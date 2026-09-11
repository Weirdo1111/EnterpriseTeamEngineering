<script setup lang="ts">
import { computed, reactive } from 'vue'
import { Download, Search, ShieldCheck } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useClinicalStore } from '@/stores/clinical'
const clinicalStore = useClinicalStore()
const filters = reactive({ keyword: '', result: '' })
const filteredLogs = computed(() => clinicalStore.auditLogs.filter((log) => {
  const text = `${log.user}${log.role}${log.action}${log.resource}${log.ip}`
  return (!filters.keyword || text.includes(filters.keyword)) && (!filters.result || log.result === filters.result)
}))
</script>
<template>
  <div class="view-stack">
    <PageHeader eyebrow="Operation Logs and Audit" title="审计日志" description="记录登录、访问患者、修改病历、AI 生成和审核操作，支撑隐私合规与责任追踪。"><el-button :icon="Download" plain>导出报表</el-button><el-button :icon="ShieldCheck" type="primary">权限配置</el-button></PageHeader>
    <article class="panel"><div class="panel-header"><div><h2 class="panel-title">操作记录</h2><p class="panel-subtitle">按用户、资源、IP、操作类型和结果筛选。</p></div></div><div class="panel-body"><div class="filter-bar"><el-input v-model="filters.keyword" clearable placeholder="搜索用户、资源、IP"><template #prefix><Search :size="16" /></template></el-input><el-select v-model="filters.result" clearable placeholder="结果"><el-option label="成功" value="成功" /><el-option label="待复核" value="待复核" /><el-option label="拦截" value="拦截" /></el-select></div><el-table :data="filteredLogs" height="520"><el-table-column prop="time" label="时间" min-width="170" /><el-table-column prop="user" label="用户" min-width="120" /><el-table-column prop="role" label="角色" min-width="100" /><el-table-column prop="action" label="操作" min-width="160" /><el-table-column prop="resource" label="资源" min-width="140" /><el-table-column prop="ip" label="IP" min-width="130" /><el-table-column label="结果" width="110"><template #default="{ row }"><StatusBadge :status="row.result" type="audit" /></template></el-table-column></el-table></div></article>
  </div>
</template>
<style scoped>
.filter-bar { display: grid; grid-template-columns: minmax(240px, 1fr) 160px; gap: 12px; margin-bottom: 16px; }
@media (max-width: 640px) { .filter-bar { grid-template-columns: 1fr; } }
</style>