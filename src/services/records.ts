import { recordsSeed } from '@/mocks/records'
import { useAuthStore } from '@/stores/auth'
import type { AiGenerationMetadata, MedicalOrder, MedicalRecord, RecordReviewDecision, Role } from '@/types/clinical'
import { apiEnabled, apiRequest } from './http'

export const RECORD_STORAGE_KEY = 'doctor-platform-medical-records-v1'
export const RECORD_STORAGE_VERSION = 1

export interface RecordDraftInput {
  patientId: string
  patientName: string
  chiefComplaint: string
  presentIllness: string
  diagnosis: string
  orders?: Pick<MedicalOrder, 'type' | 'content'>[]
  aiMetadata?: AiGenerationMetadata
}

export interface MedicalRecordService {
  list(): Promise<MedicalRecord[]>
  getById(id: string): Promise<MedicalRecord>
  createDraft(input: RecordDraftInput): Promise<MedicalRecord>
  updateClinicalFields(id: string, fields: Pick<MedicalRecord, 'chiefComplaint' | 'presentIllness' | 'diagnosis'>, expectedVersion: number): Promise<MedicalRecord>
  submit(id: string, expectedVersion: number): Promise<MedicalRecord>
  addOrder(id: string, order: Pick<MedicalOrder, 'type' | 'content'>, expectedVersion: number): Promise<MedicalRecord>
  updateOrder(id: string, orderId: string, content: string, expectedVersion: number): Promise<MedicalRecord>
  stopOrder(id: string, orderId: string, expectedVersion: number): Promise<MedicalRecord>
  review(id: string, decision: RecordReviewDecision, note: string, expectedVersion: number): Promise<MedicalRecord>
}

function isIsoDate(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isMedicalRecord(value: unknown): value is MedicalRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (!['id', 'patientId', 'patientName', 'doctor', 'chiefComplaint', 'presentIllness', 'diagnosis'].every(key => typeof record[key] === 'string')) return false
  if (!['draft', 'pending', 'approved', 'returned', 'archived'].includes(record.status as string)) return false
  if (!Number.isInteger(record.version) || (record.version as number) < 1 || !isIsoDate(record.createdAt) || !isIsoDate(record.updatedAt)) return false
  if (!Array.isArray(record.orders) || !Array.isArray(record.reviewHistory)) return false
  return record.orders.every(item => {
    if (!item || typeof item !== 'object') return false
    const order = item as Record<string, unknown>
    return typeof order.id === 'string' && typeof order.content === 'string'
      && ['Medication', 'Examination', 'Laboratory', 'Nursing'].includes(order.type as string)
      && ['active', 'stopped'].includes(order.status as string)
      && typeof order.createdBy === 'string' && isIsoDate(order.createdAt) && isIsoDate(order.updatedAt)
  })
}

function validateClinicalFields(fields: Pick<MedicalRecord, 'chiefComplaint' | 'presentIllness' | 'diagnosis'>) {
  if (!fields.chiefComplaint.trim()) throw new Error('Chief complaint is required.')
  if (!fields.presentIllness.trim()) throw new Error('Present illness is required.')
  if (!fields.diagnosis.trim()) throw new Error('Preliminary diagnosis is required.')
  return {
    chiefComplaint: fields.chiefComplaint.trim(),
    presentIllness: fields.presentIllness.trim(),
    diagnosis: fields.diagnosis.trim(),
  }
}

