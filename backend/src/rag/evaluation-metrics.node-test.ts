import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluationCases } from './evaluation-cases.js'
import { retrievalMetrics } from './evaluation-metrics.js'

const testCase = { relevant: [{ title: 'Guide', location: 'Page 1' }, { title: 'Guide', location: 'Page 2' }] }
const result = (id: string, title: string, location: string) => ({ chunk: { id, documentId: 'doc', title, filename: 'guide.pdf', location, content: '', embedding: [1] }, score: 1 })
const ranked = [result('a', 'Guide', 'Page 1'), result('b', 'Guide', 'Page 2')]

test('fixed-k precision and actual-returned precision are distinct', () => {
  const metric = retrievalMetrics(ranked, testCase, 8)
  assert.equal(metric.precision, 0.25)
  assert.equal(metric.returnedPrecision, 1)
  assert.equal(metric.precisionCeiling, 0.25)
  assert.equal(metric.recall, 1)
  assert.equal(metric.returnedCount, 2)
})

test('duplicate relevant locations do not inflate precision or recall', () => {
  const metric = retrievalMetrics([ranked[0]!, ranked[0]!], testCase, 3)
  assert.equal(metric.precision, 1 / 3)
  assert.equal(metric.recall, 0.5)
  assert.equal(metric.returnedPrecision, 0.5)
})

test('empty retrieval counts as failure rather than perfect returned precision', () => {
  const metric = retrievalMetrics([], testCase, 8)
  assert.equal(metric.returnedPrecision, 0)
  assert.equal(metric.recall, 0)
  assert.equal(metric.noResults, 1)
})

test('top ranks and sparse-label ceilings are evaluated at the original cutoff', () => {
  const metric = retrievalMetrics([result('noise', 'Unrelated', 'Page 1'), ...ranked], testCase, 3)
  assert.equal(metric.reciprocalRank, 0.5)
  assert.equal(metric.precision, 2 / 3)
  assert.equal(metric.precisionCeiling, 2 / 3)
  assert.ok(metric.ndcg < 1)
  assert.throws(() => retrievalMetrics(ranked, testCase, 0), /positive integer/)
})

test('the unchanged 29-question labels imply a 25.86 percent ceiling at eight', () => {
  const cases = evaluationCases.filter(item => item.relevant.length)
  const relevantCount = cases.reduce((sum, item) => sum + Math.min(item.relevant.length, 8), 0)
  assert.equal(cases.length, 29)
  assert.equal(relevantCount, 60)
  assert.equal(relevantCount / (cases.length * 8), 60 / 232)
})
