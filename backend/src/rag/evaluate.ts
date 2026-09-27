import 'dotenv/config'
import { performance } from 'node:perf_hooks'
import { createDb } from '../db.js'
import { arkConfig, createArkClient } from './ark.js'
import { evaluationCases, type EvaluationCase, type EvaluationDomain } from './evaluation-cases.js'
import { createKnowledgeRepository } from './repository.js'
import { createRagService, filterChunksForScope, rankChunks, rankSourceGroups } from './service.js'

type Ranked = ReturnType<typeof rankChunks>
type RetrievalMetric = { precision: number; recall: number; reciprocalRank: number; ndcg: number }
type RetrievalTotals = RetrievalMetric & { count: number }

const emptyTotals = (): RetrievalTotals => ({ precision: 0, recall: 0, reciprocalRank: 0, ndcg: 0, count: 0 })
const percentile = (values: number[], ratio: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ?? 0
}

const relevantIndex = (item: Ranked[number], test: EvaluationCase) => test.relevant.findIndex(expected =>
  item.chunk.title.includes(expected.title) && item.chunk.location === expected.location)

function retrievalMetrics(ranked: Ranked, test: EvaluationCase, k: number): RetrievalMetric {
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
  return { precision: seen.size / k, recall: test.relevant.length ? seen.size / test.relevant.length : 0, reciprocalRank: firstRank ? 1 / firstRank : 0, ndcg: idealDcg ? dcg / idealDcg : 0 }
}

function add(total: RetrievalTotals, value: RetrievalMetric) {
  total.precision += value.precision; total.recall += value.recall
  total.reciprocalRank += value.reciprocalRank; total.ndcg += value.ndcg; total.count += 1
}

const average = (total: RetrievalTotals, k: number) => total.count ? ({
  [`precisionAt${k}`]: total.precision / total.count,
  [`recallAt${k}`]: total.recall / total.count,
  [`mrrAt${k}`]: total.reciprocalRank / total.count,
  [`ndcgAt${k}`]: total.ndcg / total.count,
}) : {}

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
const activeCases = selectedCase ? evaluationCases.filter(test => test.id === selectedCase) : evaluationCases
if (selectedCase && !activeCases.length) throw new Error(`Unknown evaluation case: ${selectedCase}`)
const db = createDb()
try {
  const repository = createKnowledgeRepository(db.pool)
  const chunks = await repository.readyChunks()
  const ark = createArkClient(arkConfig())
  const baseline5 = emptyTotals(); const baseline8 = emptyTotals()
  const optimized5 = emptyTotals(); const optimized8 = emptyTotals()
  const domainTotals = new Map<EvaluationDomain, RetrievalTotals>()
  const domainContamination = new Map<EvaluationDomain, { invalid: number; returned: number }>()
  const retrievalLatency: number[] = []; const generationLatency: number[] = []
  const answerScores: (ReturnType<typeof answerMetrics> & { domain: EvaluationDomain })[] = []
  const caseResults: object[] = []
  let errors = 0

  for (const test of activeCases) {
    try {
      const documentId = test.documentTitle ? chunks.find(chunk => chunk.title === test.documentTitle)?.documentId : undefined
      const candidates = filterChunksForScope(chunks, test.scope, documentId)
      const retrievalStart = performance.now()
      const embedding = await ark.embed(test.question)
      const oldRanked = rankChunks(candidates, embedding, 8, test.question)
      const newRanked = rankSourceGroups(candidates, embedding, 8, test.question)
      retrievalLatency.push(performance.now() - retrievalStart)
      const contamination = domainContamination.get(test.domain) ?? { invalid: 0, returned: 0 }
      contamination.invalid += newRanked.filter(item => !allowedForCase(test, documentId, item.chunk)).length
      contamination.returned += newRanked.length
      domainContamination.set(test.domain, contamination)
      if (test.relevant.length) {
        const b5 = retrievalMetrics(oldRanked, test, 5); const b8 = retrievalMetrics(oldRanked, test, 8)
        const o5 = retrievalMetrics(newRanked, test, 5); const o8 = retrievalMetrics(newRanked, test, 8)
        add(baseline5, b5); add(baseline8, b8); add(optimized5, o5); add(optimized8, o8)
        const byDomain = domainTotals.get(test.domain) ?? emptyTotals()
        add(byDomain, o8); domainTotals.set(test.domain, byDomain)
        caseResults.push({
          id: test.id, domain: test.domain, recallAt5: o5.recall, recallAt8: o8.recall,
          reciprocalRankAt8: o8.reciprocalRank, ndcgAt8: o8.ndcg,
          topSources: includeDetails ? newRanked.map(item => ({ title: item.chunk.title, location: item.chunk.location, score: Number(item.score.toFixed(4)) })) : undefined,
        })
      }
      if (generate) {
        const service = createRagService({ chunks: async () => chunks, embed: async () => embedding, answer: ark.answer })
        const generationStart = performance.now()
        const result = await service.ask({ question: test.question, scope: test.scope, documentId })
        generationLatency.push(performance.now() - generationStart)
        answerScores.push({ ...answerMetrics(result.answer, test, result.sources.length), domain: test.domain })
      }
      console.log(`${test.id}: ok`)
    } catch (error) {
      errors += 1
      console.error(`${test.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const byDomain = Object.fromEntries([...domainTotals].map(([domain, total]) => {
    const contamination = domainContamination.get(domain) ?? { invalid: 0, returned: 0 }
    return [domain, { ...average(total, 8), contaminationRate: contamination.returned ? contamination.invalid / contamination.returned : 0, cases: total.count }]
  }))
  const report: Record<string, unknown> = {
    corpus: { documents: new Set(chunks.map(chunk => chunk.documentId)).size, chunks: chunks.length, evaluationCases: activeCases.length },
    retrievalBaseline: { at5: average(baseline5, 5), at8: average(baseline8, 8) },
    retrievalOptimized: { at5: average(optimized5, 5), at8: average(optimized8, 8) },
    byDomain,
    retrievalLatencyMs: { p50: Math.round(percentile(retrievalLatency, 0.5)), p95: Math.round(percentile(retrievalLatency, 0.95)) },
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
