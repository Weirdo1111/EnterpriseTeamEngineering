import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type { MedicalOrder, MedicalRecord, RecordAudit, RecordRepository, RecordReview } from './types.js'

type RecordRow = RowDataPacket & {
  id: string; patient_id: string; patient_name: string; doctor_id: string; doctor_name: string
  chief_complaint: string; present_illness: string; diagnosis: string; status: MedicalRecord['status']
  ai_generated: number; ai_metadata: unknown; review_note: string | null; version: number
  submitted_at: Date | null; reviewed_at: Date | null; reviewed_by: string | null; reviewed_by_name: string | null
  created_at: Date; updated_at: Date
}
type OrderRow = RowDataPacket & {
  id: string; record_id: string; order_type: MedicalOrder['type']; content: string; status: MedicalOrder['status']
  created_by: string; created_by_name: string; stopped_at: Date | null; stopped_by: string | null; stopped_by_name: string | null
  created_at: Date; updated_at: Date
}
type ReviewRow = RowDataPacket & {
  id: string; record_id: string; decision: RecordReview['decision']; reviewer_id: string; reviewer_name: string; note: string; created_at: Date
}

const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : new Date(value).toISOString()
const optionalIso = (value: Date | string | null) => value ? iso(value) : undefined
const dbDate = (value: string | undefined) => value ? new Date(value) : null
const recordColumns = `id, patient_id, patient_name, doctor_id, doctor_name, chief_complaint, present_illness,
  diagnosis, status, ai_generated, ai_metadata, review_note, version, submitted_at, reviewed_at,
  reviewed_by, reviewed_by_name, created_at, updated_at`

function parseMetadata(value: unknown): MedicalRecord['aiMetadata'] {
  if (!value) return undefined
  if (typeof value === 'string') return JSON.parse(value) as MedicalRecord['aiMetadata']
  return value as MedicalRecord['aiMetadata']
}

function aggregate(rows: RecordRow[], orders: OrderRow[], reviews: ReviewRow[]) {
  return rows.map(row => ({
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    doctor: row.doctor_name,
    doctorId: String(row.doctor_id),
    chiefComplaint: row.chief_complaint,
    presentIllness: row.present_illness,
    diagnosis: row.diagnosis,
    status: row.status,
    aiGenerated: Boolean(row.ai_generated),
    aiMetadata: parseMetadata(row.ai_metadata),
    reviewNote: row.review_note ?? undefined,
    version: row.version,
    submittedAt: optionalIso(row.submitted_at),
    reviewedAt: optionalIso(row.reviewed_at),
    reviewedBy: row.reviewed_by_name ?? undefined,
    reviewedById: row.reviewed_by ? String(row.reviewed_by) : undefined,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    orders: orders.filter(item => item.record_id === row.id).map(item => ({
      id: item.id,
      type: item.order_type,
      content: item.content,
      status: item.status,
      createdBy: item.created_by_name,
      createdById: String(item.created_by),
      stoppedAt: optionalIso(item.stopped_at),
      stoppedBy: item.stopped_by_name ?? undefined,
      stoppedById: item.stopped_by ? String(item.stopped_by) : undefined,
      createdAt: iso(item.created_at),
      updatedAt: iso(item.updated_at),
    })),
    reviewHistory: reviews.filter(item => item.record_id === row.id).map(item => ({
      id: item.id,
      decision: item.decision,
      reviewer: item.reviewer_name,
      reviewerId: String(item.reviewer_id),
      note: item.note,
      createdAt: iso(item.created_at),
    })),
  } satisfies MedicalRecord))
}

async function childRows(connection: Pool | PoolConnection, ids: string[]) {
  if (!ids.length) return { orders: [] as OrderRow[], reviews: [] as ReviewRow[] }
  const placeholders = ids.map(() => '?').join(',')
  const [orders] = await connection.query<OrderRow[]>(`SELECT id, record_id, order_type, content, status, created_by, created_by_name, stopped_at, stopped_by, stopped_by_name, created_at, updated_at FROM medical_orders WHERE record_id IN (${placeholders}) ORDER BY created_at`, ids)
  const [reviews] = await connection.query<ReviewRow[]>(`SELECT id, record_id, decision, reviewer_id, reviewer_name, note, created_at FROM record_reviews WHERE record_id IN (${placeholders}) ORDER BY created_at`, ids)
  return { orders, reviews }
}

