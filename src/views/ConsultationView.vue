<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowReactive, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, FilePlus2, ImagePlus, Play, Search, SendHorizontal, Sparkles } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PatientSummary from '@/components/patients/PatientSummary.vue'
import ConsultationImageMessage from '@/components/consultations/ConsultationImageMessage.vue'
import ConsultationRecordsDrawer from '@/components/consultations/ConsultationRecordsDrawer.vue'
import ConsultationSummaryPanel from '@/components/consultations/ConsultationSummaryPanel.vue'
import ConsultationDemoPanel from '@/components/consultations/ConsultationDemoPanel.vue'
import HighlightedText from '@/components/consultations/HighlightedText.vue'
import { prepareConsultationImage } from '@/services/consultation-images'
import type { ConsultationService } from '@/services/consultations'
import { useAuthStore } from '@/stores/auth'
import { useClinicalStore } from '@/stores/clinical'
import { downloadText } from '@/utils/export'
import { formatConsultationTime as formatTime } from '@/utils/consultations'
import { exportConsultationText } from '@/utils/consultation-export'
import { resolvePatientIdentity } from '@/utils/patient-identity'
import type { ConsultationSession, ConsultationSummaryInput } from '@/types/clinical'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const clinicalStore = useClinicalStore()
const recordsVisible = shallowRef(false)
const searchTarget = shallowRef<{ sessionId: string; messageId: string; keyword: string }>()
let recordNavigationPending = false
const busy = shallowRef(false)
const saveState = shallowRef<'ready' | 'saving' | 'saved' | 'failed'>('ready')
const savedAt = shallowRef('')
const saveSessionId = shallowRef('')
const actionError = shallowRef('')
const chatBody = ref<HTMLElement>()
const summaryPanel = ref<InstanceType<typeof ConsultationSummaryPanel>>()
const summaryDirty = reactive<Record<string, boolean>>({})
const drafts = reactive<Record<string, string>>({})
type ImageDraft = Awaited<ReturnType<typeof prepareConsultationImage>>
const imageDrafts = shallowReactive<Record<string, ImageDraft>>({})
const imageInput = ref<HTMLInputElement>()
const preparingImage = shallowRef(false)
const imageErrors = reactive<Record<string, string>>({})
const attempts = new Map<string, { content: string; imageId?: string; id: string }>()
const failedSessionId = shallowRef('')
const demoDirty = shallowRef(false)
const queueKeyword = shallowRef('')
const queueStatus = shallowRef<'all' | 'waiting' | 'active'>('all')
const readError = shallowRef('')
const readingSessionId = shallowRef('')
let disposed = false

const actor = computed(() => ({ name: authStore.profile.name, role: authStore.roleLabel, department: authStore.profile.department }))
const missingRequestedSession = computed(() => typeof route.query.session === 'string' && !clinicalStore.consultationsLoading
  && !clinicalStore.consultationsError && !clinicalStore.consultations.some(session => session.id === route.query.session))
const selectedSession = computed(() => missingRequestedSession.value ? undefined : clinicalStore.selectedConsultation)
const selectedPatient = computed(() => clinicalStore.patients.find(item => item.id === selectedSession.value?.patientId))
const patientBindingBlocked = computed(() => clinicalStore.patientsLoading || Boolean(clinicalStore.patientsError) || !selectedPatient.value)
const activeSessions = computed(() => clinicalStore.consultations.filter(item => item.status !== 'completed'))
const queueCounts = computed(() => ({
  all: activeSessions.value.length,
  waiting: activeSessions.value.filter(item => item.status === 'waiting').length,
  active: activeSessions.value.filter(item => item.status === 'active').length,
}))
const filteredQueue = computed(() => {
  const keyword = queueKeyword.value.trim().toLowerCase()
  return activeSessions.value.filter(session => (queueStatus.value === 'all' || session.status === queueStatus.value)
    && [patientName(session), session.patientId, session.id, session.complaint].some(text => text.toLowerCase().includes(keyword)))
    .sort((a, b) => (Number.isNaN(Date.parse(b.updatedAt)) ? 0 : Date.parse(b.updatedAt)) - (Number.isNaN(Date.parse(a.updatedAt)) ? 0 : Date.parse(a.updatedAt)))
})
const hasUnsavedWork = computed(() => Object.values(drafts).some(text => text.trim())
  || Object.keys(imageDrafts).length > 0 || Object.values(summaryDirty).some(Boolean) || demoDirty.value)
