export type Role = 'doctor' | 'seniorDoctor' | 'admin'

export type PatientStatus = 'stable' | 'warning' | 'critical'

export type RecordStatus = 'draft' | 'pending' | 'approved' | 'returned'

export interface Patient {
  id: string
  name: string
  gender: '男' | '女'
  age: number
  diagnosis: string
  group: string
  status: PatientStatus
  allergies: string[]
  history: string
  plan: string
  lastVisit: string
  ownerDoctor: string
  metrics: {
    bloodPressure: string
    glucose: string
    heartRate: number
    riskScore: number
  }
}

export interface ConsultationMessage {
  id: string
  sender: 'doctor' | 'patient' | 'ai'
  content: string
  time: string
  attachment?: string
}

export interface MedicalRecord {
  id: string
  patientId: string
  patientName: string
  doctor: string
  chiefComplaint: string
  presentIllness: string
  diagnosis: string
  orders: string[]
  status: RecordStatus
  aiGenerated: boolean
  reviewNote?: string
  updatedAt: string
}

export interface AuditLog {
  id: string
  user: string
  role: string
  action: string
  resource: string
  ip: string
  time: string
  result: '成功' | '拦截' | '待复核'
}

export interface RagReference {
  id: string
  title: string
  source: string
  confidence: number
}
