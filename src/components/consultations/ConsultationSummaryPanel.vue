<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CONSULTATION_SUMMARY_LIMITS } from '@/services/consultations'
import type { ConsultationSession, ConsultationSummary, ConsultationSummaryInput } from '@/types/clinical'

const props = defineProps<{
  session: ConsultationSession
  patientName: string
  canEdit: boolean
  busy: boolean
  saveSummary: (id: string, input: ConsultationSummaryInput) => Promise<void>
}>()
const emit = defineEmits<{ dirty: [sessionId: string, value: boolean] }>()

type SummaryField = keyof ConsultationSummaryInput
interface SummaryDraft {
  form: ConsultationSummaryInput
  baseline: ConsultationSummaryInput
  saved?: ConsultationSummary
  patientName: string
  status: ConsultationSession['status']
  errors: Partial<Record<SummaryField, string>>
  saveError: string
}

const fields: Array<{ key: SummaryField; label: string; required: boolean; rows: number }> = [
  { key: 'chiefComplaint', label: 'Chief complaint', required: true, rows: 2 },
  { key: 'consultationNotes', label: 'Consultation notes', required: true, rows: 5 },
  { key: 'assessment', label: 'Assessment', required: false, rows: 3 },
  { key: 'plan', label: 'Advice / plan', required: false, rows: 3 },
  { key: 'followUp', label: 'Follow-up', required: false, rows: 2 },
]
const drafts = reactive<Record<string, SummaryDraft>>({})
const reportedDirty = new Map<string, boolean>()
const drawerVisible = ref(false)
const editorSessionId = ref('')
const savingSessionId = ref('')
const confirmingDiscard = ref(false)

function copyInput(input: ConsultationSummaryInput): ConsultationSummaryInput {
  return {
    chiefComplaint: input.chiefComplaint,
    consultationNotes: input.consultationNotes,
    assessment: input.assessment,
    plan: input.plan,
    followUp: input.followUp,
  }
}

function initialInput(session: ConsultationSession): ConsultationSummaryInput {
  return session.summary ? copyInput(session.summary) : {
    chiefComplaint: session.complaint,
    consultationNotes: '',
    assessment: '',
    plan: '',
    followUp: '',
  }
}

function copySaved(summary?: ConsultationSummary): ConsultationSummary | undefined {
  return summary ? { ...copyInput(summary), authorName: summary.authorName, updatedAt: summary.updatedAt } : undefined
}

function fingerprint(input: ConsultationSummaryInput) { return JSON.stringify(copyInput(input)) }
function isDirty(draft?: SummaryDraft) { return Boolean(draft && fingerprint(draft.form) !== fingerprint(draft.baseline)) }

function reportDirty(id: string, value: boolean) {
  if ((reportedDirty.get(id) ?? false) === value) return
  reportedDirty.set(id, value)
  emit('dirty', id, value)
}

function syncCurrentSession() {
  const session = props.session
  const baseline = initialInput(session)
  const existing = drafts[session.id]
  drafts[session.id] = {
    form: existing && isDirty(existing) ? copyInput(existing.form) : copyInput(baseline),
    baseline: copyInput(baseline),
    saved: copySaved(session.summary),
    patientName: props.patientName,
    status: session.status,
    errors: existing?.errors ?? {},
    saveError: existing?.saveError ?? '',
  }
}

watch(() => [props.session.id, props.session.summary, props.session.complaint, props.session.status, props.patientName], () => {
  if (drawerVisible.value && editorSessionId.value !== props.session.id) drawerVisible.value = false
  syncCurrentSession()
}, { immediate: true, deep: true })

watch(() => Object.entries(drafts).map(([id, draft]) => [id, isDirty(draft)] as const), entries => {
  entries.forEach(([id, value]) => reportDirty(id, value))
}, { flush: 'sync' })

const currentDraft = computed(() => drafts[props.session.id])
const currentDirty = computed(() => isDirty(currentDraft.value))
const editorDraft = computed(() => drafts[editorSessionId.value])
const editorDirty = computed(() => isDirty(editorDraft.value))
const interactionBlocked = computed(() => props.busy || Boolean(savingSessionId.value) || confirmingDiscard.value)
const editorEditable = computed(() => props.session.id === editorSessionId.value && props.canEdit && editorDraft.value?.status === 'active')
const actionLabel = computed(() => props.canEdit ? props.session.summary ? 'Edit Summary' : 'Write Summary' : 'View Summary')
const panelStatus = computed(() => currentDirty.value ? 'Unsaved changes' : props.session.summary ? 'Saved' : 'Not recorded')
const editorStatus = computed(() => editorDirty.value ? 'Unsaved changes' : editorDraft.value?.saved ? 'Saved' : 'Not recorded')
const savedPreview = computed(() => {
  const notes = props.session.summary?.consultationNotes ?? ''
  return notes.length > 180 ? `${notes.slice(0, 180)}…` : notes
})