const linkedRecord = computed(() => clinicalStore.records.find(record => record.sourceConsultationId === selectedSession.value?.id))
const patientNames = computed(() => clinicalStore.patientsError ? {} : Object.fromEntries(clinicalStore.patients.map(patient => [patient.id, patient.name])))
const canOperate = computed(() => ['doctor', 'seniorDoctor'].includes(authStore.currentRole))
const loadBlocked = computed(() => clinicalStore.consultationsLoading || Boolean(clinicalStore.consultationsError))
const canWrite = computed(() => canOperate.value && !busy.value && !preparingImage.value && !loadBlocked.value && !patientBindingBlocked.value && Boolean(selectedSession.value) && selectedSession.value?.status !== 'completed')
const pendingImage = computed(() => imageDrafts[selectedSession.value?.id ?? ''])
const imageError = computed(() => imageErrors[selectedSession.value?.id ?? ''] ?? '')
const draftMessage = computed({
  get: () => drafts[selectedSession.value?.id ?? ''] ?? '',
  set: value => { if (selectedSession.value) drafts[selectedSession.value.id] = value },
})
const saveLabel = computed(() => {
  const target = saveSessionId.value && saveSessionId.value !== selectedSession.value?.id ? ` · Session ${saveSessionId.value}` : ''
  if (saveState.value === 'saving') return `Saving in this browser…${target}`
  if (saveState.value === 'failed') return `Not saved — please retry${target}`
  if (saveState.value === 'saved') return `Saved in this browser at ${savedAt.value}${target}`
  return 'Local history ready'
})

function patientName(session: ConsultationSession) {
  const identity = resolvePatientIdentity(clinicalStore.patientsError ? [] : clinicalStore.patients, session)
  return identity.currentName ?? `${identity.snapshotName} (snapshot)`
}

async function reloadPatients() { try { await clinicalStore.loadPatients(true) } catch { /* Preserve the explicit profile error. */ } }

function selectSession(id: string) {
  if (busy.value) return
  searchTarget.value = undefined
  clinicalStore.selectConsultation(id)
  actionError.value = ''
  saveState.value = 'ready'
  void router.replace({ query: { ...route.query, session: id } })
  void markRead(id)
}

function clearQueueFilters() { queueKeyword.value = ''; queueStatus.value = 'all' }

async function markRead(id: string) {
  if (!canOperate.value || loadBlocked.value || busy.value || readingSessionId.value) return
  if (!clinicalStore.consultations.find(session => session.id === id)?.unread) return
  readingSessionId.value = id
  readError.value = ''
  try { await clinicalStore.markConsultationRead(id) }
  catch (error) { readError.value = error instanceof Error ? error.message : 'Unable to save read status. Please retry.' }
  finally { readingSessionId.value = '' }
}

function showRecords() {
  recordsVisible.value = true
}

function openRecord(sessionId: string, messageId?: string, keyword = '') {
  if (busy.value || loadBlocked.value) return
  const session = clinicalStore.consultations.find(item => item.id === sessionId)
  if (!session) return
  selectSession(sessionId)
  if (messageId && session.messages.some(message => message.id === messageId)) {
    searchTarget.value = { sessionId, messageId, keyword }
  }
  recordNavigationPending = true
  recordsVisible.value = false
  void alignConversation()
}

function recordsClosed() {
  if (!recordNavigationPending) return
  recordNavigationPending = false
  void alignConversation()
}

function isSearchTarget(messageId: string) {
  return searchTarget.value?.sessionId === selectedSession.value?.id && searchTarget.value?.messageId === messageId
}

function showLatestMessage() {
  searchTarget.value = undefined
  void scrollToLatest()
  if (selectedSession.value) void markRead(selectedSession.value.id)
}

function clearImageDraft(id: string) {
  const pending = imageDrafts[id]
  if (pending) URL.revokeObjectURL(pending.previewUrl)
  delete imageDrafts[id]
  delete imageErrors[id]
}

function removeImage() {
  if (selectedSession.value && canWrite.value) clearImageDraft(selectedSession.value.id)
}

async function chooseImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const session = selectedSession.value
  if (!file || !session || !canWrite.value) return
  const id = session.id
  preparingImage.value = true
  imageErrors[id] = ''
  try {
    const prepared = await prepareConsultationImage(file)
    if (disposed || !canOperate.value || clinicalStore.consultations.find(item => item.id === id)?.status === 'completed') {
      URL.revokeObjectURL(prepared.previewUrl)
      return
    }
    clearImageDraft(id)
    imageDrafts[id] = prepared
  } catch (error) {
    if (!disposed) imageErrors[id] = error instanceof Error ? error.message : 'Unable to read this image. Please choose another file.'
  } finally { preparingImage.value = false }
}

