<script setup lang="ts">
import { computed, reactive, shallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, FileText, Play, Plus, UserPlus } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { useAuthStore } from '@/stores/auth'
import { useClinicalStore } from '@/stores/clinical'
import { downloadText } from '@/utils/export'
import { remoteStatusLabel } from '@/utils/status'
import type { RemoteConsultation, RemoteConsultationStatus } from '@/types/clinical'

const authStore = useAuthStore()
const clinicalStore = useClinicalStore()
const selectedId = shallowRef(clinicalStore.remoteConsultations[0]!.id)
const statusFilter = shallowRef('')
const newDialogVisible = shallowRef(false)
const expertDialogVisible = shallowRef(false)
const opinionDialogVisible = shallowRef(false)
const expertName = shallowRef('Dr. Vivian Qian, Associate Chief Physician')
const opinionExpert = shallowRef('')
const opinionDraft = shallowRef('')
const newForm = reactive({ patientId: clinicalStore.patients[0]!.id, specialty: 'Cardiology', reason: '', scheduledAt: '2026-09-13 14:00' })

const actor = computed(() => ({ name: authStore.profile.name, role: authStore.roleLabel, department: authStore.profile.department }))
const canOperate = computed(() => authStore.currentRole !== 'admin')
const selected = computed<RemoteConsultation>(() => clinicalStore.remoteConsultations.find((item) => item.id === selectedId.value) ?? clinicalStore.remoteConsultations[0]!)
const filteredItems = computed(() => clinicalStore.remoteConsultations.filter((item) => !statusFilter.value || item.status === statusFilter.value))

function statusType(status: RemoteConsultationStatus) {
  if (status === 'completed') return 'success'
  if (status === 'inProgress') return 'primary'
  if (status === 'accepted') return 'warning'
  return 'info'
}

function createConsultation() {
  if (!newForm.reason.trim()) {
    ElMessage.warning('Enter a reason for the consultation.')
    return
  }
  const item = clinicalStore.createRemoteConsultation({ ...newForm, reason: newForm.reason.trim() }, actor.value)
  if (!item) return
  selectedId.value = item.id
  newDialogVisible.value = false
  newForm.reason = ''
  ElMessage.success('Group case-review request submitted in this prototype.')
}

function updateStatus(status: RemoteConsultationStatus) {
  clinicalStore.updateRemoteStatus(selected.value.id, status, actor.value)
  ElMessage.success(status === 'accepted' ? 'Group review request accepted.' : 'Group case review started.')
}

function addExpert() {
  if (!expertName.value.trim()) return
  clinicalStore.addRemoteExpert(selected.value.id, expertName.value.trim(), actor.value)
  expertDialogVisible.value = false
  ElMessage.success('Consultation specialist added.')
}

function openExpertOpinion(expert: string) {
  opinionExpert.value = expert
  opinionDraft.value = selected.value.expertOpinions.find(entry => entry.expert === expert)?.text ?? ''
  opinionDialogVisible.value = true
}

function saveExpertOpinion() {
  try {
    clinicalStore.recordRemoteExpertOpinion(selected.value.id, opinionExpert.value, opinionDraft.value, actor.value)
    opinionDialogVisible.value = false
    ElMessage.success('Specialist contribution recorded for this demo case.')
  } catch (error) { ElMessage.warning(error instanceof Error ? error.message : 'Unable to record the contribution.') }
}

function completeConsultation() {
  if (!selected.value.experts.length) {
    ElMessage.warning('Add at least one participating specialist before completing a group review.')
    return
  }
  if (!selected.value.opinion.trim()) {
    ElMessage.warning('Enter the consultation opinion first.')
    return
  }
  try {
    clinicalStore.completeRemoteConsultation(selected.value.id, selected.value.opinion.trim(), actor.value)
    ElMessage.success('Group case-review report generated.')
  } catch (error) { ElMessage.warning(error instanceof Error ? error.message : 'Unable to complete the group review.') }
}

