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
  followUpItems?: string[]
}

export function generateClinicalDraft(input: Record<string, unknown>, now = () => new Date().toISOString()): ClinicalDraftSuggestion {
  const patient = input.patient as PatientContext | undefined
  if (!patient || typeof patient.id !== 'string' || !patient.id) throw new Error('A valid patient context is required.')
  const consultation = input.consultation && typeof input.consultation === 'object' ? input.consultation as Record<string, unknown> : undefined
  const messages = Array.isArray(consultation?.messages)
    ? consultation.messages.filter(message => message && typeof message === 'object')
      .map(message => {
        const item = message as Record<string, unknown>
        const content = limited(item.content, 1000)
        if (!content) return ''
        return `${item.sender === 'patient' ? 'Patient' : item.sender === 'doctor' ? 'Physician' : 'Other'}: ${content}`
      }).filter(Boolean).join('\n')
    : ''
  const references = Array.isArray(input.references) ? input.references : []
  const referenceIds = references.map(reference => reference && typeof reference === 'object' ? (reference as Record<string, unknown>).id : undefined).filter((id): id is string => typeof id === 'string').slice(0, 2)
  const allergies = Array.isArray(patient.allergies) ? patient.allergies.filter(value => typeof value === 'string') : []
  const safetyWarnings = [
    patient.allergyStatus === 'known' && allergies.length ? `Documented allergies: ${allergies.join(', ')}.` : 'Allergy status is not fully confirmed.',
    'AI-generated content must be verified against the complete history, examination, and test results.',
  ]
  if (patient.status === 'critical') safetyWarnings.unshift('High-risk patient: assess whether urgent in-person care or emergency escalation is required.')
  return {
    chiefComplaint: typeof consultation?.complaint === 'string' && consultation.complaint.trim() ? consultation.complaint.trim() : patient.symptoms?.trim() || 'Follow-up assessment',
    presentIllness: [patient.history?.trim() ? `Recorded history: ${patient.history.trim()}` : '', messages ? `Consultation statements:\n${messages}` : '', typeof input.additionalNotes === 'string' && input.additionalNotes.trim() ? `Physician notes: ${input.additionalNotes.trim()}` : ''].filter(Boolean).join('\n\n') || 'No history or consultation statements were supplied.',
    diagnosis: 'Pending physician assessment',
    orders: [],
    safetyWarnings,
    sourceIds: [patient.id, typeof consultation?.id === 'string' ? consultation.id : undefined, ...referenceIds].filter((value): value is string => Boolean(value)),
    generator: 'rule-based-clinical-draft-v1',
    generatedAt: now(),
  }
}

type MessageInput = { sender?: unknown; content?: unknown; time?: unknown }

function limited(value: unknown, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function summarizeConsultation(input: Record<string, unknown>) {
  const patient = input.patient && typeof input.patient === 'object' ? input.patient as Record<string, unknown> : {}
  const consultation = input.consultation && typeof input.consultation === 'object' ? input.consultation as Record<string, unknown> : {}
  const messages = Array.isArray(consultation.messages) ? consultation.messages.slice(0, 100) as MessageInput[] : []
  const patientStatements = messages.filter(item => item?.sender === 'patient').map(item => limited(item.content, 1000)).filter(Boolean)
  const clinicianStatements = messages.filter(item => item?.sender === 'doctor').map(item => limited(item.content, 1000)).filter(Boolean)
  const followUpItems = clinicianStatements.filter(item => /\b(?:please|continue|repeat|follow.?up|monitor|review|arrange|schedule|attend|bring|return)\b/i.test(item))
  const additionalNotes = limited(input.additionalNotes, 4000)
  const missingInformation = [
    !messages.length && !additionalNotes ? 'No consultation transcript or physician notes were provided.' : '',
    patient.allergyStatus === 'unknown' || !patient.allergyStatus ? 'Allergy status is not confirmed.' : '',
    'Current medication list and objective test results must be checked in the source record.',
  ].filter(Boolean)
  return {
    chiefComplaint: limited(consultation.complaint, 500) || limited(patient.symptoms, 500) || 'Not documented',
    recordedHistory: limited(patient.history, 4000) || 'Not documented',
    existingDiagnosis: limited(patient.diagnosis, 500) || 'Not documented',
    patientStatements,
    clinicianStatements,
    followUpItems,
    additionalNotes,
    missingInformation,
    sourceIds: [limited(patient.id, 64), limited(consultation.id, 64)].filter(Boolean),
    generatedAt: new Date().toISOString(),
  }
}
