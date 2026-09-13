export type Role = 'doctor' | 'seniorDoctor' | 'admin'

export type PatientStatus = 'stable' | 'warning' | 'critical'

export type RecordStatus = 'draft' | 'pending' | 'approved' | 'returned' | 'archived'

export type ConsultationStatus = 'waiting' | 'active' | 'completed'

export type RemoteConsultationStatus = 'pending' | 'accepted' | 'inProgress' | 'completed'

export interface Patient {
  id: string
  name: string
  gender: 'Male' | 'Female'
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
  type: 'Medication' | 'Examination' | 'Laboratory' | 'Nursing'
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
  result: 'Success' | 'Blocked' | 'Pending Review'
}

export interface RagReference {
  id: string
  title: string
  kind: 'Clinical Guideline' | 'Medication Information' | 'De-identified Case'
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
  type: 'Medication' | 'Follow-up' | 'Monitoring'
  content: string
  dueAt: string
  status: 'pending' | 'completed'
}

export interface HealthAssessment {
  id: string
  patientId: string
  date: string
  level: 'Low Risk' | 'Moderate Risk' | 'High Risk'
  summary: string
  advice: string
}
