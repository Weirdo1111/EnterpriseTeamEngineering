<script setup lang="ts">
import { Activity, HeartPulse, ShieldAlert, Stethoscope } from '@lucide/vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import type { Patient } from '@/types/clinical'

interface Props {
  patient: Patient
}

defineProps<Props>()
</script>

<template>
  <section class="patient-summary">
    <div class="summary-main">
      <div>
        <p class="summary-label">当前患者</p>
        <h2 class="summary-name">{{ patient.name }}</h2>
      </div>
      <StatusBadge :status="patient.status" type="patient" />
    </div>
    <div class="summary-meta">
      <span>{{ patient.gender }} · {{ patient.age }} 岁</span>
      <span>{{ patient.id }}</span>
      <span>{{ patient.group }}</span>
    </div>
    <div class="metric-grid">
      <div class="metric-item">
        <HeartPulse :size="18" />
        <span>血压</span>
        <strong>{{ patient.metrics.bloodPressure }}</strong>
      </div>
      <div class="metric-item">
        <Activity :size="18" />
        <span>血糖</span>
        <strong>{{ patient.metrics.glucose }}</strong>
      </div>
      <div class="metric-item">
        <Stethoscope :size="18" />
        <span>心率</span>
        <strong>{{ patient.metrics.heartRate }}</strong>
      </div>
      <div class="metric-item">
        <ShieldAlert :size="18" />
        <span>风险</span>
        <strong>{{ patient.metrics.riskScore }}</strong>
      </div>
    </div>
    <div class="summary-section">
      <span class="summary-section-title">病史</span>
      <p>{{ patient.history }}</p>
    </div>
    <div class="summary-section">
      <span class="summary-section-title">过敏史</span>
      <p>{{ patient.allergies.join('、') }}</p>
    </div>
    <div class="summary-section">
      <span class="summary-section-title">随访计划</span>
      <p>{{ patient.plan }}</p>
    </div>
  </section>
</template>

<style scoped>
.patient-summary {
  display: grid;
  gap: 16px;
}

.summary-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.summary-label {
  margin: 0 0 4px;
  color: var(--muted);
  font-size: 12px;
}

.summary-name {
  margin: 0;
  font-size: 22px;
}

.summary-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.metric-item {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 4px 8px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-soft);
  color: var(--muted);
  font-size: 12px;
}

.metric-item strong {
  grid-column: 2;
  color: var(--text);
  font-size: 15px;
}

.summary-section-title {
  display: block;
  margin-bottom: 5px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.summary-section p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}
</style>