<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowReactive, shallowRef, watch } from 'vue'
import { ImagePlus } from '@lucide/vue'
import { prepareConsultationImage } from '@/services/consultation-images'
import type { ConsultationImage, ConsultationSession } from '@/types/clinical'

interface RequestInput {
  clientRequestId: string
  patientId: string
  patientName: string
  complaint: string
  content: string
}
interface ReplyInput {
  content: string
  clientMessageId: string
  image?: ConsultationImage
  blob?: Blob
}
const props = defineProps<{
  patients: Array<{ id: string; name: string }>
  session?: ConsultationSession
  disabled: boolean
  createRequest: (input: RequestInput) => Promise<void>
  receiveMessage: (id: string, input: ReplyInput) => Promise<void>
}>()
const emit = defineEmits<{ dirty: [value: boolean] }>()

type ImageDraft = Awaited<ReturnType<typeof prepareConsultationImage>>
interface ReplyDraft { content: string; error: string; imageError: string; success: string }
interface Attempt { key: string; id: string }
interface ReplyTarget { id: string; patientId: string; patientName: string; complaint: string }

const drawerVisible = ref(false)
const activeTab = ref('new')
const submitting = ref<'request' | 'reply' | ''>('')
const preparingSessionId = ref('')
const requestForm = reactive({ patientId: '', complaint: '', content: '' })
const requestErrors = ref<Partial<Record<keyof typeof requestForm, string>>>({})
const requestError = ref('')
const requestSuccess = ref('')
const requestAttempt = shallowRef<Attempt>()
const replyDrafts = reactive<Record<string, ReplyDraft>>({})
const replyImages = shallowReactive<Record<string, ImageDraft>>({})
const replyAttempts = new Map<string, Attempt>()
const replyTarget = shallowRef<ReplyTarget>()
const imageInput = ref<HTMLInputElement>()
let disposed = false

const working = computed(() => Boolean(submitting.value || preparingSessionId.value))
const blocked = computed(() => props.disabled || working.value)
const selectedPatient = computed(() => props.patients.find(patient => patient.id === requestForm.patientId))
const currentReply = computed(() => replyTarget.value ? replyDrafts[replyTarget.value.id] : undefined)
const currentImage = computed(() => replyTarget.value ? replyImages[replyTarget.value.id] : undefined)
const targetIsCurrent = computed(() => Boolean(replyTarget.value && replyTarget.value.id === props.session?.id))
const replyCompleted = computed(() => targetIsCurrent.value && props.session?.status === 'completed')
const canReply = computed(() => targetIsCurrent.value && !replyCompleted.value && !blocked.value)
const replyHasDraft = computed(() => Boolean(currentReply.value?.content.trim() || currentImage.value))
const hasDraft = computed(() => Boolean(
  requestForm.patientId || requestForm.complaint.trim() || requestForm.content.trim() || preparingSessionId.value
  || Object.values(replyDrafts).some(draft => draft.content.trim()) || Object.keys(replyImages).length,
))

watch(hasDraft, value => { if (!disposed) emit('dirty', value) }, { flush: 'sync' })
watch(() => [requestForm.patientId, requestForm.complaint, requestForm.content], () => { requestSuccess.value = '' }, { flush: 'sync' })
watch(() => props.session?.id, id => {
  if (drawerVisible.value && activeTab.value === 'reply' && replyTarget.value?.id !== id) drawerVisible.value = false
})
watch(activeTab, tab => { if (tab === 'reply') captureReplyTarget() })

function captureReplyTarget() {
  const session = props.session
  if (!session) { replyTarget.value = undefined; return }
  replyTarget.value = {
    id: session.id,
    patientId: session.patientId,
    patientName: props.patients.find(patient => patient.id === session.patientId)?.name ?? session.patientName,
    complaint: session.complaint,
  }
  replyDrafts[session.id] ??= { content: '', error: '', imageError: '', success: '' }
}

function openTools() {
  if (blocked.value) return
  captureReplyTarget()
  drawerVisible.value = true
}

function closeTools(done?: () => void) {
  if (working.value) return
  drawerVisible.value = false
  done?.()
}

function clearImage(id: string) {
  const image = replyImages[id]
  if (image) URL.revokeObjectURL(image.previewUrl)
  delete replyImages[id]
  if (replyDrafts[id]) replyDrafts[id]!.imageError = ''
}

function clearRequest() {
  Object.assign(requestForm, { patientId: '', complaint: '', content: '' })
  requestErrors.value = {}
  requestError.value = ''
  requestSuccess.value = ''
  requestAttempt.value = undefined
}

