import type { ConsultationSession, MedicalOrder, Patient, RagReference } from '@/types/clinical'
import { apiEnabled, apiRequest } from './http'

export interface ClinicalDraftSuggestion {
  chiefComplaint: string
  presentIllness: string
  diagnosis: string
  orders: Pick<MedicalOrder, 'type' | 'content'>[]
  safetyWarnings: string[]
  sourceIds: string[]
  generator: string
  generatedAt: string
}

export interface ClinicalAiService {
  generateRecordDraft(context: { patient: Patient; consultation?: ConsultationSession; references: RagReference[] }): Promise<ClinicalDraftSuggestion>
}

// Deterministic and traceable fallback. Replace this adapter with the FastAPI RAG endpoint.
const localClinicalAiService: ClinicalAiService = {
  async generateRecordDraft({ patient, consultation, references }) {
    const messages = consultation?.messages.map(message => message.content).join(' ') ?? ''
    const sourceIds = [patient.id, consultation?.id, ...references.slice(0, 2).map(item => item.id)].filter((value): value is string => Boolean(value))
    const safetyWarnings = [
      patient.allergyStatus === 'known' ? `Documented allergies: ${patient.allergies.join(', ')}.` : 'Allergy status is not fully confirmed.',
      'AI-generated content must be verified against the complete history, examination, and test results.',
    ]
    if (patient.status === 'critical') safetyWarnings.unshift('High-risk patient: assess whether urgent in-person care or emergency escalation is required.')

    const orders: Pick<MedicalOrder, 'type' | 'content'>[] = patient.status === 'critical'
      ? [
          { type: 'Nursing', content: 'Monitor oxygen saturation, respiratory rate, and other key vital signs' },
          { type: 'Examination', content: 'Arrange prompt in-person clinical assessment' },
        ]
      : [
          { type: 'Nursing', content: 'Continue monitoring key vital signs and document trends' },
          { type: 'Examination', content: 'Complete follow-up examinations relevant to the current diagnosis' },
        ]

    return {
      chiefComplaint: consultation?.complaint || patient.symptoms || 'Follow-up assessment',
      presentIllness: [patient.history, messages ? `Consultation summary: ${messages}` : 'No linked consultation transcript was available.'].filter(Boolean).join(' '),
      diagnosis: patient.diagnosis || 'Diagnosis pending physician assessment',
      orders,
      safetyWarnings,
      sourceIds,
      generator: 'rule-based-clinical-draft-v1',
      generatedAt: new Date().toISOString(),
    }
  },
}

const apiClinicalAiService: ClinicalAiService = {
  async generateRecordDraft(context) {
    return (await apiRequest<{ suggestion: ClinicalDraftSuggestion }>('/api/ai/record-draft', {
      method: 'POST', body: JSON.stringify(context),
    })).suggestion
  },
}

export const clinicalAiService = apiEnabled ? apiClinicalAiService : localClinicalAiService