export function createMockMedicalRecordService(options: {
  storage: () => Pick<Storage, 'getItem' | 'setItem'>
  role: () => Role
  owner: () => string
  now?: () => string
}): MedicalRecordService {
  const now = options.now ?? (() => new Date().toISOString())

  function read() {
    let raw: string | null
    try { raw = options.storage().getItem(RECORD_STORAGE_KEY) }
    catch { throw new Error('Unable to read local medical records. Check browser storage permissions and retry.') }
    if (!raw) return structuredClone(recordsSeed)
    try {
      const saved = JSON.parse(raw)
      if (saved.version !== RECORD_STORAGE_VERSION || !Array.isArray(saved.records) || !saved.records.every(isMedicalRecord)) throw new Error('Invalid stored data')
      if (new Set(saved.records.map((record: MedicalRecord) => record.id)).size !== saved.records.length) throw new Error('Duplicate record IDs')
      return structuredClone(saved.records as MedicalRecord[])
    } catch {
      throw new Error('Local medical record data is invalid. Reset the medical record demo storage before continuing.')
    }
  }

  function commit(records: MedicalRecord[]) {
    try { options.storage().setItem(RECORD_STORAGE_KEY, JSON.stringify({ version: RECORD_STORAGE_VERSION, records })) }
    catch { throw new Error('Save failed: unable to persist medical records. Your current form values have been kept.') }
  }

  function find(records: MedicalRecord[], id: string) {
    const record = records.find(item => item.id === id)
    if (!record) throw new Error('Medical record not found.')
    return record
  }

  function assertClinician() {
    if (!['doctor', 'seniorDoctor'].includes(options.role())) throw new Error('Administrators have read-only access to medical records.')
  }

  function assertSenior() {
    if (options.role() !== 'seniorDoctor') throw new Error('Only a senior physician can review or archive a medical record.')
  }

  function assertEditable(record: MedicalRecord) {
    if (!['draft', 'returned'].includes(record.status)) throw new Error('Only draft or returned records can be edited.')
  }

  function assertVersion(record: MedicalRecord, expectedVersion: number) {
    if (record.version !== expectedVersion) throw new Error('This record changed in another session. Reload it before saving again.')
  }

  function touch(record: MedicalRecord) {
    record.version += 1
    record.updatedAt = now()
  }

  function mutate(id: string, expectedVersion: number, operation: (record: MedicalRecord) => void) {
    const records = read()
    const record = find(records, id)
    assertVersion(record, expectedVersion)
    operation(record)
    touch(record)
    commit(records)
    return structuredClone(record)
  }

  return {
    async list() { return read() },
    async getById(id) { return structuredClone(find(read(), id)) },
    async createDraft(input) {
      assertClinician()
      const fields = validateClinicalFields(input)
      if (!input.patientId || !input.patientName.trim()) throw new Error('A patient is required to create a medical record.')
      if (input.orders?.some(order => !order.content.trim())) throw new Error('Order details are required.')
      const records = read()
      const timestamp = now()
      const record: MedicalRecord = {
        id: `MR-${crypto.randomUUID()}`,
        patientId: input.patientId,
        patientName: input.patientName.trim(),
        doctor: options.owner(),
        ...fields,
        orders: (input.orders ?? []).map(order => ({
          id: `O-${crypto.randomUUID()}`,
          type: order.type,
          content: order.content.trim(),
          status: 'active',
          createdAt: timestamp,
          updatedAt: timestamp,
          createdBy: options.owner(),
        })),
        status: 'draft',
        aiGenerated: Boolean(input.aiMetadata),
        aiMetadata: input.aiMetadata,
        reviewHistory: [],
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      records.unshift(record)
      commit(records)
      return structuredClone(record)
    },
    async updateClinicalFields(id, fields, expectedVersion) {
      assertClinician()
      const cleaned = validateClinicalFields(fields)
      return mutate(id, expectedVersion, record => { assertEditable(record); Object.assign(record, cleaned) })
    },
    async submit(id, expectedVersion) {
      assertClinician()
      return mutate(id, expectedVersion, record => {
        assertEditable(record)
        validateClinicalFields(record)
        if (!record.orders.some(order => order.status === 'active')) throw new Error('At least one active medical order is required before submission.')
        record.status = 'pending'
        record.submittedAt = now()
        record.reviewNote = undefined
      })
    },
    async addOrder(id, order, expectedVersion) {
      assertClinician()
      const content = order.content.trim()
      if (!content) throw new Error('Order details are required.')
      return mutate(id, expectedVersion, record => {
        assertEditable(record)
        const timestamp = now()
        record.orders.push({ id: `O-${crypto.randomUUID()}`, type: order.type, content, status: 'active', createdAt: timestamp, updatedAt: timestamp, createdBy: options.owner() })
      })
    },
    async updateOrder(id, orderId, content, expectedVersion) {
      assertClinician()
      const cleaned = content.trim()
      if (!cleaned) throw new Error('Order details are required.')
      return mutate(id, expectedVersion, record => {
        assertEditable(record)
        const order = record.orders.find(item => item.id === orderId)
        if (!order) throw new Error('Medical order not found.')
        if (order.status === 'stopped') throw new Error('A stopped order cannot be edited.')
        order.content = cleaned
        order.updatedAt = now()
      })
    },
    async stopOrder(id, orderId, expectedVersion) {
      assertClinician()
      return mutate(id, expectedVersion, record => {
        assertEditable(record)
        const order = record.orders.find(item => item.id === orderId)
        if (!order) throw new Error('Medical order not found.')
        if (order.status === 'stopped') throw new Error('This order has already been stopped.')
        order.status = 'stopped'
        order.stoppedAt = now()
        order.stoppedBy = options.owner()
        order.updatedAt = order.stoppedAt
      })
    },
    async review(id, decision, note, expectedVersion) {
      assertSenior()
      const cleaned = note.trim()
      if (!cleaned) throw new Error('A review note is required.')
      return mutate(id, expectedVersion, record => {
        if (decision === 'archived') {
          if (record.status !== 'approved') throw new Error('Only an approved record can be archived.')
        } else if (record.status !== 'pending') throw new Error('Only a pending record can be approved or returned.')
        const timestamp = now()
        record.status = decision
        record.reviewNote = cleaned
        record.reviewedAt = timestamp
        record.reviewedBy = options.owner()
        record.reviewHistory.push({ id: `RV-${crypto.randomUUID()}`, decision, reviewer: options.owner(), note: cleaned, createdAt: timestamp })
      })
    },
  }
}

export function createApiMedicalRecordService(): MedicalRecordService {
  const record = (result: { record: MedicalRecord }) => result.record
  return {
    async list() { return (await apiRequest<{ records: MedicalRecord[] }>('/api/records')).records },
    async getById(id) { return record(await apiRequest<{ record: MedicalRecord }>(`/api/records/${encodeURIComponent(id)}`)) },
    async createDraft(input) {
      return record(await apiRequest<{ record: MedicalRecord }>('/api/records', { method: 'POST', body: JSON.stringify(input) }))
    },
    async updateClinicalFields(id, fields, expectedVersion) {
      return record(await apiRequest<{ record: MedicalRecord }>(`/api/records/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ ...fields, expectedVersion }) }))
    },
    async submit(id, expectedVersion) {
      return record(await apiRequest<{ record: MedicalRecord }>(`/api/records/${encodeURIComponent(id)}/submit`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }))
    },
    async addOrder(id, order, expectedVersion) {
      return record(await apiRequest<{ record: MedicalRecord }>(`/api/records/${encodeURIComponent(id)}/orders`, { method: 'POST', body: JSON.stringify({ ...order, expectedVersion }) }))
    },
    async updateOrder(id, orderId, content, expectedVersion) {
      return record(await apiRequest<{ record: MedicalRecord }>(`/api/records/${encodeURIComponent(id)}/orders/${encodeURIComponent(orderId)}`, { method: 'PATCH', body: JSON.stringify({ content, expectedVersion }) }))
    },
    async stopOrder(id, orderId, expectedVersion) {
      return record(await apiRequest<{ record: MedicalRecord }>(`/api/records/${encodeURIComponent(id)}/orders/${encodeURIComponent(orderId)}/stop`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }))
    },
    async review(id, decision, note, expectedVersion) {
      return record(await apiRequest<{ record: MedicalRecord }>(`/api/records/${encodeURIComponent(id)}/reviews`, { method: 'POST', body: JSON.stringify({ decision, note, expectedVersion }) }))
    },
  }
}

const mockMedicalRecordService = createMockMedicalRecordService({
  storage: () => window.localStorage,
  role: () => useAuthStore().currentRole,
  owner: () => useAuthStore().profile.name,
})

export const medicalRecordService = apiEnabled ? createApiMedicalRecordService() : mockMedicalRecordService
