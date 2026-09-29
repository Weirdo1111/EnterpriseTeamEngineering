import { describe, expect, it } from 'vitest'
import type { ConsultationSession, ConsultationSummary } from '@/types/clinical'
import { exportConsultationText } from './consultation-export'
import { formatConsultationTime } from './consultations'

function summary(): ConsultationSummary {
  return {
    chiefComplaint: 'Patient described a new concern',
    consultationNotes: 'Patient described the symptoms.\nOriginal document requested.',
    assessment: 'Assessment entered by the clinician',
    plan: 'Plan recorded by the clinician',
    followUp: 'Follow-up recorded by the clinician',
    authorName: 'Dr. Example',
    updatedAt: '2026-09-27T09:40:00.000Z',
  }
}

function session(): ConsultationSession {
  return {
    id: 'C-EXPORT-1', patientId: 'P-EXPORT-1', patientName: 'Saved Patient Name',
    complaint: 'Original consultation request', status: 'active', unread: 0,
    updatedAt: '2026-09-27T09:45:00.000Z',
    messages: [
      { id: 'legacy', sender: 'patient', content: 'Original patient message', time: 'Yesterday 16:32' },
      { id: 'reply', sender: 'doctor', content: 'First line\nSecond line', time: '2026-09-27T09:35:00.000Z' },
    ],
  }
}

