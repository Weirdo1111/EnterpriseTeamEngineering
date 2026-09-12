<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { CalendarPlus, CheckCircle2, ClipboardCheck, Plus, Save } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import VitalTrendChart from '@/components/charts/VitalTrendChart.vue'
import { useAuthStore } from '@/stores/auth'
import { useClinicalStore } from '@/stores/clinical'
import type { HealthAssessment, ReminderTask } from '@/types/clinical'

const route = useRoute()
const authStore = useAuthStore()
const clinicalStore = useClinicalStore()
const requestedPatient = typeof route.query.patient === 'string' ? route.query.patient : ''
const selectedPatientId = shallowRef(clinicalStore.patients.some((item) => item.id === requestedPatient) ? requestedPatient : clinicalStore.patients[0]!.id)
const reminderDialogVisible = shallowRef(false)
const assessmentDialogVisible = shallowRef(false)
const planForm = reactive({ goals: '', measures: '', reviewCycle: '' })
const reminderForm = reactive<{ type: ReminderTask['type']; content: string; dueAt: string }>({ type: '监测', content: '', dueAt: '2026-09-13 08:00' })
const assessmentForm = reactive<{ level: HealthAssessment['level']; summary: string; advice: string }>({ level: '中风险', summary: '', advice: '' })

const actor = computed(() => ({ name: authStore.profile.name, role: authStore.roleLabel, department: authStore.profile.department }))
const canEdit = computed(() => authStore.currentRole !== 'admin')
const selectedPatient = computed(() => clinicalStore.patients.find((item) => item.id === selectedPatientId.value) ?? clinicalStore.patients[0]!)
const selectedPlan = computed(() => clinicalStore.healthPlans.find((item) => item.patientId === selectedPatientId.value) ?? clinicalStore.healthPlans[0]!)
const patientReminders = computed(() => clinicalStore.reminders.filter((item) => item.patientId === selectedPatientId.value))
const patientAssessments = computed(() => clinicalStore.assessments.filter((item) => item.patientId === selectedPatientId.value))

function syncPlan() {
  Object.assign(planForm, {
    goals: selectedPlan.value.goals,
    measures: selectedPlan.value.measures,
    reviewCycle: selectedPlan.value.reviewCycle,
  })
}

function selectPatient(id: string) {
  selectedPatientId.value = id
  clinicalStore.selectPatient(id, actor.value)
  syncPlan()
}

watch(() => route.query.patient, (value) => {
  if (typeof value === 'string' && clinicalStore.patients.some((item) => item.id === value)) selectPatient(value)
})

function savePlan() {
  if (!canEdit.value) return
  clinicalStore.saveHealthPlan(selectedPatientId.value, { ...planForm }, actor.value)
  ElMessage.success('健康管理计划已保存')
}

function addReminder() {
  if (!reminderForm.content.trim() || !reminderForm.dueAt.trim()) {
    ElMessage.warning('请填写提醒内容和执行时间')
    return
  }
  clinicalStore.addReminder({ patientId: selectedPatientId.value, ...reminderForm, content: reminderForm.content.trim() }, actor.value)
  reminderDialogVisible.value = false
  reminderForm.content = ''
  ElMessage.success('提醒任务已创建并进入待推送队列')
}

function completeReminder(id: string) {
  clinicalStore.completeReminder(id, actor.value)
  ElMessage.success('提醒任务已标记完成')
}

function addAssessment() {
  if (!assessmentForm.summary.trim() || !assessmentForm.advice.trim()) {
    ElMessage.warning('请填写评估摘要和调整建议')
    return
  }
  clinicalStore.addAssessment({ patientId: selectedPatientId.value, ...assessmentForm }, actor.value)
  assessmentDialogVisible.value = false
  Object.assign(assessmentForm, { level: '中风险', summary: '', advice: '' })
  ElMessage.success('健康评估已保存')
}

syncPlan()
</script>

