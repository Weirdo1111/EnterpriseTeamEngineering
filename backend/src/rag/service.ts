import type { StoredKnowledgeChunk } from './repository.js'
import { ArkApiError } from './ark.js'

export type RagSource = { id: string; documentId: string; title: string; filename: string; location?: string; heading?: string; excerpt: string; score: number }

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
const terms = (value: string) => new Set((value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(term => term.length > 2 && !stopWords.has(term)))

function lexicalScore(question: string, content: string) {
  const queryTerms = terms(question)
  if (!queryTerms.size) return 0
  const contentTerms = terms(content)
  return [...queryTerms].filter(term => contentTerms.has(term)).length / queryTerms.size
}

export function rankChunks(chunks: StoredKnowledgeChunk[], queryEmbedding: number[], limit = 5, question = '') {
  return chunks.map(chunk => ({ chunk, score: cosineSimilarity(chunk.embedding, queryEmbedding) * 0.85 + lexicalScore(question, chunk.content) * 0.15 }))
    .sort((left, right) => right.score - left.score).slice(0, limit)
}

export function createRagService(dependencies: {
  chunks: () => Promise<StoredKnowledgeChunk[]>
  embed: (text: string) => Promise<number[]>
  answer: (question: string, context: string) => Promise<string>
}) {
  return {
    async ask(question: string) {
      const clean = question.trim()
      if (!clean || clean.length > 4000) throw new Error('Question must contain 1 to 4000 characters.')
      const chunks = await dependencies.chunks()
      if (!chunks.length) throw new Error('The knowledge base is empty. Import documents before asking questions.')
      const ranked = rankChunks(chunks, await dependencies.embed(clean), 5, clean)
      const sources: RagSource[] = ranked.map(({ chunk, score }, index) => ({
        id: chunk.id, documentId: chunk.documentId, title: chunk.title, filename: chunk.filename,
        location: chunk.location, heading: chunk.heading, excerpt: chunk.content.slice(0, 500),
        score: Number(score.toFixed(4)),
      }))
      const context = ranked.map(({ chunk }, index) => `[${index + 1}] ${chunk.title}${chunk.location ? `, ${chunk.location}` : ''}${chunk.heading ? `, ${chunk.heading}` : ''}\n${chunk.content}`).join('\n\n')
      try {
        return { answer: await dependencies.answer(clean, context), sources, generationMode: 'generated' as const }
      } catch (error) {
        if (!(error instanceof ArkApiError) || error.status !== 429) throw error
        const evidence = sources.slice(0, 3).map((source, index) => `[${index + 1}] ${source.excerpt}`).join('\n\n')
        return {
          answer: `The generation model is temporarily rate limited. The most relevant retrieved evidence is shown below and must be reviewed directly:\n\n${evidence}`,
          sources,
          generationMode: 'retrieval-only' as const,
        }
      }
    },
  }
}
