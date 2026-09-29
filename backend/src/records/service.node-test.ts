import assert from 'node:assert/strict'
import test from 'node:test'
import type { DbUser } from '../db.js'
import { createRecordService, RecordServiceError } from './service.js'
import type { MedicalRecord, RecordAudit, RecordRepository } from './types.js'

function memoryRepository(): RecordRepository {
  const records: MedicalRecord[] = []
  return {
    async list() { return structuredClone(records) },
    async getById(id) { return structuredClone(records.find(record => record.id === id) ?? null) },
    async create(record) { records.push(structuredClone(record)) },
    async save(record, expectedVersion) {
      const index = records.findIndex(item => item.id === record.id && item.version === expectedVersion)
      if (index < 0) return false
      records[index] = structuredClone(record)
      return true
    },
  }
}

const doctor: DbUser = { id: '1', username: 'doctor.demo', password_hash: 'hash', name: 'Dr. Riley Lin', role: 'doctor', status: 'active' }
const senior: DbUser = { ...doctor, id: '2', username: 'senior.demo', name: 'Dr. Michael Zhou', role: 'seniorDoctor' }
const otherDoctor: DbUser = { ...doctor, id: '4', username: 'other.demo', name: 'Dr. Other', role: 'doctor' }
const admin: DbUser = { ...doctor, id: '3', username: 'admin.demo', name: 'Platform Admin', role: 'admin' }
const input = {
  patientId: 'P-001', patientName: 'Demo Patient', chiefComplaint: 'Morning headache',
  presentIllness: 'Symptoms have persisted for two days.', diagnosis: 'Hypertension follow-up',
  orders: [{ type: 'Nursing', content: 'Monitor blood pressure' }],
}

test('enforces the draft, submit, approve and archive workflow', async () => {
  let minute = 0
  const service = createRecordService(memoryRepository(), () => new Date(Date.UTC(2026, 8, 24, 2, minute++)).toISOString())
  const draft = await service.create(input, doctor)
  assert.equal(draft.status, 'draft')
  assert.equal(draft.version, 1)
  const pending = await service.submit(draft.id, { expectedVersion: draft.version }, doctor)
  assert.equal(pending.status, 'pending')
  await assert.rejects(() => service.update(pending.id, { ...input, expectedVersion: pending.version }, doctor), /draft or returned/)
  const approved = await service.review(pending.id, { decision: 'approved', note: 'Confirmed', expectedVersion: pending.version }, senior)
  assert.equal(approved.reviewHistory[0]?.reviewer, senior.name)
  const archived = await service.review(approved.id, { decision: 'archived', note: 'Finalized', expectedVersion: approved.version }, senior)
  assert.equal(archived.status, 'archived')
})

test('allows returned records to be revised and resubmitted', async () => {
  const service = createRecordService(memoryRepository())
  const draft = await service.create(input, doctor)
  const pending = await service.submit(draft.id, { expectedVersion: draft.version }, doctor)
  const returned = await service.review(pending.id, { decision: 'returned', note: 'Clarify duration', expectedVersion: pending.version }, senior)
  const revised = await service.update(returned.id, { ...input, presentIllness: 'Symptoms have persisted for three days.', expectedVersion: returned.version }, doctor)
  assert.equal((await service.submit(revised.id, { expectedVersion: revised.version }, doctor)).status, 'pending')
})

test('requires physician diagnosis before submitting an assistant draft', async () => {
  const service = createRecordService(memoryRepository())
  const draft = await service.create({
    ...input,
    diagnosis: 'Pending physician assessment',
    aiMetadata: { generator: 'rule-based-clinical-draft-v1', generatedAt: new Date().toISOString(), safetyWarnings: [], sourceIds: ['P-001'] },
  }, doctor)
  await assert.rejects(() => service.submit(draft.id, { expectedVersion: draft.version }, doctor), /physician-assessed preliminary diagnosis/)
  const reviewed = await service.update(draft.id, { ...input, expectedVersion: draft.version }, doctor)
  assert.equal((await service.submit(reviewed.id, { expectedVersion: reviewed.version }, doctor)).status, 'pending')
})

test('rejects admin writes and non-senior review', async () => {
  const service = createRecordService(memoryRepository())
  await assert.rejects(() => service.create(input, admin), (error: unknown) => error instanceof RecordServiceError && error.status === 403)
  const draft = await service.create(input, doctor)
  const pending = await service.submit(draft.id, { expectedVersion: draft.version }, doctor)
  await assert.rejects(() => service.review(pending.id, { decision: 'approved', note: 'No', expectedVersion: pending.version }, doctor), /senior physician/)
})

test('detects stale writes with optimistic locking', async () => {
  const service = createRecordService(memoryRepository())
  const draft = await service.create(input, doctor)
  await service.update(draft.id, { ...input, diagnosis: 'Updated diagnosis', expectedVersion: draft.version }, doctor)
  await assert.rejects(
    () => service.addOrder(draft.id, { type: 'Laboratory', content: 'CBC', expectedVersion: draft.version }, doctor),
    (error: unknown) => error instanceof RecordServiceError && error.status === 409,
  )
})

test('limits ordinary doctors to their own records while senior doctors can review all', async () => {
  const service = createRecordService(memoryRepository())
  const own = await service.create(input, doctor)
  await service.create({ ...input, patientId: 'P-002' }, otherDoctor)
  assert.deepEqual((await service.list(doctor)).map(record => record.id), [own.id])
  assert.equal((await service.list(senior)).length, 2)
  await assert.rejects(() => service.getById(own.id, otherDoctor), (error: unknown) => error instanceof RecordServiceError && error.status === 404)
  assert.equal((await service.getById(own.id, senior)).id, own.id)
})

test('passes successful mutation audits into the same repository operation', async () => {
  const base = memoryRepository()
  const audits: RecordAudit[] = []
  const repository: RecordRepository = {
    ...base,
    async create(record, audit) { if (audit) audits.push(audit); await base.create(record, audit) },
    async save(record, expectedVersion, audit) { if (audit) audits.push(audit); return base.save(record, expectedVersion, audit) },
  }
  const service = createRecordService(repository)
  const draft = await service.create(input, doctor, { ipAddress: '127.0.0.1' })
  await service.stopOrder(draft.id, draft.orders[0]!.id, { expectedVersion: draft.version }, doctor, { ipAddress: '127.0.0.1' })
  assert.deepEqual(audits.map(item => item.action), ['Created medical record draft', 'Stopped medical order'])
  assert.equal(audits[1]?.details && 'orderId' in audits[1].details, true)
  assert.equal(audits[1]?.ipAddress, '127.0.0.1')
})