function exportReport() {
  if (!selected.value.report) {
    ElMessage.warning('Complete the consultation before exporting the report.')
    return
  }
  downloadText(`${selected.value.patientName}-${selected.value.id}-Consultation-Report.txt`, selected.value.report)
  ElMessage.success('Consultation report exported.')
}
</script>

<template>
  <div class="view-stack">
    <PageHeader title="Physician Group Consultation" description="Specialist case-review requests and reports">
      <el-tag type="info" effect="plain">Workflow demo</el-tag>
      <el-button :icon="Plus" type="primary" :disabled="!canOperate" @click="newDialogVisible = true">Request Group Review</el-button>
      <el-button :icon="Download" @click="exportReport">Export Report</el-button>
    </PageHeader>

    <p v-if="!canOperate" class="permission-note">Administrators can view case-review records but cannot perform clinical actions.</p>

    <section class="remote-layout">
      <article class="panel request-panel">
        <div class="panel-header"><div><h2 class="panel-title">Case Review Requests</h2><p class="panel-subtitle">{{ filteredItems.length }} records</p></div></div>
        <div class="status-filter"><el-select v-model="statusFilter" clearable placeholder="All Statuses"><el-option v-for="(label, key) in remoteStatusLabel" :key="key" :label="label" :value="key" /></el-select></div>
        <div class="request-list">
          <button v-for="item in filteredItems" :key="item.id" type="button" :class="{ active: item.id === selected.id }" @click="selectedId = item.id">
            <div><strong>{{ item.patientName }}</strong><el-tag :type="statusType(item.status)" size="small" effect="plain">{{ remoteStatusLabel[item.status] }}</el-tag></div>
            <p>{{ item.specialty }} · {{ item.reason }}</p>
            <small>{{ item.scheduledAt }}</small>
          </button>
        </div>
      </article>

      <article class="panel detail-panel">
        <div class="panel-header detail-header">
          <div><h2 class="panel-title">{{ selected.patientName }} · {{ selected.specialty }}</h2><p class="panel-subtitle">{{ selected.id }} · Requesting Physician {{ selected.requester }}</p></div>
          <el-tag :type="statusType(selected.status)" effect="plain">{{ remoteStatusLabel[selected.status] }}</el-tag>
        </div>

        <div class="detail-body">
          <section class="case-summary">
            <h3>Reason for Consultation</h3><p>{{ selected.reason }}</p>
            <dl><div><dt>Scheduled Time</dt><dd>{{ selected.scheduledAt }}</dd></div><div><dt>Patient ID</dt><dd>{{ selected.patientId }}</dd></div></dl>
          </section>

          <section class="workflow-strip">
            <div :class="{ done: true }"><span>1</span><strong>Submit Request</strong></div>
            <div :class="{ done: selected.status !== 'pending' }"><span>2</span><strong>Specialist Accepts</strong></div>
            <div :class="{ done: ['inProgress', 'completed'].includes(selected.status) }"><span>3</span><strong>Expert Discussion</strong></div>
            <div :class="{ done: selected.status === 'completed' }"><span>4</span><strong>Create Report</strong></div>
          </section>

          <div class="detail-grid">
            <section class="info-section">
              <div class="section-heading"><h3>Patient Documents</h3><FileText :size="17" /></div>
              <ul class="material-list"><li v-for="material in selected.materials" :key="material"><span>{{ material }}</span><el-button link type="primary" @click="ElMessage.info('Previewing demo document: ' + material)">View</el-button></li></ul>
            </section>
            <section class="info-section">
              <div class="section-heading"><h3>Participating Specialists</h3><el-button :icon="UserPlus" link type="primary" :disabled="!canOperate || selected.status === 'completed'" @click="expertDialogVisible = true">Add</el-button></div>
              <ul class="expert-list"><li v-for="expert in selected.experts" :key="expert"><span class="expert-avatar">{{ expert.slice(0, 1) }}</span><span class="expert-name">{{ expert }}</span><el-tag v-if="selected.expertOpinions.some(entry => entry.expert === expert)" size="small" type="success" effect="plain">Recorded</el-tag><el-button v-if="selected.status === 'inProgress'" link type="primary" :disabled="!canOperate" @click="openExpertOpinion(expert)">Opinion</el-button></li><li v-if="!selected.experts.length" class="muted">No specialists added</li></ul>
            </section>
          </div>

          <section v-if="selected.expertOpinions.length" class="opinion-section">
            <h3>Recorded Specialist Contributions</h3>
            <div v-for="entry in selected.expertOpinions" :key="entry.expert" class="expert-contribution"><strong>{{ entry.expert }}</strong><small>Recorded by {{ entry.recordedBy }} · {{ entry.recordedAt }}</small><p>{{ entry.text }}</p></div>
          </section>

          <section class="opinion-section">
            <div class="section-heading"><h3>Shared Case Conclusion</h3><span>Prototype summary, not individual signed opinions</span></div>
            <el-input v-model="selected.opinion" type="textarea" :rows="5" resize="none" :disabled="!canOperate || selected.status === 'completed'" placeholder="Enter the shared case conclusion for this prototype" />
          </section>

          <section v-if="selected.report" class="report-section"><h3>Group Case Review Report</h3><pre>{{ selected.report }}</pre></section>

          <div class="detail-actions">
            <el-button v-if="selected.status === 'pending'" :disabled="!canOperate" @click="updateStatus('accepted')">Accept Request</el-button>
            <el-button v-if="selected.status === 'accepted'" :icon="Play" type="primary" :disabled="!canOperate" @click="updateStatus('inProgress')">Start Consultation</el-button>
            <el-button v-if="selected.status === 'inProgress'" :icon="FileText" type="primary" :disabled="!canOperate" @click="completeConsultation">Complete and Generate Report</el-button>
            <el-button v-if="selected.status === 'completed'" :icon="Download" type="primary" @click="exportReport">Export Report</el-button>
          </div>
        </div>
      </article>
    </section>

    <el-dialog v-model="newDialogVisible" title="Request Group Case Review" width="560px">
      <el-form label-position="top"><el-form-item label="Patient"><el-select v-model="newForm.patientId"><el-option v-for="patient in clinicalStore.patients" :key="patient.id" :label="`${patient.name} · ${patient.diagnosis}`" :value="patient.id" /></el-select></el-form-item><div class="form-grid"><el-form-item label="Specialty"><el-input v-model="newForm.specialty" /></el-form-item><el-form-item label="Scheduled Time"><el-input v-model="newForm.scheduledAt" /></el-form-item></div><el-form-item label="Reason for Consultation"><el-input v-model="newForm.reason" type="textarea" :rows="4" /></el-form-item></el-form>
      <template #footer><el-button @click="newDialogVisible = false">Cancel</el-button><el-button type="primary" @click="createConsultation">Submit Request</el-button></template>
    </el-dialog>

    <el-dialog v-model="expertDialogVisible" title="Add Consultation Specialist" width="440px"><el-input v-model="expertName" placeholder="Name and title" /><template #footer><el-button @click="expertDialogVisible = false">Cancel</el-button><el-button type="primary" @click="addExpert">Add Specialist</el-button></template></el-dialog>
    <el-dialog v-model="opinionDialogVisible" :title="`Record opinion for ${opinionExpert}`" width="560px"><el-input v-model="opinionDraft" type="textarea" :rows="5" maxlength="3000" show-word-limit placeholder="Enter the specialist's stated opinion" /><template #footer><el-button @click="opinionDialogVisible = false">Cancel</el-button><el-button type="primary" :disabled="!opinionDraft.trim()" @click="saveExpertOpinion">Record Opinion</el-button></template></el-dialog>
  </div>