async function insertOrders(connection: PoolConnection, record: MedicalRecord) {
  for (const order of record.orders) {
    await connection.execute(
      `INSERT INTO medical_orders (id, record_id, order_type, content, status, created_by, created_by_name, stopped_at, stopped_by, stopped_by_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE content=VALUES(content), status=VALUES(status), stopped_at=VALUES(stopped_at), stopped_by=VALUES(stopped_by), stopped_by_name=VALUES(stopped_by_name), updated_at=VALUES(updated_at)`,
      [order.id, record.id, order.type, order.content, order.status, order.createdById, order.createdBy, dbDate(order.stoppedAt), order.stoppedById ?? null, order.stoppedBy ?? null, dbDate(order.createdAt), dbDate(order.updatedAt)],
    )
  }
}

async function insertReviews(connection: PoolConnection, record: MedicalRecord) {
  for (const review of record.reviewHistory) {
    await connection.execute(
      'INSERT IGNORE INTO record_reviews (id, record_id, decision, reviewer_id, reviewer_name, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [review.id, record.id, review.decision, review.reviewerId, review.reviewer, review.note, dbDate(review.createdAt)],
    )
  }
}

async function insertAudit(connection: PoolConnection, audit?: RecordAudit) {
  if (!audit) return
  await connection.execute(
    'INSERT INTO audit_logs (user_id, user_name, role, action, resource_type, resource_id, result, ip_address, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [audit.userId, audit.userName, audit.role, audit.action, 'medical_record', audit.resourceId, audit.result,
      audit.ipAddress ?? null, audit.details ? JSON.stringify(audit.details) : null],
  )
}

export function createRecordRepository(pool: Pool): RecordRepository {
  async function transaction<T>(operation: (connection: PoolConnection) => Promise<T>) {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      const result = await operation(connection)
      await connection.commit()
      return result
    } catch (error) {
      await connection.rollback()
      throw error
    } finally { connection.release() }
  }

  return {
    transaction,
    async list() {
      const [rows] = await pool.query<RecordRow[]>(`SELECT ${recordColumns} FROM medical_records ORDER BY updated_at DESC`)
      const children = await childRows(pool, rows.map(row => row.id))
      return aggregate(rows, children.orders, children.reviews)
    },
    async getById(id) {
      const [rows] = await pool.execute<RecordRow[]>(`SELECT ${recordColumns} FROM medical_records WHERE id = ? LIMIT 1`, [id])
      if (!rows[0]) return null
      const children = await childRows(pool, [id])
      return aggregate(rows, children.orders, children.reviews)[0]!
    },
    async create(record, audit) {
      await transaction(async connection => {
        await connection.execute(
          `INSERT INTO medical_records (id, patient_id, patient_name, doctor_id, doctor_name, chief_complaint, present_illness, diagnosis, status, ai_generated, ai_metadata, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [record.id, record.patientId, record.patientName, record.doctorId, record.doctor, record.chiefComplaint, record.presentIllness, record.diagnosis, record.status, record.aiGenerated, record.aiMetadata ? JSON.stringify(record.aiMetadata) : null, record.version, dbDate(record.createdAt), dbDate(record.updatedAt)],
        )
        await insertOrders(connection, record)
        await insertAudit(connection, audit)
      })
    },
    async save(record, expectedVersion, audit) {
      return transaction(async connection => {
        const [result] = await connection.execute<ResultSetHeader>(
          `UPDATE medical_records SET chief_complaint=?, present_illness=?, diagnosis=?, status=?, ai_generated=?, ai_metadata=?, review_note=?, version=?, submitted_at=?, reviewed_at=?, reviewed_by=?, reviewed_by_name=?, updated_at=?
           WHERE id=? AND version=?`,
          [record.chiefComplaint, record.presentIllness, record.diagnosis, record.status, record.aiGenerated, record.aiMetadata ? JSON.stringify(record.aiMetadata) : null, record.reviewNote ?? null, record.version, dbDate(record.submittedAt), dbDate(record.reviewedAt), record.reviewedById ?? null, record.reviewedBy ?? null, dbDate(record.updatedAt), record.id, expectedVersion],
        )
        if (result.affectedRows !== 1) return false
        await insertOrders(connection, record)
        await insertReviews(connection, record)
        await insertAudit(connection, audit)
        return true
      })
    },
  }
}