function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasUnsavedWork.value && !busy.value && !preparingImage.value) return
  event.preventDefault()
  event.returnValue = ''
}
window.addEventListener('beforeunload', warnBeforeUnload)
onBeforeRouteLeave(async () => {
  if (busy.value || preparingImage.value) {
    ElMessage.warning('Wait for the current save or image preparation to finish before leaving.')
    return false
  }
  if (!hasUnsavedWork.value) return true
  try {
    await ElMessageBox.confirm('Unsent messages, selected images, and unsaved summary or demo-tool changes will be discarded. Saved conversations will remain.', 'Leave with unsaved changes?', {
      confirmButtonText: 'Leave and discard', cancelButtonText: 'Stay on this page', type: 'warning',
    })
    return true
  } catch { return false }
})
onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('beforeunload', warnBeforeUnload)
  Object.keys(imageDrafts).forEach(clearImageDraft)
})

watch(() => [route.query.session, clinicalStore.consultations.length] as const, ([id]) => {
  if (typeof id === 'string' && clinicalStore.consultations.some(item => item.id === id)) clinicalStore.selectConsultation(id)
}, { immediate: true })

async function scrollToLatest() {
  await nextTick()
  if (chatBody.value) chatBody.value.scrollTop = chatBody.value.scrollHeight
}

async function alignConversation() {
  await nextTick()
  const target = searchTarget.value
  if (!target) { await scrollToLatest(); return }
  if (target.sessionId !== selectedSession.value?.id) {
    searchTarget.value = undefined
    await scrollToLatest()
    return
  }
  const element = Array.from(chatBody.value?.querySelectorAll<HTMLElement>('[data-message-id]') ?? [])
    .find(item => item.dataset.messageId === target.messageId)
  if (element) {
    // In a long reply, bring the matched text into view as well as identifying its message.
    const anchor = element.querySelector<HTMLElement>('mark') ?? element.querySelector<HTMLElement>('.image-thumbnail') ?? element
    anchor.scrollIntoView({ block: 'center', inline: 'nearest' })
    element.focus({ preventScroll: true })
  }
}

function imageLoaded(messageId: string) {
  if (searchTarget.value) {
    // Image decoding must keep a selected search result in view instead of jumping to the latest message.
    if (isSearchTarget(messageId)) void alignConversation()
  } else if (messageId === selectedSession.value?.messages[selectedSession.value.messages.length - 1]?.id) {
    void scrollToLatest()
  }
}

watch(() => [selectedSession.value?.id, selectedSession.value?.messages.length, searchTarget.value], alignConversation, { immediate: true })

async function reloadHistory() {
  actionError.value = ''
  try { await clinicalStore.loadConsultations(true) } catch { /* The load alert keeps the original records intact. */ }
}

async function saveAction(work: () => Promise<void>, sessionId = selectedSession.value?.id ?? '') {
  if (busy.value) return false
  busy.value = true
  saveSessionId.value = sessionId
  saveState.value = 'saving'
  actionError.value = ''
  try {
    await work()
    saveState.value = 'saved'
    savedAt.value = new Date().toLocaleTimeString('en-GB')
    return true
  } catch (error) {
    saveState.value = 'failed'
    actionError.value = error instanceof Error ? error.message : 'Unable to save. Your existing history is unchanged.'
    return false
  } finally { busy.value = false }
}

async function saveSummary(sessionId: string, input: ConsultationSummaryInput) {
  if (busy.value || loadBlocked.value || patientBindingBlocked.value) throw new Error('The current patient profile must be available before saving this summary. Reload patient profiles and retry.')
  const saved = await saveAction(() => clinicalStore.saveConsultationSummary(sessionId, input, actor.value), sessionId)
  if (!saved) throw new Error(actionError.value || 'Unable to save this summary. Your changes have been kept.')
}

function summaryChanged(sessionId: string, dirty: boolean) {
  summaryDirty[sessionId] = dirty
}

async function startSession() {
  const session = selectedSession.value
  if (!session || !canWrite.value) return
  if (await saveAction(() => clinicalStore.startConsultation(session.id, actor.value))) {
    ElMessage.success('Consultation accepted and saved in this browser.')
  }
}

