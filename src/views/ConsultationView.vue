<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Download, FilePlus2, History, ImagePlus, Play, SendHorizontal, Sparkles } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PatientSummary from '@/components/patients/PatientSummary.vue'
import { useAuthStore } from '@/stores/auth'
import { useClinicalStore } from '@/stores/clinical'
import { downloadText } from '@/utils/export'

const router = useRouter()
const authStore = useAuthStore()
const clinicalStore = useClinicalStore()
const draftMessage = shallowRef('')
const historyVisible = shallowRef(false)
const summaryUpdated = shallowRef(false)

const actor = computed(() => ({ name: authStore.profile.name, role: authStore.roleLabel, department: authStore.profile.department }))
const selectedSession = computed(() => clinicalStore.selectedConsultation)
const selectedPatient = computed(() => clinicalStore.patients.find((item) => item.id === selectedSession.value.patientId) ?? clinicalStore.selectedPatient)
const activeSessions = computed(() => clinicalStore.consultations.filter((item) => item.status !== 'completed'))
const historySessions = computed(() => clinicalStore.consultations.filter((item) => item.status === 'completed'))
const canOperate = computed(() => authStore.currentRole !== 'admin')
const aiSummary = computed(() => [
  `Chief complaint: ${selectedSession.value.complaint}.`,
  `Key information: ${selectedPatient.value.history}`,
  `Risk alert: ${selectedPatient.value.allergies.join(', ')}; current risk score: ${selectedPatient.value.metrics.riskScore || 'Not assessed'}.`,
  `Follow-up advice: ${selectedPatient.value.plan}`,
])

function selectSession(id: string) {
  clinicalStore.selectConsultation(id)
  summaryUpdated.value = false
}

function startSession() {
  if (!canOperate.value) return
  clinicalStore.startConsultation(selectedSession.value.id, actor.value)
  ElMessage.success('Consultation accepted. The record is now saving automatically.')
}

function sendMessage() {
  const content = draftMessage.value.trim()
  if (!content || !canOperate.value || selectedSession.value.status === 'completed') return
  if (selectedSession.value.status === 'waiting') clinicalStore.startConsultation(selectedSession.value.id, actor.value)
  clinicalStore.addMessage(content)
  clinicalStore.recordAudit(actor.value, 'Sent online consultation reply', selectedSession.value.id)
  draftMessage.value = ''
}

function uploadAttachment() {
  if (!canOperate.value || selectedSession.value.status === 'completed') return
  clinicalStore.addMessage('Patient examination documents have been uploaded. Review them with the consultation record.', 'doctor', 'Outpatient-Examination-Documents.pdf')
  clinicalStore.recordAudit(actor.value, 'Uploaded consultation documents', selectedSession.value.id)
  ElMessage.success('Demo document added to the current session.')
}

function refreshSummary() {
  summaryUpdated.value = true
  clinicalStore.recordAudit(actor.value, 'Generated consultation summary', selectedSession.value.id, 'Pending Review')
  ElMessage.success('Consultation summary updated from the current conversation.')
}

function finishSession() {
  if (!canOperate.value) return
  clinicalStore.completeConsultation(selectedSession.value.id, actor.value)
  ElMessage.success('Consultation completed and record saved.')
}

function generateRecord() {
  if (!canOperate.value) return
  const record = clinicalStore.createAiRecord(actor.value, selectedPatient.value.id)
  ElMessage.success('Medical record draft generated. Review it before submission.')
  router.push({ path: '/records', query: { record: record.id } })
}

function exportSession() {
  const content = selectedSession.value.messages
    .map((message) => `${message.time} ${message.sender === 'doctor' ? 'Physician' : message.sender === 'patient' ? 'Patient' : 'AI Assistant'}: ${message.content}${message.attachment ? `\nAttachment: ${message.attachment}` : ''}`)
    .join('\n\n')
  downloadText(`${selectedSession.value.patientName}-${selectedSession.value.id}-Consultation-Record.txt`, content)
  ElMessage.success('Consultation record exported.')
}
</script>

