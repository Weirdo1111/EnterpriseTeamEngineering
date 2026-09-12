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
  if (authStore.currentRole === 'admin') return '管理员可查看平台全部操作和异常拦截记录'
  if (authStore.currentRole === 'seniorDoctor') return `当前显示 ${authStore.profile.department} 的业务与审核记录`
  return `当前仅显示 ${authStore.profile.name} 本人的操作记录`
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
  downloadCsv('操作记录.csv', [
    ['时间', '用户', '角色', '科室', '操作', '资源', 'IP', '结果'],
    ...filteredLogs.value.map((log) => [log.time, log.user, log.role, log.department, log.action, log.resource, log.ip, log.result]),
  ])
  ElMessage.success(`已导出 ${filteredLogs.value.length} 条操作记录`)
}
</script>

<template>
  <div class="view-stack">
    <PageHeader title="操作记录" :description="scopeDescription">
      <el-button :icon="ShieldCheck" @click="permissionVisible = true">查看权限范围</el-button>
      <el-button :icon="Download" type="primary" @click="exportLogs">导出记录</el-button>
    </PageHeader>

    <article class="panel">
      <div class="panel-header"><div><h2 class="panel-title">访问与操作明细</h2><p class="panel-subtitle">患者查看、病历修改、会诊、健康管理和异常访问均在此留痕</p></div><span class="record-count">{{ filteredLogs.length }} 条</span></div>
      <div class="panel-body">
        <div class="filter-bar">
          <el-input v-model="filters.keyword" clearable placeholder="用户、资源或 IP"><template #prefix><Search :size="16" /></template></el-input>
          <el-select v-model="filters.action" clearable placeholder="操作类型"><el-option v-for="action in actionOptions" :key="action" :label="action" :value="action" /></el-select>
          <el-select v-model="filters.result" clearable placeholder="处理结果"><el-option label="成功" value="成功" /><el-option label="待复核" value="待复核" /><el-option label="拦截" value="拦截" /></el-select>
          <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" range-separator="至" />
        </div>
        <div class="audit-table-scroll"><el-table :data="filteredLogs" height="570">
          <el-table-column prop="time" label="时间" min-width="165" />
          <el-table-column prop="user" label="用户" min-width="110" />
          <el-table-column prop="role" label="角色" width="100" />
          <el-table-column prop="department" label="科室" min-width="140" show-overflow-tooltip />
          <el-table-column prop="action" label="操作" min-width="170" />
          <el-table-column prop="resource" label="资源" min-width="130" />
          <el-table-column prop="ip" label="IP" min-width="120" />
          <el-table-column label="结果" width="92"><template #default="{ row }"><StatusBadge :status="row.result" type="audit" /></template></el-table-column>
        </el-table></div>
      </div>
    </article>

    <el-dialog v-model="permissionVisible" title="当前数据范围" width="500px">
      <div class="permission-detail">
        <ShieldCheck :size="28" />
        <div><strong>{{ authStore.roleLabel }}</strong><p>{{ scopeDescription }}</p><span>系统根据登录角色自动限制可见数据，越权请求会被拦截并记录。</span></div>
      </div>
      <template #footer><el-button type="primary" @click="permissionVisible = false">知道了</el-button></template>
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
