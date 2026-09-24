import assert from 'node:assert/strict'
import test from 'node:test'
import type { DbUser } from '../db.js'
import { createRecordService, RecordServiceError } from './service.js'
import type { MedicalRecord, RecordRepository } from './types.js'

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
