import { cosineSimilarity } from '../rag/service.js'
import type { StoredKnowledgeChunk } from '../rag/repository.js'
import { searchTerms } from '../rag/precision-retrieval.js'

export type SimilarCase = {
  documentId: string
  title: string
  excerpt: string
  location?: string
  sourceUrl?: string
  score: number
  synthetic: true
}

export type RelatedGuidance = {
  documentId: string
  title: string
  excerpt: string
  location?: string
  sourceUrl?: string
  publisher?: string
}

export function rankSimilarCases(chunks: StoredKnowledgeChunk[], embedding: number[], limit = 5): SimilarCase[] {
  const byDocument = new Map<string, SimilarCase>()
  for (const chunk of chunks) {
    if (chunk.category !== 'synthetic-patient-records' || !chunk.synthetic) continue
    const score = cosineSimilarity(chunk.embedding, embedding)
    const existing = byDocument.get(chunk.documentId)
    if (existing && existing.score >= score) continue
    byDocument.set(chunk.documentId, {
      documentId: chunk.documentId,
      title: chunk.title,
      excerpt: chunk.content.slice(0, 750),
      location: chunk.location,
      sourceUrl: chunk.sourceUrl,
      score: Number(score.toFixed(4)),
      synthetic: true,
    })
  }
  return [...byDocument.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}

export function relatedGuidance(chunks: StoredKnowledgeChunk[], query: string, embedding: number[], limit = 2): RelatedGuidance[] {
  const terms = searchTerms(query).filter(term => (term.length >= 4 || (term.length >= 2 && /\p{Script=Han}/u.test(term))) && !['older', 'patient', 'history', 'record', 'condition', 'diagnosis', 'years'].includes(term))
  if (!terms.length) return []
  const matches = chunks.filter(chunk => {
    if (chunk.category !== 'geriatric-clinical-guidance') return false
    const content = `${chunk.title} ${chunk.heading || ''} ${chunk.content}`.normalize('NFKC').toLowerCase()
    return terms.some(term => content.includes(term))
  }).map(chunk => ({ chunk, score: cosineSimilarity(chunk.embedding, embedding) }))
  const unique = new Map<string, RelatedGuidance>()
  for (const match of matches.sort((a, b) => b.score - a.score)) {
    if (unique.has(match.chunk.documentId)) continue
    unique.set(match.chunk.documentId, {
      documentId: match.chunk.documentId,
      title: match.chunk.title,
      excerpt: match.chunk.content.slice(0, 750),
      location: match.chunk.location,
      sourceUrl: match.chunk.sourceUrl,
      publisher: match.chunk.publisher,
    })
  }
  return [...unique.values()].slice(0, limit)
}
