import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMockPatientService, PATIENT_STORAGE_KEY, PATIENT_STORAGE_VERSION } from './patients'
import { patientsSeed } from '@/mocks/patients'
import { allergyText, emptyPatientInput, filterPatients, toPatientInput, validatePatient } from '@/utils/patients'
import { useAuthStore } from '@/stores/auth'
import { useClinicalStore } from '@/stores/clinical'
import type { PatientInput, Role } from '@/types/clinical'

function memoryStorage() {
  const data = new Map<string, string>()
  return { getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { data.set(key, value) }), removeItem: (key: string) => data.delete(key) }
}
const input = (): PatientInput => ({ ...emptyPatientInput(), name: '演示测试患者' })

describe('patient service', () => {
  let storage: ReturnType<typeof memoryStorage>
  let role: Role
  let recovered: ReturnType<typeof vi.fn>
  const create = () => createMockPatientService({ storage: () => storage, role: () => role, owner: () => '测试Physician', onRecovery: recovered })
  beforeEach(() => { storage = memoryStorage(); role = 'doctor'; recovered = vi.fn() })

  it('retains 24 fixtures and the four existing linked IDs', async () => {
    const patients = await create().list()
    expect(patients).toHaveLength(24)
    expect(patients.slice(0, 4).map(p => p.id)).toEqual(['P-202609-001', 'P-202609-002', 'P-202609-003', 'P-202609-004'])
    patients.forEach(p => expect(validatePatient(p)).toEqual({}))
  })
  it('creates without a diagnosis and survives a new adapter instance', async () => {
    const patient = await create().create(input())
    expect(patient.managementStatus).toBe('pending')
    expect(patient.diagnosis).toBe('')
    expect((await create().getById(patient.id)).name).toBe(input().name)
  })
  it('migrates legacy gender and preset tags while preserving saved profile text and IDs', async () => {
    const saved = patientsSeed.slice(0, 2).map((p, i) => ({
      ...p, gender: i ? '女' : '男', name: `用户录入姓名${i}`, history: '用户录入的原始病史',
      allergies: ['用户录入过敏项'], allergyStatus: 'known',
      diseaseTags: ['高血压', 'Hypertension', '自定义标签'], ownerDoctor: '林若医生',
    }))
    const raw = JSON.stringify({ version: 1, patients: saved })
    storage.setItem(PATIENT_STORAGE_KEY, raw)
    storage.setItem.mockClear()
    role = 'admin'
    const restored = await create().list()
    expect(restored.map(p => p.gender)).toEqual(['Male', 'Female'])
    expect(restored[0]).toMatchObject({
      id: saved[0]!.id, name: saved[0]!.name, history: saved[0]!.history,
      allergies: ['用户录入过敏项'], diseaseTags: ['Hypertension', '自定义标签'],
      ownerDoctor: 'Dr. Riley Lin', createdAt: saved[0]!.createdAt, managementStatus: 'active',
    })
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.getItem(PATIENT_STORAGE_KEY)).toBe(raw)
    expect(recovered).not.toHaveBeenCalled()
    role = 'doctor'
    await create().update(restored[0]!.id, toPatientInput(restored[0]!))
    expect(JSON.parse(storage.getItem(PATIENT_STORAGE_KEY)!).version).toBe(PATIENT_STORAGE_VERSION)
    expect((await create().list())[1]!.name).toBe(saved[1]!.name)
  })
  it('keeps legacy data intact when the first migrated save fails', async () => {
    const legacy = { ...patientsSeed[0]!, gender: '男' }
    const raw = JSON.stringify({ version: 1, patients: [legacy] })
    storage.setItem(PATIENT_STORAGE_KEY, raw)
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    await expect(create().create(input())).rejects.toThrow('Save failed')
    expect(storage.getItem(PATIENT_STORAGE_KEY)).toBe(raw)
    expect((await create().list())[0]!.gender).toBe('Male')
    expect(recovered).not.toHaveBeenCalled()
  })
  it('preserves custom tags in version 2 without treating them as legacy presets', async () => {
    const p = await create().create({ ...input(), diseaseTags: ['高血压', 'Hypertension', 'custom'] })
    expect((await create().getById(p.id)).diseaseTags).toEqual(['高血压', 'Hypertension', 'custom'])
  })
  it('generates unique IDs across repeated creation and reloads', async () => {
    const ids = await Promise.all(Array.from({ length: 12 }, async () => (await create().create(input())).id))
    expect(new Set(ids).size).toBe(12)
    expect(await create().list()).toHaveLength(36)
  })
  it('whitelists updates and does not persist health or risk fields', async () => {
    const patient = patientsSeed[0]!
    const result = await create().update(patient.id, { ...toPatientInput(patient), name: '更名测试', plan: 'tamper', status: 'critical', id: 'other' } as PatientInput)
    expect(result.id).toBe(patient.id)
    expect(result.status).toBe(patient.status)
    expect(result.plan).toBe(patient.plan)
    const persisted = JSON.parse(storage.getItem(PATIENT_STORAGE_KEY)!).patients[0]
    expect(persisted).not.toHaveProperty('metrics')
    expect(persisted).not.toHaveProperty('plan')
    expect(persisted).not.toHaveProperty('status')
    expect((await create().getById(patient.id)).name).toBe('更名测试')
  })
  it('adds unique trimmed tags without replacing existing diseases', async () => {
    const p = patientsSeed[0]!
    const [updated] = await create().batchUpdateClassification([p.id], { kind: 'addDisease', tags: [' Hypertension ', 'Coronary Heart Disease', 'Coronary Heart Disease'] })
    expect(updated!.diseaseTags).toEqual(['Hypertension', 'Diabetes', 'Coronary Heart Disease'])
  })
  it('removes only the selected disease', async () => {
    const [p] = await create().batchUpdateClassification([patientsSeed[0]!.id], { kind: 'removeDisease', tags: ['Hypertension'] })
    expect(p!.diseaseTags).toEqual(['Diabetes'])
  })
  it('updates management status without changing risk status or other patients', async () => {
    const service = create()
    const [p] = await service.batchUpdateClassification([patientsSeed[0]!.id], { kind: 'managementStatus', status: 'closed' })
    expect(p!.status).toBe('warning')
    expect((await create().getById(p!.id)).managementStatus).toBe('closed')
    expect((await service.getById(patientsSeed[1]!.id)).managementStatus).toBe('active')
  })
  it('rejects a batch containing an unknown ID without partial writes', async () => {
    await expect(create().batchUpdateClassification([patientsSeed[0]!.id, 'missing'], { kind: 'managementStatus', status: 'closed' })).rejects.toThrow('Patient not found')
    expect(storage.setItem).not.toHaveBeenCalled()
  })
  it('rejects all writes for admin, while allowing reads', async () => {
    role = 'admin'
    const service = create()
    expect(await service.list()).toHaveLength(24)
    await expect(service.create(input())).rejects.toThrow('read-only')
    await expect(service.update(patientsSeed[0]!.id, input())).rejects.toThrow('read-only')
    await expect(service.batchUpdateClassification([patientsSeed[0]!.id], { kind: 'managementStatus', status: 'closed' })).rejects.toThrow('read-only')
    expect(storage.setItem).not.toHaveBeenCalled()
  })
  it('allows senior doctors to write', async () => { role = 'seniorDoctor'; expect((await create().create(input())).name).toBe(input().name) })
  it('fails atomically when storage cannot be written, and can retry', async () => {
    const service = create()
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    await expect(service.batchUpdateClassification(patientsSeed.slice(0, 2).map(p => p.id), { kind: 'managementStatus', status: 'closed' })).rejects.toThrow('Save failed')
    expect((await service.list()).slice(0, 2).every(p => p.managementStatus === 'active')).toBe(true)
    await expect(service.create(input())).resolves.toMatchObject({ name: input().name })
  })
  it('does not mask storage read errors', async () => {
    storage.getItem.mockImplementation(() => { throw new Error('Access denied') })
    await expect(create().list()).rejects.toThrow('Unable to read')
  })
  it.each(['broken JSON', '{"version":99,"patients":[]}', '{"version":1,"patients":[{}]}'])('recovers invalid storage with a warning: %s', async raw => {
    storage.setItem(PATIENT_STORAGE_KEY, raw)
    expect(await create().list()).toHaveLength(24)
    expect(recovered).toHaveBeenCalledOnce()
  })
  it('preserves an intentionally empty dataset', async () => {
    storage.setItem(PATIENT_STORAGE_KEY, JSON.stringify({ version: 1, patients: [] }))
    expect(await create().list()).toEqual([])
    expect(recovered).not.toHaveBeenCalled()
  })
  it('returns independent data copies', async () => {
    const service = create()
    const patients = await service.list()
    patients[0]!.diseaseTags.push('not saved')
    expect((await service.list())[0]!.diseaseTags).not.toContain('not saved')
  })
  it('does not share nested fixture fields after restoring saved records', async () => {
    const service = create()
    await service.update(patientsSeed[0]!.id, toPatientInput(patientsSeed[0]!))
    const restored = await service.list()
    restored[0]!.metrics.heartRate = 999
    expect((await service.list())[0]!.metrics.heartRate).toBe(86)
  })
  it('clears the corruption notice after a successful replacement save', async () => {
    storage.setItem(PATIENT_STORAGE_KEY, 'broken')
    const service = create()
    await service.list()
    await service.create(input())
    expect(recovered).toHaveBeenLastCalledWith('')
    expect(await create().list()).toHaveLength(25)
  })
})

