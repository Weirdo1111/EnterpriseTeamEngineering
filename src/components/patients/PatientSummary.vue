<script setup lang="ts">
import { Activity, HeartPulse, ShieldAlert, Stethoscope } from '@lucide/vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import type { Patient } from '@/types/clinical'
import { allergyText } from '@/utils/patients'

defineProps<{ patient: Patient }>()
</script>

<template>
  <section class="patient-summary">
    <div class="summary-main">
      <div>
        <div class="name-line">
          <h2>{{ patient.name }}</h2>
          <StatusBadge :status="patient.status" type="patient" />
        </div>
        <p>{{ patient.gender }} · {{ patient.age }} 岁 · {{ patient.id }}</p>
        <p>{{ patient.diagnosis }} · {{ patient.group }}</p>
      </div>
    </div>

    <dl class="metric-list">
      <div><HeartPulse :size="17" /><dt>血压</dt><dd>{{ patient.metrics.bloodPressure }}</dd></div>
      <div><Activity :size="17" /><dt>血糖</dt><dd>{{ patient.metrics.glucose }}</dd></div>
      <div><Stethoscope :size="17" /><dt>心率</dt><dd>{{ patient.metrics.heartRate || '--' }}</dd></div>
      <div><ShieldAlert :size="17" /><dt>风险评分</dt><dd>{{ patient.metrics.riskScore || '--' }}</dd></div>
    </dl>

    <dl class="detail-list">
      <div><dt>病史</dt><dd>{{ patient.history }}</dd></div>
      <div><dt>过敏史</dt><dd>{{ allergyText(patient) }}</dd></div>
      <div><dt>管理计划</dt><dd>{{ patient.plan }}</dd></div>
    </dl>
  </section>
</template>

<style scoped>
.patient-summary {
  display: grid;
  gap: 18px;
}

.name-line {
  display: flex;
  align-items: center;
  gap: 10px;
}

.name-line h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: 21px;
}

.summary-main p {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.metric-list,
.detail-list {
  margin: 0;
}

.metric-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.metric-list > div {
  display: grid;
  grid-template-columns: 20px 1fr auto;
  align-items: center;
  gap: 7px;
  min-height: 50px;
  padding: 9px 11px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.metric-list > div:nth-child(2n) { border-right: 0; }
.metric-list > div:nth-last-child(-n + 2) { border-bottom: 0; }
.metric-list svg { color: var(--primary); }
.metric-list dt { color: var(--muted); font-size: 12px; }
.metric-list dd { margin: 0; color: var(--text-strong); font-size: 14px; font-weight: 700; }

.detail-list {
  display: grid;
  gap: 13px;
}

.detail-list div {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 10px;
}

.detail-list dt {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.detail-list dd {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
}
</style>
