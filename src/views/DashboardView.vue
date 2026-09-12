<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, CalendarClock, FileText, MessageSquareText, Sparkles, Video } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useClinicalStore } from '@/stores/clinical'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const clinicalStore = useClinicalStore()
const authStore = useAuthStore()

const actor = computed(() => ({
  name: authStore.profile.name,
  role: authStore.roleLabel,
  department: authStore.profile.department,
}))

const summary = computed(() => [
  { label: '待接诊', value: clinicalStore.waitingConsultations.length, note: '图文问诊队列' },
  { label: '重点患者', value: clinicalStore.warningPatients.length, note: '需持续关注' },
  { label: '待审核病历', value: clinicalStore.pendingRecords.length, note: '等待上级医生处理' },
  { label: '会诊待办', value: clinicalStore.pendingRemoteConsultations.length, note: '远程协作任务' },
])

const tasks = computed(() => [
  { id: 'T-01', time: '10:00', title: '王德胜气促与血氧下降需优先回复', meta: '图文问诊 · 高风险', tone: 'danger', path: '/consultation' },
  { id: 'T-02', time: '11:30', title: '复核张建国三日家庭血压记录', meta: '慢病随访 · 今日到期', tone: 'warning', path: '/patients?patient=P-202609-001' },
  { id: 'T-03', time: '14:30', title: '王德胜呼吸内科远程会诊', meta: '已接收 · 资料已齐', tone: 'primary', path: '/remote-consultations' },
  { id: 'T-04', time: '16:00', title: '陈秀兰术后康复计划复评', meta: '健康管理 · 定期评估', tone: 'info', path: '/health-management?patient=P-202609-002' },
])

const activeSessions = computed(() => clinicalStore.consultations.filter((item) => item.status !== 'completed'))

function openSession(id: string) {
  clinicalStore.selectConsultation(id)
  router.push('/consultation')
}

function openPatient(id: string) {
  clinicalStore.selectPatient(id, actor.value)
  router.push({ path: '/patients', query: { patient: id } })
}
</script>

<template>
  <div class="view-stack">
    <PageHeader title="医生工作台" :description="`${authStore.profile.department} · 今日诊疗任务与重点患者`">
      <el-button type="primary" @click="router.push('/consultation')">进入接诊</el-button>
      <el-button @click="router.push('/patients')">查看患者</el-button>
    </PageHeader>

    <section class="summary-panel" aria-label="今日工作摘要">
      <div v-for="item in summary" :key="item.label" class="summary-item">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.note }}</small>
      </div>
    </section>

    <section class="dashboard-grid">
      <article class="panel task-panel">
        <div class="panel-header">
          <div><h2 class="panel-title">今日待办</h2><p class="panel-subtitle">按风险等级与计划时间排列</p></div>
          <CalendarClock :size="18" class="header-icon" />
        </div>
        <div class="task-list">
          <button v-for="task in tasks" :key="task.id" type="button" @click="router.push(task.path)">
            <time>{{ task.time }}</time>
            <span class="task-marker" :class="`tone-${task.tone}`" />
            <div><strong>{{ task.title }}</strong><small>{{ task.meta }}</small></div>
            <ArrowRight :size="16" />
          </button>
        </div>
      </article>

      <article class="panel queue-panel">
        <div class="panel-header">
          <div><h2 class="panel-title">接诊队列</h2><p class="panel-subtitle">当前进行中和等待接诊的会话</p></div>
          <MessageSquareText :size="18" class="header-icon" />
        </div>
        <div class="queue-list">
          <button v-for="session in activeSessions" :key="session.id" type="button" @click="openSession(session.id)">
            <span class="patient-avatar">{{ session.patientName.slice(-1) }}</span>
            <div><strong>{{ session.patientName }}</strong><small>{{ session.complaint }}</small></div>
            <div class="queue-state">
              <el-tag :type="session.status === 'active' ? 'primary' : 'warning'" size="small" effect="plain">{{ session.status === 'active' ? '问诊中' : '待接诊' }}</el-tag>
              <small>{{ session.updatedAt }}</small>
            </div>
          </button>
        </div>
      </article>
    </section>

    <section class="dashboard-grid lower-grid">
      <article class="panel patient-panel">
        <div class="panel-header">
          <div><h2 class="panel-title">重点患者</h2><p class="panel-subtitle">根据健康监测数据和随访记录整理</p></div>
        </div>
        <div class="patient-table-wrap">
          <table class="patient-table">
            <thead><tr><th>患者</th><th>主要诊断</th><th>最新指标</th><th>状态</th><th></th></tr></thead>
            <tbody>
              <tr v-for="patient in clinicalStore.warningPatients" :key="patient.id">
                <td><strong>{{ patient.name }}</strong><small>{{ patient.age }} 岁 · {{ patient.id }}</small></td>
                <td>{{ patient.diagnosis }}</td>
                <td>血压 {{ patient.metrics.bloodPressure }} · 心率 {{ patient.metrics.heartRate }}</td>
                <td><StatusBadge :status="patient.status" type="patient" /></td>
                <td><el-button link type="primary" @click="openPatient(patient.id)">查看</el-button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <aside class="side-stack">
        <article class="panel quick-panel">
          <div class="panel-header"><div><h2 class="panel-title">常用入口</h2></div></div>
          <div class="quick-links">
            <button type="button" @click="router.push('/records')"><FileText :size="18" /><span>填写电子病历</span></button>
            <button type="button" @click="router.push('/remote-consultations')"><Video :size="18" /><span>发起远程会诊</span></button>
          </div>
        </article>
        <article class="assist-note">
          <Sparkles :size="19" />
          <div><strong>张建国的问诊记录可生成病历草稿</strong><span>生成后仍需医生核对主诉、诊断和医嘱</span></div>
          <el-button size="small" @click="router.push('/ai-assistant')">使用辅助</el-button>
        </article>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.summary-panel {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: #fff;
}

