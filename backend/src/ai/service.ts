type PatientContext = {
  id: string
  status?: string
  symptoms?: string
  diagnosis?: string
  history?: string
  allergyStatus?: string
  allergies?: string[]
}

export interface ClinicalDraftSuggestion {
  chiefComplaint: string
  presentIllness: string
  diagnosis: string
  orders: { type: 'Nursing' | 'Examination'; content: string }[]
  safetyWarnings: string[]
  sourceIds: string[]
  generator: string
  generatedAt: string
}

export function generateClinicalDraft(input: Record<string, unknown>, now = () => new Date().toISOString()): ClinicalDraftSuggestion {
  const patient = input.patient as PatientContext | undefined
  if (!patient || typeof patient.id !== 'string' || !patient.id) throw new Error('A valid patient context is required.')
  const consultation = input.consultation && typeof input.consultation === 'object' ? input.consultation as Record<string, unknown> : undefined
  const messages = Array.isArray(consultation?.messages)
    ? consultation.messages.map(message => message && typeof message === 'object' ? String((message as Record<string, unknown>).content ?? '') : '').filter(Boolean).join(' ')
    : ''
  const references = Array.isArray(input.references) ? input.references : []
  const referenceIds = references.map(reference => reference && typeof reference === 'object' ? (reference as Record<string, unknown>).id : undefined).filter((id): id is string => typeof id === 'string').slice(0, 2)
  const allergies = Array.isArray(patient.allergies) ? patient.allergies.filter(value => typeof value === 'string') : []
  const safetyWarnings = [
    patient.allergyStatus === 'known' && allergies.length ? `Documented allergies: ${allergies.join(', ')}.` : 'Allergy status is not fully confirmed.',
    'AI-generated content must be verified against the complete history, examination, and test results.',
  ]
  if (patient.status === 'critical') safetyWarnings.unshift('High-risk patient: assess whether urgent in-person care or emergency escalation is required.')
  const critical = patient.status === 'critical'
  return {
    chiefComplaint: typeof consultation?.complaint === 'string' && consultation.complaint.trim() ? consultation.complaint.trim() : patient.symptoms?.trim() || 'Follow-up assessment',
    presentIllness: [patient.history?.trim(), messages ? `Consultation summary: ${messages}` : 'No linked consultation transcript was available.'].filter(Boolean).join(' '),
    diagnosis: patient.diagnosis?.trim() || 'Diagnosis pending physician assessment',
    orders: critical
      ? [{ type: 'Nursing', content: 'Monitor oxygen saturation, respiratory rate, and other key vital signs' }, { type: 'Examination', content: 'Arrange prompt in-person clinical assessment' }]
      : [{ type: 'Nursing', content: 'Continue monitoring key vital signs and document trends' }, { type: 'Examination', content: 'Complete follow-up examinations relevant to the current diagnosis' }],
    safetyWarnings,
    sourceIds: [patient.id, typeof consultation?.id === 'string' ? consultation.id : undefined, ...referenceIds].filter((value): value is string => Boolean(value)),
    generator: 'rule-based-clinical-draft-v1',
    generatedAt: now(),
  }
}