async function sendMessage() {
  const session = selectedSession.value
  const content = draftMessage.value.trim()
  const imageDraft = pendingImage.value
  if (!session || (!content && !imageDraft) || !canWrite.value) return
  const previous = attempts.get(session.id)
  const imageId = imageDraft?.image.id
  const attempt = previous?.content === content && previous.imageId === imageId ? previous : { content, imageId, id: crypto.randomUUID() }
  attempts.set(session.id, attempt)
  const saved = await saveAction(() => imageDraft
    ? clinicalStore.addImageMessage(session.id, content, attempt.id, imageDraft.image, imageDraft.blob, actor.value)
    : clinicalStore.addMessage(session.id, content, attempt.id, actor.value))
  if (saved) {
    if ((drafts[session.id] ?? '').trim() === content) drafts[session.id] = ''
    if (imageDrafts[session.id]?.image.id === imageId) clearImageDraft(session.id)
    attempts.delete(session.id)
    failedSessionId.value = ''
    if (selectedSession.value?.id === session.id) showLatestMessage()
  } else { failedSessionId.value = session.id }
}

async function finishSession() {
  const session = selectedSession.value
  if (!session || !canWrite.value || session.status !== 'active') return
  if (summaryDirty[session.id]) {
    ElMessage.warning('Save or discard your summary changes before ending this consultation.')
    summaryPanel.value?.openEditor()
    return
  }
  try {
    await ElMessageBox.confirm(
      draftMessage.value.trim() || pendingImage.value
        ? 'Your unsent text and image draft will be discarded. Saved messages will remain in Consultation Records under Completed, and the conversation will become read-only.'
        : 'Saved messages will remain in Consultation Records under Completed. This conversation will become read-only.',
      'End this consultation?',
      { confirmButtonText: 'End consultation', cancelButtonText: 'Keep chatting', type: 'warning' },
    )
  } catch { return }
  if (await saveAction(() => clinicalStore.completeConsultation(session.id, actor.value))) {
    drafts[session.id] = ''
    clearImageDraft(session.id)
    attempts.delete(session.id)
    ElMessage.success('Consultation ended. Open Consultation Records and select Completed to revisit it.')
  }
}

async function generateRecord() {
  const session = selectedSession.value
  if (!canOperate.value || !session || busy.value || loadBlocked.value) return
  if (!linkedRecord.value && patientBindingBlocked.value) {
    ElMessage.warning('The linked patient profile is unavailable. A new medical record cannot be created.')
    return
  }
  if (summaryDirty[session.id] || !session.summary) {
    ElMessage.warning('Save the consultation summary before creating its medical record draft.')
    summaryPanel.value?.openEditor()
    return
  }
  let recordId = ''
  const saved = await saveAction(async () => {
    const record = await clinicalStore.createConsultationRecord(session.id, actor.value)
    recordId = record.id
  }, session.id)
  if (saved) void router.push({ path: '/records', query: { record: recordId } })
}

async function createDemoRequest(input: Parameters<ConsultationService['createDemoRequest']>[0]) {
  const saved = await saveAction(async () => {
    const created = await clinicalStore.createDemoConsultation(input, actor.value)
    saveSessionId.value = created.id
  }, `C-DEMO-${input.clientRequestId}`)
  if (!saved) throw new Error(actionError.value)
  clearQueueFilters()
  ElMessage.success('Demo request added to the waiting queue. Select it to accept.')
}

async function receiveDemoMessage(id: string, input: Parameters<ConsultationService['receiveDemoMessage']>[1]) {
  const saved = await saveAction(async () => { await clinicalStore.receiveDemoConsultationMessage(id, input, actor.value) }, id)
  if (!saved) throw new Error(actionError.value)
  ElMessage.success('Demo patient message saved. Open the conversation to read it.')
}

function openAiAssistant() {
  const session = selectedSession.value
  if (!session || !canOperate.value || patientBindingBlocked.value || busy.value) return
  void router.push({ path: '/ai-assistant', query: { task: 'emr', patient: session.patientId, session: session.id } })
}