.summary-item { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; padding: 16px 18px; border-right: 1px solid var(--border); }
.summary-item:last-child { border-right: 0; }
.summary-item span { color: var(--muted); font-size: 12px; }
.summary-item strong { grid-row: span 2; color: var(--text-strong); font-size: 25px; line-height: 1; }
.summary-item small { color: var(--subtle); font-size: 10px; }

.dashboard-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(340px, .75fr); gap: 16px; align-items: start; }
.lower-grid { grid-template-columns: minmax(0, 1.45fr) minmax(300px, .55fr); }
.header-icon { color: var(--muted); }

.task-list, .queue-list { display: grid; }
.task-list button, .queue-list button { width: 100%; border: 0; border-bottom: 1px solid var(--border); text-align: left; background: #fff; cursor: pointer; }
.task-list button:last-child, .queue-list button:last-child { border-bottom: 0; }
.task-list button:hover, .queue-list button:hover { background: var(--panel-soft); }

.task-list button { display: grid; grid-template-columns: 46px 5px minmax(0, 1fr) 18px; align-items: center; gap: 12px; min-height: 66px; padding: 10px 18px; }
.task-list time { color: var(--muted); font-size: 12px; }
.task-marker { width: 4px; height: 31px; border-radius: 2px; background: var(--border-strong); }
.tone-danger { background: var(--red); }.tone-warning { background: var(--amber); }.tone-primary { background: var(--primary); }.tone-info { background: var(--teal); }
.task-list strong, .task-list small, .queue-list strong, .queue-list small { display: block; }
.task-list strong { color: var(--text-strong); font-size: 13px; }
.task-list small { margin-top: 5px; color: var(--muted); font-size: 11px; }
.task-list svg { color: var(--subtle); }

.queue-list button { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: center; gap: 11px; min-height: 76px; padding: 12px 18px; }
.patient-avatar { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 50%; color: var(--primary); font-weight: 700; background: #eaf2f5; }
.queue-list strong { color: var(--text-strong); font-size: 13px; }
.queue-list small { margin-top: 4px; color: var(--muted); font-size: 11px; }
.queue-state { display: grid; justify-items: end; gap: 3px; }

.patient-table-wrap { overflow-x: auto; }
.patient-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.patient-table th { padding: 11px 15px; color: var(--muted); font-weight: 700; text-align: left; background: #f3f6f8; }
.patient-table td { padding: 13px 15px; border-top: 1px solid var(--border); white-space: nowrap; }
.patient-table td:first-child { white-space: normal; }
.patient-table strong, .patient-table small { display: block; }
.patient-table strong { color: var(--text-strong); font-size: 13px; }
.patient-table small { margin-top: 4px; color: var(--muted); font-size: 10px; }

.side-stack { display: grid; gap: 16px; }
.quick-links { display: grid; grid-template-columns: 1fr 1fr; }
.quick-links button { display: flex; align-items: center; gap: 9px; min-height: 56px; padding: 0 14px; border: 0; border-right: 1px solid var(--border); background: #fff; cursor: pointer; }
.quick-links button:last-child { border-right: 0; }
.quick-links button:hover { background: var(--panel-soft); }
.quick-links svg { color: var(--primary); }
.quick-links span { font-size: 12px; font-weight: 700; }

.assist-note { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 15px; border: 1px solid #bcd4d0; border-radius: var(--radius); background: #f3f8f7; }
.assist-note svg { color: var(--teal); }
.assist-note strong, .assist-note span { display: block; }
.assist-note strong { color: var(--text-strong); font-size: 12px; }
.assist-note span { margin-top: 4px; color: var(--muted); font-size: 10px; line-height: 1.5; }

@media (max-width: 1080px) {
  .summary-panel { grid-template-columns: repeat(2, 1fr); }
  .summary-item:nth-child(2) { border-right: 0; }
  .summary-item:nth-child(-n + 2) { border-bottom: 1px solid var(--border); }
  .dashboard-grid { grid-template-columns: 1fr; }
}

@media (max-width: 600px) {
  .summary-panel { grid-template-columns: 1fr; }
  .summary-item { border-right: 0; border-bottom: 1px solid var(--border); }
  .summary-item:nth-child(2) { border-bottom: 1px solid var(--border); }
  .summary-item:last-child { border-bottom: 0; }
  .task-list button { grid-template-columns: 40px 4px minmax(0, 1fr); }
  .task-list button > svg { display: none; }
  .quick-links { grid-template-columns: 1fr; }
  .quick-links button { border-right: 0; border-bottom: 1px solid var(--border); }
  .assist-note { grid-template-columns: 22px minmax(0, 1fr); }
  .assist-note .el-button { grid-column: 1 / -1; }
}
</style>
