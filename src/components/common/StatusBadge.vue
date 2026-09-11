<script setup lang="ts">
import { computed } from 'vue'
import type { AuditLog, PatientStatus, RecordStatus } from '@/types/clinical'
import { patientStatusLabel, recordStatusLabel } from '@/utils/status'

interface Props {
  status: PatientStatus | RecordStatus | AuditLog['result']
  type: 'patient' | 'record' | 'audit'
}

const props = defineProps<Props>()

const label = computed(() => {
  if (props.type === 'patient') return patientStatusLabel(props.status as PatientStatus)
  if (props.type === 'record') return recordStatusLabel(props.status as RecordStatus)
  return props.status
})

const tone = computed(() => {
  if (['stable', 'approved', '成功'].includes(props.status)) return 'success'
  if (['warning', 'pending', '待复核'].includes(props.status)) return 'warning'
  if (['critical', 'returned', '拦截'].includes(props.status)) return 'danger'
  return 'info'
})
</script>

<template>
  <span class="status-badge" :class="`status-${tone}`">{{ label }}</span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 9px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.status-success {
  color: var(--green);
  background: #eaf7ef;
}

.status-warning {
  color: var(--amber);
  background: #fff4dc;
}

.status-danger {
  color: var(--red);
  background: #ffeded;
}

.status-info {
  color: var(--primary);
  background: #e8f2ff;
}
</style>