</template>

<style scoped>
.permission-note { margin: 0; padding: 10px 13px; border: 1px solid #d6c28f; border-radius: var(--radius); color: #75551c; background: #fffaf0; font-size: 12px; }
.remote-layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 16px; align-items: start; }
.request-panel { position: sticky; top: 80px; }
.status-filter { padding: 12px; border-bottom: 1px solid var(--border); }
.status-filter :deep(.el-select) { width: 100%; }
.request-list { display: grid; }
.request-list > button { display: grid; gap: 8px; width: 100%; min-height: 112px; padding: 13px; border: 0; border-bottom: 1px solid var(--border); text-align: left; background: #fff; cursor: pointer; }
.request-list > button:last-child { border-bottom: 0; }
.request-list > button:hover { background: var(--panel-soft); }
.request-list > button.active { background: #eef5f7; box-shadow: inset 3px 0 0 var(--primary); }
.request-list > button > div { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.request-list strong { color: var(--text-strong); font-size: 13px; }
.request-list p { display: -webkit-box; margin: 0; overflow: hidden; color: var(--muted); font-size: 11px; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.request-list small { color: var(--subtle); font-size: 10px; }
.detail-header { align-items: center; }
.detail-body { display: grid; gap: 20px; padding: 19px; }
.case-summary h3, .info-section h3, .opinion-section h3, .report-section h3 { margin: 0; color: var(--text-strong); font-size: 14px; }
.case-summary > p { margin: 8px 0 13px; font-size: 13px; line-height: 1.7; }
.case-summary dl { display: flex; gap: 30px; margin: 0; }
.case-summary dl div { display: flex; gap: 8px; font-size: 11px; }
.case-summary dt { color: var(--muted); }.case-summary dd { margin: 0; }
.workflow-strip { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--border); border-radius: 4px; }
.workflow-strip div { position: relative; display: flex; align-items: center; gap: 8px; min-height: 52px; padding: 9px 12px; border-right: 1px solid var(--border); color: var(--subtle); }
.workflow-strip div:last-child { border-right: 0; }
.workflow-strip span { display: grid; width: 22px; height: 22px; place-items: center; border-radius: 50%; color: #fff; font-size: 10px; background: var(--border-strong); }
.workflow-strip strong { font-size: 11px; }
.workflow-strip div.done { color: var(--text-strong); }.workflow-strip div.done span { background: var(--teal); }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.info-section, .opinion-section, .report-section { padding-top: 16px; border-top: 1px solid var(--border); }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.section-heading > span { color: var(--muted); font-size: 10px; }
.material-list, .expert-list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.material-list li { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 42px; border-bottom: 1px solid var(--border); font-size: 11px; }
.expert-list li { display: flex; align-items: center; gap: 9px; min-height: 42px; font-size: 12px; }
.expert-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }.expert-contribution { padding: 10px 0; border-bottom: 1px solid var(--border); }.expert-contribution strong, .expert-contribution small { display: block; }.expert-contribution small { margin-top: 3px; color: var(--muted); font-size: 10px; }.expert-contribution p { margin: 8px 0 0; font-size: 12px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.expert-avatar { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 50%; color: var(--primary); background: #e8f1f4; }
.report-section pre { margin: 10px 0 0; padding: 13px; border: 1px solid var(--border); border-radius: 4px; color: var(--text); background: var(--panel-soft); font-family: inherit; font-size: 12px; line-height: 1.7; white-space: pre-wrap; }
.detail-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 14px; border-top: 1px solid var(--border); }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }.form-grid :deep(.el-input), :deep(.el-select) { width: 100%; }
@media (max-width: 860px) { .remote-layout { grid-template-columns: 1fr; } .request-panel { position: static; } .request-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } .request-list > button:nth-child(odd) { border-right: 1px solid var(--border); } }
@media (max-width: 600px) { .request-list, .detail-grid, .workflow-strip, .form-grid { grid-template-columns: 1fr; } .request-list > button:nth-child(odd), .workflow-strip div { border-right: 0; } .workflow-strip div { border-bottom: 1px solid var(--border); } .workflow-strip div:last-child { border-bottom: 0; } .case-summary dl { align-items: flex-start; flex-direction: column; gap: 8px; } }
</style>
