import type { EvaluationCase } from './evaluation-cases.js'
import type { RankedSource } from './precision-retrieval.js'

export type RetrievalMetric = {
  precision: number
  recall: number
  reciprocalRank: number
  ndcg: number
  returnedPrecision: number
  returnedCount: number
  noResults: number
  precisionCeiling: number
}

export function retrievalMetrics(ranked: RankedSource[], test: Pick<EvaluationCase, 'relevant'>, k: number): RetrievalMetric {
  if (!Number.isInteger(k) || k < 1) throw new Error('k must be a positive integer.')
  const seen = new Set<number>()
  const returned = ranked.slice(0, k)
  let firstRank = 0; let dcg = 0
  returned.forEach((item, index) => {
    const match = test.relevant.findIndex(expected => item.chunk.title.includes(expected.title) && item.chunk.location === expected.location)
    if (match < 0 || seen.has(match)) return
    seen.add(match)
    if (!firstRank) firstRank = index + 1
    dcg += 1 / Math.log2(index + 2)
  })
  const idealCount = Math.min(test.relevant.length, k)
  const idealDcg = Array.from({ length: idealCount }, (_, index) => 1 / Math.log2(index + 2)).reduce((sum, value) => sum + value, 0)
  return {
    precision: seen.size / k,
    recall: test.relevant.length ? seen.size / test.relevant.length : 0,
    reciprocalRank: firstRank ? 1 / firstRank : 0,
    ndcg: idealDcg ? dcg / idealDcg : 0,
    returnedPrecision: returned.length ? seen.size / returned.length : 0,
    returnedCount: returned.length,
    noResults: Number(returned.length === 0),
    precisionCeiling: idealCount / k,
  }
}
