import { useAuthStore } from '@/stores/auth'
import type { ConsultationSession, MedicalOrder, MedicalRecord, Role } from '@/types/clinical'
import { consultationRecordDraft } from '@/utils/consultation-records'

export const CONSULTATION_RECORDS_STORAGE_KEY = 'doctor-platform-consultation-records-v1'
export const CONSULTATION_RECORDS_STORAGE_VERSION = 2
type RecordFields = Pick<MedicalRecord, 'chiefComplaint' | 'presentIllness' | 'diagnosis'>
type OrderInput = Pick<MedicalOrder, 'type' | 'content'>
type ReviewStatus = 'approved' | 'returned' | 'archived'

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function text(value: unknown): value is string { return typeof value === 'string' && Boolean(value.trim()) }
function timestamp(value: unknown): value is string {
  return text(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
}
function validOrder(value: unknown): value is MedicalOrder {
  return object(value) && text(value.id) && text(value.content)
    && ['Medication', 'Examination', 'Laboratory', 'Nursing'].includes(value.type as string)
    && ['active', 'stopped'].includes(value.status as string)
}
function validRecord(value: unknown): value is MedicalRecord {
  return object(value)
    && ['id', 'patientId', 'patientName', 'doctor', 'sourceConsultationId'].every(key => text(value[key]))
    && ['chiefComplaint', 'presentIllness', 'diagnosis'].every(key => typeof value[key] === 'string')
    && value.aiGenerated === false
    && ['draft', 'pending', 'approved', 'returned', 'archived'].includes(value.status as string)
    && timestamp(value.updatedAt) && timestamp(value.sourceSummaryUpdatedAt)
    && (value.reviewNote === undefined || typeof value.reviewNote === 'string')
    && Array.isArray(value.orders) && value.orders.every(validOrder)
    && new Set(value.orders.map(order => order.id)).size === value.orders.length
}

function validWorkflowMetadata(record: MedicalRecord) {
  return Number.isSafeInteger(record.version) && record.version >= 1 && timestamp(record.createdAt)
    && Array.isArray(record.reviewHistory) && record.reviewHistory.every(review => object(review)
      && text(review.id) && ['approved', 'returned', 'archived'].includes(review.decision as string)
      && text(review.reviewer) && text(review.note) && timestamp(review.createdAt))
    && record.orders.every(order => timestamp(order.createdAt) && timestamp(order.updatedAt) && text(order.createdBy))
}

/** Legacy local records predate workflow metadata; preserve their content without writing on read. */
function migrateLegacyRecord(record: MedicalRecord): MedicalRecord {
  return {
    ...record,
    version: 1,
    createdAt: record.updatedAt,
    reviewHistory: [],
    orders: record.orders.map(order => ({
      ...order,
      createdAt: record.updatedAt,
      updatedAt: record.updatedAt,
      createdBy: 'Legacy record (author not recorded)',
    })),
  }
}

export function createLocalConsultationRecordService(options: {
  storage: () => Pick<Storage, 'getItem' | 'setItem'>
  role: () => Role
  owner?: () => string
  uuid?: () => string
  now?: () => string
}) {
  const uuid = options.uuid ?? (() => crypto.randomUUID())
  const now = options.now ?? (() => new Date().toISOString())
  const owner = options.owner ?? (() => options.role() === 'seniorDoctor' ? 'Senior Physician' : 'Physician')

  function list(): MedicalRecord[] {
    let raw: string | null
    try { raw = options.storage().getItem(CONSULTATION_RECORDS_STORAGE_KEY) }
    catch { throw new Error('Unable to read consultation medical records. Check browser storage permissions and retry.') }
    if (raw === null) return []
    try {
      const saved: unknown = JSON.parse(raw)
      if (!object(saved) || ![1, CONSULTATION_RECORDS_STORAGE_VERSION].includes(saved.version as number) || !Array.isArray(saved.records)
        || !saved.records.every(validRecord)
        || new Set(saved.records.map(record => record.id)).size !== saved.records.length
        || new Set(saved.records.map(record => record.sourceConsultationId)).size !== saved.records.length) throw new Error('Invalid records')
      const records = saved.version === 1 ? saved.records.map(migrateLegacyRecord) : saved.records
      if (!records.every(validWorkflowMetadata)) throw new Error('Invalid workflow metadata')
      return records
    } catch {
      throw new Error('Consultation medical records are damaged or use an unsupported format. Saved data has been kept unchanged.')
    }
  }

  function commit(records: MedicalRecord[]) {
    if (!records.every(record => validRecord(record) && validWorkflowMetadata(record))) throw new Error('Invalid medical record data. Saved data has been kept unchanged.')
    try { options.storage().setItem(CONSULTATION_RECORDS_STORAGE_KEY, JSON.stringify({ version: CONSULTATION_RECORDS_STORAGE_VERSION, records })) }
    catch { throw new Error('Unable to save the medical record in this browser. Your changes have not been saved; retry after checking storage permissions or space.') }
  }

  function assertWrite() {
    if (!['doctor', 'seniorDoctor'].includes(options.role())) throw new Error('Your current role has read-only access to medical records.')
  }

  function update(id: string, edit: (record: MedicalRecord) => void, review = false, expectedVersion?: number) {
    assertWrite()
    const records = list()
    const record = records.find(item => item.id === id)
    if (!record) throw new Error('The saved consultation medical record was not found. Reload records before trying again.')
    if (!review && !['draft', 'returned'].includes(record.status)) throw new Error('This medical record is read-only. Only draft or returned records can be edited.')
    if (expectedVersion !== undefined && record.version !== expectedVersion) throw new Error('This record changed in another session. Reload it before saving again.')
    edit(record)
    record.version += 1
    record.updatedAt = now()
    commit(records)
    return record
  }

  return {
    list,
    create(session: ConsultationSession, doctor: string): MedicalRecord {
      assertWrite()
      const records = list()
      const existing = records.find(record => record.sourceConsultationId === session.id)
      if (existing) return existing
      if (!['active', 'completed'].includes(session.status)) throw new Error('Accept the consultation and save its summary before creating a medical record.')
      if (!session.summary) throw new Error('Save a consultation summary before creating a medical record.')
      if (!text(doctor)) throw new Error('A physician name is required to create a medical record.')
      const record = consultationRecordDraft(session, doctor.trim(), `MR-C-${uuid()}`, now())
      if (records.some(item => item.id === record.id)) throw new Error('The record identifier already exists. Please retry.')
      records.unshift(record)
      commit(records)
      return record
    },
    save(id: string, fields: RecordFields, submit = false, expectedVersion?: number) {
      return update(id, record => {
        if (!object(fields) || !(['chiefComplaint', 'presentIllness', 'diagnosis'] as const).every(key => typeof fields[key] === 'string')) throw new Error('Enter valid medical record text.')
        if (fields.chiefComplaint.length > 1000 || fields.presentIllness.length > 12000 || fields.diagnosis.length > 3000) throw new Error('Medical record text exceeds the field limit.')
        if (submit && ![fields.chiefComplaint, fields.presentIllness, fields.diagnosis].every(text)) throw new Error('Complete the chief complaint, present illness, and diagnosis before submitting for review.')
        record.chiefComplaint = fields.chiefComplaint
        record.presentIllness = fields.presentIllness
        record.diagnosis = fields.diagnosis
        record.status = submit ? 'pending' : 'draft'
        if (submit) {
          record.submittedAt = now()
          record.reviewNote = undefined
        }
      }, false, expectedVersion)
    },
    addOrder(id: string, input: OrderInput, expectedVersion?: number) {
      return update(id, record => {
        if (!object(input)) throw new Error('Enter valid order details.')
        const time = now()
        const order: MedicalOrder = { type: input.type, content: input.content, id: `O-${uuid()}`, status: 'active', createdAt: time, updatedAt: time, createdBy: owner() }
        if (!validOrder(order)) throw new Error('Enter a valid order type and details.')
        record.orders.push(order)
      }, false, expectedVersion)
    },
    updateOrder(id: string, orderId: string, content: string, expectedVersion?: number) {
      return update(id, record => {
        const order = record.orders.find(item => item.id === orderId)
        if (!order || order.status !== 'active') throw new Error('Only an existing active order can be edited.')
        if (!text(content)) throw new Error('Enter the order details.')
        order.content = content
        order.updatedAt = now()
      }, false, expectedVersion)
    },
    stopOrder(id: string, orderId: string, expectedVersion?: number) {
      return update(id, record => {
        const order = record.orders.find(item => item.id === orderId)
        if (!order) throw new Error('Order not found.')
        order.status = 'stopped'
        order.updatedAt = now()
        order.stoppedAt = now()
        order.stoppedBy = owner()
      }, false, expectedVersion)
    },
    review(id: string, status: ReviewStatus, note: string, expectedVersion?: number) {
      if (options.role() !== 'seniorDoctor') throw new Error('Only a senior physician can review or archive medical records.')
      return update(id, record => {
        if (!text(note)) throw new Error('Enter a review note.')
        if (!((record.status === 'pending' && ['approved', 'returned'].includes(status)) || (record.status === 'approved' && status === 'archived'))) {
          throw new Error('The medical record status has changed. Reload it before reviewing or archiving.')
        }
        record.status = status
        record.reviewNote = note
        record.reviewedAt = now()
        record.reviewedBy = owner()
        record.reviewHistory.push({ id: `RR-${uuid()}`, decision: status, reviewer: owner(), note, createdAt: now() })
      }, true, expectedVersion)
    },
  }
}

export const consultationRecordService = createLocalConsultationRecordService({
  storage: () => window.localStorage,
  role: () => useAuthStore().currentRole,
  owner: () => useAuthStore().profile.name,
})
