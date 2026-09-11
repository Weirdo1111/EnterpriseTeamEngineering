<script setup lang="ts">
import { computed, reactive, shallowRef } from 'vue'
import { Filter, Plus, Search } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PatientSummary from '@/components/patients/PatientSummary.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import VitalTrendChart from '@/components/charts/VitalTrendChart.vue'
import { useClinicalStore } from '@/stores/clinical'

const clinicalStore = useClinicalStore()
const filters = reactive({ keyword: '', group: '', status: '' })
const selectedPatientId = shallowRef(clinicalStore.selectedPatientId)
const groupOptions = computed(() => Array.from(new Set(clinicalStore.patients.map((patient) => patient.group))))
const selectedPatient = computed(() => clinicalStore.patients.find((patient) => patient.id === selectedPatientId.value) ?? clinicalStore.patients[0])
const filteredPatients = computed(() => clinicalStore.patients.filter((patient) => {
  const text = `${patient.id}${patient.name}${patient.diagnosis}${patient.group}`
  return (!filters.keyword || text.includes(filters.keyword)) && (!filters.group || patient.group === filters.group) && (!filters.status || patient.status === filters.status)
}))
function handleRowClick(row: { id: string }) { selectedPatientId.value = row.id; clinicalStore.selectPatient(row.id) }
</script>

<template>
  <div class="view-stack">
    <PageHeader eyebrow="Patient Information Management" title="患者管理" description="支持姓名、编号、疾病、分组与风险状态检索，面向医生日常慢病随访和重点患者管理。">
      <el-button :icon="Plus" type="primary">新建患者</el-button><el-button :icon="Filter" plain>批量分组</el-button>
    </PageHeader>
    <section class="page-grid">
      <article class="panel patient-table-panel">
        <div class="panel-header"><div><h2 class="panel-title">患者列表</h2><p class="panel-subtitle">当前共 {{ filteredPatients.length }} 名患者，点击行查看完整档案。</p></div></div>
        <div class="panel-body">
          <div class="filter-bar"><el-input v-model="filters.keyword" clearable placeholder="搜索姓名、编号、疾病"><template #prefix><Search :size="16" /></template></el-input><el-select v-model="filters.group" clearable placeholder="患者分组"><el-option v-for="group in groupOptions" :key="group" :label="group" :value="group" /></el-select><el-select v-model="filters.status" clearable placeholder="风险状态"><el-option label="平稳" value="stable" /><el-option label="需关注" value="warning" /><el-option label="高风险" value="critical" /></el-select></div>
          <el-table :data="filteredPatients" height="430" @row-click="handleRowClick"><el-table-column prop="name" label="姓名" min-width="110" /><el-table-column prop="age" label="年龄" width="80" /><el-table-column prop="diagnosis" label="主要诊断" min-width="180" /><el-table-column prop="group" label="分组" min-width="140" /><el-table-column label="状态" width="100"><template #default="{ row }"><StatusBadge :status="row.status" type="patient" /></template></el-table-column><el-table-column prop="lastVisit" label="最近问诊" width="120" /></el-table>
        </div>
      </article>
      <article class="panel detail-panel"><div class="panel-header"><div><h2 class="panel-title">患者档案</h2><p class="panel-subtitle">病史、过敏史、健康计划和实时指标。</p></div></div><div class="panel-body"><PatientSummary :patient="selectedPatient" /></div></article>
    </section>
    <article class="panel"><div class="panel-header"><div><h2 class="panel-title">健康数据趋势</h2><p class="panel-subtitle">{{ selectedPatient.name }} · 血压、心率和风险波动趋势。</p></div><el-tag effect="light">IoT 数据 Demo</el-tag></div><div class="panel-body"><VitalTrendChart :patient="selectedPatient" /></div></article>
  </div>
</template>

<style scoped>
.patient-table-panel { grid-column: span 8; } .detail-panel { grid-column: span 4; }
.filter-bar { display: grid; grid-template-columns: minmax(220px, 1fr) 180px 160px; gap: 12px; margin-bottom: 16px; }
@media (max-width: 1040px) { .patient-table-panel, .detail-panel { grid-column: 1 / -1; } }
@media (max-width: 720px) { .filter-bar { grid-template-columns: 1fr; } }
</style>