function exportSession() {
  const session = selectedSession.value
  if (!session || loadBlocked.value) return
  if (summaryDirty[session.id]) {
    ElMessage.warning('Save or discard your summary changes before exporting the conversation.')
    summaryPanel.value?.openEditor()
    return
  }
  const identity = resolvePatientIdentity(clinicalStore.patients, session)
  const content = exportConsultationText(session, identity.currentName ?? identity.snapshotName, identity.profileMissing || Boolean(clinicalStore.patientsError))
  downloadText(`${patientName(session)}-${session.id}-Consultation-Record.txt`, content)
  ElMessage.success('Consultation text exported.')
}
</script>

<template>
  <div class="view-stack">
    <PageHeader title="Online Consultation" description="Doctor–patient visits: accept requests, exchange messages, and prepare a clinical summary">
      <el-button :icon="Search" :disabled="busy || loadBlocked" @click="showRecords">Consultation Records ({{ clinicalStore.consultations.length }})</el-button>
      <el-button :icon="Download" :disabled="!selectedSession || loadBlocked || busy" @click="exportSession">Export Current Conversation</el-button>
      <ConsultationDemoPanel :patients="clinicalStore.patients" :session="patientBindingBlocked ? undefined : selectedSession" :disabled="!canOperate || busy || loadBlocked || clinicalStore.patientsLoading || Boolean(clinicalStore.patientsError)" :create-request="createDemoRequest" :receive-message="receiveDemoMessage" @dirty="demoDirty = $event" />
    </PageHeader>

    <div class="local-storage-note">
      <div><strong>Local demo · Saved in this browser</strong><p>Sent messages, images, saved summaries, and consultation status survive refresh. Data is not sent to a server. Patient messages and attachments labelled “Sample” are examples. Use fictional data for this demo.</p></div>
      <span v-if="!loadBlocked" class="save-state" :class="saveState" role="status">{{ saveLabel }}</span>
    </div>
    <el-alert v-if="clinicalStore.consultationsError" title="Local history could not be loaded" type="error" :closable="false" show-icon>
      <p>{{ clinicalStore.consultationsError }}</p><el-button :loading="clinicalStore.consultationsLoading" @click="reloadHistory">Retry loading</el-button>
    </el-alert>
    <el-alert v-if="actionError" title="Changes were not saved" type="error" :closable="false" show-icon>
      <p>Session {{ saveSessionId }}: {{ actionError }} Your unsaved input is kept. You can retry the action.</p>
    </el-alert>
    <p v-if="clinicalStore.consultationsLoading" class="empty-text" role="status">Loading local history…</p>
    <el-alert v-if="missingRequestedSession" title="Consultation not found" type="warning" :closable="false"><p>The requested session ID does not exist. Select a conversation from the queue or Consultation Records.</p></el-alert>
    <el-alert v-if="clinicalStore.patientsError" title="Patient profiles could not be loaded" type="error" :closable="false"><p>{{ clinicalStore.patientsError }} Saved conversation names are historical snapshots.</p><el-button @click="reloadPatients">Retry patient profiles</el-button></el-alert>
    <p v-if="readError" class="image-error" role="alert">{{ readError }} <el-button link @click="selectedSession && markRead(selectedSession.id)">Retry read status</el-button></p>

    <section v-else-if="!clinicalStore.consultationsError" class="consultation-layout">
      <article class="panel session-panel">
        <div class="panel-header"><div><h2 class="panel-title">Consultation Queue</h2><p class="panel-subtitle">{{ activeSessions.length }} sessions to process</p></div></div>
        <div class="queue-filters">
          <el-input v-model="queueKeyword" aria-label="Filter consultation queue" placeholder="Name, ID, or complaint" clearable />
          <label for="queue-status">Queue status</label>
          <select id="queue-status" v-model="queueStatus" aria-label="Queue status"><option value="all">All ({{ queueCounts.all }})</option><option value="waiting">Waiting ({{ queueCounts.waiting }})</option><option value="active">In Progress ({{ queueCounts.active }})</option></select>
        </div>
        <div class="session-list">
          <button v-for="session in filteredQueue" :key="session.id" type="button" :disabled="busy" :class="{ active: session.id === selectedSession?.id }" :aria-pressed="session.id === selectedSession?.id" @click="selectSession(session.id)">
            <span class="session-avatar">{{ patientName(session).slice(0, 1) }}</span>
            <div><strong>{{ patientName(session) }}</strong><p>{{ session.complaint }}</p><small>{{ formatTime(session.updatedAt) }}</small></div>
            <i v-if="session.unread" :aria-label="`${session.unread} unread messages`">{{ session.unread > 99 ? '99+' : session.unread }}</i>
            <span v-if="drafts[session.id]?.trim() || imageDrafts[session.id] || summaryDirty[session.id]" class="queue-draft">Unsaved draft</span>
            <em>{{ session.status === 'active' ? 'In Progress' : 'Waiting' }}</em>
          </button>
          <p v-if="!activeSessions.length" class="empty-text">No active consultations. Open Consultation Records and select Completed to revisit past conversations.</p>
          <div v-else-if="!filteredQueue.length" class="empty-text">No consultations match these filters.<el-button link @click="clearQueueFilters">Clear queue filters</el-button></div>
        </div>
      </article>

      <article v-if="selectedSession" class="panel chat-panel">
        <div class="panel-header chat-header">
          <div><h2 class="panel-title">{{ patientName(selectedSession) }} · {{ selectedSession.complaint }}</h2><p class="panel-subtitle">Patient ID {{ selectedSession.patientId }} · Session ID {{ selectedSession.id }}</p><p v-if="selectedPatient && selectedPatient.name !== selectedSession.patientName" class="panel-subtitle">Name at consultation creation: {{ selectedSession.patientName }} (snapshot)</p></div>
          <div class="session-actions">
            <el-button size="small" :disabled="busy || loadBlocked" @click="summaryPanel?.openEditor()">Consultation Summary</el-button>
            <el-button v-if="selectedSession.status === 'waiting'" :icon="Play" size="small" type="primary" :disabled="!canWrite" :loading="busy" @click="startSession">Accept</el-button>
            <el-button v-else-if="selectedSession.status === 'active'" size="small" :disabled="!canWrite" @click="finishSession">End Consultation</el-button>
            <el-tag v-else type="info" effect="plain">Completed</el-tag>
          </div>
        </div>

        <div v-if="searchTarget?.sessionId === selectedSession.id" class="search-position-note" role="status"><span>Viewing a message found in records</span><el-button size="small" @click="showLatestMessage">Latest message</el-button></div>
        <div v-if="selectedSession.unread" class="unread-note" role="status"><span>{{ selectedSession.unread }} unread patient message(s)</span><el-button size="small" :disabled="busy || !canOperate" :loading="readingSessionId === selectedSession.id" @click="showLatestMessage">Read latest</el-button></div>
        <div ref="chatBody" class="chat-body" role="log" aria-label="Conversation messages" aria-live="polite" :aria-busy="busy">
          <div v-for="message in selectedSession.messages" :key="message.id" class="message-row" :class="[`sender-${message.sender}`, { 'search-target': isSearchTarget(message.id) }]" :data-message-id="message.id" tabindex="-1">
            <div class="message-bubble">
              <span class="message-time">{{ formatTime(message.time) }} · {{ message.sender === 'doctor' ? 'Physician' : message.sender === 'patient' ? 'Patient' : 'AI Assistant' }}</span>
              <p v-if="message.content"><HighlightedText :text="message.content" :keyword="isSearchTarget(message.id) ? searchTarget?.keyword ?? '' : ''" /></p>
              <ConsultationImageMessage v-if="message.image" :image="message.image" :keyword="isSearchTarget(message.id) ? searchTarget?.keyword ?? '' : ''" @loaded="imageLoaded(message.id)" />
              <button v-if="message.attachment" class="attachment" type="button" @click="ElMessage.info('Sample reference only. No image or document has been uploaded.')"><ImagePlus :size="15" />Sample: <HighlightedText :text="message.attachment" :keyword="isSearchTarget(message.id) ? searchTarget?.keyword ?? '' : ''" /></button>
            </div>
          </div>
          <p v-if="!selectedSession.messages.length" class="empty-text">No messages in this conversation yet.</p>
        </div>

        <div class="composer">
          <p v-if="selectedSession.status === 'completed'" class="read-only-note">This consultation is complete. Saved messages are read-only and can be exported.</p>
          <p v-else-if="!canOperate" class="read-only-note">Your current demo role has read-only access.</p>
          <div v-if="pendingImage" class="image-draft" aria-label="Image ready to send">
            <img :src="pendingImage.previewUrl" :alt="`Preview: ${pendingImage.image.name}`" />
            <div class="image-draft-details"><strong>{{ pendingImage.image.name }}</strong><span>{{ pendingImage.image.width }} × {{ pendingImage.image.height }} · {{ (pendingImage.image.size / 1024).toFixed(1) }} KB</span><small>Not sent yet · Add an optional message below</small></div>
            <div class="image-draft-actions" role="group" aria-label="Image actions">
              <el-button size="small" :disabled="!canWrite" :loading="preparingImage" @click="imageInput?.click()">Replace Image</el-button>
              <el-button size="small" :disabled="!canWrite" @click="removeImage">Remove image</el-button>
            </div>
          </div>
          <p v-if="imageError" class="image-error" role="alert">{{ imageError }}</p>
          <el-input v-model="draftMessage" type="textarea" :rows="3" resize="none" :disabled="!canWrite" :maxlength="5000" show-word-limit placeholder="Enter a consultation reply or follow-up advice" @keydown.ctrl.enter.prevent="sendMessage" />
          <input ref="imageInput" class="image-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose consultation image" :disabled="!canWrite" @change="chooseImage" />
          <div class="composer-actions"><span>Ctrl + Enter to send</span><div><el-button v-if="!pendingImage" :icon="ImagePlus" :disabled="!canWrite" :loading="preparingImage" @click="imageInput?.click()">Add Image</el-button><el-button :icon="SendHorizontal" type="primary" :loading="busy" :disabled="(!draftMessage.trim() && !pendingImage) || !canWrite" @click="sendMessage">{{ failedSessionId === selectedSession.id && saveState === 'failed' ? 'Retry Send' : 'Send' }}</el-button></div></div>
          <p class="composer-help">One JPG, PNG, or WebP per message · Up to 5 MB / 24 megapixels. Unsent text and images stay with each conversation until you leave or refresh this page.</p>
        </div>
      </article>
      <article v-else class="panel"><p class="empty-text">No consultation selected. Choose a conversation from the queue or Consultation Records.</p></article>

      <aside v-if="selectedSession" class="context-column">
        <article class="panel patient-context"><div class="panel-header"><h2 class="panel-title">Patient Summary</h2></div><div class="panel-body"><PatientSummary v-if="selectedPatient && !clinicalStore.patientsError" :patient="selectedPatient" /><div v-else class="muted"><p>The linked patient profile is unavailable. The saved conversation remains readable; current profile details and new clinical actions are unavailable.</p><p>Patient ID: {{ selectedSession.patientId }}</p><el-button size="small" @click="reloadPatients">Retry patient profiles</el-button></div><el-button v-if="selectedPatient && !clinicalStore.patientsError" size="small" @click="router.push({ path: '/patients', query: { patient: selectedSession.patientId } })">Open Patient Profile</el-button></div></article>
        <ConsultationSummaryPanel ref="summaryPanel" :session="selectedSession" :patient-name="patientName(selectedSession)" :can-edit="canOperate && selectedSession.status === 'active' && !loadBlocked && !patientBindingBlocked" :busy="busy" :save-summary="saveSummary" @dirty="summaryChanged" />
        <article class="panel assist-panel">
          <div class="panel-header"><div><h2 class="panel-title">Patient Context</h2><p class="panel-subtitle">Profile information, not an AI summary of this conversation</p></div></div>
          <div v-if="selectedPatient && !clinicalStore.patientsError" class="panel-body">
            <ul class="summary-list"><li>Chief complaint: {{ selectedSession.complaint }}</li><li>History: {{ selectedPatient.history || 'Not provided' }}</li><li>Care plan: {{ selectedPatient.plan || 'Not set' }}</li></ul>
          </div>
        </article>
        <article class="panel record-handoff"><div class="panel-header"><h2 class="panel-title">Medical Record</h2></div><div class="panel-body"><p>Create a draft from the saved clinician summary. Review and complete it in Medical Records.</p><p v-if="!selectedSession.summary">Save a consultation summary first.</p><p v-if="linkedRecord">A linked record already exists. Opening it keeps your existing edits.</p><p v-if="clinicalStore.consultationRecordsError" class="image-error">{{ clinicalStore.consultationRecordsError }}</p><el-button :icon="FilePlus2" size="small" :disabled="!canOperate || busy || loadBlocked || clinicalStore.consultationRecordsLoading || !selectedSession.summary || (!linkedRecord && patientBindingBlocked)" @click="generateRecord">{{ linkedRecord ? 'Open Linked Record' : 'Create Record Draft' }}</el-button></div></article>
      <article class="panel record-handoff"><div class="panel-header"><h2 class="panel-title">AI Assistant</h2></div><div class="panel-body"><p>Open the separate assistant workflow to review a generated draft for this patient. It does not replace your saved consultation summary or linked record.</p><el-button :icon="Sparkles" size="small" :disabled="!canOperate || busy || loadBlocked || patientBindingBlocked" @click="openAiAssistant">Open AI Assistant</el-button></div></article>
      </aside>
    </section>

    <ConsultationRecordsDrawer v-model="recordsVisible" :sessions="clinicalStore.consultations" :patient-names="patientNames" :disabled="busy || loadBlocked" @open="openRecord" @closed="recordsClosed" />
  </div>
