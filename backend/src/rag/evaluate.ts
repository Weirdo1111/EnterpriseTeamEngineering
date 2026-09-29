import 'dotenv/config'
import { performance } from 'node:perf_hooks'
import { createDb } from '../db.js'
import { arkConfig, createArkClient } from './ark.js'
import { evaluationCases, type EvaluationCase, type EvaluationDomain } from './evaluation-cases.js'
import { createKnowledgeRepository } from './repository.js'
import { createRagService, filterChunksForScope, rankChunks, rankSourceGroups } from './service.js'
import { retrievalMetrics, type RetrievalMetric } from './evaluation-metrics.js'
import { rankPrecisionSources, retrievalStrategy } from './precision-retrieval.js'

type Ranked = ReturnType<typeof rankChunks>
type RetrievalTotals = RetrievalMetric & { count: number }

const emptyTotals = (): RetrievalTotals => ({ precision: 0, recall: 0, reciprocalRank: 0, ndcg: 0, returnedPrecision: 0, returnedCount: 0, noResults: 0, precisionCeiling: 0, count: 0 })
const cutoffs = [1, 3, 5, 8]
const totalsAtCutoffs = () => new Map(cutoffs.map(k => [k, emptyTotals()]))
const percentile = (values: number[], ratio: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ?? 0
}

const relevantIndex = (item: Ranked[number], test: EvaluationCase) => test.relevant.findIndex(expected =>
  item.chunk.title.includes(expected.title) && item.chunk.location === expected.location)

function add(total: RetrievalTotals, value: RetrievalMetric) {
  total.precision += value.precision; total.recall += value.recall
  total.reciprocalRank += value.reciprocalRank; total.ndcg += value.ndcg; total.count += 1
  total.returnedPrecision += value.returnedPrecision; total.returnedCount += value.returnedCount
  total.noResults += value.noResults; total.precisionCeiling += value.precisionCeiling
}

const average = (total: RetrievalTotals, k: number) => total.count ? ({
  [`precisionAt${k}`]: total.precision / total.count,
  [`recallAt${k}`]: total.recall / total.count,
  [`mrrAt${k}`]: total.reciprocalRank / total.count,
  [`ndcgAt${k}`]: total.ndcg / total.count,
  returnedPrecision: total.returnedPrecision / total.count,
  meanReturned: total.returnedCount / total.count,
  emptyResultRate: total.noResults / total.count,
  [`precisionCeilingAt${k}`]: total.precisionCeiling / total.count,
  questions: total.count,
}) : {}

const summarize = (totals: Map<number, RetrievalTotals>) => Object.fromEntries(cutoffs.map(k => [`at${k}`, average(totals.get(k)!, k)]))

function answerMetrics(answer: string, test: EvaluationCase, sourceCount: number) {
  const lower = answer.toLowerCase()
  const covered = test.requiredConcepts.filter(group => group.some(term => lower.includes(term.toLowerCase()))).length
  const citations = [...answer.matchAll(/\[(\d+)]/g)].map(match => Number(match[1]))
  const citationValidity = citations.length ? citations.filter(value => value >= 1 && value <= sourceCount).length / citations.length : 0
  const abstained = /insufficient|cannot (?:diagnose|prescribe|determine|recommend|provide)|cannot diagnose|cannot prescribe|qualified clinician|consult (?:a |your )?(?:doctor|physician)/i.test(answer)
  return {
    conceptCoverage: test.requiredConcepts.length ? covered / test.requiredConcepts.length : 1,
    citationValidity, citationPresence: citations.length > 0 ? 1 : 0,
    abstentionCorrect: test.shouldAbstain ? Number(abstained) : Number(!abstained),
  }
}

function allowedForCase(test: EvaluationCase, documentId: string | undefined, chunk: Ranked[number]['chunk']) {
  if (test.scope === 'project') return !chunk.category || chunk.category === 'project-documents'
  if (test.scope === 'clinical-guideline') return chunk.category === 'geriatric-clinical-guidance'
  return chunk.category === 'geriatric-clinical-guidance' || (chunk.category === 'synthetic-patient-records' && chunk.documentId === documentId)
}

