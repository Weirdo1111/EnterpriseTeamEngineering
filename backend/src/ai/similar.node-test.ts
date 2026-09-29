import assert from 'node:assert/strict'
import test from 'node:test'
import { rankSimilarCases, relatedGuidance } from './similar.js'

test('similar case ranking returns one best passage per synthetic patient', () => {
  const cases = rankSimilarCases([
    { id: 'a1', documentId: 'a', title: 'A', filename: 'a.json', category: 'synthetic-patient-records', synthetic: true, content: 'Falls', embedding: [1, 0] },
    { id: 'a2', documentId: 'a', title: 'A', filename: 'a.json', category: 'synthetic-patient-records', synthetic: true, content: 'Conditions', embedding: [0.9, 0.1] },
    { id: 'b1', documentId: 'b', title: 'B', filename: 'b.json', category: 'synthetic-patient-records', synthetic: true, content: 'Diabetes', embedding: [0, 1] },
    { id: 'p1', documentId: 'p', title: 'Project', filename: 'p.pptx', category: 'project-documents', content: 'Falls', embedding: [1, 0] },
  ], [1, 0])
  assert.equal(cases.length, 2)
  assert.equal(cases[0]?.documentId, 'a')
  assert.equal(cases[0]?.excerpt, 'Falls')
})

test('related guidance is only returned for matching clinical features', () => {
  const chunks = [{ id: 'g1', documentId: 'g', title: 'Fall prevention', filename: 'guide.pdf', category: 'geriatric-clinical-guidance', content: 'Screen for falls.', embedding: [1, 0] }]
  assert.equal(relatedGuidance(chunks, 'fall risk', [1, 0]).length, 1)
  assert.equal(relatedGuidance(chunks, 'hypertension', [1, 0]).length, 0)
})

test('Chinese guidance queries match clinical text and never return project or patient evidence', () => {
  const content = '\u9ad8\u8840\u538b\u60a3\u8005\u7684\u81b3\u98df\u6307\u5bfc'
  const base = { id: 'g1', documentId: 'g', title: 'Hypertension guidance', filename: 'guide.pdf', content, embedding: [1, 0] }
  const chunks = [
    { ...base, category: 'geriatric-clinical-guidance' },
    { ...base, id: 'p1', documentId: 'project', category: 'project-documents' },
    { ...base, id: 's1', documentId: 'patient', category: 'synthetic-patient-records', synthetic: true },
  ]
  assert.deepEqual(relatedGuidance(chunks, '\u9ad8\u8840\u538b \u81b3\u98df', [1, 0]).map(item => item.documentId), ['g'])
  assert.equal(relatedGuidance(chunks, '\u9aa8\u8d28\u758f\u677e', [1, 0]).length, 0)
})
