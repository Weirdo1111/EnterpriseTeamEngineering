import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFhirBundle } from './fhir.js'

test('FHIR parser excludes direct identifiers and produces clinical chunks', () => {
  const parsed = parseFhirBundle(JSON.stringify({ resourceType: 'Bundle', entry: [
    { resource: { resourceType: 'Patient', name: [{ text: 'Do Not Leak' }], address: [{ city: 'Boston' }], identifier: [{ value: 'secret' }], birthDate: '1940-01-01', gender: 'female' } },
    { resource: { resourceType: 'Condition', code: { text: 'Hypertension' }, onsetDateTime: '2020-01-01' } },
    { resource: { resourceType: 'MedicationRequest', medicationCodeableConcept: { text: 'Lisinopril' }, status: 'active', authoredOn: '2024-01-01' } }
  ] }))
  const content = parsed.chunks.map(chunk => chunk.content).join(' ')
  assert.match(content, /Hypertension/)
  assert.match(content, /Lisinopril/)
  assert.doesNotMatch(content, /Do Not Leak|Boston|secret|1940-01-01/)
})

test('FHIR parser rejects non-bundle JSON', () => {
  assert.throws(() => parseFhirBundle('{}'), /FHIR Bundle/)
})
