import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { patientService, PATIENT_STORAGE_KEY } from '@/services/patients'
import { CONSULTATION_STORAGE_KEY } from '@/services/consultations'
import { CONSULTATION_RECORDS_STORAGE_KEY } from '@/services/consultation-records'
import { emptyPatientInput, toPatientInput } from '@/utils/patients'
import { useClinicalStore } from './clinical'

const actor = { name: 'Dr. Riley Lin', role: 'Physician', department: 'Geriatric Medicine' }
const summary = { chiefComplaint: 'Fictional follow-up', consultationNotes: 'Saved clinician note', assessment: '', plan: '', followUp: '' }

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    removeItem: (key: string) => values.delete(key),
  }
}

function request(patientId: string, clientRequestId = 'binding-request') {
  return { clientRequestId, patientId, patientName: 'Caller-supplied name must not bind identity', complaint: 'Follow-up', content: 'Fictional request message' }
}

function state(store: ReturnType<typeof useClinicalStore>) {
  return JSON.stringify({ patients: store.patients, consultations: store.consultations, records: store.records, healthPlans: store.healthPlans, audit: store.auditLogs })
}

async function savedSource() {
  const store = useClinicalStore()
  await store.loadPatients()
  await store.loadConsultations()
  const session = store.consultations.find(item => item.status === 'active')!
  await store.saveConsultationSummary(session.id, summary, actor)
  return { store, session }
}

