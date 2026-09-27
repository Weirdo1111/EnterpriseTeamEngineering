import { randomUUID } from 'node:crypto'
import type { StoredKnowledgeChunk } from './repository.js'
import { ArkApiError } from './ark.js'

export type RagScope = 'project' | 'clinical-guideline' | 'synthetic-patient'
export type RagQuery = { question: string; scope?: RagScope; documentId?: string }

export type RagSource = {
  id: string
  documentId: string
  title: string
  filename: string
  sourceUrl?: string
  publisher?: string
  licenseName?: string
  synthetic: boolean
  category?: string
  location?: string
  heading?: string
  excerpt: string
  score: number
}

export type RagResult = {
  traceId: string
  generatedAt: string
  answer: string
  sources: RagSource[]
  generationMode: 'generated' | 'retrieval-only' | 'not-run'
  scope: RagScope
  answerDecision: 'answered' | 'abstained' | 'retrieval-only'
  evidenceStatus: 'sufficient' | 'insufficient'
  clinicianReviewRequired: boolean
  citations: { index: number; sourceId: string }[]
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length || !left.length) return 0
  let dot = 0; let leftNorm = 0; let rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!
    leftNorm += left[index]! ** 2
    rightNorm += right[index]! ** 2
  }
  return leftNorm && rightNorm ? dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) : 0
}