describe('consultation text export', () => {
  it('distinguishes the current profile from the saved name snapshot and includes identity, status and timestamps', () => {
    const saved = session()
    const output = exportConsultationText(saved, 'Current Patient Name')
    expect(output.startsWith('LOCAL DEMO CONSULTATION RECORD\n')).toBe(true)
    expect(output).toContain('Patient ID: P-EXPORT-1')
    expect(output).toContain('Current patient name: Current Patient Name')
    expect(output).toContain('Patient name at consultation creation (snapshot): Saved Patient Name')
    expect(output).toContain('Session: C-EXPORT-1\nStatus: active')
    expect(output).toContain('Chief complaint: Original consultation request')
    expect(output).toContain(`Last updated: ${formatConsultationTime(saved.updatedAt)}`)
  })

  it('labels the historical name as a snapshot even when the current name is unchanged', () => {
    const saved = session()
    const output = exportConsultationText(saved, saved.patientName)
    expect(output).toContain('Current patient name: Saved Patient Name')
    expect(output).toContain('Patient name at consultation creation (snapshot): Saved Patient Name')
  })

  it('explicitly marks a missing current profile and retains the saved patient identity', () => {
    const saved = session()
    const output = exportConsultationText(saved, saved.patientName, true)
    expect(output).toContain('Patient ID: P-EXPORT-1')
    expect(output).toContain('Current patient name: Profile unavailable')
    expect(output).toContain('Patient name at consultation creation (snapshot): Saved Patient Name')
    expect(output).not.toContain('Current patient name: Saved Patient Name')
  })

  it('exports all five saved summary fields with their author and save time before the messages', () => {
    const saved = { ...session(), summary: summary() }
    const output = exportConsultationText(saved, saved.patientName)
    expect(output).toContain('Consultation Summary (clinician-written)')
    expect(output).toContain('Saved by: Dr. Example')
    expect(output).toContain(`Last saved: ${formatConsultationTime(saved.summary.updatedAt)}`)
    expect(output).toContain(`Chief complaint:\n${saved.summary.chiefComplaint}`)
    expect(output).toContain(`Consultation notes:\n${saved.summary.consultationNotes}`)
    expect(output).toContain(`Assessment:\n${saved.summary.assessment}`)
    expect(output).toContain(`Plan:\n${saved.summary.plan}`)
    expect(output).toContain(`Follow-up:\n${saved.summary.followUp}`)
    expect(output.indexOf('Consultation Summary')).toBeLessThan(output.indexOf('Conversation messages'))
  })

  it('uses Not recorded for empty summary fields without deriving content from the conversation', () => {
    const saved = { ...session(), summary: { ...summary(), chiefComplaint: '', consultationNotes: '  \n', assessment: '', plan: '\t', followUp: '' } }
    const output = exportConsultationText(saved, saved.patientName)
    for (const label of ['Chief complaint', 'Consultation notes', 'Assessment', 'Plan', 'Follow-up']) {
      expect(output).toContain(`${label}:\nNot recorded`)
    }
    expect(output).toContain('Original patient message')
    expect(output).toContain('Chief complaint: Original consultation request')
  })

  it('marks a missing summary explicitly instead of creating a fictional one', () => {
    const saved = session()
    const output = exportConsultationText(saved, saved.patientName)
    expect(output).toContain('Consultation summary: Not recorded')
    expect(output).not.toContain('Consultation Summary (clinician-written)')
    expect(output).not.toContain('Assessment:')
    expect(output).not.toContain('Saved by:')
  })

  it('keeps message sequence, original sample time labels, sender names and multiline text', () => {
    const saved = session()
    saved.messages.push({ id: 'ai-example', sender: 'ai', content: 'Existing AI-labelled sample text', time: '09:19' })
    const output = exportConsultationText(saved, saved.patientName)
    expect(output).toContain('Yesterday 16:32 Patient: Original patient message')
    expect(output).toContain(`${formatConsultationTime(saved.messages[1]!.time)} Physician: First line\nSecond line`)
    expect(output).toContain('09:19 AI Assistant: Existing AI-labelled sample text')
    expect(output.indexOf('Original patient message')).toBeLessThan(output.indexOf('First line'))
    expect(output.indexOf('First line')).toBeLessThan(output.indexOf('Existing AI-labelled sample text'))
  })

  it('includes image-only metadata and distinguishes sample attachments with no uploaded file', () => {
    const saved = session()
    saved.messages.push(
      { id: 'image-only', sender: 'doctor', content: '', time: '09:40', image: { id: 'image-1', name: 'original-image.png', mimeType: 'image/png', size: 2048, width: 640, height: 480 } },
      { id: 'sample', sender: 'patient', content: 'Sample reference', time: '09:41', attachment: 'example-report.jpg' },
    )
    const output = exportConsultationText(saved, saved.patientName)
    expect(output).toContain('09:40 Physician:\nImage: original-image.png (640 × 480, 2048 bytes)')
    expect(output).toContain('Sample attachment reference (no uploaded file): example-report.jpg')
    expect(output).toContain('Images are listed by filename. Open each image in the conversation to download its original file.')
    expect(output).not.toContain('data:image')
    expect(output).not.toContain('blob:')
  })

  it('exports a completed, read-only conversation and never includes an unrelated unsaved summary draft', () => {
    const saved = { ...session(), status: 'completed' as const, summary: summary(), summaryDraft: { ...summary(), assessment: 'UNSAVED DRAFT MUST NOT BE EXPORTED' } }
    const output = exportConsultationText(saved, saved.patientName)
    expect(output).toContain('Status: completed')
    expect(output).toContain('Assessment:\nAssessment entered by the clinician')
    expect(output).not.toContain('UNSAVED DRAFT MUST NOT BE EXPORTED')
  })

  it('does not alter the session, saved summary or nested message data', () => {
    const saved = { ...session(), summary: summary() }
    const original = structuredClone(saved)
    Object.freeze(saved.summary)
    saved.messages.forEach(Object.freeze)
    Object.freeze(saved.messages)
    Object.freeze(saved)
    expect(() => exportConsultationText(saved, saved.patientName)).not.toThrow()
    expect(saved).toEqual(original)
  })

  it('handles an empty saved conversation without inventing messages', () => {
    const saved = { ...session(), messages: [] }
    const output = exportConsultationText(saved, saved.patientName)
    expect(output).toContain('Conversation messages')
    expect(output).toContain('Consultation summary: Not recorded')
    expect(output).not.toContain('Patient: Original patient message')
    expect(output).not.toContain('Physician:')
  })
})
