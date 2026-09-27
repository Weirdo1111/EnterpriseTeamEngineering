import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import type { RowDataPacket } from 'mysql2/promise'
import { createDb, type DbUser } from '../db.js'
import { createRecordRepository } from './repository.js'
import { createRecordService } from './service.js'
import type { MedicalRecord } from './types.js'

const enabled = process.env.RUN_DB_INTEGRATION === '1'

test('record and audit writes commit or roll back together in MariaDB', { skip: !enabled }, async () => {
  const db = createDb()
  const repository = createRecordRepository(db.pool)
  let committedId: string | undefined
  const rollbackId = `MR-IT-${randomUUID()}`
  try {
    const doctor = await db.byAccount('doctor.demo')
    assert.ok(doctor, 'doctor.demo must be seeded before running integration tests')
    const service = createRecordService(repository)
    const record = await service.create({
      patientId: 'P-INTEGRATION', patientName: 'Integration Test', chiefComplaint: 'Test complaint',
      presentIllness: 'Transaction integration test only.', diagnosis: 'Test record',
      orders: [{ type: 'Nursing', content: 'Test observation' }],
    }, doctor, { ipAddress: '127.0.0.1' })
    committedId = record.id
    const [auditRows] = await db.pool.execute<(RowDataPacket & { count: number })[]>('SELECT COUNT(*) count FROM audit_logs WHERE resource_type=? AND resource_id=?', ['medical_record', record.id])
    assert.equal(Number(auditRows[0]?.count), 1)

    const timestamp = new Date().toISOString()
    const rollbackRecord: MedicalRecord = {
      id: rollbackId, patientId: 'P-ROLLBACK', patientName: 'Rollback Test', doctor: doctor.name, doctorId: doctor.id,
      chiefComplaint: 'Rollback', presentIllness: 'Must not persist.', diagnosis: 'Rollback test', orders: [],
      status: 'draft', aiGenerated: false, reviewHistory: [], version: 1, createdAt: timestamp, updatedAt: timestamp,
    }
    const invalidUser = { ...doctor, id: '999999999999' } satisfies DbUser
    await assert.rejects(() => repository.create(rollbackRecord, {
      userId: invalidUser.id, userName: invalidUser.name, role: invalidUser.role, action: 'Rollback test',
      resourceId: rollbackId, result: 'Success',
    }))
    assert.equal(await repository.getById(rollbackId), null)
  } finally {
    const ids = [committedId, rollbackId].filter((id): id is string => Boolean(id))
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',')
      const connection = await db.pool.getConnection()
      try {
        await connection.beginTransaction()
        await connection.query(`DELETE FROM audit_logs WHERE resource_type='medical_record' AND resource_id IN (${placeholders})`, ids)
        await connection.query(`DELETE FROM medical_orders WHERE record_id IN (${placeholders})`, ids)
        await connection.query(`DELETE FROM record_reviews WHERE record_id IN (${placeholders})`, ids)
        await connection.query(`DELETE FROM medical_records WHERE id IN (${placeholders})`, ids)
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally { connection.release() }
    }
    await db.close()
  }
})