function clearReply(id: string) {
  clearImage(id)
  replyDrafts[id] = { content: '', error: '', imageError: '', success: '' }
  replyAttempts.delete(id)
}

function clearActiveForm() {
  if (blocked.value) return
  if (activeTab.value === 'new') clearRequest()
  else if (replyTarget.value) clearReply(replyTarget.value.id)
}

function updateReply(value: string) {
  const draft = currentReply.value
  if (!draft || blocked.value) return
  draft.content = value
  draft.success = ''
}

async function createDemoRequest() {
  if (blocked.value) return
  const errors: typeof requestErrors.value = {}
  if (!selectedPatient.value) errors.patientId = 'Select a patient from the list.'
  if (!requestForm.complaint.trim()) errors.complaint = 'Enter a chief complaint for this demo request.'
  else if (requestForm.complaint.length > 1000) errors.complaint = 'The chief complaint must contain at most 1000 characters.'
  if (!requestForm.content.trim()) errors.content = 'Enter the patient’s opening message.'
  else if (requestForm.content.length > 5000) errors.content = 'The opening message must contain at most 5000 characters.'
  requestErrors.value = errors
  requestError.value = ''
  requestSuccess.value = ''
  if (Object.keys(errors).length || !selectedPatient.value) return

  const formSnapshot = JSON.stringify(requestForm)
  const input = {
    patientId: selectedPatient.value.id,
    patientName: selectedPatient.value.name,
    complaint: requestForm.complaint.trim(),
    content: requestForm.content.trim(),
  }
  const key = JSON.stringify(input)
  submitting.value = 'request'
  try {
    const attempt = requestAttempt.value?.key === key ? requestAttempt.value : { key, id: crypto.randomUUID() }
    requestAttempt.value = attempt
    await props.createRequest({ ...input, clientRequestId: attempt.id })
    if (disposed) return
    if (JSON.stringify(requestForm) === formSnapshot) clearRequest()
    requestSuccess.value = 'Local demo request created. Find it in the consultation queue.'
  } catch (error) {
    if (!disposed) requestError.value = error instanceof Error && error.message.trim()
      ? error.message : 'The demo request could not be saved. Your input has been kept; please retry.'
  } finally { submitting.value = '' }
}

async function choosePatientImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const target = replyTarget.value
  if (!file || !target || !canReply.value) return
  const id = target.id
  const draft = replyDrafts[id]!
  preparingSessionId.value = id
  draft.imageError = ''
  draft.success = ''
  try {
    const prepared = await prepareConsultationImage(file)
    if (disposed) { URL.revokeObjectURL(prepared.previewUrl); return }
    // Keep the attachment with the captured patient, even if the selected conversation changed during decoding.
    clearImage(id)
    replyImages[id] = prepared
  } catch (error) {
    if (!disposed) draft.imageError = error instanceof Error && error.message.trim()
      ? error.message : 'Unable to prepare this image. Select another file and try again.'
  } finally { preparingSessionId.value = '' }
}

function removePatientImage() {
  if (blocked.value || !replyTarget.value) return
  clearImage(replyTarget.value.id)
  if (currentReply.value) currentReply.value.success = ''
}

async function simulateReply() {
  const target = replyTarget.value
  const draft = currentReply.value
  if (!target || !draft || !canReply.value || props.session?.id !== target.id) return
  const id = target.id
  const content = draft.content.trim()
  const image = replyImages[id]
  draft.error = ''
  draft.success = ''
  if (!content && !image) { draft.error = 'Enter patient reply text or choose one image.'; return }
  if (draft.content.length > 5000) { draft.error = 'The patient reply must contain at most 5000 characters.'; return }
  const submittedContent = draft.content
  const key = JSON.stringify({ content, imageId: image?.image.id })
  submitting.value = 'reply'
  try {
    const previous = replyAttempts.get(id)
    const attempt = previous?.key === key ? previous : { key, id: crypto.randomUUID() }
    replyAttempts.set(id, attempt)
    const input: ReplyInput = { content, clientMessageId: attempt.id }
    if (image) { input.image = { ...image.image }; input.blob = image.blob }
    await props.receiveMessage(id, input)
    if (disposed) return
    if (replyDrafts[id]?.content === submittedContent && replyImages[id]?.image.id === image?.image.id) clearReply(id)
    if (replyDrafts[id]) replyDrafts[id]!.success = 'Patient reply saved locally in this conversation.'
  } catch (error) {
    if (!disposed && replyDrafts[id]) replyDrafts[id]!.error = error instanceof Error && error.message.trim()
      ? error.message : 'The patient reply could not be saved. Your text and image have been kept; please retry.'
  } finally { submitting.value = '' }
}

