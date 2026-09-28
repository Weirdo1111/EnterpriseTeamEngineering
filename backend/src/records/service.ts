import { randomUUID } from 'node:crypto'
import type { DbUser } from '../db.js'
import type { MedicalOrder, MedicalRecord, OrderType, RecordAudit, RecordRepository, ReviewDecision } from './types.js'

export class RecordServiceError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}

const editable = new Set(['draft', 'returned'])
const orderTypes = new Set<OrderType>(['Medication', 'Examination', 'Laboratory', 'Nursing'])
type OperationContext = { ipAddress?: string }

function clinician(user: DbUser) {
  if (!['doctor', 'seniorDoctor'].includes(user.role)) throw new RecordServiceError(403, 'Administrators have read-only access to medical records.')
}

function senior(user: DbUser) {
  if (user.role !== 'seniorDoctor') throw new RecordServiceError(403, 'Only a senior physician can review or archive a medical record.')
}

function text(value: unknown, field: string, max: number) {
  if (typeof value !== 'string' || !value.trim()) throw new RecordServiceError(400, `${field} is required.`)
  if (value.trim().length > max) throw new RecordServiceError(400, `${field} is too long.`)
  return value.trim()
}

function version(value: unknown) {
  if (!Number.isInteger(value) || (value as number) < 1) throw new RecordServiceError(400, 'A valid expectedVersion is required.')
  return value as number
}

