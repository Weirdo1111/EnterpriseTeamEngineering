import assert from 'node:assert/strict'
import test from 'node:test'
import { rankPrecisionSources, retrievalStrategy, searchTerms, type RankedSource } from './precision-retrieval.js'

const source = (id: string, content: string, score: number, heading = ''): RankedSource => ({
  chunk: { id, documentId: id, title: 'Platform documentation', filename: 'guide.pdf', location: 'Page 1', content, heading, embedding: [1, 0] }, score,
})

test('local keyword reranking promotes an exact topic and trims unmatched tail evidence', () => {
  const ranked = [source('overview', 'Platform deployment and storage', 0.95), source('security', 'JWT authentication and RBAC authorization', 0.8), source('charts', 'Monitoring chart rendering', 0.75)]
  const result = rankPrecisionSources(ranked, 'JWT authentication and RBAC')
  assert.equal(result[0]!.chunk.id, 'security')
  assert.equal(result.length, 1)
  assert.equal(result[0]!.score, 0.8)
  assert.ok(result[0]!.rerankScore)
})

test('semantic fallback preserves paraphrase evidence with no keyword overlap', () => {
  const result = rankPrecisionSources([source('semantic', 'Verify clinician identity', 0.9), source('noise', 'Chart rendering', 0.2)], 'authentication')
  assert.equal(result[0]!.chunk.id, 'semantic')
  assert.equal(result.length, 1)
})

test('fusion never rescales weak evidence into sufficient evidence', () => {
  assert.deepEqual(rankPrecisionSources([source('weak', 'Exact authentication phrase', 0.1)], 'authentication'), [])
  assert.deepEqual(rankPrecisionSources([], 'authentication'), [])
})

test('query tokenization supports Chinese, compatibility forms, and short medical tokens', () => {
  assert.ok(searchTerms('检查药物过敏').length > 1)
  assert.deepEqual(searchTerms('ＪＷＴ and 25 mg'), ['jwt', '25', 'mg'])
  const ranked = [source('noise', '平台部署架构', 0.9), source('allergy', '检查药物过敏', 0.8)]
  assert.equal(rankPrecisionSources(ranked, '药物过敏')[0]!.chunk.id, 'allergy')
})

test('evidence cap is fixed and deterministic and does not mutate source order', () => {
  const ranked = Array.from({ length: 12 }, (_, i) => source(`source-${i}`, 'JWT authentication', 0.9))
  const before = ranked.map(item => item.chunk.id)
  const first = rankPrecisionSources(ranked, 'JWT', { maximumSources: 3 })
  assert.equal(first.length, 3)
  assert.deepEqual(first, rankPrecisionSources(ranked, 'JWT', { maximumSources: 3 }))
  assert.deepEqual(ranked.map(item => item.chunk.id), before)
})

test('invalid selection settings are rejected instead of silently changing the strategy', () => {
  assert.throws(() => rankPrecisionSources([], 'test', { maximumSources: 0 }), /Invalid/)
  assert.throws(() => rankPrecisionSources([], 'test', { maximumSources: 9 }), /Invalid/)
  assert.throws(() => rankPrecisionSources([], 'test', { minimumScore: NaN }), /Invalid/)
  assert.throws(() => rankPrecisionSources([], 'test', { relativeCutoff: 2 }), /Invalid/)
  assert.equal(retrievalStrategy('source-group'), 'source-group')
  assert.equal(retrievalStrategy('precision'), 'precision')
  assert.throws(() => retrievalStrategy('typo'), /must be/)
})
