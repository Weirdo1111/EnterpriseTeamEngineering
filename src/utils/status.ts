import type { PatientStatus, RecordStatus, RemoteConsultationStatus } from '@/types/clinical'

export const patientStatusLabel: Record<PatientStatus, string> = {
  stable: '平稳',
  warning: '需关注',
  critical: '高风险',
}

export const recordStatusLabel: Record<RecordStatus, string> = {
  draft: '草稿',
  pending: '待审核',
  approved: '已通过',
  returned: '已退回',
  archived: '已归档',
}

export const remoteStatusLabel: Record<RemoteConsultationStatus, string> = {
  pending: '待接收',
  accepted: '已接收',
  inProgress: '会诊中',
  completed: '已完成',
}