onBeforeUnmount(() => {
  disposed = true
  Object.keys(replyImages).forEach(clearImage)
})
</script>

<template>
  <el-button :disabled="blocked" @click="openTools">Demo Tools</el-button>
  <el-drawer
    v-model="drawerVisible"
    title="Demo Tools"
    size="min(620px, 100vw)"
    class="consultation-demo-drawer"
    append-to-body
    :before-close="closeTools"
    :show-close="!working"
    :close-on-click-modal="!working"
    :close-on-press-escape="!working"
  >
    <div class="demo-content">
      <div class="demo-notice"><strong>Local patient simulation</strong><p>Create fictional requests and patient replies for testing. They are saved only in this browser; these tools do not connect to a real patient app.</p></div>
      <el-tabs v-model="activeTab" class="demo-tabs">
        <el-tab-pane label="New request" name="new" :disabled="blocked">
          <p class="demo-help">Choose a demo patient and write their request. A new waiting consultation will appear in the queue.</p>
          <el-alert v-if="requestError" title="Demo request was not saved" type="error" :closable="false" show-icon><p class="error-detail">{{ requestError }} Your input has been kept.</p></el-alert>
          <p v-if="requestSuccess" class="demo-success" role="status">{{ requestSuccess }}</p>
          <el-form label-position="top" :disabled="blocked" @submit.prevent="createDemoRequest">
            <el-form-item label="Patient" required :error="requestErrors.patientId">
              <el-select v-model="requestForm.patientId" aria-label="Demo request patient" filterable clearable placeholder="Search patient name or ID">
                <el-option v-for="patient in patients" :key="patient.id" :value="patient.id" :label="`${patient.name} (${patient.id})`" />
              </el-select>
            </el-form-item>
            <el-form-item label="Chief complaint" required :error="requestErrors.complaint"><el-input v-model="requestForm.complaint" aria-label="Demo chief complaint" type="textarea" :rows="2" :maxlength="1000" show-word-limit /></el-form-item>
            <el-form-item label="Opening message" required :error="requestErrors.content"><el-input v-model="requestForm.content" aria-label="Demo opening message" type="textarea" :rows="5" :maxlength="5000" show-word-limit /></el-form-item>
            <el-button type="primary" :loading="submitting === 'request'" :disabled="blocked || !patients.length" @click="createDemoRequest">{{ requestError ? 'Retry Create Request' : 'Create Demo Request' }}</el-button>
          </el-form>
          <p v-if="!patients.length" class="demo-help">No patients are available. Create a patient profile before starting a demo request.</p>
        </el-tab-pane>

        <el-tab-pane label="Patient reply" name="reply" :disabled="blocked">
          <template v-if="replyTarget && currentReply">
            <div class="reply-target"><strong>{{ replyTarget.patientName }}</strong><span>Patient: {{ replyTarget.patientId }}</span><span>Session: {{ replyTarget.id }}</span><p>{{ replyTarget.complaint }}</p></div>
            <p v-if="!targetIsCurrent" class="demo-help" role="alert">The selected conversation changed. Close and reopen Demo Tools to target the current conversation.</p>
            <p v-else-if="replyCompleted" class="demo-help">This consultation is completed. Patient replies cannot be added. Select a waiting or active consultation to continue.</p>
            <p v-else class="demo-help">Write a simulated patient message for the conversation shown above. You can include text, one image, or both.</p>
            <el-alert v-if="currentReply.error" title="Patient reply was not saved" type="error" :closable="false" show-icon><p class="error-detail">{{ currentReply.error }} Your input has been kept.</p></el-alert>
            <p v-if="currentReply.success" class="demo-success" role="status">{{ currentReply.success }}</p>
            <el-form label-position="top" @submit.prevent="simulateReply">
              <el-form-item label="Patient reply"><el-input :model-value="currentReply.content" aria-label="Demo patient reply" type="textarea" :rows="5" :maxlength="5000" show-word-limit :disabled="!canReply" @update:model-value="updateReply" /></el-form-item>
              <div v-if="currentImage" class="demo-image-preview" aria-label="Patient image ready to send">
                <img :src="currentImage.previewUrl" :alt="`Patient reply preview: ${currentImage.image.name}`" />
                <div class="demo-image-details"><strong>{{ currentImage.image.name }}</strong><span>{{ currentImage.image.width }} × {{ currentImage.image.height }} px · {{ (currentImage.image.size / 1024).toFixed(1) }} KB</span><small>Not sent yet</small></div>
                <div class="demo-image-actions" role="group" aria-label="Patient image actions">
                  <el-button size="small" :icon="ImagePlus" :loading="Boolean(preparingSessionId)" :disabled="!canReply" @click="imageInput?.click()">Replace Image</el-button>
                  <el-button size="small" :disabled="blocked" @click="removePatientImage">Remove image</el-button>
                </div>
              </div>
              <p v-if="currentReply.imageError" class="demo-image-error" role="alert">{{ currentReply.imageError }}</p>
              <input ref="imageInput" class="demo-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose demo patient image" :disabled="!canReply" @change="choosePatientImage" />
              <p class="image-help">One JPEG, PNG, or WebP image · Up to 5 MiB / 24 megapixels.</p>
              <div class="reply-actions">
                <el-button v-if="!currentImage" :icon="ImagePlus" :loading="Boolean(preparingSessionId)" :disabled="!canReply" @click="imageInput?.click()">Add patient image</el-button>
                <el-button type="primary" :loading="submitting === 'reply'" :disabled="!canReply || !replyHasDraft" @click="simulateReply">{{ currentReply.error ? 'Retry Patient Reply' : 'Simulate Patient Reply' }}</el-button>
              </div>
            </el-form>
          </template>
          <p v-else class="demo-help">Select a consultation in the queue, then reopen Demo Tools to simulate a patient reply.</p>
        </el-tab-pane>
      </el-tabs>
    </div>
    <template #footer>
      <div class="demo-footer"><p>Unsent demo input stays on this page until you clear it, leave, or refresh.</p><div><el-button :disabled="blocked" @click="clearActiveForm">Clear form</el-button><el-button :disabled="working" @click="closeTools()">Close</el-button></div></div>
    </template>
  </el-drawer>
