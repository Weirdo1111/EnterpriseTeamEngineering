import 'dotenv/config'
import { performance } from 'node:perf_hooks'
import { createDb } from '../db.js'
import { arkConfig, createArkClient } from './ark.js'
import { evaluationCases, type EvaluationCase } from './evaluation-cases.js'
import { createKnowledgeRepository } from './repository.js'
import { rankChunks, rankSourceGroups } from './service.js'

type Ranked = ReturnType<typeof rankChunks>
type RetrievalTotals = { precision: number; recall: number; reciprocalRank: number; ndcg: number; count: number }

const percentile = (values: number[], ratio: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ?? 0
}

const relevantIndex = (item: Ranked[number], test: EvaluationCase) => test.relevant.findIndex(expected =>
  item.chunk.title.includes(expected.title) && item.chunk.location === expected.location)

function retrievalMetrics(ranked: Ranked, test: EvaluationCase, k: number) {
  const seen = new Set<number>()
  let firstRank = 0; let dcg = 0
  ranked.slice(0, k).forEach((item, index) => {
    const match = relevantIndex(item, test)
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
  }
}

function add(total: RetrievalTotals, value: Omit<RetrievalTotals, 'count'>) {
  total.precision += value.precision; total.recall += value.recall
  total.reciprocalRank += value.reciprocalRank; total.ndcg += value.ndcg; total.count += 1
}

const average = (total: RetrievalTotals) => ({
  precisionAt8: total.precision / total.count,
  recallAt8: total.recall / total.count,
  mrrAt8: total.reciprocalRank / total.count,
  ndcgAt8: total.ndcg / total.count,
})

function answerMetrics(answer: string, test: EvaluationCase, sourceCount: number) {
  const lower = answer.toLowerCase()
  const covered = test.requiredConcepts.filter(group => group.some(term => lower.includes(term.toLowerCase()))).length
  const citations = [...answer.matchAll(/\[(\d+)]/g)].map(match => Number(match[1]))
  const citationValidity = citations.length ? citations.filter(value => value >= 1 && value <= sourceCount).length / citations.length : 0
  const abstained = /insufficient|not (?:provided|documented|available)|cannot (?:determine|recommend|provide)|consult (?:a |your )?(?:doctor|physician)/i.test(answer)
  return {
    conceptCoverage: test.requiredConcepts.length ? covered / test.requiredConcepts.length : 1,
    citationValidity,
    citationPresence: citations.length > 0 ? 1 : 0,
    abstentionCorrect: test.shouldAbstain ? Number(abstained) : Number(!abstained),
  }
}

const generate = process.argv.includes('--generate')
const db = createDb()
try {
  const repository = createKnowledgeRepository(db.pool)
  const chunks = await repository.readyChunks()
  const ark = createArkClient(arkConfig())
  const baseline: RetrievalTotals = { precision: 0, recall: 0, reciprocalRank: 0, ndcg: 0, count: 0 }
  const optimized: RetrievalTotals = { precision: 0, recall: 0, reciprocalRank: 0, ndcg: 0, count: 0 }
  const retrievalLatency: number[] = []
  const generationLatency: number[] = []
  const answerScores: ReturnType<typeof answerMetrics>[] = []
  let errors = 0

  for (const test of evaluationCases) {
    try {
      const retrievalStart = performance.now()
      const embedding = await ark.embed(test.question)
      const oldRanked = rankChunks(chunks, embedding, 8, test.question)
      const newRanked = rankSourceGroups(chunks, embedding, 8, test.question)
      retrievalLatency.push(performance.now() - retrievalStart)
      if (test.relevant.length) {
        add(baseline, retrievalMetrics(oldRanked, test, 8))
        add(optimized, retrievalMetrics(newRanked, test, 8))
      }
      if (generate) {
        const context = newRanked.map(({ chunk }, index) => `[${index + 1}] ${chunk.title}${chunk.location ? `, ${chunk.location}` : ''}\n${chunk.content}`).join('\n\n')
        const generationStart = performance.now()
        const answer = await ark.answer(test.question, context)
        generationLatency.push(performance.now() - generationStart)
        answerScores.push(answerMetrics(answer, test, newRanked.length))
      }
      console.log(`${test.id}: ok`)
    } catch (error) {
      errors += 1
      console.error(`${test.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const report: Record<string, unknown> = {
    corpus: { documents: new Set(chunks.map(chunk => chunk.documentId)).size, chunks: chunks.length, evaluationCases: evaluationCases.length },
    retrievalBaseline: average(baseline),
    retrievalOptimized: average(optimized),
    retrievalLatencyMs: { p50: Math.round(percentile(retrievalLatency, 0.5)), p95: Math.round(percentile(retrievalLatency, 0.95)) },
    errorRate: errors / evaluationCases.length,
  }
  if (generate && answerScores.length) {
    const mean = (key: keyof ReturnType<typeof answerMetrics>) => answerScores.reduce((sum, score) => sum + score[key], 0) / answerScores.length
    report.generation = {
      conceptCoverage: mean('conceptCoverage'), citationValidity: mean('citationValidity'),
      citationPresence: mean('citationPresence'), abstentionAccuracy: mean('abstentionCorrect'),
      latencyMs: { p50: Math.round(percentile(generationLatency, 0.5)), p95: Math.round(percentile(generationLatency, 0.95)) },
    }
  }
  console.log(JSON.stringify(report, null, 2))
} finally { await db.close() }