<template>
  <div class="view-stack">
    <PageHeader title="Online Consultation" description="Handle online patient consultations; messages and uploaded documents are saved automatically">
      <el-button :icon="History" @click="historyVisible = true">History</el-button>
      <el-button :icon="Download" @click="exportSession">Export Current Record</el-button>
    </PageHeader>

    <section class="consultation-layout">
      <article class="panel session-panel">
        <div class="panel-header"><div><h2 class="panel-title">Consultation Queue</h2><p class="panel-subtitle">{{ activeSessions.length }} sessions to process</p></div></div>
        <div class="session-list">
          <button v-for="session in activeSessions" :key="session.id" type="button" :class="{ active: session.id === selectedSession.id }" @click="selectSession(session.id)">
            <span class="session-avatar">{{ session.patientName.slice(-1) }}</span>
            <div><strong>{{ session.patientName }}</strong><p>{{ session.complaint }}</p><small>{{ session.updatedAt }}</small></div>
            <i v-if="session.unread">{{ session.unread }}</i>
            <em>{{ session.status === 'active' ? 'In Progress' : 'Waiting' }}</em>
          </button>
        </div>
      </article>

      <article class="panel chat-panel">
        <div class="panel-header chat-header">
          <div><h2 class="panel-title">{{ selectedSession.patientName }} · {{ selectedSession.complaint }}</h2><p class="panel-subtitle">Session ID {{ selectedSession.id }}</p></div>
          <div class="session-actions">
            <el-button v-if="selectedSession.status === 'waiting'" :icon="Play" size="small" type="primary" :disabled="!canOperate" @click="startSession">Accept</el-button>
            <el-button v-else-if="selectedSession.status === 'active'" size="small" :disabled="!canOperate" @click="finishSession">End Consultation</el-button>
            <el-tag v-else type="info" effect="plain">Completed</el-tag>
          </div>
        </div>

        <div class="chat-body">
          <div v-for="message in selectedSession.messages" :key="message.id" class="message-row" :class="`sender-${message.sender}`">
            <div class="message-bubble">
              <span class="message-time">{{ message.time }} · {{ message.sender === 'doctor' ? 'Physician' : message.sender === 'patient' ? 'Patient' : 'AI Assistant' }}</span>
              <p>{{ message.content }}</p>
              <button v-if="message.attachment" class="attachment" type="button" @click="ElMessage.info('Demo document: ' + message.attachment)"><ImagePlus :size="15" />{{ message.attachment }}</button>
            </div>
          </div>
        </div>

        <div class="composer">
          <el-input v-model="draftMessage" type="textarea" :rows="3" resize="none" :disabled="!canOperate || selectedSession.status === 'completed'" placeholder="Enter a consultation reply or follow-up advice" @keydown.ctrl.enter="sendMessage" />
          <div class="composer-actions"><span>Ctrl + Enter to send</span><div><el-button :icon="ImagePlus" :disabled="!canOperate || selectedSession.status === 'completed'" @click="uploadAttachment">Add Document</el-button><el-button :icon="SendHorizontal" type="primary" :disabled="!draftMessage.trim() || !canOperate || selectedSession.status === 'completed'" @click="sendMessage">Send</el-button></div></div>
        </div>
      </article>

      <aside class="context-column">
        <article class="panel patient-context"><div class="panel-header"><div><h2 class="panel-title">Patient Summary</h2></div></div><div class="panel-body"><PatientSummary :patient="selectedPatient" /></div></article>
        <article class="panel assist-panel">
          <div class="panel-header"><div><h2 class="panel-title">Consultation Summary</h2><p class="panel-subtitle">Generated content requires physician review</p></div><Sparkles :size="18" /></div>
          <div class="panel-body">
            <ul class="summary-list"><li v-for="item in aiSummary" :key="item">{{ item }}</li></ul>
            <p v-if="summaryUpdated" class="updated-line">Updated from the latest conversation</p>
            <div class="assist-actions"><el-button size="small" @click="refreshSummary">Refresh Summary</el-button><el-button :icon="FilePlus2" size="small" type="primary" :disabled="!canOperate" @click="generateRecord">Generate Record Draft</el-button></div>
          </div>
        </article>
      </aside>
    </section>

    <el-drawer v-model="historyVisible" title="Consultation History" size="420px">
      <div class="history-list">
        <button v-for="session in historySessions" :key="session.id" type="button" @click="selectSession(session.id); historyVisible = false">
          <strong>{{ session.patientName }}</strong><span>{{ session.complaint }}</span><small>{{ session.updatedAt }} · {{ session.messages.length }} messages</small>
        </button>
        <p v-if="!historySessions.length" class="empty-text">No consultation history</p>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.consultation-layout { display: grid; grid-template-columns: 250px minmax(430px, 1fr) 320px; gap: 16px; align-items: start; }