describe('validation and search', () => {
  it('validates required identity, integer age, contacts, and known allergies', () => {
    expect(validatePatient({ ...input(), name: ' ', age: 2.5, phone: 'bad', emergencyRelation: '家属', allergyStatus: 'known' })).toMatchObject({ name: expect.any(String), age: expect.any(String), phone: expect.any(String), emergencyName: expect.any(String), emergencyPhone: expect.any(String), allergies: expect.any(String) })
  })
  it.each(['13800000000', '010-12345678', '+44 20 7946 0958'])('accepts phone format %s', phone => { expect(validatePatient({ ...input(), phone })).toEqual({}) })
  it('distinguishes unknown from no known allergies and clears stale entries', () => {
    expect(allergyText(input())).toBe('Unconfirmed')
    const none = toPatientInput({ ...input(), allergyStatus: 'none', allergies: ['青霉素'] })
    expect(none.allergies).toEqual([])
    expect(allergyText(none)).toBe('No known allergies')
  })
  it.each(['Jianguo Zhang', 'p-202609-001', 'Morning head pressure', 'Hypertension with Diabetes', 'Twelve-year history of hypertension'])('searches name, ID, symptoms, diagnosis and history: %s', keyword => {
    expect(filterPatients(patientsSeed, { keyword, disease: '', status: '' }).map(p => p.id)).toContain('P-202609-001')
  })
  it('combines all filters and supports no results', () => {
    expect(filterPatients(patientsSeed, { keyword: 'Jianguo Zhang', disease: 'Diabetes', status: 'active' })).toHaveLength(1)
    expect(filterPatients(patientsSeed, { keyword: 'Jianguo Zhang', disease: 'Diabetes', status: 'closed' })).toHaveLength(0)
  })
})

