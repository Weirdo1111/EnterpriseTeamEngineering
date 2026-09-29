<script setup lang="ts">
import { computed } from 'vue'
import type { AuditLog, PatientStatus, RecordStatus } from '@/types/clinical'
import { patientStatusLabel, recordStatusLabel } from '@/utils/status'

interface Props {
  status: PatientStatus | RecordStatus | AuditLog['result']
  type: 'patient' | 'record' | 'audit'
  compact?: boolean
}

const props = defineProps<Props>()

const label = computed(() => {
  if (props.type === 'patient') return patientStatusLabel[props.status as PatientStatus]
  if (props.type === 'record') return recordStatusLabel[props.status as RecordStatus]
  return props.status
})

const tone = computed(() => {
  if (['stable', 'approved', 'archived', 'Success'].includes(props.status)) return 'success'
  if (['warning', 'pending', 'Pending Review'].includes(props.status)) return 'warning'
  if (['critical', 'returned', 'Blocked'].includes(props.status)) return 'danger'
  return 'info'
})

const compactLabel = computed(() => {
  if (props.type === 'patient') {
    return { stable: 'S', warning: 'A', critical: 'H' }[props.status as PatientStatus]
  }
  return label.value.charAt(0)
})
</script>

<template>
  <span class="status-badge" :class="[`status-${tone}`, { 'status-badge--compact': compact }]" :title="compact ? label : undefined" :aria-label="compact ? label : undefined">{{ compact ? compactLabel : label }}</span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 9px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.status-badge--compact {
  justify-content: center;
  width: 26px;
  height: 26px;
  min-width: 26px;
  padding: 0;
  border-radius: 50%;
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
