import type { ConsultationSession } from '@/types/clinical'
import { formatConsultationTime } from './consultations'

function recorded(value: string) {
  return value.trim() ? value : 'Not recorded'
}

/** Export only the saved session. Drafts and other clinical records are not inputs. */
export function exportConsultationText(session: ConsultationSession, patientName: string, profileMissing = false): string {
  const header = [
    'LOCAL DEMO CONSULTATION RECORD',
    `Patient ID: ${session.patientId}`,
    `Current patient name: ${profileMissing ? 'Profile unavailable' : patientName}`,
    `Patient name at consultation creation (snapshot): ${session.patientName}`,
    `Session: ${session.id}`,
    `Status: ${session.status}`,
    `Chief complaint: ${session.complaint}`,
    `Last updated: ${formatConsultationTime(session.updatedAt)}`,
  ].join('\n')

  const saved = session.summary
  const summary = saved ? [
    'Consultation Summary (clinician-written)',
    `Saved by: ${recorded(saved.authorName)}`,
    `Last saved: ${formatConsultationTime(saved.updatedAt)}`,
    `Chief complaint:\n${recorded(saved.chiefComplaint)}`,
    `Consultation notes:\n${recorded(saved.consultationNotes)}`,
    `Assessment:\n${recorded(saved.assessment)}`,
    `Plan:\n${recorded(saved.plan)}`,
    `Follow-up:\n${recorded(saved.followUp)}`,
  ].join('\n\n') : 'Consultation summary: Not recorded'

  const conversation = [
    'Conversation messages',
    'Images are listed by filename. Open each image in the conversation to download its original file.',
    ...session.messages.map(message => {
      const sender = message.sender === 'doctor' ? 'Physician' : message.sender === 'patient' ? 'Patient' : 'AI Assistant'
      return [
        `${formatConsultationTime(message.time)} ${sender}:${message.content ? ` ${message.content}` : ''}`,
        ...(message.image ? [`Image: ${message.image.name} (${message.image.width} × ${message.image.height}, ${message.image.size} bytes)`] : []),
        ...(message.attachment ? [`Sample attachment reference (no uploaded file): ${message.attachment}`] : []),
      ].join('\n')
    }),
  ].join('\n\n')

  return [header, summary, conversation].join('\n\n')
}
