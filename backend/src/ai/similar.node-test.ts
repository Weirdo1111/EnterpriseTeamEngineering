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
