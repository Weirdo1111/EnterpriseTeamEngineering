import MiniSearch from 'minisearch'
import type { StoredKnowledgeChunk } from './repository.js'

export type RetrievalStrategy = 'source-group' | 'precision'
export type RankedSource = { chunk: StoredKnowledgeChunk; score: number; rerankScore?: number }
export type PrecisionOptions = { maximumSources?: number; minimumScore?: number; relativeCutoff?: number }

export function retrievalStrategy(value = process.env.RAG_RETRIEVAL_STRATEGY ?? 'source-group'): RetrievalStrategy {
  if (value !== 'source-group' && value !== 'precision') throw new Error('RAG_RETRIEVAL_STRATEGY must be source-group or precision.')
  return value
}

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
const stopWords = new Set('a an the and or of to in on at by for from with is are was were be been being it this that these those what which how who why when where do does did can could would should must please 的 了 是 在 和 与 及 或 请 如何 什么 哪些 是否 应该 一个 一种'.split(' '))

export function searchTerms(text: string): string[] {
  return [...segmenter.segment(text.normalize('NFKC').toLowerCase())]
    .filter(part => part.isWordLike && !stopWords.has(part.segment))
    .map(part => part.segment)
}

export function rankPrecisionSources(grouped: RankedSource[], question: string, options: PrecisionOptions = {}): RankedSource[] {
  const { maximumSources = 8, minimumScore = 0.15, relativeCutoff = 0.7 } = options
  if (!Number.isInteger(maximumSources) || maximumSources < 1 || maximumSources > 8 ||
    !Number.isFinite(minimumScore) || minimumScore < 0 ||
    !Number.isFinite(relativeCutoff) || relativeCutoff < 0 || relativeCutoff > 1) throw new Error('Invalid precision retrieval options.')
  const candidates = grouped.filter(item => Number.isFinite(item.score) && item.score >= minimumScore)
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
  if (!candidates.length) return []
  const queryTerms = searchTerms(question)
  const index = new MiniSearch({ fields: ['content', 'heading', 'title'], tokenize: searchTerms, processTerm: term => term })
  index.addAll(candidates.map((item, id) => ({ id, content: item.chunk.content, heading: item.chunk.heading ?? '', title: item.chunk.title })))
  // Full-text ranking is local; fusion changes order, not the evidence-confidence floor.
  const lexical = index.search(queryTerms.join(' '), { boost: { heading: 2, title: 1, content: 1 }, prefix: false, fuzzy: false })
  if (!lexical.length) {
    const cutoff = Math.max(minimumScore, candidates[0]!.score * relativeCutoff)
    return candidates.filter(item => item.score >= cutoff).slice(0, maximumSources)
  }
  const lexicalRanks = new Map(lexical.map((item, rank) => [item.id as number, rank + 1]))
  const fused = candidates.map((item, semanticIndex) => {
    const lexicalRank = lexicalRanks.get(semanticIndex)
    const rerankScore = 21 * (0.5 / (20 + semanticIndex + 1) + (lexicalRank ? 0.5 / (20 + lexicalRank) : 0))
    return { ...item, rerankScore }
  }).sort((a, b) => b.rerankScore - a.rerankScore || b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
  const cutoff = fused[0]!.rerankScore * relativeCutoff
  return fused.filter(item => item.rerankScore >= cutoff).slice(0, maximumSources)
}