const stopWords = new Set(['the', 'and', 'are', 'for', 'with', 'what', 'this', 'that', 'from', 'into', 'required'])
const terms = (value: string) => new Set((value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
  .filter(term => (term.length > 2 || /^\d+$/.test(term)) && !stopWords.has(term)))

function lexicalScore(question: string, content: string) {
  const queryTerms = terms(question)
  if (!queryTerms.size) return 0
  const contentTerms = terms(content)
  return [...queryTerms].filter(term => contentTerms.has(term)).length / queryTerms.size
}

function identifierBoost(question: string, chunk: StoredKnowledgeChunk) {
  const queryIdentifiers = [...terms(question)].filter(term => /^\d{2,}$/.test(term))
  if (!queryIdentifiers.length) return 0
  const titleTerms = terms([chunk.title, chunk.location].filter(Boolean).join(' '))
  return queryIdentifiers.some(term => titleTerms.has(term)) ? 0.2 : 0
}

export function rankChunks(chunks: StoredKnowledgeChunk[], queryEmbedding: number[], limit = 5, question = '') {
  return chunks.map(chunk => ({ chunk, score: cosineSimilarity(chunk.embedding, queryEmbedding) * 0.85 + lexicalScore(question, chunk.content) * 0.15 + identifierBoost(question, chunk) }))
    .sort((left, right) => right.score - left.score).slice(0, limit)
}

export function rankSourceGroups(chunks: StoredKnowledgeChunk[], queryEmbedding: number[], limit = 8, question = '') {
  const groups = new Map<string, StoredKnowledgeChunk[]>()
  for (const chunk of chunks) {
    const key = `${chunk.documentId}\u0000${chunk.location ?? chunk.id}`
    const group = groups.get(key) ?? []
    group.push(chunk)
    groups.set(key, group)
  }
  return [...groups.values()].map(group => {
    const ordered = [...group].sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    const content = [...new Set(ordered.map(item => item.content.trim()).filter(Boolean))].join('\n')
    const representative = group.reduce((best, item) => cosineSimilarity(item.embedding, queryEmbedding) > cosineSimilarity(best.embedding, queryEmbedding) ? item : best)
    const semantic = Math.max(...group.map(item => cosineSimilarity(item.embedding, queryEmbedding)))
    return { chunk: { ...representative, content }, score: semantic * 0.85 + lexicalScore(question, content) * 0.15 + identifierBoost(question, representative) }
  }).sort((left, right) => right.score - left.score).slice(0, limit)
}

export function filterChunksForScope(chunks: StoredKnowledgeChunk[], scope: RagScope, documentId?: string) {
  if (scope === 'project') return chunks.filter(chunk => !chunk.category || chunk.category === 'project-documents')
  if (scope === 'clinical-guideline') return chunks.filter(chunk => chunk.category === 'geriatric-clinical-guidance')
  if (!documentId) throw new Error('documentId is required for synthetic-patient scope.')
  const patientExists = chunks.some(chunk => chunk.documentId === documentId && chunk.category === 'synthetic-patient-records')
  if (!patientExists) throw new Error('The requested synthetic patient document was not found.')
  return chunks.filter(chunk => chunk.category === 'geriatric-clinical-guidance' || (chunk.category === 'synthetic-patient-records' && chunk.documentId === documentId))
}

const unsafeClinicalRequest = (question: string) => /\b(?:diagnose|prescribe|prescription|dosage|what dose|exact dose|what is (?:the )?diagnosis|give (?:a )?diagnosis)\b|诊断|开药|处方|剂量/i.test(question)

function metadata() {
  return { traceId: randomUUID(), generatedAt: new Date().toISOString() }
}

function citationsFor(answer: string, sources: RagSource[]) {
  const indexes = [...answer.matchAll(/\[(\d+)\]/g)].map(match => Number(match[1]))
  const valid = indexes.filter(index => Number.isInteger(index) && index >= 1 && index <= sources.length)
  return {
    citations: [...new Set(valid)].map(index => ({ index, sourceId: sources[index - 1]!.id })),
    invalid: indexes.some(index => !Number.isInteger(index) || index < 1 || index > sources.length),
  }
}

function evidenceAnswer(sources: RagSource[]) {
  return sources.slice(0, 3).map((source, index) => `[${index + 1}] ${source.excerpt}`).join('\n\n')
}

function abstained(scope: RagScope, answer: string, sources: RagSource[] = []): RagResult {
  return {
    ...metadata(),
    answer, sources, scope, generationMode: 'not-run', answerDecision: 'abstained', evidenceStatus: 'insufficient',
    clinicianReviewRequired: scope !== 'project', citations: [],
  }
}

export function createRagService(dependencies: {
  chunks: () => Promise<StoredKnowledgeChunk[]>
  embed: (text: string) => Promise<number[]>
  answer: (question: string, context: string, options?: { scope: RagScope; syntheticPatient: boolean }) => Promise<string>
  minimumScore?: number
}) {
  return {
    async ask(query: string | RagQuery): Promise<RagResult> {
      const input = typeof query === 'string' ? { question: query } : query
      const clean = input.question.trim()
      if (!clean || clean.length > 4000) throw new Error('Question must contain 1 to 4000 characters.')
      const scope = input.scope ?? 'project'
      if (!['project', 'clinical-guideline', 'synthetic-patient'].includes(scope)) throw new Error('Invalid RAG scope.')
      if (scope !== 'synthetic-patient' && input.documentId) throw new Error('documentId is only valid for synthetic-patient scope.')
      const chunks = filterChunksForScope(await dependencies.chunks(), scope, input.documentId)
      if (!chunks.length) throw new Error('The knowledge base is empty. Import documents before asking questions.')
      if (scope !== 'project' && unsafeClinicalRequest(clean)) {
        return abstained(scope, 'This assistant cannot diagnose, prescribe, or provide medication doses. Review the patient and applicable clinical guidance directly with a qualified clinician.')
      }
      const ranked = rankSourceGroups(chunks, await dependencies.embed(clean), 8, clean)
      const sources: RagSource[] = ranked.map(({ chunk, score }, index) => ({
        id: chunk.id, documentId: chunk.documentId, title: chunk.title, filename: chunk.filename,
        sourceUrl: chunk.sourceUrl, publisher: chunk.publisher, licenseName: chunk.licenseName, synthetic: Boolean(chunk.synthetic),
        category: chunk.category, location: chunk.location, heading: chunk.heading, excerpt: chunk.content.slice(0, 500),
        score: Number(score.toFixed(4)),
      }))
      if (!ranked.length || ranked[0]!.score < (dependencies.minimumScore ?? 0.15)) {
        return abstained(scope, 'The available evidence is insufficient to answer this question reliably.', sources)
      }
      const context = ranked.map(({ chunk }, index) => `[${index + 1}] ${chunk.title}${chunk.location ? `, ${chunk.location}` : ''}${chunk.heading ? `, ${chunk.heading}` : ''}\n${chunk.content}`).join('\n\n')
      try {
        const answer = await dependencies.answer(clean, context, { scope, syntheticPatient: scope === 'synthetic-patient' })
        const citationResult = citationsFor(answer, sources)
        if (!citationResult.citations.length || citationResult.invalid) {
          return {
            ...metadata(),
            answer: `The generated response did not contain verifiable citations. Review the retrieved evidence directly:\n\n${evidenceAnswer(sources)}`,
            sources, citations: [], scope, generationMode: 'retrieval-only', answerDecision: 'retrieval-only',
            evidenceStatus: 'sufficient', clinicianReviewRequired: scope !== 'project',
          }
        }
        return {
          ...metadata(), answer, sources, citations: citationResult.citations,
          scope, generationMode: 'generated', answerDecision: 'answered', evidenceStatus: 'sufficient', clinicianReviewRequired: scope !== 'project',
        }
      } catch (error) {
        if (!(error instanceof ArkApiError) || error.status !== 429) throw error
        return {
          ...metadata(), answer: `The generation model is temporarily rate limited. The most relevant retrieved evidence is shown below and must be reviewed directly:\n\n${evidenceAnswer(sources)}`,
          sources, citations: [], scope, generationMode: 'retrieval-only', answerDecision: 'retrieval-only', evidenceStatus: 'sufficient',
          clinicianReviewRequired: scope !== 'project',
        }
      }
    },
  }
}
