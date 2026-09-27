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
  evidence?: { field: string; sourceId: string; quote: string }[]
  followUpItems?: string[]
}

export interface ConsultationSummary {
  chiefComplaint: string
  recordedHistory: string
  existingDiagnosis: string
  patientStatements: string[]
  clinicianStatements: string[]
  followUpItems: string[]
  additionalNotes: string
  missingInformation: string[]
  sourceIds: string[]
  generatedAt: string
  generator?: string
  evidence?: { field: string; sourceId: string; quote: string }[]
}

export interface OrderSafetyCheck {
  status: 'potential-match' | 'incomplete'
  alerts: string[]
  findings: { category: 'allergy' | 'cross-allergy' | 'interaction' | 'dose'; severity: 'warning' | 'critical'; message: string; evidence?: { title: string; url: string; version: string; reviewedBy: string; reviewedAt: string } }[]
  documentedAllergies: string[]
  checked: string[]
  notChecked: string[]
  catalogVersion: string | null
  generatedAt: string
}

export interface MedicationSafetyInput {
  ingredient: string
  approvalNumber: string
  route: string
  dose: { value: number | null; unit: 'mg' | 'g' | 'mcg' }
  frequencyPerDay: number | null
}

export interface SimilarCase {
  documentId: string
  title: string
  excerpt: string
  location?: string
  sourceUrl?: string
  score: number
  synthetic: true
}

export interface RelatedGuidance {
  documentId: string
  title: string
  excerpt: string
  location?: string
  sourceUrl?: string
  publisher?: string
}

export interface SimilarCaseResult { cases: SimilarCase[]; guidance: RelatedGuidance[] }

export interface AssistantContext {
  patient: Patient
  consultation?: ConsultationSession
  additionalNotes?: string
}

export interface ClinicalAiService {
  generateRecordDraft(context: AssistantContext & { references: RagReference[] }): Promise<ClinicalDraftSuggestion>
  summarizeConsultation(context: AssistantContext): Promise<ConsultationSummary>
  checkOrder(context: { patient: Patient & { currentMedications?: string[]; medicationListConfirmed?: boolean; egfr?: number }; order: Pick<MedicalOrder, 'type' | 'content'> & { medication?: MedicationSafetyInput } }): Promise<OrderSafetyCheck>
  findSimilarCases(query: string): Promise<SimilarCaseResult>
}

function backendRequired(): never {
  throw new Error('The clinical assistant requires the authenticated backend API.')
}

const localClinicalAiService: ClinicalAiService = {
  async generateRecordDraft({ patient, consultation, references, additionalNotes }) {
    const messages = consultation?.messages.map(message => `${message.sender === 'patient' ? 'Patient' : message.sender === 'doctor' ? 'Physician' : 'Other'}: ${message.content}`).join('\n') ?? ''
    const sourceIds = [patient.id, consultation?.id, ...references.slice(0, 2).map(item => item.id)].filter((value): value is string => Boolean(value))
    const safetyWarnings = [
      patient.allergyStatus === 'known' ? `Documented allergies: ${patient.allergies.join(', ')}.` : 'Allergy status is not fully confirmed.',
      'AI-generated content must be verified against the complete history, examination, and test results.',
    ]
    if (patient.status === 'critical') safetyWarnings.unshift('High-risk patient: assess whether urgent in-person care or emergency escalation is required.')

    return {
      chiefComplaint: consultation?.complaint || patient.symptoms || 'Follow-up assessment',
      presentIllness: [patient.history ? `Recorded history: ${patient.history}` : '', messages ? `Consultation statements:\n${messages}` : '', additionalNotes?.trim() ? `Physician notes: ${additionalNotes.trim()}` : ''].filter(Boolean).join('\n\n') || 'No history or consultation statements were supplied.',
      diagnosis: 'Pending physician assessment',
      orders: [],
      safetyWarnings,
      sourceIds,
      generator: 'rule-based-clinical-draft-v1',
      generatedAt: new Date().toISOString(),
    }
  },
  async summarizeConsultation() { return backendRequired() },
  async checkOrder() { return backendRequired() },
  async findSimilarCases() { return backendRequired() },
}

const apiClinicalAiService: ClinicalAiService = {
  async generateRecordDraft(context) {
    return (await apiRequest<{ suggestion: ClinicalDraftSuggestion }>('/api/ai/record-draft', {
      method: 'POST', body: JSON.stringify(context),
    })).suggestion
  },
  async summarizeConsultation(context) {
    return (await apiRequest<{ summary: ConsultationSummary }>('/api/ai/consultation-summary', {
      method: 'POST', body: JSON.stringify(context),
    })).summary
  },
  async checkOrder(context) {
    return (await apiRequest<{ check: OrderSafetyCheck }>('/api/ai/order-check', {
      method: 'POST', body: JSON.stringify(context),
    })).check
  },
  async findSimilarCases(query) {
    return await apiRequest<SimilarCaseResult>('/api/ai/similar-cases', {
      method: 'POST', body: JSON.stringify({ query }),
    })
  },
}

export const clinicalAiService = apiEnabled ? apiClinicalAiService : localClinicalAiService