describe('shared clinical store compatibility', () => {
  let storage: ReturnType<typeof memoryStorage>
  beforeEach(() => {
    storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('window', { localStorage: storage })
    setActivePinia(createPinia())
  })
  afterEach(() => vi.unstubAllGlobals())
  const actor = { name: 'Dr. Riley Lin', role: 'Physician', department: 'Geriatric Medicine' }
  it('syncs saved information without overwriting runtime health changes', async () => {
    const store = useClinicalStore()
    await store.loadPatients()
    const patient = store.patients[0]!
    patient.plan = '另一模块的新计划'
    patient.metrics.heartRate = 75
    await store.updatePatient(patient.id, { ...toPatientInput(patient), name: '已编辑患者' }, actor)
    expect(store.patients[0]!.plan).toBe('另一模块的新计划')
    expect(store.patients[0]!.metrics.heartRate).toBe(75)
    expect(store.patients[0]!.name).toBe('已编辑患者')
    expect(store.auditLogs[0]!.action).toBe('Updated patient profile')
  })
  it('restores newly created patients with their own downstream plan placeholders', async () => {
    const created = await useClinicalStore().addPatient(input(), actor)
    setActivePinia(createPinia())
    const fresh = useClinicalStore()
    await fresh.loadPatients()
    expect(fresh.patients.some(p => p.id === created.id)).toBe(true)
    expect(fresh.healthPlans.find(plan => plan.patientId === created.id)).toMatchObject({ patientId: created.id, measures: 'Not set' })
  })
  it('does not mutate shared data or audit success on failed save', async () => {
    const store = useClinicalStore()
    const before = JSON.stringify(store.patients)
    const audits = store.auditLogs.length
    storage.setItem.mockImplementation(() => { throw new Error('denied') })
    await expect(store.updatePatient(store.patients[0]!.id, input(), actor)).rejects.toThrow('Save failed')
    expect(JSON.stringify(store.patients)).toBe(before)
    expect(store.auditLogs).toHaveLength(audits)
  })
  it('checks live role even if an old editing dialog was open', async () => {
    const store = useClinicalStore()
    useAuthStore().currentRole = 'admin'
    await expect(store.addPatient(input(), actor)).rejects.toThrow('read-only')
  })
})