</template>

<style scoped>
.local-storage-note { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 12px 16px; border: 1px solid #bed6df; border-radius: 4px; background: #eff6f8; }
.local-storage-note strong { color: var(--text-strong); font-size: 13px; }
.local-storage-note p { margin: 5px 0 0; max-width: 820px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.save-state { flex-shrink: 0; font-size: 12px; color: var(--muted); }
.save-state.saved { color: var(--green); }
.save-state.failed { color: var(--red); }
.read-only-note { margin: 0; padding: 9px 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.search-position-note { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 14px; border-bottom: 1px solid #e4cb86; background: #fff8e5; color: #725414; font-size: 12px; }
.search-target .message-bubble { outline: 2px solid #bc882c; outline-offset: 2px; }
.message-row:focus { outline: none; }
.session-list button:disabled { cursor: wait; }
.message-bubble p { white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 900px) { .local-storage-note { align-items: flex-start; flex-direction: column; gap: 8px; } }

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
.queue-filters { display: grid; gap: 8px; padding: 12px; border-bottom: 1px solid var(--border); }
.queue-filters label { font-size: 11px; color: var(--muted); }
.queue-filters select { width: 100%; min-width: 0; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: white; color: var(--text-strong); }
.session-list strong { padding-right: 20px; }
.session-list .queue-draft { grid-column: 2; color: #946a1b; font-size: 10px; }
.unread-note { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 14px; background: #eff6f8; color: var(--primary); font-size: 12px; }
.record-handoff p { margin: 0 0 10px; font-size: 12px; line-height: 1.6; color: var(--muted); }

.chat-panel { overflow: hidden; }
.chat-header { align-items: center; }
.chat-header > div:first-child { min-width: 0; overflow-wrap: anywhere; }
.session-actions { display: flex; flex: 0 1 auto; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.session-actions .el-button { margin-left: 0; }
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
.image-file-input { display: none; }
.image-draft { display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: start; gap: 10px; padding: 9px; border: 1px solid var(--border); border-radius: 4px; background: var(--panel-soft); min-width: 0; }
.image-draft img { width: 64px; height: 64px; object-fit: contain; background: #fff; border-radius: 3px; }
.image-draft-details { display: grid; gap: 4px; min-width: 0; }
.image-draft-actions { grid-column: 2; display: flex; flex-wrap: wrap; gap: 8px; }
.image-draft-actions .el-button { margin-left: 0; }
.image-draft strong { font-size: 12px; overflow-wrap: anywhere; }
.image-draft span, .image-draft small { color: var(--muted); font-size: 11px; }
.image-error { margin: 0; color: var(--red); font-size: 12px; line-height: 1.5; }
.composer-help { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.6; }
@media (max-width: 600px) { .image-draft-actions { grid-column: 1 / -1; } }

.context-column { display: grid; gap: 16px; }
.patient-context :deep(.detail-list) { display: none; }
.summary-list { display: grid; gap: 9px; margin: 0; padding: 0; list-style: none; }
.summary-list li { padding-bottom: 9px; border-bottom: 1px solid var(--border); font-size: 12px; line-height: 1.65; }
.summary-list li:last-child { border-bottom: 0; }
.updated-line { margin: 10px 0 0; color: var(--green); font-size: 11px; }
.assist-actions { display: flex; gap: 7px; margin-top: 13px; }

@media (max-width: 1280px) { .consultation-layout { grid-template-columns: 230px minmax(430px, 1fr); } .context-column { position: static; grid-column: 1 / -1; grid-template-columns: 1fr 1fr; } }
@media (max-width: 900px) { .consultation-layout { grid-template-columns: 1fr; } .session-panel, .context-column { position: static; } .session-list { grid-template-columns: repeat(2, 1fr); } .context-column { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .session-list { grid-template-columns: 1fr; } .chat-body { height: 430px; padding: 12px; } .composer-actions { align-items: flex-end; } .composer-actions > span { display: none; } .composer-actions > div { width: 100%; justify-content: flex-end; } }
</style>