<template>
  <div class="view-stack">
    <PageHeader title="健康管理" description="查看居家健康数据，制定管理计划并安排用药、监测和复诊提醒">
      <el-button :icon="CalendarPlus" :disabled="!canEdit" @click="reminderDialogVisible = true">新增提醒</el-button>
      <el-button :icon="ClipboardCheck" type="primary" :disabled="!canEdit" @click="assessmentDialogVisible = true">健康评估</el-button>
    </PageHeader>

    <p v-if="!canEdit" class="permission-note">管理员可查看健康管理记录，但不能修改患者计划或评估结论。</p>

    <section class="health-layout">
      <article class="panel patient-list-panel">
        <div class="panel-header"><div><h2 class="panel-title">管理患者</h2><p class="panel-subtitle">选择患者查看健康计划</p></div></div>
        <div class="patient-list">
          <button v-for="patient in clinicalStore.patients" :key="patient.id" type="button" :class="{ active: patient.id === selectedPatientId }" @click="selectPatient(patient.id)">
            <span>{{ patient.name.slice(-1) }}</span><div><strong>{{ patient.name }}</strong><small>{{ patient.diagnosis }}</small></div><StatusBadge :status="patient.status" type="patient" />
          </button>
        </div>
      </article>

      <div class="health-main">
        <section class="patient-summary-strip">
          <div><span>当前患者</span><strong>{{ selectedPatient.name }}</strong><small>{{ selectedPatient.age }} 岁 · {{ selectedPatient.group }}</small></div>
          <div><span>血压</span><strong>{{ selectedPatient.metrics.bloodPressure }}</strong><small>mmHg</small></div>
          <div><span>血糖</span><strong>{{ selectedPatient.metrics.glucose }}</strong><small>mmol/L</small></div>
          <div><span>心率</span><strong>{{ selectedPatient.metrics.heartRate || '--' }}</strong><small>次/分</small></div>
        </section>

        <section class="health-grid">
          <article class="panel trend-panel"><div class="panel-header"><div><h2 class="panel-title">健康数据趋势</h2><p class="panel-subtitle">最近七天居家监测记录</p></div></div><div class="panel-body"><VitalTrendChart :patient="selectedPatient" /></div></article>
          <article class="panel plan-panel">
            <div class="panel-header"><div><h2 class="panel-title">健康管理计划</h2><p class="panel-subtitle">最近更新 {{ selectedPlan.updatedAt }}</p></div></div>
            <div class="panel-body"><el-form label-position="top"><el-form-item label="管理目标"><el-input v-model="planForm.goals" type="textarea" :rows="2" resize="none" :disabled="!canEdit" /></el-form-item><el-form-item label="管理措施"><el-input v-model="planForm.measures" type="textarea" :rows="4" resize="none" :disabled="!canEdit" /></el-form-item><el-form-item label="评估周期"><el-select v-model="planForm.reviewCycle" :disabled="!canEdit"><el-option v-for="cycle in ['每周评估', '每两周评估', '每月评估']" :key="cycle" :label="cycle" :value="cycle" /></el-select></el-form-item><el-button :icon="Save" type="primary" :disabled="!canEdit" @click="savePlan">保存计划</el-button></el-form></div>
          </article>
        </section>

        <section class="health-grid lower-grid">
          <article class="panel reminders-panel">
            <div class="panel-header"><div><h2 class="panel-title">提醒任务</h2><p class="panel-subtitle">系统按计划向患者端推送提醒</p></div><el-button :icon="Plus" link type="primary" :disabled="!canEdit" @click="reminderDialogVisible = true">新增</el-button></div>
            <div class="reminder-list">
              <div v-for="reminder in patientReminders" :key="reminder.id" :class="{ completed: reminder.status === 'completed' }">
                <el-tag size="small" effect="plain">{{ reminder.type }}</el-tag><div><strong>{{ reminder.content }}</strong><span>{{ reminder.dueAt }}</span></div><el-button v-if="reminder.status === 'pending'" :icon="CheckCircle2" link type="primary" :disabled="!canEdit" @click="completeReminder(reminder.id)">完成</el-button><span v-else class="done-label">已完成</span>
              </div>
              <p v-if="!patientReminders.length" class="empty-text">暂无提醒任务</p>
            </div>
          </article>

          <article class="panel assessment-panel">
            <div class="panel-header"><div><h2 class="panel-title">定期评估</h2><p class="panel-subtitle">记录风险变化和建议调整</p></div><el-button :icon="Plus" link type="primary" :disabled="!canEdit" @click="assessmentDialogVisible = true">新增</el-button></div>
            <div class="assessment-list">
              <div v-for="assessment in patientAssessments" :key="assessment.id"><div><strong>{{ assessment.date }}</strong><el-tag :type="assessment.level === '高风险' ? 'danger' : assessment.level === '中风险' ? 'warning' : 'success'" size="small" effect="plain">{{ assessment.level }}</el-tag></div><p>{{ assessment.summary }}</p><span>{{ assessment.advice }}</span></div>
              <p v-if="!patientAssessments.length" class="empty-text">暂无健康评估</p>
            </div>
          </article>
        </section>
      </div>
    </section>

    <el-dialog v-model="reminderDialogVisible" title="新增健康提醒" width="500px"><el-form label-position="top"><el-form-item label="提醒类型"><el-select v-model="reminderForm.type"><el-option label="用药" value="用药" /><el-option label="复诊" value="复诊" /><el-option label="监测" value="监测" /></el-select></el-form-item><el-form-item label="提醒内容"><el-input v-model="reminderForm.content" /></el-form-item><el-form-item label="执行时间"><el-input v-model="reminderForm.dueAt" /></el-form-item></el-form><template #footer><el-button @click="reminderDialogVisible = false">取消</el-button><el-button type="primary" @click="addReminder">创建提醒</el-button></template></el-dialog>

    <el-dialog v-model="assessmentDialogVisible" title="新增健康评估" width="560px"><el-form label-position="top"><el-form-item label="风险等级"><el-select v-model="assessmentForm.level"><el-option label="低风险" value="低风险" /><el-option label="中风险" value="中风险" /><el-option label="高风险" value="高风险" /></el-select></el-form-item><el-form-item label="评估摘要"><el-input v-model="assessmentForm.summary" type="textarea" :rows="3" /></el-form-item><el-form-item label="调整建议"><el-input v-model="assessmentForm.advice" type="textarea" :rows="3" /></el-form-item></el-form><template #footer><el-button @click="assessmentDialogVisible = false">取消</el-button><el-button type="primary" @click="addAssessment">保存评估</el-button></template></el-dialog>
  </div>
