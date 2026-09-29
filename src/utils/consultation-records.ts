import type { ConsultationSession, MedicalRecord } from '@/types/clinical'

/** Copy only the clinician's saved summary. Never infer diagnoses or orders. */
export function consultationRecordDraft(session: ConsultationSession, doctor: string, id: string, updatedAt: string): MedicalRecord {
  const summary = session.summary
  if (!summary) throw new Error('Save a consultation summary before creating a medical record.')
  return {
    id,
    patientId: session.patientId,
    patientName: session.patientName,
    doctor,
    chiefComplaint: summary.chiefComplaint,
    presentIllness: [
      summary.consultationNotes,
      ...(summary.plan ? [`Advice / plan:\n${summary.plan}`] : []),
      ...(summary.followUp ? [`Follow-up:\n${summary.followUp}`] : []),
    ].join('\n\n'),
    diagnosis: summary.assessment,
    orders: [],
    status: 'draft',
    aiGenerated: false,
    sourceConsultationId: session.id,
    sourceSummaryUpdatedAt: summary.updatedAt,
    reviewHistory: [],
    version: 1,
    createdAt: updatedAt,
    updatedAt,
  }
}
