import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordsSeed } from '@/mocks/records'
import { createMockMedicalRecordService, RECORD_STORAGE_KEY } from './records'
import { clinicalAiService } from './clinical-ai'
import { patientsSeed } from '@/mocks/patients'
import type { Role } from '@/types/clinical'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value) }),
  }
}

describe('medical record service', () => {
  let storage: ReturnType<typeof memoryStorage>
  let role: Role
  let owner: string
  let tick: number
  const create = () => createMockMedicalRecordService({
    storage: () => storage,
    role: () => role,
    owner: () => owner,
    now: () => new Date(Date.UTC(2026, 8, 24, 2, tick++)).toISOString(),
  })
  const draftInput = () => ({
    patientId: 'P-202609-001',
    patientName: 'Jianguo Zhang',
    chiefComplaint: 'Morning headache',
    presentIllness: 'Symptoms have persisted for two days.',
    diagnosis: 'Hypertension follow-up',
    orders: [{ type: 'Nursing' as const, content: 'Monitor blood pressure' }],
  })

  beforeEach(() => {
    storage = memoryStorage()
    role = 'doctor'
    owner = 'Dr. Riley Lin'
    tick = 0
  })

  it('loads independent fixture copies', async () => {
    const first = await create().list()
    first[0]!.orders[0]!.content = 'Changed outside the service'
    expect((await create().list())[0]!.orders[0]!.content).toBe(recordsSeed[0]!.orders[0]!.content)
  })

  it('creates and persists a versioned draft', async () => {
    const record = await create().createDraft(draftInput())
    expect(record).toMatchObject({ status: 'draft', version: 1, doctor: owner, aiGenerated: false })
    expect(record.orders[0]).toMatchObject({ status: 'active', createdBy: owner })
    expect((await create().getById(record.id)).chiefComplaint).toBe('Morning headache')
  })

  it('rejects incomplete clinical fields', async () => {
    await expect(create().createDraft({ ...draftInput(), diagnosis: ' ' })).rejects.toThrow('diagnosis')
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('keeps administrators read-only', async () => {
    role = 'admin'
    expect(await create().list()).toHaveLength(2)
    await expect(create().createDraft(draftInput())).rejects.toThrow('read-only')
  })

  it('saves a draft and increments its version', async () => {
    const service = create()
    const record = await service.createDraft(draftInput())
    const updated = await service.updateClinicalFields(record.id, { chiefComplaint: 'Updated complaint', presentIllness: record.presentIllness, diagnosis: record.diagnosis }, record.version)
    expect(updated).toMatchObject({ chiefComplaint: 'Updated complaint', version: 2, status: 'draft' })
  })

  it('uses optimistic concurrency to reject stale writes', async () => {
    const service = create()
    const record = await service.createDraft(draftInput())
    await service.updateClinicalFields(record.id, record, record.version)
    await expect(service.addOrder(record.id, { type: 'Laboratory', content: 'CBC' }, record.version)).rejects.toThrow('another session')
  })

  it('requires an active order before submission', async () => {
    const service = create()
    const record = await service.createDraft({ ...draftInput(), orders: [] })
    await expect(service.submit(record.id, record.version)).rejects.toThrow('active medical order')
  })

  it('locks a pending record against clinical and order edits', async () => {
    const service = create()
    const draft = await service.createDraft(draftInput())
    const pending = await service.submit(draft.id, draft.version)
    await expect(service.updateClinicalFields(pending.id, pending, pending.version)).rejects.toThrow('draft or returned')
    await expect(service.addOrder(pending.id, { type: 'Laboratory', content: 'CBC' }, pending.version)).rejects.toThrow('draft or returned')
  })

  it('allows only senior physicians to approve or return pending records', async () => {
    const service = create()
    const draft = await service.createDraft(draftInput())
    const pending = await service.submit(draft.id, draft.version)
    await expect(service.review(pending.id, 'approved', 'Looks good', pending.version)).rejects.toThrow('senior physician')
    role = 'seniorDoctor'
    owner = 'Dr. Michael Zhou'
    const approved = await service.review(pending.id, 'approved', 'Clinical rationale confirmed.', pending.version)
    expect(approved).toMatchObject({ status: 'approved', reviewedBy: owner, version: 3 })
    expect(approved.reviewHistory[0]).toMatchObject({ decision: 'approved', reviewer: owner })
  })

  it('returns a record for revision and allows resubmission', async () => {
    const service = create()
    const draft = await service.createDraft(draftInput())
    const pending = await service.submit(draft.id, draft.version)
    role = 'seniorDoctor'
    const returned = await service.review(pending.id, 'returned', 'Clarify symptom duration.', pending.version)
    role = 'doctor'
    const revised = await service.updateClinicalFields(returned.id, { ...returned, presentIllness: 'Symptoms have persisted for three days.' }, returned.version)
    const resubmitted = await service.submit(revised.id, revised.version)
    expect(resubmitted.status).toBe('pending')
    expect(resubmitted.reviewHistory).toHaveLength(1)
  })

  it('archives only an approved record', async () => {
    const service = create()
    role = 'seniorDoctor'
    const pending = await service.getById('MR-8842')
    await expect(service.review(pending.id, 'archived', 'Archive', pending.version)).rejects.toThrow('approved')
    const approved = await service.review(pending.id, 'approved', 'Approved', pending.version)
    const archived = await service.review(approved.id, 'archived', 'Finalized', approved.version)
    expect(archived.status).toBe('archived')
    expect(archived.reviewHistory.map(item => item.decision)).toEqual(['approved', 'archived'])
  })

  it('tracks stopped orders without deleting history', async () => {
    const service = create()
    const record = await service.createDraft(draftInput())
    const stopped = await service.stopOrder(record.id, record.orders[0]!.id, record.version)
    expect(stopped.orders[0]).toMatchObject({ status: 'stopped', stoppedBy: owner })
    expect(stopped.orders[0]!.stoppedAt).toBeTruthy()
  })

  it('does not commit partial state when persistence fails', async () => {
    storage.setItem.mockImplementationOnce(() => { throw new Error('quota') })
    await expect(create().createDraft(draftInput())).rejects.toThrow('Save failed')
    expect(await create().list()).toHaveLength(recordsSeed.length)
  })

  it('rejects corrupted stored records instead of silently overwriting them', async () => {
    storage.setItem(RECORD_STORAGE_KEY, '{"version":1,"records":[{}]}')
    await expect(create().list()).rejects.toThrow('invalid')
  })
})

describe('clinical AI draft adapter', () => {
  it('produces a traceable suggestion with allergy warnings', async () => {
    const patient = patientsSeed[0]!
    const result = await clinicalAiService.generateRecordDraft({ patient, references: [{ id: 'R-01', title: 'Guideline', kind: 'Clinical Guideline', excerpt: 'Demo' }] })
    expect(result.sourceIds).toContain(patient.id)
    expect(result.sourceIds).toContain('R-01')
    expect(result.safetyWarnings.join(' ')).toContain('Penicillin')
    expect(result.generator).toBe('rule-based-clinical-draft-v1')
    expect(result.orders.every(order => !/\bmg\b|\bdose\b/i.test(order.content))).toBe(true)
  })

  it('adds escalation guidance for a critical patient', async () => {
    const result = await clinicalAiService.generateRecordDraft({ patient: patientsSeed[2]!, references: [] })
    expect(result.safetyWarnings[0]).toContain('High-risk patient')
    expect(result.orders.some(order => order.content.includes('in-person'))).toBe(true)
  })
})
