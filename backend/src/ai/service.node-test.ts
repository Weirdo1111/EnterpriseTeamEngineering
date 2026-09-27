import assert from 'node:assert/strict'
import test from 'node:test'
import { generateClinicalDraft, summarizeConsultation } from './service.js'

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
  assert.deepEqual(result.orders, [])
  assert.equal(result.diagnosis, 'Pending physician assessment')
})

test('consultation summary keeps recorded statements separate from diagnosis', () => {
  const result = summarizeConsultation({
    patient: { id: 'P-1', history: 'Hypertension', allergyStatus: 'unknown' },
    consultation: { id: 'C-1', complaint: 'Head pressure', messages: [
      { sender: 'patient', content: 'Blood pressure was 152/94.' },
      { sender: 'doctor', content: 'Please record blood pressure for three days.' },
    ] },
  })
  assert.equal(result.chiefComplaint, 'Head pressure')
  assert.deepEqual(result.patientStatements, ['Blood pressure was 152/94.'])
  assert.deepEqual(result.clinicianStatements, ['Please record blood pressure for three days.'])
  assert.deepEqual(result.followUpItems, ['Please record blood pressure for three days.'])
  assert.ok(result.missingInformation.some(item => item.includes('Allergy status')))
})
