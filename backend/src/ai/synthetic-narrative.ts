import { generateClinicalDraft, summarizeConsultation, type ClinicalDraftSuggestion } from './service.js'

export type NarrativeSource = { id: string; role: 'patient' | 'doctor' | 'record'; text: string }
export type NarrativeEvidence = { field: string; sourceId: string; quote: string }
type SyntheticEncounter = { patientId: string; patientName: string; consultationId: string; history: string; complaint: string; messages: { id: string; sender: 'patient' | 'doctor'; content: string }[] }

// The model receives only these server-owned, fictional records, never caller-supplied notes or demographics.
const encounters: SyntheticEncounter[] = [
  { patientId: 'P-202609-001', patientName: 'Jianguo Zhang', consultationId: 'C-20260912-01',
    history: 'Twelve-year history of hypertension and eight-year history of type 2 diabetes, with marked nighttime blood pressure fluctuations recently.',
    complaint: 'Elevated morning blood pressure and head pressure', messages: [
      { id: 'm1', sender: 'patient', content: 'Doctor, my blood pressure has still been high in the mornings for the past two days, and I feel some pressure in my head.' },
      { id: 'm2', sender: 'doctor', content: 'What was your exact blood pressure this morning? Did you take your medication on time last night?' },
      { id: 'm3', sender: 'patient', content: 'It was 152/94 this morning. I took my medicine last night, but I did not sleep well.' },
      { id: 'm4', sender: 'doctor', content: 'Please record your morning and bedtime blood pressure for three consecutive days. I will review it with your medication and sleep pattern before adjusting the plan.' },
    ] },
  { patientId: 'P-202609-002', patientName: 'Xiulan Chen', consultationId: 'C-20260911-03',
    history: 'Six months after coronary stent placement; medication adherence is good and exercise tolerance has recently improved.',
    complaint: 'Post-PCI follow-up', messages: [
      { id: 'm7', sender: 'patient', content: 'I have had no recent chest pain, and walking feels easier than last month.' },
      { id: 'm8', sender: 'doctor', content: 'Continue taking your medication regularly and repeat the lipid panel and ECG within two weeks.' },
    ] },
  { patientId: 'P-202609-003', patientName: 'Desheng Wang', consultationId: 'C-20260912-02',
    history: 'Fifteen-year history of COPD, with worsening cough over the past three days and pronounced exertional dyspnea.',
    complaint: 'Worsening cough and exertional dyspnea', messages: [
      { id: 'm5', sender: 'patient', content: 'Doctor, my cough has worsened over the past three days, and I get more breathless when walking.' },
      { id: 'm6', sender: 'patient', content: 'My oxygen saturation at home is 91%. Do I need to go to the hospital?' },
    ] },
]

function record(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null }

export function syntheticSources(input: Record<string, unknown>): NarrativeSource[] | null {
  const patient = record(input.patient)
  const consultation = record(input.consultation)
  if (!patient || !consultation || (typeof input.additionalNotes === 'string' && input.additionalNotes.trim())) return null
  const encounter = encounters.find(item => item.patientId === patient.id && item.consultationId === consultation.id)
  if (!encounter || patient.name !== encounter.patientName || patient.history !== encounter.history || consultation.complaint !== encounter.complaint || !Array.isArray(consultation.messages)) return null
  const messages = consultation.messages as unknown[]
  if (messages.length !== encounter.messages.length || messages.some((raw, index) => {
    const message = record(raw)
    const expected = encounter.messages[index]!
    return !message || message.id !== expected.id || message.sender !== expected.sender || message.content !== expected.content
  })) return null
  return [
    { id: `${encounter.patientId}:history`, role: 'record', text: encounter.history },
    { id: `${encounter.consultationId}:complaint`, role: 'record', text: encounter.complaint },
    ...encounter.messages.map(message => ({ id: message.id, role: message.sender, text: message.content })),
  ]
}