function readOnlyReason(status: ConsultationSession['status']) {
  if (status === 'waiting') return 'Accept the consultation before writing a summary.'
  if (status === 'completed') return 'This consultation is completed. Its saved summary is read-only.'
  return 'You have read-only access to this summary.'
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function openEditor() {
  if (interactionBlocked.value) return
  syncCurrentSession()
  editorSessionId.value = props.session.id
  drawerVisible.value = true
}

function closeEditor(done?: () => void) {
  if (interactionBlocked.value) return
  drawerVisible.value = false
  done?.()
}

function validateInput(input: ConsultationSummaryInput) {
  const errors: Partial<Record<SummaryField, string>> = {}
  fields.forEach(field => {
    const value = input[field.key].trim()
    if (field.required && !value) errors[field.key] = `Enter ${field.label.toLowerCase()}.`
    else if (input[field.key].length > CONSULTATION_SUMMARY_LIMITS[field.key]) {
      errors[field.key] = `${field.label} must contain at most ${CONSULTATION_SUMMARY_LIMITS[field.key]} characters.`
    }
  })
  return errors
}

async function save() {
  const id = editorSessionId.value
  const draft = drafts[id]
  if (!draft || !editorEditable.value || interactionBlocked.value) return
  const submittedDraft = copyInput(draft.form)
  draft.errors = validateInput(submittedDraft)
  draft.saveError = ''
  if (Object.keys(draft.errors).length) return
  const input = copyInput(submittedDraft)
  fields.forEach(field => { input[field.key] = input[field.key].trim() })
  const saveCallback = props.saveSummary
  savingSessionId.value = id
  try {
    await saveCallback(id, input)
    await nextTick()
    const latest = drafts[id]
    if (!latest) return
    const saved = props.session.id === id ? copySaved(props.session.summary) : undefined
    const baseline = saved ? copyInput(saved) : copyInput(input)
    // The request owns only the submitted draft; preserve any newer edits to this session.
    const form = fingerprint(latest.form) === fingerprint(submittedDraft) || fingerprint(latest.form) === fingerprint(baseline)
      ? copyInput(baseline)
      : copyInput(latest.form)
    drafts[id] = { ...latest, form, baseline, saved: saved ?? latest.saved, errors: {}, saveError: '' }
    const hasNewerChanges = isDirty(drafts[id])
    if (editorSessionId.value === id && props.session.id === id && !hasNewerChanges) {
      drawerVisible.value = false
    }
    ElMessage.success(hasNewerChanges ? 'Summary saved. Your newer changes are still unsaved.' : 'Summary saved.')
  } catch (error) {
    if (drafts[id]) drafts[id]!.saveError = error instanceof Error && error.message.trim()
      ? error.message
      : 'The summary could not be saved. Your changes are still here; please retry.'
  } finally {
    savingSessionId.value = ''
  }
}

async function discardChanges() {
  const id = editorSessionId.value
  if (!isDirty(drafts[id]) || interactionBlocked.value) return
  confirmingDiscard.value = true
  try {
    await ElMessageBox.confirm('Discard your unsaved summary changes for this consultation?', 'Discard summary changes', {
      confirmButtonText: 'Discard changes', cancelButtonText: 'Keep editing', type: 'warning',
    })
    const draft = drafts[id]
    if (draft) drafts[id] = { ...draft, form: copyInput(draft.baseline), errors: {}, saveError: '' }
  } catch { /* Keep the draft when the confirmation is dismissed. */ }
  finally { confirmingDiscard.value = false }
}

defineExpose({ openEditor })
</script>

<template>
  <article class="panel summary-panel">
    <div class="panel-header summary-header"><h2 class="panel-title">Consultation Summary</h2><span class="summary-status" :class="{ unsaved: currentDirty, saved: !!session.summary && !currentDirty }">{{ panelStatus }}</span></div>
    <div class="panel-body summary-body">
      <p class="summary-description">Written by the clinician; saved with this conversation.</p>
      <template v-if="session.summary">
        <p class="summary-author">{{ session.summary.authorName }} · {{ formatTime(session.summary.updatedAt) }}</p>
        <p class="summary-preview">{{ savedPreview }}</p>
      </template>
      <p v-else class="summary-empty">No summary has been recorded for this consultation.</p>
      <p v-if="!canEdit" class="read-only-note">{{ readOnlyReason(session.status) }}</p>
      <p v-if="currentDirty" class="unsaved-note">You have unsaved summary changes for this conversation.</p>
      <el-button size="small" :disabled="interactionBlocked" @click="openEditor">{{ actionLabel }}</el-button>
    </div>

    <el-drawer
      v-model="drawerVisible"
      append-to-body
      title="Consultation Summary"
      size="min(620px, 100vw)"
      class="consultation-summary-drawer"
      :before-close="closeEditor"
      :show-close="!interactionBlocked"
      :close-on-click-modal="!interactionBlocked"
      :close-on-press-escape="!interactionBlocked"
    >
      <div v-if="editorDraft" class="summary-editor">
        <div class="summary-context">
          <strong>{{ editorDraft.patientName }}</strong><span>Session: {{ editorSessionId }}</span>
          <span class="summary-status" :class="{ unsaved: editorDirty, saved: !!editorDraft.saved && !editorDirty }">{{ editorStatus }}</span>
        </div>
        <p class="summary-description">Written by the clinician; saved with this conversation.</p>
        <p v-if="editorDraft.saved" class="summary-author">{{ editorDraft.saved.authorName }} · {{ formatTime(editorDraft.saved.updatedAt) }}</p>

        <el-alert v-if="editorDraft.saveError" title="Summary was not saved" type="error" :closable="false" show-icon><p class="save-error">{{ editorDraft.saveError }} Your changes have been kept.</p></el-alert>

        <el-form v-if="editorEditable" label-position="top" :model="editorDraft.form" :disabled="interactionBlocked" @submit.prevent="save">
          <el-form-item v-for="field in fields" :key="field.key" :label="`${field.label}${field.required ? '' : ' (optional)'}`" :required="field.required" :error="editorDraft.errors[field.key]">
            <el-input v-model="editorDraft.form[field.key]" type="textarea" :aria-label="field.label" :rows="field.rows" :maxlength="CONSULTATION_SUMMARY_LIMITS[field.key]" show-word-limit resize="vertical" />
          </el-form-item>
        </el-form>
        <template v-else>
          <p class="read-only-note">{{ readOnlyReason(editorDraft.status) }}</p>
          <dl v-if="editorDraft.saved" class="saved-summary-fields"><div v-for="field in fields" :key="field.key"><dt>{{ field.label }}</dt><dd>{{ editorDraft.saved[field.key] || 'Not recorded' }}</dd></div></dl>
          <p v-else class="summary-empty readonly-empty">No summary has been recorded for this consultation.</p>
          <p v-if="editorDirty" class="unsaved-note">Your unsaved draft is retained, but cannot be submitted while this consultation is read-only.</p>
        </template>
      </div>
      <template #footer>
        <div class="summary-footer">
          <p>Unsubmitted changes stay here until you leave or refresh this page.</p>
          <div class="summary-footer-actions">
            <el-button v-if="editorDirty" :disabled="interactionBlocked" @click="discardChanges">Discard changes</el-button>
            <el-button :disabled="interactionBlocked" @click="closeEditor()">Close</el-button>
            <el-button v-if="editorEditable" type="primary" :loading="savingSessionId === editorSessionId" :disabled="interactionBlocked" @click="save">{{ editorDraft?.saveError ? 'Retry Save' : 'Save' }}</el-button>
          </div>
        </div>
      </template>
    </el-drawer>
  </article>
</template>

<style scoped>
.summary-header { flex-wrap: wrap; align-items: center; gap: 8px; }
.summary-body { display: grid; justify-items: start; gap: 10px; min-width: 0; }
.summary-description { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.summary-status { display: inline-block; justify-self: start; padding: 3px 6px; border: 1px solid #d4dfe3; border-radius: 3px; color: #526972; background: #f4f7f8; font-size: 10px; line-height: 1.5; }
.summary-status.saved { color: #27665f; border-color: #bfd9d2; background: #edf6f3; }
.summary-status.unsaved { color: #805d24; border-color: #e5d2ac; background: #fcf7eb; }
.summary-author { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.6; overflow-wrap: anywhere; }
.summary-preview { margin: 0; color: var(--text-strong); font-size: 12px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.summary-empty { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
.read-only-note { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.unsaved-note { margin: 0; color: #805d24; font-size: 11px; line-height: 1.6; }
.summary-editor { display: grid; gap: 14px; min-width: 0; }
.summary-context { display: grid; gap: 5px; padding: 12px; border: 1px solid #cbdfe4; border-radius: 4px; background: #f0f7f8; overflow-wrap: anywhere; }
.summary-context strong { color: var(--text-strong); font-size: 15px; }
.summary-context > span:not(.summary-status) { color: var(--muted); font-size: 11px; line-height: 1.6; }
.save-error { margin: 4px 0 0; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.saved-summary-fields { display: grid; gap: 14px; min-width: 0; margin: 0; }
.saved-summary-fields > div { padding-bottom: 12px; border-bottom: 1px solid var(--border); }
.saved-summary-fields dt { margin-bottom: 6px; color: var(--muted); font-size: 12px; font-weight: 600; }
.saved-summary-fields dd { margin: 0; color: var(--text-strong); font-size: 13px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.readonly-empty { padding: 20px 12px; border: 1px dashed var(--border-strong); border-radius: 4px; }
.summary-footer { display: grid; gap: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
.summary-footer > p { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.6; text-align: left; }
.summary-footer-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
.summary-footer-actions :deep(.el-button + .el-button) { margin-left: 0; }
:global(.consultation-summary-drawer .el-drawer__body) { min-width: 0; padding-top: 0; }
:global(.consultation-summary-drawer .el-drawer__header) { margin-bottom: 18px; }
.summary-editor :deep(.el-form-item__label) { color: var(--text-strong); font-size: 12px; }
@media (max-width: 420px) { :global(.consultation-summary-drawer .el-drawer__body), :global(.consultation-summary-drawer .el-drawer__footer) { padding-right: 14px; padding-left: 14px; } .summary-footer-actions :deep(.el-button) { max-width: 100%; } }
</style>
