import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { consultationRecordService, CONSULTATION_RECORDS_STORAGE_KEY } from '@/services/consultation-records'
import { CONSULTATION_STORAGE_KEY } from '@/services/consultations'
import { medicalRecordService } from '@/services/records'
import { recordsSeed } from '@/mocks/records'
import type { ConsultationSummaryInput } from '@/types/clinical'
import { useClinicalStore } from './clinical'
import { useAuthStore } from './auth'

const actor = { name: 'Dr. Riley Lin', role: 'Physician', department: 'Geriatric Medicine' }
const summary: ConsultationSummaryInput = {
  chiefComplaint: 'Saved chief complaint', consultationNotes: 'Saved clinician notes',
  assessment: '', plan: 'Saved manual plan', followUp: 'Saved manual follow-up',
}
const fields = { chiefComplaint: 'Edited complaint', presentIllness: 'Edited record notes', diagnosis: 'Manual assessment' }

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    removeItem: vi.fn((key: string) => { values.delete(key) }),
  }
}

async function savedSource() {
  const store = useClinicalStore()
  await store.loadConsultations()
  const session = store.consultations.find(item => item.status === 'active')!
  await store.saveConsultationSummary(session.id, summary, actor)
  return { store, session }
}

describe('consultation medical record store integration', () => {
  let storage: ReturnType<typeof memoryStorage>

  beforeEach(() => {
    storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('window', { localStorage: storage })
    setActivePinia(createPinia())
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('creates a draft from the saved summary rather than changes made to the reactive consultation', async () => {
    const { store, session } = await savedSource()
    const savedTime = session.summary!.updatedAt
    const savedName = session.patientName
    const originalHistory = storage.getItem(CONSULTATION_STORAGE_KEY)
    session.summary!.chiefComplaint = 'Unsaved complaint'
    session.summary!.consultationNotes = 'Unsaved notes'
    session.summary!.assessment = 'Unsaved assessment'
    session.patientName = 'Unsaved different patient name'
    session.status = 'waiting'

    const record = await store.createConsultationRecord(session.id, actor)
    expect(record).toMatchObject({ chiefComplaint: summary.chiefComplaint, diagnosis: '', patientName: savedName, sourceConsultationId: session.id, sourceSummaryUpdatedAt: savedTime, aiGenerated: false, status: 'draft', orders: [] })
    expect(record.presentIllness).toBe('Saved clinician notes\n\nAdvice / plan:\nSaved manual plan\n\nFollow-up:\nSaved manual follow-up')
    expect(store.records.find(item => item.id === record.id)).toEqual(record)
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(originalHistory)
  })

  it('restores edited source records after refresh and reopening without overwriting them or duplicating seed records', async () => {
    const { store, session } = await savedSource()
    const demos = store.records.map(record => record.id)
    const record = await store.createConsultationRecord(session.id, actor)
    await store.saveRecord(record.id, fields, actor)
    const savedHistory = storage.getItem(CONSULTATION_STORAGE_KEY)

    setActivePinia(createPinia())
    const reopened = useClinicalStore()
    await reopened.loadConsultationRecords()
    await reopened.loadConsultationRecords(true)
    expect(reopened.records.find(item => item.id === record.id)).toMatchObject(fields)
    expect(reopened.records).toHaveLength(demos.length + 1)
    expect(new Set(reopened.records.map(item => item.id)).size).toBe(reopened.records.length)
    expect(reopened.records.filter(item => !item.sourceConsultationId).map(item => item.id)).toEqual(demos)
    const returned = await reopened.createConsultationRecord(session.id, actor)
    expect(returned).toMatchObject({ id: record.id, ...fields })
    expect(reopened.records).toHaveLength(demos.length + 1)
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(savedHistory)
  })

  it('leaves shared records, source history and audit unchanged when creating a record cannot persist', async () => {
    const { store, session } = await savedSource()
    const beforeRecords = JSON.stringify(store.records)
    const beforeAudit = JSON.stringify(store.auditLogs)
    const beforeHistory = storage.getItem(CONSULTATION_STORAGE_KEY)
    storage.setItem.mockImplementationOnce(() => { throw new Error('Storage denied') })
    await expect(store.createConsultationRecord(session.id, actor)).rejects.toThrow('Unable to save')
    expect(JSON.stringify(store.records)).toBe(beforeRecords)
    expect(JSON.stringify(store.auditLogs)).toBe(beforeAudit)
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(beforeHistory)
    expect(storage.getItem(CONSULTATION_RECORDS_STORAGE_KEY)).toBeNull()
    await expect(store.createConsultationRecord(session.id, actor)).resolves.toMatchObject({ sourceConsultationId: session.id })
  })

  it.each(['save', 'order'] as const)('does not update shared source records or audit when an existing-record %s fails', async action => {
    const { store, session } = await savedSource()
    const record = await store.createConsultationRecord(session.id, actor)
    const beforeRecords = JSON.stringify(store.records)
    const beforeAudit = JSON.stringify(store.auditLogs)
    const beforeStored = storage.getItem(CONSULTATION_RECORDS_STORAGE_KEY)
    storage.setItem.mockImplementationOnce(() => { throw new Error('Storage denied') })
    const operation = () => action === 'save'
      ? store.saveRecord(record.id, fields, actor)
      : store.addOrder(record.id, { type: 'Nursing', content: 'Manually entered example' }, actor)
    await expect(operation()).rejects.toThrow('Unable to save')
    expect(JSON.stringify(store.records)).toBe(beforeRecords)
    expect(JSON.stringify(store.auditLogs)).toBe(beforeAudit)
    expect(storage.getItem(CONSULTATION_RECORDS_STORAGE_KEY)).toBe(beforeStored)
  })

  it('rejects stale edits when persisted status changed and rejects administrator source-record writes', async () => {
    const { store, session } = await savedSource()
    const record = await store.createConsultationRecord(session.id, actor)
    consultationRecordService.save(record.id, fields, true)
    const beforeRecords = JSON.stringify(store.records)
    const beforeAudit = JSON.stringify(store.auditLogs)
    const storedPending = storage.getItem(CONSULTATION_RECORDS_STORAGE_KEY)
    await expect(store.saveRecord(record.id, fields, actor)).rejects.toThrow('read-only')
    await expect(store.addOrder(record.id, { type: 'Nursing', content: 'Example' }, actor)).rejects.toThrow('read-only')
    useAuthStore().currentRole = 'admin'
    await expect(store.createConsultationRecord(session.id, actor)).rejects.toThrow('read-only')
    expect(JSON.stringify(store.records)).toBe(beforeRecords)
    expect(JSON.stringify(store.auditLogs)).toBe(beforeAudit)
    expect(storage.getItem(CONSULTATION_RECORDS_STORAGE_KEY)).toBe(storedPending)
  })

  it('keeps current records after a damaged-history load failure and allows retry after the data is restored', async () => {
    const { store, session } = await savedSource()
    const record = await store.createConsultationRecord(session.id, actor)
    const validSaved = storage.getItem(CONSULTATION_RECORDS_STORAGE_KEY)!
    const before = JSON.stringify(store.records)
    storage.setItem(CONSULTATION_RECORDS_STORAGE_KEY, '{damaged')
    await expect(store.loadConsultationRecords(true)).rejects.toThrow('damaged')
    expect(store.consultationRecordsLoading).toBe(false)
    expect(store.consultationRecordsError).toContain('damaged')
    expect(JSON.stringify(store.records)).toBe(before)
    expect(storage.getItem(CONSULTATION_RECORDS_STORAGE_KEY)).toBe('{damaged')
    storage.setItem(CONSULTATION_RECORDS_STORAGE_KEY, validSaved)
    await expect(store.loadConsultationRecords(true)).resolves.toBeUndefined()
    expect(store.consultationRecordsError).toBe('')
    expect(store.consultationRecordsLoading).toBe(false)
    expect(store.records.find(item => item.id === record.id)).toBeDefined()
  })

  it('does not create a record or success audit when saved source history cannot be read', async () => {
    const { store, session } = await savedSource()
    const before = JSON.stringify(store.records)
    const beforeAudit = JSON.stringify(store.auditLogs)
    storage.setItem(CONSULTATION_STORAGE_KEY, '{damaged source')
    await expect(store.createConsultationRecord(session.id, actor)).rejects.toThrow('kept unchanged')
    expect(JSON.stringify(store.records)).toBe(before)
    expect(JSON.stringify(store.auditLogs)).toBe(beforeAudit)
    expect(storage.getItem(CONSULTATION_RECORDS_STORAGE_KEY)).toBeNull()
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe('{damaged source')
  })

  it('preserves both record inventories whichever service reloads last', async () => {
    const { store, session } = await savedSource()
    const local = await store.createConsultationRecord(session.id, actor)
    const server = { ...structuredClone(recordsSeed[0]!), id: 'SERVER-RECORD', patientName: 'Server record snapshot' }
    vi.spyOn(medicalRecordService, 'list').mockResolvedValue([server])
    await store.loadRecords(true)
    expect(store.records.map(item => item.id)).toEqual([local.id, server.id])
    await store.loadConsultationRecords(true)
    expect(store.records.map(item => item.id)).toEqual([local.id, server.id])
    await store.loadRecords(true)
    expect(store.records.map(item => item.id)).toEqual([local.id, server.id])
  })

  it('routes local source-record edits locally and regular record edits through the medical record service', async () => {
    const { store, session } = await savedSource()
    const local = await store.createConsultationRecord(session.id, actor)
    const regular = store.records.find(item => !item.sourceConsultationId)!
    const update = vi.spyOn(medicalRecordService, 'updateClinicalFields').mockResolvedValue({ ...structuredClone(recordsSeed[0]!), ...fields, version: 2 })
    await store.saveRecord(local.id, fields, actor)
    expect(update).not.toHaveBeenCalled()
    expect(consultationRecordService.list()[0]).toMatchObject({ ...fields, version: 2 })
    await store.saveRecord(regular.id, fields, actor)
    expect(update).toHaveBeenCalledExactlyOnceWith(regular.id, fields, 1)
  })

  it('rejects a stale linked draft without overwriting newer data or recording a success audit', async () => {
    const { store, session } = await savedSource()
    const local = await store.createConsultationRecord(session.id, actor)
    consultationRecordService.save(local.id, { ...fields, diagnosis: 'Saved from another tab' })
    const beforeAudit = JSON.stringify(store.auditLogs)
    await expect(store.saveRecord(local.id, fields, actor)).rejects.toThrow('another session')
    expect(consultationRecordService.list()[0]!.diagnosis).toBe('Saved from another tab')
    expect(JSON.stringify(store.auditLogs)).toBe(beforeAudit)
  })

  it('keeps the committed version after a failed regular-record submission so an order can be added and submission retried', async () => {
    const store = useClinicalStore()
    const record = await medicalRecordService.createDraft({ patientId: 'P-202609-001', patientName: 'Jianguo Zhang', ...fields, orders: [] })
    await store.loadRecords()
    const edited = { ...fields, presentIllness: 'Clinician changes saved before submission validation' }
    const beforeAudit = JSON.stringify(store.auditLogs)
    await expect(store.saveRecord(record.id, edited, actor, true)).rejects.toThrow('active medical order')
    expect(store.records.find(item => item.id === record.id)).toMatchObject({ ...edited, status: 'draft', version: 2 })
    expect(await medicalRecordService.getById(record.id)).toMatchObject({ ...edited, status: 'draft', version: 2 })
    expect(JSON.stringify(store.auditLogs)).toBe(beforeAudit)

    await expect(store.addOrder(record.id, { type: 'Nursing', content: 'Manually specified follow-up' }, actor)).resolves.toMatchObject({ version: 3 })
    await expect(store.saveRecord(record.id, edited, actor, true)).resolves.toMatchObject({ status: 'pending', version: 5 })
    expect(store.records.find(item => item.id === record.id)).toMatchObject({ status: 'pending', version: 5 })
    expect(store.auditLogs.filter(log => log.resource === record.id && log.action === 'Submitted medical record for review')).toHaveLength(1)
  })
})
