<script setup lang="ts">
import { computed, reactive, shallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Search, ShieldCheck } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useClinicalStore } from '@/stores/clinical'
import { downloadCsv } from '@/utils/export'

const authStore = useAuthStore()
const clinicalStore = useClinicalStore()
const filters = reactive({ keyword: '', result: '', action: '' })
const dateRange = shallowRef<string[]>([])
const permissionVisible = shallowRef(false)

const scopeDescription = computed(() => {
  if (authStore.currentRole === 'admin') return 'Administrators can view all platform activity and blocked access attempts'
  if (authStore.currentRole === 'seniorDoctor') return `Showing records for ${authStore.profile.department} clinical and review activity`
  return `Showing only activity by ${authStore.profile.name}`
})

const scopedLogs = computed(() => {
  if (authStore.currentRole === 'admin') return clinicalStore.auditLogs
  if (authStore.currentRole === 'seniorDoctor') return clinicalStore.auditLogs.filter((log) => log.department === authStore.profile.department || log.user === authStore.profile.name)
  return clinicalStore.auditLogs.filter((log) => log.user === authStore.profile.name)
})

const actionOptions = computed(() => Array.from(new Set(scopedLogs.value.map((log) => log.action))))
const filteredLogs = computed(() => scopedLogs.value.filter((log) => {
  const text = `${log.user}${log.role}${log.action}${log.resource}${log.ip}`.toLowerCase()
  const keyword = filters.keyword.trim().toLowerCase()
  const inDateRange = !dateRange.value?.length || (log.time.slice(0, 10) >= dateRange.value[0]! && log.time.slice(0, 10) <= dateRange.value[1]!)
  return (!keyword || text.includes(keyword)) && (!filters.result || log.result === filters.result) && (!filters.action || log.action === filters.action) && inDateRange
}))

function exportLogs() {
  downloadCsv('Audit-Log.csv', [
    ['Time', 'User', 'Role', 'Department', 'Actions', 'Resource', 'IP', 'Result'],
    ...filteredLogs.value.map((log) => [log.time, log.user, log.role, log.department, log.action, log.resource, log.ip, log.result]),
  ])
  ElMessage.success(`Exported ${filteredLogs.value.length} audit entries`)
}
</script>

<template>
  <div class="view-stack">
    <PageHeader title="Audit Log" :description="scopeDescription">
      <el-button :icon="ShieldCheck" @click="permissionVisible = true">View Access Scope</el-button>
      <el-button :icon="Download" type="primary" @click="exportLogs">Export Logs</el-button>
    </PageHeader>

    <article class="panel">
      <div class="panel-header"><div><h2 class="panel-title">Access and Activity Details</h2><p class="panel-subtitle">Patient views, record changes, consultations, health management, and abnormal access are logged here</p></div><span class="record-count">{{ filteredLogs.length }} records</span></div>
      <div class="panel-body">
        <div class="filter-bar">
          <el-input v-model="filters.keyword" clearable placeholder="User, resource, or IP"><template #prefix><Search :size="16" /></template></el-input>
          <el-select v-model="filters.action" clearable placeholder="Action Type"><el-option v-for="action in actionOptions" :key="action" :label="action" :value="action" /></el-select>
          <el-select v-model="filters.result" clearable placeholder="Result"><el-option label="Success" value="Success" /><el-option label="Pending Review" value="Pending Review" /><el-option label="Blocked" value="Blocked" /></el-select>
          <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="Start Date" end-placeholder="End Date" range-separator="to" />
        </div>
        <div class="audit-table-scroll"><el-table :data="filteredLogs" height="570">
          <el-table-column prop="time" label="Time" min-width="165" />
          <el-table-column prop="user" label="User" min-width="110" />
          <el-table-column prop="role" label="Role" width="100" />
          <el-table-column prop="department" label="Department" min-width="140" show-overflow-tooltip />
          <el-table-column prop="action" label="Actions" min-width="170" />
          <el-table-column prop="resource" label="Resource" min-width="130" />
          <el-table-column prop="ip" label="IP" min-width="120" />
          <el-table-column label="Result" width="92"><template #default="{ row }"><StatusBadge :status="row.result" type="audit" /></template></el-table-column>
        </el-table></div>
      </div>
    </article>

    <el-dialog v-model="permissionVisible" title="Current Data Scope" width="500px">
      <div class="permission-detail">
        <ShieldCheck :size="28" />
        <div><strong>{{ authStore.roleLabel }}</strong><p>{{ scopeDescription }}</p><span>Visible data is automatically limited by role. Unauthorized requests are blocked and logged.</span></div>
      </div>
      <template #footer><el-button type="primary" @click="permissionVisible = false">Got It</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.record-count { color: var(--muted); font-size: 12px; }
.filter-bar { display: grid; grid-template-columns: minmax(190px, 1fr) 180px 130px 260px; gap: 9px; margin-bottom: 13px; }
.filter-bar > * { min-width: 0; }
.filter-bar :deep(.el-date-editor) { width: 100%; min-width: 0; }
.audit-table-scroll { max-width: 100%; overflow-x: auto; }
.audit-table-scroll :deep(.el-table) { min-width: 1020px; }
.permission-detail { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 12px; }
.permission-detail svg { color: var(--primary); }
.permission-detail strong { color: var(--text-strong); }
.permission-detail p { margin: 7px 0; line-height: 1.6; }
.permission-detail span { color: var(--muted); font-size: 12px; line-height: 1.6; }
@media (max-width: 1050px) { .filter-bar { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 620px) { .filter-bar { grid-template-columns: 1fr; } .filter-bar :deep(.el-date-editor) { width: 100%; } }
</style>
