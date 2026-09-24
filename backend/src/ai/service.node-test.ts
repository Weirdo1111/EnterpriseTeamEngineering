import assert from 'node:assert/strict'
import test from 'node:test'
import { generateClinicalDraft } from './service.js'

test('creates a traceable draft with allergy warnings and no medication dose', () => {
  const result = generateClinicalDraft({
    patient: { id: 'P-1', status: 'warning', symptoms: 'Head pressure', diagnosis: 'Hypertension', history: 'Two days of symptoms.', allergyStatus: 'known', allergies: ['Penicillin'] },
    consultation: { id: 'C-1', complaint: 'Morning headache', messages: [{ content: 'Blood pressure was elevated.' }] },
    references: [{ id: 'R-1' }],
  }, () => '2026-09-24T00:00:00.000Z')
  assert.deepEqual(result.sourceIds, ['P-1', 'C-1', 'R-1'])
  assert.match(result.safetyWarnings.join(' '), /Penicillin/)
  assert.equal(result.orders.some(order => /\bmg\b|\bdose\b/i.test(order.content)), false)
})

test('adds escalation guidance for critical patients', () => {
  const result = generateClinicalDraft({ patient: { id: 'P-2', status: 'critical' } })
  assert.match(result.safetyWarnings[0]!, /High-risk patient/)
  assert.equal(result.orders.some(order => order.content.includes('in-person')), true)
})
