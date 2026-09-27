import type { PoolConnection } from 'mysql2/promise'

export type RecordStatus = 'draft' | 'pending' | 'approved' | 'returned' | 'archived'
export type ReviewDecision = 'approved' | 'returned' | 'archived'
export type OrderType = 'Medication' | 'Examination' | 'Laboratory' | 'Nursing'

export interface MedicalOrder {
  id: string
  type: OrderType
  content: string
  status: 'active' | 'stopped'
  createdAt: string
  updatedAt: string
  createdBy: string
  createdById: string
  stoppedAt?: string
  stoppedBy?: string
  stoppedById?: string
}

export interface RecordReview {
  id: string
  decision: ReviewDecision
  reviewer: string
  reviewerId: string
  note: string
  createdAt: string
}

export interface MedicalRecord {
  id: string
  patientId: string
  patientName: string
  doctor: string
  doctorId: string
  chiefComplaint: string
  presentIllness: string
  diagnosis: string
  orders: MedicalOrder[]
  status: RecordStatus
  aiGenerated: boolean
  aiMetadata?: { generator: string; generatedAt: string; safetyWarnings: string[]; sourceIds: string[]; evidence?: { field: string; sourceId: string; quote: string }[]; followUpItems?: string[] }
  reviewNote?: string
  reviewHistory: RecordReview[]
  version: number
  createdAt: string
  updatedAt: string
  submittedAt?: string
  reviewedAt?: string
  reviewedBy?: string
  reviewedById?: string
}

export interface RecordAudit {
  userId: string
  userName: string
  role: string
  action: string
  resourceId: string
  result: 'Success' | 'Pending Review'
  ipAddress?: string
  details?: object
}

export interface RecordRepository {
  list(): Promise<MedicalRecord[]>
  getById(id: string): Promise<MedicalRecord | null>
  create(record: MedicalRecord, audit?: RecordAudit): Promise<void>
  save(record: MedicalRecord, expectedVersion: number, audit?: RecordAudit): Promise<boolean>
  transaction?<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T>
}
