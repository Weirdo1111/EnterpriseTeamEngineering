import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { consultationService, CONSULTATION_STORAGE_KEY } from '@/services/consultations'
import type { ConsultationImage, ConsultationSummaryInput } from '@/types/clinical'
import { PATIENT_STORAGE_KEY } from '@/services/patients'
import { emptyPatientInput } from '@/utils/patients'
import { useClinicalStore } from './clinical'
import { useAuthStore } from './auth'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value) }),
    removeItem: (key: string) => data.delete(key),
  }
}

const actor = { name: 'Dr. Riley Lin', role: 'Physician', department: 'Geriatric Medicine' }
const summaryInput: ConsultationSummaryInput = {
  chiefComplaint: 'Fictional follow-up', consultationNotes: 'Discussed the example monitoring record.',
  assessment: 'Demonstration note only', plan: 'Demonstration plan', followUp: 'Demonstration follow-up',
}

describe('consultation history store integration', () => {
  let storage: ReturnType<typeof memoryStorage>

  beforeEach(() => {
    storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('window', { localStorage: storage })
    setActivePinia(createPinia())
  })

  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('restores the saved clinician summary in completed history without modifying messages or patient records', async () => {
    const store = useClinicalStore()
    await store.loadPatients()
    await store.loadConsultations()
    const active = store.consultations.find(session => session.status === 'active')!
    const beforeMessages = JSON.stringify(active.messages)
    const beforePatients = JSON.stringify(store.patients)
    const beforeRecords = JSON.stringify(store.records)
    await store.saveConsultationSummary(active.id, summaryInput, actor)
    await store.completeConsultation(active.id, actor)

    setActivePinia(createPinia())
    const reopened = useClinicalStore()
    await reopened.loadConsultations()
    const restored = reopened.consultations.find(session => session.id === active.id)!
    expect(restored.status).toBe('completed')
    expect(restored.summary).toMatchObject({ ...summaryInput, authorName: actor.name })
    expect(JSON.stringify(restored.messages)).toBe(beforeMessages)
    expect(JSON.stringify(store.patients)).toBe(beforePatients)
    expect(JSON.stringify(store.records)).toBe(beforeRecords)
  })

  it('does not update the displayed summary or audit when a summary save fails', async () => {
    const store = useClinicalStore()
    await store.loadConsultations()
    const active = store.consultations.find(session => session.status === 'active')!
    await store.saveConsultationSummary(active.id, summaryInput, actor)
    const before = JSON.stringify(store.consultations)
    const beforeAudit = JSON.stringify(store.auditLogs)
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    await expect(store.saveConsultationSummary(active.id, { ...summaryInput, plan: 'Unsaved edit' }, actor)).rejects.toThrow('Save failed')
    expect(JSON.stringify(store.consultations)).toBe(before)
    expect(JSON.stringify(store.auditLogs)).toBe(beforeAudit)
  })

  it('keeps a saved summary attached to its original session when selection changes while saving', async () => {
    const store = useClinicalStore()
    await store.loadConsultations()
    const active = store.consultations.find(session => session.status === 'active')!
    const other = store.consultations.find(session => session.status === 'waiting')!
    const pending = store.saveConsultationSummary(active.id, summaryInput, actor)
    store.selectConsultation(other.id)
    await pending
    expect(active.summary).toMatchObject(summaryInput)
    expect(other.summary).toBeUndefined()
    expect(store.selectedConsultation?.id).toBe(other.id)
  })

  it('syncs an image reply to its originating session only after a successful save', async () => {
    const store = useClinicalStore()
    await store.loadConsultations()
    const original = store.consultations[0]
    const other = store.consultations[1]
    const image: ConsultationImage = { id: 'image-store-test', name: 'example.png', mimeType: 'image/png', size: 4, width: 1, height: 1 }
    const blob = new Blob(['demo'], { type: 'image/png' })
    let resolveSave!: (session: typeof original) => void
    const savedSession = JSON.parse(JSON.stringify(original)) as typeof original
    savedSession.messages.push({ id: 'image-reply', sender: 'doctor', content: '', time: new Date().toISOString(), image })
    const send = vi.spyOn(consultationService, 'sendImage').mockImplementation(() => new Promise(resolve => { resolveSave = resolve }))
    const beforeAudit = store.auditLogs.length
    const pending = store.addImageMessage(original.id, '', 'image-reply', image, blob, actor)
    store.selectConsultation(other.id)
    expect(original.messages.some(message => message.id === 'image-reply')).toBe(false)
    expect(store.auditLogs).toHaveLength(beforeAudit)
    resolveSave(savedSession)
    await pending
    expect(send).toHaveBeenCalledWith(original.id, { content: '', clientMessageId: 'image-reply', image, blob })
    expect(original.messages.some(message => message.image?.id === image.id)).toBe(true)
    expect(other.messages.some(message => message.image?.id === image.id)).toBe(false)
    expect(store.selectedConsultation?.id).toBe(other.id)
    expect(store.auditLogs).toHaveLength(beforeAudit + 1)
  })

  it('keeps history and audit unchanged after an image save fails', async () => {
    const store = useClinicalStore()
    await store.loadConsultations()
    const original = store.consultations[0]
    const beforeSessions = JSON.stringify(store.consultations)
    const beforeAudit = JSON.stringify(store.auditLogs)
    vi.spyOn(consultationService, 'sendImage').mockRejectedValueOnce(new Error('Image storage is full'))
    await expect(store.addImageMessage(original.id, 'Caption', 'failed-image', {
      id: 'image-fail', name: 'example.png', mimeType: 'image/png', size: 4, width: 1, height: 1,
    }, new Blob(['demo'], { type: 'image/png' }), actor)).rejects.toThrow('Image storage is full')
    expect(JSON.stringify(store.consultations)).toBe(beforeSessions)
    expect(JSON.stringify(store.auditLogs)).toBe(beforeAudit)
  })

  it('restores a saved reply and completed session in a fresh app without changing patient profiles', async () => {
    const store = useClinicalStore()
    const patient = await store.addPatient({ ...emptyPatientInput(), name: 'Saved patient profile' }, actor)
    const savedPatients = storage.getItem(PATIENT_STORAGE_KEY)
    await store.loadConsultations()
    const waiting = store.consultations.find(session => session.status === 'waiting')!

    await store.startConsultation(waiting.id, actor)
    await store.addMessage(waiting.id, 'Please bring your monitoring record to the follow-up.', 'reply-reload', actor)
    await store.completeConsultation(waiting.id, actor)

    setActivePinia(createPinia())
    const reopened = useClinicalStore()
    await reopened.loadConsultations()
    await reopened.loadPatients()
    const restored = reopened.consultations.find(session => session.id === waiting.id)!
    expect(restored.status).toBe('completed')
    expect(restored.messages.filter(message => message.id === 'reply-reload')).toEqual([
      expect.objectContaining({ sender: 'doctor', content: 'Please bring your monitoring record to the follow-up.' }),
    ])
    expect(storage.getItem(PATIENT_STORAGE_KEY)).toBe(savedPatients)
    expect(reopened.patients.find(item => item.id === patient.id)?.name).toBe('Saved patient profile')
  })

  it.each(['reply', 'accept', 'complete'] as const)('keeps messages, session state and audit unchanged when saving %s fails', async operation => {
    const store = useClinicalStore()
    await store.loadConsultations()
    const active = store.consultations.find(session => session.status === 'active')!
    const waiting = store.consultations.find(session => session.status === 'waiting')!
    const beforeSessions = JSON.stringify(store.consultations)
    const beforeAudit = JSON.stringify(store.auditLogs)
    const beforeHistory = storage.getItem(CONSULTATION_STORAGE_KEY)
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })

    const save = operation === 'reply'
      ? store.addMessage(active.id, 'This reply must not appear as saved.', 'failed-reply', actor)
      : operation === 'accept'
        ? store.startConsultation(waiting.id, actor)
        : store.completeConsultation(active.id, actor)

    await expect(save).rejects.toThrow('Save failed')
    expect(JSON.stringify(store.consultations)).toBe(beforeSessions)
    expect(JSON.stringify(store.auditLogs)).toBe(beforeAudit)
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(beforeHistory)
  })

  it('saves a reply to its original session if the doctor selects another conversation before it finishes', async () => {
    const store = useClinicalStore()
    await store.loadConsultations()
    const target = store.consultations.find(session => session.status === 'waiting')!
    const other = store.consultations.find(session => session.status === 'active')!
    store.selectConsultation(target.id)
    const pendingReply = store.addMessage(target.id, 'Reply for the original patient.', 'reply-original-session', actor)
    store.selectConsultation(other.id)
    await pendingReply

    expect(store.selectedConsultation?.id).toBe(other.id)
    expect(target.messages.find(message => message.id === 'reply-original-session')?.content).toBe('Reply for the original patient.')
    expect(other.messages.some(message => message.id === 'reply-original-session')).toBe(false)
  })

  it('rejects a new reply after completion without changing saved history or audit', async () => {
    const store = useClinicalStore()
    await store.loadConsultations()
    const active = store.consultations.find(session => session.status === 'active')!
    await store.completeConsultation(active.id, actor)
    const beforeSessions = JSON.stringify(store.consultations)
    const beforeAudit = JSON.stringify(store.auditLogs)
    const beforeHistory = storage.getItem(CONSULTATION_STORAGE_KEY)

    await expect(store.addMessage(active.id, 'A new reply after completion.', 'reply-after-close', actor)).rejects.toThrow('completed')
    expect(JSON.stringify(store.consultations)).toBe(beforeSessions)
    expect(JSON.stringify(store.auditLogs)).toBe(beforeAudit)
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(beforeHistory)
  })

  it('reports damaged history without silently replacing it with demo conversations', async () => {
    storage.setItem(CONSULTATION_STORAGE_KEY, '{damaged history')
    const store = useClinicalStore()
    const beforeAudit = JSON.stringify(store.auditLogs)

    await expect(store.loadConsultations()).rejects.toThrow('damaged')
    expect(store.consultationsError).toContain('damaged')
    expect(store.consultations).toEqual([])
    expect(store.selectedConsultation).toBeUndefined()
    expect(store.consultationsLoading).toBe(false)
    expect(JSON.stringify(store.auditLogs)).toBe(beforeAudit)
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe('{damaged history')
  })

  it('allows loading to retry after storage access is restored', async () => {
    const store = useClinicalStore()
    storage.getItem.mockImplementationOnce(() => { throw new Error('Storage access denied') })
    await expect(store.loadConsultations()).rejects.toThrow('Unable to read')
    expect(store.consultations).toEqual([])

    await store.loadConsultations(true)
    expect(store.consultations).toHaveLength(3)
    expect(store.selectedConsultation).toBeDefined()
    expect(store.consultationsError).toBe('')
    expect(store.consultationsLoading).toBe(false)
  })

  it('persists a demo request and patient reply with explicit demo audits without auto-selecting it', async () => {
    const store = useClinicalStore()
    await store.loadConsultations()
    const selected = store.selectedConsultationId
    const request = { clientRequestId: 'store-request', patientId: store.patients[0]!.id, patientName: store.patients[0]!.name, complaint: 'Fictional follow-up', content: 'Initial fictional request' }
    const created = await store.createDemoConsultation(request, actor)
    expect(store.consultations.find(item => item.id === created.id)).toEqual(created)
    expect(store.selectedConsultationId).toBe(selected)
    expect(store.waitingConsultations.some(item => item.id === created.id)).toBe(true)
    expect(store.auditLogs[0]!.action).toContain('Demo:')
    const beforeAudit = store.auditLogs.length
    await store.createDemoConsultation(request, actor)
    expect(store.auditLogs).toHaveLength(beforeAudit)
    await store.receiveDemoConsultationMessage(created.id, { content: 'Another fictional reply', clientMessageId: 'store-incoming' }, actor)
    const saved = store.consultations.find(item => item.id === created.id)!
    expect(saved.status).toBe('waiting')
    expect(saved.unread).toBe(2)
    expect(saved.messages[saved.messages.length - 1]).toMatchObject({ sender: 'patient', content: 'Another fictional reply' })
    expect(store.auditLogs[0]!.action).toContain('Demo:')
    const afterReplyAudit = store.auditLogs.length
    await store.receiveDemoConsultationMessage(created.id, { content: 'Another fictional reply', clientMessageId: 'store-incoming' }, actor)
    expect(store.auditLogs).toHaveLength(afterReplyAudit)
    setActivePinia(createPinia())
    const restored = useClinicalStore()
    await restored.loadConsultations()
    expect(restored.consultations.find(item => item.id === created.id)).toEqual(saved)
  })

  it('selects without clearing unread until persistent mark-read succeeds, without logging navigation', async () => {
    const store = useClinicalStore()
    await store.loadConsultations()
    const waiting = store.consultations.find(item => item.status === 'waiting')!
    const beforeTime = waiting.updatedAt
    const beforeAudit = JSON.stringify(store.auditLogs)
    store.selectConsultation(waiting.id)
    expect(waiting.unread).toBe(2)
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBeNull()
    await store.markConsultationRead(waiting.id)
    expect(waiting.unread).toBe(0)
    expect(waiting.status).toBe('waiting')
    expect(waiting.updatedAt).toBe(beforeTime)
    expect(JSON.stringify(store.auditLogs)).toBe(beforeAudit)
    setActivePinia(createPinia())
    const restored = useClinicalStore()
    await restored.loadConsultations()
    expect(restored.consultations.find(item => item.id === waiting.id)!.unread).toBe(0)
  })

  it.each(['create', 'receive', 'read'] as const)('does not change shared history or audit if %s persistence fails', async action => {
    const store = useClinicalStore()
    await store.loadConsultations()
    const waiting = store.consultations.find(item => item.status === 'waiting')!
    const before = JSON.stringify(store.consultations)
    const beforeAudit = JSON.stringify(store.auditLogs)
    storage.setItem.mockImplementationOnce(() => { throw new Error('Storage denied') })
    const operation = action === 'create'
      ? store.createDemoConsultation({ clientRequestId: 'failed-store', patientId: store.patients[0]!.id, patientName: 'Demo', complaint: 'Follow-up', content: 'Request' }, actor)
      : action === 'receive'
        ? store.receiveDemoConsultationMessage(waiting.id, { clientMessageId: 'failed-incoming', content: 'Patient text' }, actor)
        : store.markConsultationRead(waiting.id)
    await expect(operation).rejects.toThrow('Save failed')
    expect(JSON.stringify(store.consultations)).toBe(before)
    expect(JSON.stringify(store.auditLogs)).toBe(beforeAudit)
  })

  it('applies an incoming image to its original session after selection changes during the save', async () => {
    const store = useClinicalStore()
    await store.loadConsultations()
    const original = store.consultations[0]!
    const other = store.consultations[1]!
    const image: ConsultationImage = { id: 'patient-store-image', name: 'Example.png', mimeType: 'image/png', size: 4, width: 1, height: 1 }
    const input = { content: '', clientMessageId: 'patient-image-message', image, blob: new Blob(['demo'], { type: 'image/png' }) }
    const saved = JSON.parse(JSON.stringify(original)) as typeof original
    saved.messages.push({ id: input.clientMessageId, sender: 'patient', content: '', image, time: new Date().toISOString() })
    saved.unread++
    let resolve!: (session: typeof original) => void
    vi.spyOn(consultationService, 'receiveDemoMessage').mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const beforeAudit = store.auditLogs.length
    const pending = store.receiveDemoConsultationMessage(original.id, input, actor)
    store.selectConsultation(other.id)
    expect(original.messages.some(item => item.id === input.clientMessageId)).toBe(false)
    expect(store.auditLogs).toHaveLength(beforeAudit)
    resolve(saved)
    await pending
    expect(original.messages.some(item => item.id === input.clientMessageId)).toBe(true)
    expect(other.messages.some(item => item.id === input.clientMessageId)).toBe(false)
    expect(store.selectedConsultationId).toBe(other.id)
    expect(store.auditLogs[0]!.action).toContain('Demo:')
  })

  it('keeps administrator selection read-only and rejects request, receive and mark-read writes', async () => {
    const store = useClinicalStore()
    await store.loadConsultations()
    useAuthStore().currentRole = 'admin'
    const waiting = store.consultations.find(item => item.status === 'waiting')!
    store.selectConsultation(waiting.id)
    expect(waiting.unread).toBe(2)
    const before = JSON.stringify(store.consultations)
    const beforeAudit = JSON.stringify(store.auditLogs)
    await expect(store.markConsultationRead(waiting.id)).rejects.toThrow('read-only')
    await expect(store.receiveDemoConsultationMessage(waiting.id, { content: 'Patient reply', clientMessageId: 'admin-message' }, actor)).rejects.toThrow('read-only')
    await expect(store.createDemoConsultation({ clientRequestId: 'admin-request', patientId: 'P-1', patientName: 'Demo', complaint: 'Follow-up', content: 'Request' }, actor)).rejects.toThrow('read-only')
    expect(JSON.stringify(store.consultations)).toBe(before)
    expect(JSON.stringify(store.auditLogs)).toBe(beforeAudit)
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})
