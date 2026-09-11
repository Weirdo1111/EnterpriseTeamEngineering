import type { PatientStatus, RecordStatus } from '@/types/clinical'

export function patientStatusLabel(status: PatientStatus) {
  return {
    stable: '平稳',
    warning: '需关注',
    critical: '高风险',
  }[status]
}

export function recordStatusLabel(status: RecordStatus) {
  return {
    draft: '草稿',
    pending: '待审核',
    approved: '已通过',
    returned: '已退回',
  }[status]
}