.session-panel, .context-column { position: sticky; top: 80px; }
.session-list { display: grid; }
.session-list > button { position: relative; display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 10px; width: 100%; min-height: 92px; padding: 13px; border: 0; border-bottom: 1px solid var(--border); text-align: left; background: #fff; cursor: pointer; }
.session-list > button:last-child { border-bottom: 0; }
.session-list > button:hover { background: var(--panel-soft); }
.session-list > button.active { background: #eef5f7; box-shadow: inset 3px 0 0 var(--primary); }
.session-avatar { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 50%; color: var(--primary); font-weight: 700; background: #dcebee; }
.session-list strong, .session-list p, .session-list small { display: block; }
.session-list strong { color: var(--text-strong); font-size: 13px; }
.session-list p { margin: 4px 0; overflow: hidden; color: var(--muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.session-list small { color: var(--subtle); font-size: 10px; }
.session-list i { position: absolute; top: 12px; right: 12px; display: grid; width: 18px; height: 18px; place-items: center; border-radius: 50%; color: #fff; font-size: 10px; font-style: normal; background: var(--red); }
.session-list em { position: absolute; right: 12px; bottom: 12px; color: var(--primary); font-size: 10px; font-style: normal; }

.chat-panel { overflow: hidden; }
.chat-header { align-items: center; }
.session-actions { flex: 0 0 auto; }
.chat-body { display: grid; align-content: start; gap: 14px; height: 490px; padding: 18px; overflow-y: auto; background: #f5f7f8; }
.message-row { display: flex; }
.sender-doctor { justify-content: flex-end; }
.message-bubble { width: min(520px, 84%); padding: 10px 12px; border: 1px solid var(--border); border-radius: 5px; background: #fff; }
.sender-doctor .message-bubble { border-color: #b9d1db; background: #e8f2f5; }
.message-time { display: block; margin-bottom: 5px; color: var(--subtle); font-size: 10px; }
.message-bubble p { margin: 0; font-size: 13px; line-height: 1.65; }
.attachment { display: inline-flex; align-items: center; gap: 6px; margin-top: 9px; padding: 6px 8px; border: 1px solid var(--border-strong); border-radius: 3px; color: var(--primary); background: #fff; cursor: pointer; }
.composer { display: grid; gap: 9px; padding: 13px; border-top: 1px solid var(--border); }
.composer-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.composer-actions > span { color: var(--subtle); font-size: 10px; }
.composer-actions > div { display: flex; gap: 8px; }

.context-column { display: grid; gap: 16px; }
.patient-context :deep(.detail-list) { display: none; }
.summary-list { display: grid; gap: 9px; margin: 0; padding: 0; list-style: none; }
.summary-list li { padding-bottom: 9px; border-bottom: 1px solid var(--border); font-size: 12px; line-height: 1.65; }
.summary-list li:last-child { border-bottom: 0; }
.updated-line { margin: 10px 0 0; color: var(--green); font-size: 11px; }
.assist-actions { display: flex; gap: 7px; margin-top: 13px; }

.history-list { display: grid; gap: 9px; }
.history-list button { display: grid; gap: 5px; padding: 13px; border: 1px solid var(--border); border-radius: 4px; text-align: left; background: #fff; cursor: pointer; }
.history-list button:hover { background: var(--panel-soft); }
.history-list span, .history-list small { color: var(--muted); }
.history-list small { font-size: 11px; }

@media (max-width: 1280px) { .consultation-layout { grid-template-columns: 230px minmax(430px, 1fr); } .context-column { position: static; grid-column: 1 / -1; grid-template-columns: 1fr 1fr; } }
@media (max-width: 900px) { .consultation-layout { grid-template-columns: 1fr; } .session-panel, .context-column { position: static; } .session-list { grid-template-columns: repeat(2, 1fr); } .context-column { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .session-list { grid-template-columns: 1fr; } .chat-body { height: 430px; padding: 12px; } .composer-actions { align-items: flex-end; } .composer-actions > span { display: none; } .composer-actions > div { width: 100%; justify-content: flex-end; } }
</style>
