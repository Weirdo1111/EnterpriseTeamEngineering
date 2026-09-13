import type { PatientStatus, RecordStatus, RemoteConsultationStatus } from '@/types/clinical'

export const patientStatusLabel: Record<PatientStatus, string> = {
  stable: 'Stable',
  warning: 'Needs Attention',
  critical: 'High Risk',
}

export const recordStatusLabel: Record<RecordStatus, string> = {
  draft: 'Draft',
  pending: 'Pending Review',
  approved: 'Approved',
  returned: 'Returned',
  archived: 'Archived',
}

export const remoteStatusLabel: Record<RemoteConsultationStatus, string> = {
  pending: 'Pending Acceptance',
  accepted: 'Accepted',
  inProgress: 'In Progress',
  completed: 'Completed',
}
