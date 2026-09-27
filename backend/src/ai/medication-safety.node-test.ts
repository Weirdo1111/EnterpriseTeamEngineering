import assert from 'node:assert/strict'
import test from 'node:test'
import { checkOrderSafety, validateMedicationCatalog } from './medication-safety.js'
import { createDdiIndex } from './ddinter.js'

const evidence = { title: 'Fictional pharmacy review', url: 'https://example.org/fictional-label', version: '1', reviewedBy: 'Test Pharmacist', reviewedAt: '2026-01-01' }
const catalog = validateMedicationCatalog({
  formatVersion: 1, jurisdiction: 'CN', version: 'synthetic-test-v1', medications: [
    { ingredient: 'Drug A', approvalNumber: 'TEST-A', interactions: [{ withIngredient: 'Drug B', message: 'Fictional interaction.', severity: 'critical', evidence }],
      crossAllergies: [{ allergenIngredient: 'Drug C', message: 'Fictional cross-allergy.', severity: 'warning', evidence }],
      doseRules: [{ route: 'oral', maxDailyMg: 100, message: 'Fictional daily limit exceeded.', evidence }, { route: 'oral', maxDailyMg: 50, maxEgfr: 30, message: 'Fictional renal limit exceeded.', evidence }] },
    { ingredient: 'Drug B', approvalNumber: 'TEST-B' },
  ],
})

const order = { type: 'Medication', medication: { ingredient: 'Drug A', approvalNumber: 'TEST-A', route: 'oral', dose: { value: 60, unit: 'mg' }, frequencyPerDay: 2 } }

test('reviewed rules surface interaction, cross-allergy and dose with provenance', () => {
  const result = checkOrderSafety({ patient: { age: 75, allergyStatus: 'known', allergies: ['Drug C'], currentMedications: ['Drug B'], medicationListConfirmed: true, egfr: 25 }, order }, catalog)
  assert.deepEqual(result.findings.map(item => item.category), ['cross-allergy', 'interaction', 'dose', 'dose'])
  assert.equal(result.findings[0]?.evidence?.reviewedBy, 'Test Pharmacist')
  assert.equal(result.catalogVersion, 'synthetic-test-v1')
  assert.equal(result.status, 'potential-match')
})

test('no catalog or incomplete patient context never clears an order', () => {
  const result = checkOrderSafety({ patient: { allergyStatus: 'unknown' }, order })
  assert.equal(result.status, 'incomplete')
  assert.ok(result.notChecked.some(item => item.includes('catalog')))
  assert.ok(result.notChecked.some(item => item.includes('Interaction')))
  assert.ok(result.notChecked.some(item => item.includes('Dose')))
})

test('exact allergy catches a verified ingredient without a knowledge catalog', () => {
  const result = checkOrderSafety({ patient: { allergyStatus: 'known', allergies: ['drug a'] }, order })
  assert.equal(result.findings[0]?.category, 'allergy')
  assert.equal(result.status, 'potential-match')
})

test('Chinese and English penicillin names trigger an exact allergy warning', () => {
  const result = checkOrderSafety({ patient: { allergyStatus: 'known', allergies: ['Penicillin'] }, order: { type: 'Medication', medication: { ingredient: '青霉素' } } })
  assert.equal(result.findings[0]?.category, 'allergy')
  assert.equal(result.findings[0]?.severity, 'critical')
})

test('amoxicillin with dose and route triggers a preliminary penicillin-class warning', () => {
  const result = checkOrderSafety({ patient: { age: 72, allergyStatus: 'known', allergies: ['青霉素'] }, order: { type: 'Medication', medication: { ingredient: 'Amoxicillin 0.5g oral' } } })
  assert.equal(result.findings[0]?.category, 'cross-allergy')
  assert.equal(result.findings[0]?.severity, 'critical')
  assert.match(result.findings[0]?.reference?.url || '', /^https:\/\//)
  assert.ok(result.notChecked.some(item => item.includes('catalog')))
  assert.ok(result.notChecked.some(item => item.includes('Beers')))
})

test('azithromycin and metoprolol are not mistaken for penicillin allergy clearance', () => {
  for (const ingredient of ['Azithromycin 0.25g oral', 'Metoprolol 25mg oral']) {
    const result = checkOrderSafety({ patient: { age: 72, allergyStatus: 'known', allergies: ['Penicillin'] }, order: { type: 'Medication', medication: { ingredient } } })
    assert.equal(result.findings.filter(item => item.category === 'allergy' || item.category === 'cross-allergy').length, 0)
    assert.equal(result.status, 'incomplete')
    assert.ok(result.notChecked.some(item => item.includes('Beers')))
  }
})

test('DDInter screens confirmed medicines while preserving coverage gaps', () => {
  const ddi = createDdiIndex({ schemaVersion: 1, source: { name: 'DDInter 2.0' }, drugs: [
    { id: 'D1', name: 'Metoprolol', rxnormName: 'metoprolol' },
    { id: 'D2', name: 'Verapamil', rxnormName: 'verapamil' },
  ], mechanisms: { '1': 'Additive slowing of heart rate.' }, interactions: [['D1', 'D2', 'Major', '1']] })
  const proposed = { type: 'Medication', medication: { ingredient: 'Metoprolol 25mg oral' } }
  const patient = { age: 72, allergyStatus: 'known', allergies: ['Penicillin'], currentMedications: ['Verapamil'], medicationListConfirmed: true }
  const result = checkOrderSafety({ patient, order: proposed }, null, ddi)
  assert.equal(result.findings[0]?.category, 'interaction')
  assert.equal(result.findings[0]?.severity, 'critical')
  assert.ok(result.checked.some(item => item.includes('DDInter')))
  assert.ok(result.notChecked.some(item => item.includes('not exhaustive')))

  const unconfirmed = checkOrderSafety({ patient: { ...patient, medicationListConfirmed: false }, order: proposed }, null, ddi)
  assert.equal(unconfirmed.findings.length, 0)
  assert.ok(unconfirmed.notChecked.some(item => item.includes('confirm the complete current medication list')))
})

test('renal rule is not silently treated as checked when eGFR is absent', () => {
  const result = checkOrderSafety({ patient: { allergyStatus: 'none', currentMedications: [], medicationListConfirmed: true }, order }, catalog)
  assert.ok(result.notChecked.some(item => item.includes('eGFR')))
  assert.equal(result.findings.filter(item => item.category === 'dose').length, 1)
})

test('a reverse-direction interaction rule is also detected', () => {
  const reverse = validateMedicationCatalog({ formatVersion: 1, jurisdiction: 'CN', version: 'reverse-test', medications: [
    { ingredient: 'Drug A', approvalNumber: 'TEST-A' },
    { ingredient: 'Drug B', approvalNumber: 'TEST-B', interactions: [{ withIngredient: 'Drug A', message: 'Fictional reverse interaction.', severity: 'warning', evidence }] },
  ] })
  const result = checkOrderSafety({ patient: { allergyStatus: 'none', currentMedications: ['Drug B'], medicationListConfirmed: true }, order }, reverse)
  assert.equal(result.findings[0]?.category, 'interaction')
})

test('invalid catalog rules fail before the server accepts traffic', () => {
  assert.throws(() => validateMedicationCatalog({ formatVersion: 1, jurisdiction: 'CN', version: 'bad', medications: [
    { ingredient: 'Drug A', approvalNumber: 'TEST-A', doseRules: [{ route: 'oral', maxDailyMg: 50, message: 'Bad rule', evidence: { ...evidence, reviewedBy: '' } }] },
  ] }), /Invalid dose rule/)
})