</template>

<style scoped>
.permission-note { margin: 0; padding: 10px 13px; border: 1px solid #d6c28f; border-radius: var(--radius); color: #75551c; background: #fffaf0; font-size: 12px; }
.health-layout { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 16px; align-items: start; }
.patient-list-panel { position: sticky; top: 80px; }
.patient-list { display: grid; }
.patient-list button { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 9px; min-height: 70px; padding: 10px 12px; border: 0; border-bottom: 1px solid var(--border); text-align: left; background: #fff; cursor: pointer; }
.patient-list button:last-child { border-bottom: 0; }.patient-list button:hover { background: var(--panel-soft); }.patient-list button.active { background: #eef5f7; box-shadow: inset 3px 0 0 var(--primary); }
.patient-list button > span { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 50%; color: var(--primary); font-weight: 700; background: #e7f0f3; }
.patient-list strong, .patient-list small { display: block; }.patient-list strong { color: var(--text-strong); font-size: 12px; }.patient-list small { margin-top: 4px; overflow: hidden; color: var(--muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.health-main { display: grid; gap: 16px; min-width: 0; }
.patient-summary-strip { display: grid; grid-template-columns: 1.25fr repeat(3, 1fr); border: 1px solid var(--border); border-radius: var(--radius); background: #fff; }
.patient-summary-strip > div { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; padding: 14px 16px; border-right: 1px solid var(--border); }.patient-summary-strip > div:last-child { border-right: 0; }
.patient-summary-strip span, .patient-summary-strip small { color: var(--muted); font-size: 10px; }.patient-summary-strip strong { grid-row: span 2; color: var(--text-strong); font-size: 19px; }.patient-summary-strip > div:first-child strong { grid-column: 1 / -1; grid-row: auto; }.patient-summary-strip > div:first-child small { grid-column: 1 / -1; }
.health-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(300px, .75fr); gap: 16px; align-items: start; }.lower-grid { grid-template-columns: 1fr 1fr; }
.plan-panel :deep(.el-select), :deep(.el-dialog .el-select) { width: 100%; }
.reminder-list, .assessment-list { display: grid; }
.reminder-list > div { display: grid; grid-template-columns: 58px minmax(0, 1fr) auto; align-items: center; gap: 10px; min-height: 66px; padding: 11px 16px; border-bottom: 1px solid var(--border); }.reminder-list > div:last-child { border-bottom: 0; }.reminder-list > div.completed { opacity: .58; }
.reminder-list strong, .reminder-list span { display: block; }.reminder-list strong { color: var(--text-strong); font-size: 12px; }.reminder-list div div span { margin-top: 4px; color: var(--muted); font-size: 10px; }.done-label { color: var(--green); font-size: 10px; }
.assessment-list > div { padding: 13px 16px; border-bottom: 1px solid var(--border); }.assessment-list > div:last-child { border-bottom: 0; }.assessment-list > div > div { display: flex; align-items: center; justify-content: space-between; gap: 10px; }.assessment-list strong { font-size: 11px; }.assessment-list p { margin: 8px 0 5px; font-size: 12px; line-height: 1.55; }.assessment-list span { color: var(--muted); font-size: 10px; line-height: 1.5; }
@media (max-width: 1080px) { .health-grid { grid-template-columns: 1fr; }.lower-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 820px) { .health-layout { grid-template-columns: 1fr; }.patient-list-panel { position: static; }.patient-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }.patient-list button:nth-child(odd) { border-right: 1px solid var(--border); } }
@media (max-width: 620px) { .patient-summary-strip, .lower-grid { grid-template-columns: 1fr; }.patient-summary-strip > div { border-right: 0; border-bottom: 1px solid var(--border); }.patient-summary-strip > div:last-child { border-bottom: 0; }.patient-list { grid-template-columns: 1fr; }.patient-list button:nth-child(odd) { border-right: 0; } }
</style>