</template>

<style scoped>
.demo-content { display: grid; gap: 14px; min-width: 0; }
.demo-notice { padding: 12px; border: 1px solid #c8dfe4; border-radius: 4px; background: #eff7f8; }
.demo-notice strong { color: #285c68; font-size: 13px; }
.demo-notice p, .demo-help { margin: 6px 0 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
.demo-help { margin: 0 0 14px; }
.demo-tabs { min-width: 0; }
.demo-tabs :deep(.el-tabs__item) { font-size: 13px; }
.demo-tabs :deep(.el-select) { width: 100%; }
.demo-tabs :deep(.el-form-item__label) { color: var(--text-strong); font-size: 12px; }
.demo-tabs :deep(.el-alert) { margin-bottom: 14px; }
.error-detail { margin: 4px 0 0; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.demo-success { margin: 0 0 14px; color: var(--green); font-size: 12px; line-height: 1.7; }
.reply-target { display: grid; gap: 4px; margin-bottom: 12px; padding: 12px; border: 1px solid var(--border); border-radius: 4px; background: var(--panel-soft); overflow-wrap: anywhere; }
.reply-target strong { color: var(--text-strong); font-size: 14px; }
.reply-target span { color: var(--muted); font-size: 11px; }
.reply-target p { margin: 4px 0 0; color: var(--text-strong); font-size: 12px; line-height: 1.6; white-space: pre-wrap; }
.demo-image-preview { display: grid; grid-template-columns: 70px minmax(0, 1fr); align-items: center; gap: 9px 12px; margin-bottom: 12px; padding: 10px; border: 1px solid #c8dfe4; border-radius: 4px; background: #f3f9fa; }
.demo-image-preview img { display: block; width: 70px; height: 70px; object-fit: contain; border-radius: 3px; background: #fff; }
.demo-image-details { display: grid; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
.demo-image-preview strong { color: var(--text-strong); font-size: 12px; }
.demo-image-preview span, .demo-image-preview small { color: var(--muted); font-size: 11px; }
.demo-image-actions { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; min-width: 0; }
.demo-image-actions :deep(.el-button + .el-button) { margin-left: 0; }
.demo-image-error { margin: 0 0 10px; color: var(--red); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.demo-file-input { display: none; }
.image-help { margin: 0 0 12px; color: var(--muted); font-size: 11px; line-height: 1.6; }
.reply-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.reply-actions :deep(.el-button + .el-button), .demo-footer :deep(.el-button + .el-button) { margin-left: 0; }
.demo-footer { display: grid; gap: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
.demo-footer p { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.6; text-align: left; }
.demo-footer > div { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
:global(.consultation-demo-drawer .el-drawer__body) { min-width: 0; padding-top: 0; }
:global(.consultation-demo-drawer .el-drawer__header) { margin-bottom: 18px; }
@media (max-width: 420px) { :global(.consultation-demo-drawer .el-drawer__body), :global(.consultation-demo-drawer .el-drawer__footer) { padding-right: 14px; padding-left: 14px; } .reply-actions :deep(.el-button) { max-width: 100%; } }
</style>
