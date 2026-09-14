export type Role = 'doctor' | 'seniorDoctor' | 'admin'

export type PatientStatus = 'stable' | 'warning' | 'critical'

export type PatientManagementStatus = 'pending' | 'active' | 'closed'
export type AllergyStatus = 'unknown' | 'none' | 'known'

export interface PatientInput {
  name: string
  gender: '男' | '女'
  age: number
  phone: string
  address: string
  emergencyName: string
  emergencyRelation: string
  emergencyPhone: string
  symptoms: string
  diagnosis: string
  history: string
  allergyStatus: AllergyStatus
  allergies: string[]
  diseaseTags: string[]
  managementStatus: PatientManagementStatus
}

export type ClassificationChange =
  | { kind: 'addDisease' | 'removeDisease'; tags: string[] }
  | { kind: 'managementStatus'; status: PatientManagementStatus }

export type RecordStatus = 'draft' | 'pending' | 'approved' | 'returned' | 'archived'

export type ConsultationStatus = 'waiting' | 'active' | 'completed'

export type RemoteConsultationStatus = 'pending' | 'accepted' | 'inProgress' | 'completed'

export interface Patient extends PatientInput {
  id: string
  group: string
  status: PatientStatus
  plan: string
  lastVisit: string
  ownerDoctor: string
  createdAt: string
  updatedAt: string
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

export interface ConsultationSession {
  id: string
  patientId: string
  patientName: string
  complaint: string
  status: ConsultationStatus
  unread: number
  updatedAt: string
  messages: ConsultationMessage[]
}

export interface MedicalOrder {
  id: string
  type: '药物' | '检查' | '检验' | '护理'
  content: string
  status: 'active' | 'stopped'
}

export interface MedicalRecord {
  id: string
  patientId: string
  patientName: string
  doctor: string
  chiefComplaint: string
  presentIllness: string
  diagnosis: string
  orders: MedicalOrder[]
  status: RecordStatus
  aiGenerated: boolean
  reviewNote?: string
  updatedAt: string
}

export interface AuditLog {
  id: string
  user: string
  role: string
  department: string
  action: string
  resource: string
  ip: string
  time: string
  result: '成功' | '拦截' | '待复核'
}

export interface RagReference {
  id: string
  title: string
  kind: '临床指南' | '药品说明' | '脱敏病例'
  excerpt: string
}

export interface RemoteConsultation {
  id: string
  patientId: string
  patientName: string
  specialty: string
  reason: string
  requester: string
  experts: string[]
  materials: string[]
  status: RemoteConsultationStatus
  scheduledAt: string
  opinion: string
  report?: string
}

export interface HealthPlan {
  patientId: string
  goals: string
  measures: string
  reviewCycle: string
  updatedAt: string
}

export interface ReminderTask {
  id: string
  patientId: string
  type: '用药' | '复诊' | '监测'
  content: string
  dueAt: string
  status: 'pending' | 'completed'
}

export interface HealthAssessment {
  id: string
  patientId: string
  date: string
  level: '低风险' | '中风险' | '高风险'
  summary: string
  advice: string
}