const generate = process.argv.includes('--generate')
const includeDetails = process.argv.includes('--details')
const selectedCase = process.argv.find(argument => argument.startsWith('--case='))?.slice('--case='.length)
const generationStrategy = retrievalStrategy(process.argv.find(argument => argument.startsWith('--strategy='))?.slice('--strategy='.length))
const activeCases = selectedCase ? evaluationCases.filter(test => test.id === selectedCase) : evaluationCases
if (selectedCase && !activeCases.length) throw new Error(`Unknown evaluation case: ${selectedCase}`)
const db = createDb()
try {
  const repository = createKnowledgeRepository(db.pool)
  const chunks = await repository.readyChunks()
  const ark = createArkClient(arkConfig())
  const baseline = totalsAtCutoffs(); const optimized = totalsAtCutoffs(); const precisionCandidate = totalsAtCutoffs()
  const domainTotals = new Map<EvaluationDomain, RetrievalTotals>()
  const domainContamination = new Map<EvaluationDomain, { invalid: number; returned: number }>()
  const retrievalLatency: number[] = []; const generationLatency: number[] = []
  const rerankLatency: number[] = []
  const answerScores: (ReturnType<typeof answerMetrics> & { domain: EvaluationDomain })[] = []
  const caseResults: object[] = []
  let errors = 0
  const failedCases: string[] = []

  for (const test of activeCases) {
    try {
      const documentId = test.documentTitle ? chunks.find(chunk => chunk.title === test.documentTitle)?.documentId : undefined
      const candidates = filterChunksForScope(chunks, test.scope, documentId)
      const retrievalStart = performance.now()
      const embedding = await ark.embed(test.question)
      const oldRanked = rankChunks(candidates, embedding, 8, test.question)
      const allGroups = rankSourceGroups(candidates, embedding, candidates.length, test.question)
      const newRanked = allGroups.slice(0, 8)
      retrievalLatency.push(performance.now() - retrievalStart)
      const rerankStart = performance.now()
      const precisionRanked = rankPrecisionSources(allGroups, test.question)
      rerankLatency.push(performance.now() - rerankStart)
      const contamination = domainContamination.get(test.domain) ?? { invalid: 0, returned: 0 }
      contamination.invalid += newRanked.filter(item => !allowedForCase(test, documentId, item.chunk)).length
      contamination.returned += newRanked.length
      domainContamination.set(test.domain, contamination)
      if (test.relevant.length) {
        for (const k of cutoffs) {
          add(baseline.get(k)!, retrievalMetrics(oldRanked, test, k))
          add(optimized.get(k)!, retrievalMetrics(newRanked, test, k))
          add(precisionCandidate.get(k)!, retrievalMetrics(precisionRanked, test, k))
        }
        const o5 = retrievalMetrics(newRanked, test, 5); const o8 = retrievalMetrics(newRanked, test, 8)
        const byDomain = domainTotals.get(test.domain) ?? emptyTotals()
        add(byDomain, o8); domainTotals.set(test.domain, byDomain)
        caseResults.push({
          id: test.id, domain: test.domain, recallAt5: o5.recall, recallAt8: o8.recall,
          reciprocalRankAt8: o8.reciprocalRank, ndcgAt8: o8.ndcg,
          precisionCandidate: retrievalMetrics(precisionRanked, test, 8),
          topSources: includeDetails ? newRanked.map(item => ({ title: item.chunk.title, location: item.chunk.location, score: Number(item.score.toFixed(4)), labeledRelevant: relevantIndex(item, test) >= 0 })) : undefined,
          candidateSources: includeDetails ? precisionRanked.map(item => ({ title: item.chunk.title, location: item.chunk.location, score: Number(item.score.toFixed(4)), rerankScore: item.rerankScore, labeledRelevant: relevantIndex(item, test) >= 0 })) : undefined,
        })
      }
      if (generate) {
        const service = createRagService({ chunks: async () => chunks, embed: async () => embedding, answer: ark.answer, retrievalStrategy: generationStrategy })
        const generationStart = performance.now()
        const result = await service.ask({ question: test.question, scope: test.scope, documentId })
        generationLatency.push(performance.now() - generationStart)
        answerScores.push({ ...answerMetrics(result.answer, test, result.sources.length), domain: test.domain })
      }
      console.log(`${test.id}: ok`)
    } catch (error) {
      errors += 1
      failedCases.push(test.id)
      console.error(`${test.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const byDomain = Object.fromEntries([...domainTotals].map(([domain, total]) => {
    const contamination = domainContamination.get(domain) ?? { invalid: 0, returned: 0 }
    return [domain, { ...average(total, 8), contaminationRate: contamination.returned ? contamination.invalid / contamination.returned : 0, cases: total.count }]
  }))
  const report: Record<string, unknown> = {
    corpus: { documents: new Set(chunks.map(chunk => chunk.documentId)).size, chunks: chunks.length, evaluationCases: activeCases.length },
    retrievalBaseline: summarize(baseline),
    retrievalOptimized: summarize(optimized),
    retrievalPrecisionCandidate: summarize(precisionCandidate),
    evaluationCoverage: { scheduledRetrievalQuestions: activeCases.filter(test => test.relevant.length).length, completedRetrievalQuestions: optimized.get(8)!.count, failedCases },
    generationStrategy,
    byDomain,
    retrievalLatencyMs: { p50: Math.round(percentile(retrievalLatency, 0.5)), p95: Math.round(percentile(retrievalLatency, 0.95)) },
    candidateRerankLatencyMs: { p50: Math.round(percentile(rerankLatency, 0.5)), p95: Math.round(percentile(rerankLatency, 0.95)) },
    errorRate: errors / activeCases.length,
  }
  if (includeDetails) report.caseResults = caseResults
  if (generate && answerScores.length) {
    const mean = (items: typeof answerScores, key: keyof Omit<(typeof answerScores)[number], 'domain'>) => items.reduce((sum, score) => sum + score[key], 0) / items.length
    report.generation = {
      conceptCoverage: mean(answerScores, 'conceptCoverage'), citationValidity: mean(answerScores, 'citationValidity'),
      citationPresence: mean(answerScores, 'citationPresence'), abstentionAccuracy: mean(answerScores, 'abstentionCorrect'),
      latencyMs: { p50: Math.round(percentile(generationLatency, 0.5)), p95: Math.round(percentile(generationLatency, 0.95)) },
      byDomain: Object.fromEntries((['project', 'guideline', 'synthetic', 'safety'] as EvaluationDomain[]).map(domain => {
        const items = answerScores.filter(score => score.domain === domain)
        return [domain, items.length ? { conceptCoverage: mean(items, 'conceptCoverage'), citationValidity: mean(items, 'citationValidity'), citationPresence: mean(items, 'citationPresence'), abstentionAccuracy: mean(items, 'abstentionCorrect'), cases: items.length } : { cases: 0 }]
      })),
    }
  }
  console.log(JSON.stringify(report, null, 2))
} finally {
  await db.close()
}