export function createRecordService(repository: RecordRepository, now = () => new Date().toISOString()) {
  function audit(user: DbUser, action: string, resourceId: string, result: RecordAudit['result'], context: OperationContext, details?: object): RecordAudit {
    return { userId: String(user.id), userName: user.name, role: user.role, action, resourceId, result, ipAddress: context.ipAddress, details }
  }

  async function find(id: string, user: DbUser) {
    const record = await repository.getById(id)
    if (!record) throw new RecordServiceError(404, 'Medical record not found.')
    if (user.role === 'doctor' && record.doctorId !== String(user.id)) throw new RecordServiceError(404, 'Medical record not found.')
    return record
  }

  async function persist(record: MedicalRecord, expectedVersion: number, recordAudit: RecordAudit) {
    record.version = expectedVersion + 1
    record.updatedAt = now()
    recordAudit.details = { ...recordAudit.details, version: record.version }
    if (!await repository.save(record, expectedVersion, recordAudit)) throw new RecordServiceError(409, 'This record changed in another session. Reload it and retry.')
    return record
  }

  function assertEditable(record: MedicalRecord) {
    if (!editable.has(record.status)) throw new RecordServiceError(409, 'Only draft or returned records can be edited.')
  }

  function clinicalFields(input: Record<string, unknown>) {
    return {
      chiefComplaint: text(input.chiefComplaint, 'Chief complaint', 500),
      presentIllness: text(input.presentIllness, 'Present illness', 20000),
      diagnosis: text(input.diagnosis, 'Preliminary diagnosis', 1000),
    }
  }

  return {
    async list(user: DbUser) {
      const records = await repository.list()
      return user.role === 'doctor' ? records.filter(record => record.doctorId === String(user.id)) : records
    },
    getById: (id: string, user: DbUser) => find(id, user),
    async create(input: Record<string, unknown>, user: DbUser, context: OperationContext = {}) {
      clinician(user)
      const timestamp = now()
      const fields = clinicalFields(input)
      const patientId = text(input.patientId, 'Patient', 64)
      const patientName = text(input.patientName, 'Patient name', 100)
      const rawOrders = input.orders === undefined ? [] : input.orders
      if (!Array.isArray(rawOrders)) throw new RecordServiceError(400, 'Orders must be an array.')
      const orders: MedicalOrder[] = rawOrders.map(value => {
        if (!value || typeof value !== 'object') throw new RecordServiceError(400, 'Invalid medical order.')
        const item = value as Record<string, unknown>
        if (!orderTypes.has(item.type as OrderType)) throw new RecordServiceError(400, 'Invalid order type.')
        return { id: `O-${randomUUID()}`, type: item.type as OrderType, content: text(item.content, 'Order details', 2000), status: 'active', createdAt: timestamp, updatedAt: timestamp, createdBy: user.name, createdById: String(user.id) }
      })
      const aiMetadata = input.aiMetadata && typeof input.aiMetadata === 'object' ? input.aiMetadata as MedicalRecord['aiMetadata'] : undefined
      const record: MedicalRecord = {
        id: `MR-${randomUUID()}`, patientId, patientName, doctor: user.name, doctorId: String(user.id), ...fields,
        orders, status: 'draft', aiGenerated: Boolean(aiMetadata), aiMetadata, reviewHistory: [], version: 1,
        createdAt: timestamp, updatedAt: timestamp,
      }
      await repository.create(record, audit(user, 'Created medical record draft', record.id, record.aiGenerated ? 'Pending Review' : 'Success', context, { version: record.version }))
      return record
    },
    async update(id: string, input: Record<string, unknown>, user: DbUser, context: OperationContext = {}) {
      clinician(user)
      const record = await find(id, user)
      assertEditable(record)
      Object.assign(record, clinicalFields(input))
      return persist(record, version(input.expectedVersion), audit(user, 'Updated medical record draft', record.id, 'Success', context))
    },
    async submit(id: string, input: Record<string, unknown>, user: DbUser, context: OperationContext = {}) {
      clinician(user)
      const record = await find(id, user)
      assertEditable(record)
      if (record.aiGenerated && record.diagnosis.trim() === 'Pending physician assessment') {
        throw new RecordServiceError(400, 'Enter a physician-assessed preliminary diagnosis before submission.')
      }
      if (!record.orders.some(order => order.status === 'active')) throw new RecordServiceError(400, 'At least one active medical order is required before submission.')
      record.status = 'pending'
      record.submittedAt = now()
      record.reviewNote = undefined
      return persist(record, version(input.expectedVersion), audit(user, 'Submitted medical record for review', record.id, 'Pending Review', context))
    },
    async addOrder(id: string, input: Record<string, unknown>, user: DbUser, context: OperationContext = {}) {
      clinician(user)
      const record = await find(id, user)
      assertEditable(record)
      if (!orderTypes.has(input.type as OrderType)) throw new RecordServiceError(400, 'Invalid order type.')
      const timestamp = now()
      record.orders.push({ id: `O-${randomUUID()}`, type: input.type as OrderType, content: text(input.content, 'Order details', 2000), status: 'active', createdAt: timestamp, updatedAt: timestamp, createdBy: user.name, createdById: String(user.id) })
      return persist(record, version(input.expectedVersion), audit(user, 'Added medical order', record.id, 'Success', context))
    },
    async updateOrder(id: string, orderId: string, input: Record<string, unknown>, user: DbUser, context: OperationContext = {}) {
      clinician(user)
      const record = await find(id, user)
      assertEditable(record)
      const order = record.orders.find(item => item.id === orderId)
      if (!order) throw new RecordServiceError(404, 'Medical order not found.')
      if (order.status === 'stopped') throw new RecordServiceError(409, 'A stopped order cannot be edited.')
      order.content = text(input.content, 'Order details', 2000)
      order.updatedAt = now()
      return persist(record, version(input.expectedVersion), audit(user, 'Updated medical order', record.id, 'Success', context, { orderId }))
    },
    async stopOrder(id: string, orderId: string, input: Record<string, unknown>, user: DbUser, context: OperationContext = {}) {
      clinician(user)
      const record = await find(id, user)
      assertEditable(record)
      const order = record.orders.find(item => item.id === orderId)
      if (!order) throw new RecordServiceError(404, 'Medical order not found.')
      if (order.status === 'stopped') throw new RecordServiceError(409, 'This order has already been stopped.')
      order.status = 'stopped'; order.stoppedAt = now(); order.updatedAt = order.stoppedAt; order.stoppedBy = user.name; order.stoppedById = String(user.id)
      return persist(record, version(input.expectedVersion), audit(user, 'Stopped medical order', record.id, 'Success', context, { orderId }))
    },
    async review(id: string, input: Record<string, unknown>, user: DbUser, context: OperationContext = {}) {
      senior(user)
      const record = await find(id, user)
      const decision = input.decision as ReviewDecision
      if (!['approved', 'returned', 'archived'].includes(decision)) throw new RecordServiceError(400, 'Invalid review decision.')
      if (decision === 'archived' ? record.status !== 'approved' : record.status !== 'pending') {
        throw new RecordServiceError(409, decision === 'archived' ? 'Only an approved record can be archived.' : 'Only a pending record can be approved or returned.')
      }
      const note = text(input.note, 'Review note', 10000)
      const timestamp = now()
      record.status = decision; record.reviewNote = note; record.reviewedAt = timestamp; record.reviewedBy = user.name; record.reviewedById = String(user.id)
      record.reviewHistory.push({ id: `RV-${randomUUID()}`, decision, reviewer: user.name, reviewerId: String(user.id), note, createdAt: timestamp })
      const action = `${decision === 'archived' ? 'Archived' : decision === 'approved' ? 'Approved' : 'Returned'} medical record`
      return persist(record, version(input.expectedVersion), audit(user, action, record.id, decision === 'returned' ? 'Pending Review' : 'Success', context))
    },
  }
}
