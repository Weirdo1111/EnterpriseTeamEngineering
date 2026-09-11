<script setup lang="ts">
import { computed } from 'vue'
import { Bot, CalendarClock, ClipboardCheck, FileClock, HeartPulse, ShieldAlert } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import VitalTrendChart from '@/components/charts/VitalTrendChart.vue'
import { useClinicalStore } from '@/stores/clinical'

const clinicalStore = useClinicalStore()
const selectedPatient = computed(() => clinicalStore.selectedPatient)
const stats = computed(() => [
  { title: '今日图文问诊', value: 28, trend: '较昨日 +12%', tone: 'blue' as const, icon: CalendarClock },
  { title: '高风险患者', value: clinicalStore.warningPatients.length, trend: '需要 24 小时内处理', tone: 'red' as const, icon: ShieldAlert },
  { title: '待审核病历', value: clinicalStore.pendingRecords.length, trend: '上级医生队列', tone: 'amber' as const, icon: FileClock },
  { title: 'AI 辅助记录', value: 18, trend: '平均节省 42% 书写时间', tone: 'teal' as const, icon: Bot },
])
const urgentTasks = computed(() => [
  { id: 'T-01', title: '张建国晨起血压连续升高', owner: '林若医生', level: '需关注', due: '今日 11:30 前' },
  { id: 'T-02', title: '王德胜慢阻肺急性加重风险复核', owner: '呼吸专科协作', level: '高风险', due: '今日 10:45 前' },
  { id: 'T-03', title: '陈秀兰术后复诊病历审核', owner: '周明主任', level: '待审核', due: '今日 16:00 前' },
])
</script>

<template>
  <div class="view-stack">
    <PageHeader eyebrow="Phase 1 Core Loop" title="医生工作台" description="围绕患者管理、图文问诊、结构化病历、AI/RAG 辅助和权限审计建立可演示业务闭环。">
      <el-button type="primary" @click="$router.push('/consultation')">进入问诊</el-button>
      <el-button plain @click="$router.push('/ai-assistant')">AI 辅助</el-button>
    </PageHeader>

    <section class="stats-grid">
      <StatCard v-for="stat in stats" :key="stat.title" :title="stat.title" :value="stat.value" :trend="stat.trend" :tone="stat.tone" :icon="stat.icon" />
    </section>

    <section class="page-grid">
      <article class="panel care-flow">
        <div class="panel-header"><div><h2 class="panel-title">今日业务闭环</h2><p class="panel-subtitle">从患者筛查到医生确认，AI 只生成草稿，正式结果由医生保存。</p></div></div>
        <div class="panel-body flow-list">
          <div v-for="(item, index) in ['患者检索', '图文问诊', 'AI 生成', '医生确认', '审计追踪']" :key="item" class="flow-item" :class="{ active: index < 3 }">
            <span>{{ String(index + 1).padStart(2, '0') }}</span><strong>{{ item }}</strong><p>{{ ['多条件搜索、分组、风险标签', '聊天记录、检查单、自动归档', '摘要、病历草稿、相似病例', '人工修改、医嘱校验、提交审核', '权限、访问、修改全量留痕'][index] }}</p>
          </div>
        </div>
      </article>

      <article class="panel patient-panel">
        <div class="panel-header"><div><h2 class="panel-title">重点患者趋势</h2><p class="panel-subtitle">{{ selectedPatient.name }} · {{ selectedPatient.diagnosis }}</p></div><StatusBadge :status="selectedPatient.status" type="patient" /></div>
        <div class="panel-body"><VitalTrendChart :patient="selectedPatient" /></div>
      </article>
    </section>

    <section class="page-grid">
      <article class="panel task-panel">
        <div class="panel-header"><div><h2 class="panel-title">优先处理任务</h2><p class="panel-subtitle">按风险与审核时限自动排序。</p></div></div>
        <div class="panel-body task-list">
          <div v-for="task in urgentTasks" :key="task.id" class="task-row"><ClipboardCheck :size="18" /><div><strong>{{ task.title }}</strong><span>{{ task.owner }} · {{ task.due }}</span></div><el-tag :type="task.level === '高风险' ? 'danger' : task.level === '待审核' ? 'warning' : 'primary'" effect="light">{{ task.level }}</el-tag></div>
        </div>
      </article>
      <article class="panel ai-panel">
        <div class="panel-header"><div><h2 class="panel-title">AI 安全策略</h2><p class="panel-subtitle">RAG 引用、LLM Reviewer 与医生确认共同降低幻觉风险。</p></div></div>
        <div class="panel-body ai-rules"><div class="rule-row"><Bot :size="18" /><span>AI 输出只进入草稿状态</span></div><div class="rule-row"><HeartPulse :size="18" /><span>过敏史和老年用药禁忌自动提示</span></div><div class="rule-row"><ShieldAlert :size="18" /><span>正式病历必须医生确认并留审计日志</span></div></div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }
.care-flow { grid-column: span 5; } .patient-panel { grid-column: span 7; } .task-panel { grid-column: span 8; } .ai-panel { grid-column: span 4; }
.flow-list, .task-list, .ai-rules { display: grid; gap: 12px; }
.flow-item { display: grid; grid-template-columns: 44px 116px minmax(0, 1fr); align-items: center; min-height: 58px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--panel-soft); }
.flow-item span { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 8px; color: var(--muted); background: #e8edf4; font-size: 12px; font-weight: 800; }
.flow-item.active span { color: #fff; background: var(--primary); } .flow-item p { margin: 0; color: var(--muted); font-size: 13px; }
.task-row { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 58px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--panel-soft); }
.task-row strong, .task-row span { display: block; } .task-row span { margin-top: 4px; color: var(--muted); font-size: 12px; }
.rule-row { display: flex; gap: 10px; align-items: center; min-height: 48px; padding: 12px; border-radius: var(--radius); background: var(--panel-soft); }
@media (max-width: 1040px) { .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .care-flow, .patient-panel, .task-panel, .ai-panel { grid-column: 1 / -1; } }
@media (max-width: 640px) { .stats-grid { grid-template-columns: 1fr; } .flow-item, .task-row { grid-template-columns: 1fr; } }
</style>