describe('consultation binding to the shared patient service', () => {
  let storage: ReturnType<typeof memoryStorage>
  beforeEach(() => {
    storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('window', { localStorage: storage })
    setActivePinia(createPinia())
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('looks up the exact patient and uses their current name instead of caller input or a stale cache', async () => {
    const store = useClinicalStore()
    await store.loadPatients()
    const cached = store.patients[0]!
    await patientService.update(cached.id, { ...toPatientInput(cached), name: 'Renamed shared profile' })
    expect(cached.name).not.toBe('Renamed shared profile')
    const getById = vi.spyOn(patientService, 'getById')
    const created = await store.createDemoConsultation(request(cached.id), actor)
    expect(getById).toHaveBeenCalledWith(cached.id)
    expect(created.patientId).toBe(cached.id)
    expect(created.patientName).toBe('Renamed shared profile')
    expect(cached.name).toBe('Renamed shared profile')
  })

  it('binds a newly created UUID patient from the shared service and makes the successful association available in cache', async () => {
    const store = useClinicalStore()
    const patient = await patientService.create({ ...emptyPatientInput(), name: 'New shared patient' })
    expect(patient.id).toMatch(/^P-[0-9a-f-]{36}$/i)
    expect(store.patients.some(item => item.id === patient.id)).toBe(false)
    const created = await store.createDemoConsultation(request(patient.id), actor)
    expect(created).toMatchObject({ patientId: patient.id, patientName: patient.name })
    expect(store.patients.find(item => item.id === patient.id)?.name).toBe(patient.name)
    expect(store.healthPlans.some(item => item.patientId === patient.id)).toBe(true)
    await store.startConsultation(created.id, actor)
    await store.saveConsultationSummary(created.id, summary, actor)
    const record = await store.createConsultationRecord(created.id, actor)
    expect(record).toMatchObject({ patientId: patient.id, patientName: patient.name, sourceConsultationId: created.id })
  })

  it('passes an opaque patient ID unchanged to lookup and storage', async () => {
    const store = useClinicalStore()
    const id = ' patient:opaque/中文-ID '
    const patient = { ...store.patients[0]!, id, name: 'Opaque ID profile' }
    const getById = vi.spyOn(patientService, 'getById').mockResolvedValueOnce(patient)
    const created = await store.createDemoConsultation(request(id), actor)
    expect(getById).toHaveBeenCalledWith(id)
    expect(created.patientId).toBe(id)
  })

  it('keeps creation bound to the verified original ID when a caller changes its form during patient lookup', async () => {
    const store = useClinicalStore()
    const original = { ...store.patients[0]! }
    const other = store.patients[1]!
    const input = request(original.id)
    vi.spyOn(patientService, 'getById').mockImplementationOnce(async id => {
      expect(id).toBe(original.id)
      input.patientId = other.id
      input.patientName = other.name
      return original
    })
    const created = await store.createDemoConsultation(input, actor)
    expect(created).toMatchObject({ patientId: original.id, patientName: original.name })
  })

  it.each(['missing', 'readError', 'wrongReturnId'] as const)('fails a new request before writes, cache changes or audit on %s', async reason => {
    const store = useClinicalStore()
    await store.loadPatients()
    const id = reason === 'missing' ? 'nonexistent-patient' : store.patients[0]!.id
    if (reason === 'readError') vi.spyOn(patientService, 'getById').mockRejectedValueOnce(new Error('Patient service unavailable'))
    if (reason === 'wrongReturnId') vi.spyOn(patientService, 'getById').mockResolvedValueOnce({ ...store.patients[1]! })
    const before = state(store)
    storage.setItem.mockClear()
    await expect(store.createDemoConsultation(request(id), actor)).rejects.toThrow()
    expect(state(store)).toBe(before)
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBeNull()
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('does not cache a freshly read patient if consultation persistence fails', async () => {
    const store = useClinicalStore()
    const patient = await patientService.create({ ...emptyPatientInput(), name: 'Not cached on failure' })
    const before = state(store)
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    await expect(store.createDemoConsultation(request(patient.id), actor)).rejects.toThrow('Save failed')
    expect(state(store)).toBe(before)
    expect(store.patients.some(item => item.id === patient.id)).toBe(false)
  })

  it('retries an existing request after a patient rename without duplicating or rewriting its historical snapshot', async () => {
    const store = useClinicalStore()
    const original = store.patients[0]!
    const input = request(original.id)
    const created = await store.createDemoConsultation(input, actor)
    await patientService.update(original.id, { ...toPatientInput(original), name: 'Later profile name' })
    const beforeAudit = store.auditLogs.length
    storage.setItem.mockClear()
    const retried = await store.createDemoConsultation({ ...input, patientName: 'Later profile name' }, actor)
    expect(retried).toEqual(created)
    expect(retried.patientName).not.toBe('Later profile name')
    expect(store.auditLogs).toHaveLength(beforeAudit)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('uses the current verified profile name when first handing a saved summary to a medical record', async () => {
    const { store, session } = await savedSource()
    const patient = await patientService.getById(session.patientId)
    await patientService.update(patient.id, { ...toPatientInput(patient), name: 'Current name at record creation' })
    const getById = vi.spyOn(patientService, 'getById')
    const record = await store.createConsultationRecord(session.id, actor)
    expect(getById).toHaveBeenCalledWith(session.patientId)
    expect(record).toMatchObject({ patientId: session.patientId, patientName: 'Current name at record creation', chiefComplaint: summary.chiefComplaint })
    expect(store.patients.find(item => item.id === session.patientId)?.name).toBe('Current name at record creation')
    expect(session.patientName).not.toBe('Current name at record creation')
  })

  it.each(['missing', 'readError', 'wrongReturnId'] as const)('blocks a new record handoff before writes, cache changes and success audit on %s', async reason => {
    const { store, session } = await savedSource()
    if (reason === 'missing') {
      const patients = (await patientService.list()).filter(item => item.id !== session.patientId)
      storage.setItem(PATIENT_STORAGE_KEY, JSON.stringify({ version: 2, patients }))
    }
    if (reason === 'readError') vi.spyOn(patientService, 'getById').mockRejectedValueOnce(new Error('Patient storage unavailable'))
    if (reason === 'wrongReturnId') vi.spyOn(patientService, 'getById').mockResolvedValueOnce({ ...store.patients.find(item => item.id !== session.patientId)! })
    const before = state(store)
    const beforeHistory = storage.getItem(CONSULTATION_STORAGE_KEY)
    storage.setItem.mockClear()
    await expect(store.createConsultationRecord(session.id, actor)).rejects.toThrow()
    expect(state(store)).toBe(before)
    expect(storage.getItem(CONSULTATION_STORAGE_KEY)).toBe(beforeHistory)
    expect(storage.getItem(CONSULTATION_RECORDS_STORAGE_KEY)).toBeNull()
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('keeps a previously created record viewable as a historical snapshot when its patient can no longer be loaded', async () => {
    const { store, session } = await savedSource()
    const original = await store.createConsultationRecord(session.id, actor)
    const getById = vi.spyOn(patientService, 'getById').mockRejectedValue(new Error('Patient not found'))
    storage.setItem.mockClear()
    const existing = await store.createConsultationRecord(session.id, actor)
    expect(existing).toEqual(original)
    expect(getById).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('does not refresh a stale patient cache when medical record persistence fails after patient verification', async () => {
    const { store, session } = await savedSource()
    const patient = await patientService.getById(session.patientId)
    await patientService.update(patient.id, { ...toPatientInput(patient), name: 'New profile name' })
    const before = state(store)
    storage.setItem.mockImplementationOnce(() => { throw new Error('Record storage full') })
    await expect(store.createConsultationRecord(session.id, actor)).rejects.toThrow('Unable to save')
    expect(state(store)).toBe(before)
    expect(store.patients.find(item => item.id === patient.id)?.name).not.toBe('New profile name')
    expect(storage.getItem(CONSULTATION_RECORDS_STORAGE_KEY)).toBeNull()
  })

  it('does not change patient or consultation selection for an unknown conversation, and preserves patient selection for a historical missing profile', async () => {
    const store = useClinicalStore()
    await store.loadConsultations()
    const beforeSession = store.selectedConsultationId
    const beforePatient = store.selectedPatientId
    store.selectConsultation('unknown-conversation')
    expect(store.selectedConsultationId).toBe(beforeSession)
    expect(store.selectedPatientId).toBe(beforePatient)
    const historical = store.consultations[1]!
    historical.patientId = 'missing-profile'
    store.selectConsultation(historical.id)
    expect(store.selectedConsultationId).toBe(historical.id)
    expect(store.selectedPatientId).toBe(beforePatient)
  })

  it('rejects explicit and default invalid AI draft patient IDs instead of using the first patient', async () => {
    const store = useClinicalStore()
    expect(() => store.createAiRecord(actor, store.patients[0]!.id)).toThrow('Load patient information')
    await store.loadPatients()
    const before = state(store)
    expect(() => store.createAiRecord(actor, 'missing-profile')).toThrow('Patient not found')
    store.selectedPatientId = 'missing-profile'
    expect(() => store.createAiRecord(actor)).toThrow('Patient not found')
    expect(state(store)).toBe(before)
    store.patientsError = 'Read failed'
    expect(() => store.createAiRecord(actor, store.patients[0]!.id)).toThrow('Load patient information')
  })
})
