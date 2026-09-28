import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareClinicalDraft, prepareConsultationSummary, syntheticSources, validateNarrative } from './synthetic-narrative.js'

const encounter = {
  patient: { id: 'P-202609-002', name: 'Xiulan Chen', phone: 'SENSITIVE_NOT_FOR_MODEL', history: 'Six months after coronary stent placement; medication adherence is good and exercise tolerance has recently improved.', allergyStatus: 'none' },
  consultation: { id: 'C-20260911-03', complaint: 'Post-PCI follow-up', messages: [
    { id: 'm7', sender: 'patient', content: 'I have had no recent chest pain, and walking feels easier than last month.' },
    { id: 'm8', sender: 'doctor', content: 'Continue taking your medication regularly and repeat the lipid panel and ECG within two weeks.' },
  ] },
}

const field = (text: string, sourceId: string, quote = text) => ({ text, evidence: [{ sourceId, quote }] })
const modelOutput = {
  chiefComplaint: field('Post-PCI follow-up', 'C-20260911-03:complaint'),
  presentIllness: field('No recent chest pain; walking feels easier.', 'm7', 'I have had no recent chest pain, and walking feels easier than last month.'),
  patientStatements: [field('I have had no recent chest pain, and walking feels easier than last month.', 'm7')],
  clinicianStatements: [field('Continue taking your medication regularly and repeat the lipid panel and ECG within two weeks.', 'm8')],
  followUpItems: [field('repeat the lipid panel and ECG within two weeks.', 'm8')],
}

test('synthetic model receives server-owned transcript and returns source-linked draft', async () => {
  let seen = ''
  const draft = await prepareClinicalDraft(encounter, async sources => { seen = JSON.stringify(sources); return modelOutput })
  assert.doesNotMatch(seen, /SENSITIVE_NOT_FOR_MODEL/)
  assert.equal(draft.generator, 'ark-synthetic-source-linked-v1')
  assert.equal(draft.presentIllness, modelOutput.presentIllness.text)
  assert.equal(draft.evidence?.[1]?.sourceId, 'm7')
  assert.deepEqual(draft.followUpItems, [modelOutput.followUpItems[0]!.text])
  assert.equal(draft.diagnosis, 'Pending physician assessment')
  assert.deepEqual(draft.orders, [])
})

test('free-text notes and changed transcripts never reach the model', async () => {
  let calls = 0
  const model = async () => { calls += 1; return modelOutput }
  const withNotes = await prepareClinicalDraft({ ...encounter, additionalNotes: 'SENSITIVE_NOT_FOR_MODEL' }, model)
  const changed = await prepareClinicalDraft({ ...encounter, consultation: { ...encounter.consultation, messages: [{ ...encounter.consultation.messages[0], content: 'Changed transcript' }, encounter.consultation.messages[1]] } }, model)
  const changedIdentity = await prepareClinicalDraft({ ...encounter, patient: { ...encounter.patient, name: 'Different Person' } }, model)
  assert.equal(calls, 0)
  assert.match(withNotes.presentIllness, /SENSITIVE_NOT_FOR_MODEL/)
  assert.equal(changed.generator, 'rule-based-clinical-draft-v1')
  assert.equal(changedIdentity.generator, 'rule-based-clinical-draft-v1')
})

test('unsupported numbers or missing evidence cause rule-based fallback', async () => {
  const draft = await prepareClinicalDraft(encounter, async () => ({ ...modelOutput, presentIllness: field('Blood pressure 999/999.', 'm7') }))
  assert.equal(draft.generator, 'rule-based-clinical-draft-v1')
  assert.ok(draft.safetyWarnings.some(item => item.includes('source validation')))
  assert.throws(() => validateNarrative({ ...modelOutput, chiefComplaint: field('Follow-up', 'unknown') }, syntheticSources(encounter)!), /Unverifiable/)
})

test('summary uses the same source-linked model only for synthetic encounters', async () => {
  const result = await prepareConsultationSummary(encounter, async () => modelOutput)
  assert.equal(result.generator, 'ark-synthetic-source-linked-v1')
  assert.deepEqual(result.followUpItems, [modelOutput.followUpItems[0]!.text])
  assert.ok(result.evidence?.some(item => item.sourceId === 'm8'))
})