function parseField(value: unknown, field: string, sources: Map<string, NarrativeSource>, allowedRoles: NarrativeSource['role'][]): { text: string; evidence: NarrativeEvidence[] } {
  const item = record(value)
  if (!item || typeof item.text !== 'string' || !item.text.trim() || item.text.length > 2500 || !Array.isArray(item.evidence) || !item.evidence.length || item.evidence.length > 8) throw new Error(`Invalid ${field} field.`)
  const evidence = item.evidence.map(raw => {
    const entry = record(raw)
    const sourceId = typeof entry?.sourceId === 'string' ? entry.sourceId : ''
    const quote = typeof entry?.quote === 'string' ? entry.quote.trim() : ''
    const source = sources.get(sourceId)
    if (!source || !allowedRoles.includes(source.role) || quote.length < 5 || !source.text.includes(quote)) throw new Error(`Unverifiable ${field} evidence.`)
    return { field, sourceId, quote }
  })
  const numbers = item.text.match(/\d+(?:[./]\d+)?/g) || []
  const quotedNumbers = evidence.flatMap(entry => entry.quote.match(/\d+(?:[./]\d+)?/g) || [])
  if (numbers.some(number => !quotedNumbers.includes(number))) throw new Error(`Unsupported number in ${field}.`)
  return { text: item.text.trim(), evidence }
}

export function validateNarrative(value: unknown, sourceList: NarrativeSource[]) {
  const result = record(value)
  if (!result) throw new Error('The model returned an invalid narrative.')
  const sources = new Map(sourceList.map(source => [source.id, source]))
  const chiefComplaint = parseField(result.chiefComplaint, 'chiefComplaint', sources, ['record', 'patient'])
  const presentIllness = parseField(result.presentIllness, 'presentIllness', sources, ['record', 'patient'])
  function list(value: unknown, field: string, roles: NarrativeSource['role'][]) {
    if (!Array.isArray(value) || value.length > 10) throw new Error(`Invalid ${field} list.`)
    return value.map(item => parseField(item, field, sources, roles))
  }
  const patientStatements = list(result.patientStatements, 'patientStatements', ['patient'])
  const clinicianStatements = list(result.clinicianStatements, 'clinicianStatements', ['doctor'])
  const followUpItems = list(result.followUpItems, 'followUpItems', ['doctor'])
  const cited = new Set([chiefComplaint, presentIllness, ...patientStatements].flatMap(item => item.evidence.map(entry => entry.sourceId)))
  for (const source of sourceList.filter(item => item.role === 'patient' && /\d/.test(item.text))) {
    if (!cited.has(source.id)) throw new Error('A patient statement containing measurements was omitted.')
  }
  return { chiefComplaint, presentIllness, patientStatements, clinicianStatements, followUpItems }
}

export function parseNarrativeJson(raw: string) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(cleaned) as unknown
}

export type NarrativeModel = (sources: NarrativeSource[]) => Promise<unknown>

export async function prepareClinicalDraft(input: Record<string, unknown>, model?: NarrativeModel): Promise<ClinicalDraftSuggestion & { evidence?: NarrativeEvidence[] }> {
  const baseline = generateClinicalDraft(input)
  const sources = syntheticSources(input)
  if (!model || !sources) return baseline
  try {
    const output = validateNarrative(await model(sources), sources)
    return {
      ...baseline,
      chiefComplaint: output.chiefComplaint.text,
      presentIllness: output.presentIllness.text,
      evidence: [...output.chiefComplaint.evidence, ...output.presentIllness.evidence, ...output.followUpItems.flatMap(item => item.evidence)],
      followUpItems: output.followUpItems.map(item => item.text),
      generator: 'ark-synthetic-source-linked-v1',
      safetyWarnings: [...baseline.safetyWarnings, 'Confirm the model summary against linked source excerpts before submission.'],
    }
  } catch {
    return { ...baseline, safetyWarnings: [...baseline.safetyWarnings, 'Model summarization was unavailable or failed source validation; original recorded text was retained.'] }
  }
}

export async function prepareConsultationSummary(input: Record<string, unknown>, model?: NarrativeModel) {
  const baseline = summarizeConsultation(input)
  const sources = syntheticSources(input)
  if (!model || !sources) return { ...baseline, generator: 'rule-based-consultation-summary-v1', evidence: [] as NarrativeEvidence[] }
  try {
    const output = validateNarrative(await model(sources), sources)
    return {
      ...baseline,
      chiefComplaint: output.chiefComplaint.text,
      patientStatements: output.patientStatements.map(item => item.text),
      clinicianStatements: output.clinicianStatements.map(item => item.text),
      followUpItems: output.followUpItems.map(item => item.text),
      evidence: [output.chiefComplaint, ...output.patientStatements, ...output.clinicianStatements, ...output.followUpItems].flatMap(item => item.evidence),
      generator: 'ark-synthetic-source-linked-v1',
    }
  } catch {
    return { ...baseline, generator: 'rule-based-fallback-v1', evidence: [] as NarrativeEvidence[] }
  }
}
