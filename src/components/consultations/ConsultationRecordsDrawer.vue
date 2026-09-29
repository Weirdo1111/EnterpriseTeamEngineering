<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Search } from '@lucide/vue'
import type { ConsultationMessage, ConsultationSession } from '@/types/clinical'
import { searchConsultationRecords, validateConsultationDateRange } from '@/utils/consultation-search'
import type { ConsultationSearchFilters } from '@/utils/consultation-search'
import HighlightedText from './HighlightedText.vue'

const props = defineProps<{
  modelValue: boolean
  sessions: ConsultationSession[]
  patientNames: Record<string, string>
  disabled: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  open: [sessionId: string, messageId?: string, keyword?: string]
  closed: []
}>()

const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const filters = reactive<ConsultationSearchFilters>({ keyword: '', status: 'all', from: '', to: '' })
const sessionLimit = ref(10)
const messageLimits = reactive<Record<string, number>>({})
const keyword = computed(() => filters.keyword.trim())
const dateError = computed(() => validateConsultationDateRange(filters.from, filters.to))
const results = computed(() => dateError.value ? [] : searchConsultationRecords(
  props.sessions,
  filters,
  session => props.patientNames[session.patientId] ?? session.patientName,
))
const visibleResults = computed(() => results.value.slice(0, sessionLimit.value))
const messageCount = computed(() => results.value.reduce((count, result) => count + result.messages.length, 0))
const messageCountLabel = computed(() => keyword.value ? 'matching messages' : filters.from || filters.to ? 'messages in range' : 'messages')
const statusLabels = { waiting: 'Waiting', active: 'In Progress', completed: 'Completed' }
const statusOptions = [
  { value: 'all', label: 'All' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'active', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
] as const
const statusCounts = computed(() => {
  const counts = { all: props.sessions.length, waiting: 0, active: 0, completed: 0 }
  props.sessions.forEach(session => { counts[session.status]++ })
  return counts
})

function resetPagination() {
  sessionLimit.value = 10
  Object.keys(messageLimits).forEach(id => { delete messageLimits[id] })
}

function resetFilters() {
  Object.assign(filters, { keyword: '', status: 'all', from: '', to: '' })
  resetPagination()
}

watch(() => props.modelValue, opened => {
  if (opened) resetFilters()
}, { immediate: true })
watch(() => [filters.keyword, filters.status, filters.from, filters.to], resetPagination)

function openConversation(sessionId: string, messageId?: string) {
  if (props.disabled) return
  emit('open', sessionId, messageId, keyword.value || undefined)
  emit('update:modelValue', false)
}

function showMoreMessages(sessionId: string) {
  if (!props.disabled) messageLimits[sessionId] = (messageLimits[sessionId] ?? 3) + 5
}

function excerpt(text: string, limit = 220) {
  if (text.length <= limit) return text
  const match = keyword.value ? text.toLowerCase().indexOf(keyword.value.toLowerCase()) : -1
  const start = match < 0 ? 0 : Math.max(0, match - 65)
  const end = Math.min(text.length, start + limit)
  return `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

function senderLabel(message: ConsultationMessage) {
  return message.sender === 'doctor' ? 'Physician' : message.sender === 'patient' ? 'Patient' : 'AI Assistant'
}

function formatTime(value: string | null) {
  if (!value) return 'Date unavailable (sample record)'
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return `${value} (date unavailable)`
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? `${value} (date unavailable)` : new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function fileName(message: ConsultationMessage) {
  return message.image?.name ?? message.attachment ?? ''
}
</script>

<template>
  <el-drawer
    v-model="visible"
    append-to-body
    title="Consultation Records"
    size="min(620px, 100vw)"
    class="consultation-records-drawer"
    :show-close="!disabled"
    :close-on-click-modal="!disabled"
    :close-on-press-escape="!disabled"
    @closed="emit('closed')"
  >
    <div class="records-content">
      <p class="search-note">Search your consultations by patient, message, saved summary, or image filename. Image contents are not searched (no OCR). Date filters exclude older sample records without a full date.</p>

      <form class="record-filters" @submit.prevent>
        <fieldset class="status-filter" :disabled="disabled" aria-describedby="consultation-status-counts-note">
          <legend>Consultation status</legend>
          <div class="status-tabs">
            <label v-for="option in statusOptions" :key="option.value" class="status-tab" :class="{ selected: filters.status === option.value, disabled }">
              <input v-model="filters.status" type="radio" name="consultation-record-status" :value="option.value" :aria-label="option.label" :aria-describedby="`consultation-status-count-${option.value}`" :disabled="disabled" />
              <span class="status-tab-name">{{ option.label }}</span>
              <span :id="`consultation-status-count-${option.value}`" class="status-tab-count">{{ statusCounts[option.value] }}</span>
            </label>
          </div>
          <p id="consultation-status-counts-note" class="status-counts-note">Status counts include all saved consultations, before keyword and date filters.</p>
        </fieldset>
        <div class="filter-field keyword-field">
          <label for="consultation-record-keyword">Search records</label>
          <el-input id="consultation-record-keyword" v-model="filters.keyword" aria-label="Search consultation records" placeholder="Patient, ID, message, summary, or filename" clearable :disabled="disabled">
            <template #prefix><Search :size="16" /></template>
          </el-input>
        </div>
        <div class="filter-field">
          <label for="consultation-record-from">From date</label>
          <input id="consultation-record-from" v-model="filters.from" type="date" aria-label="From date" :aria-invalid="Boolean(dateError)" :aria-describedby="dateError ? 'consultation-record-date-error' : undefined" :disabled="disabled" />
        </div>
        <div class="filter-field">
          <label for="consultation-record-to">To date</label>
          <input id="consultation-record-to" v-model="filters.to" type="date" aria-label="To date" :aria-invalid="Boolean(dateError)" :aria-describedby="dateError ? 'consultation-record-date-error' : undefined" :disabled="disabled" />
        </div>
        <div class="filter-footer"><span>Dates use your local time zone.</span><el-button size="small" :disabled="disabled" @click="resetFilters()">Clear filters</el-button></div>
        <p v-if="filters.from || filters.to" class="date-help">Messages use their sent date; summaries use their last saved date. For patient or conversation details, any saved activity within the range qualifies.</p>
        <p v-if="dateError" id="consultation-record-date-error" class="date-error" role="alert">{{ dateError }}</p>
      </form>

      <p class="result-count" role="status" aria-live="polite">
        <template v-if="dateError">Correct the date range to search records.</template>
        <template v-else><strong>{{ results.length }}</strong> {{ results.length === 1 ? 'conversation' : 'conversations' }} · {{ messageCount }} {{ messageCountLabel }}</template>
      </p>

      <ol v-if="results.length" class="record-results" aria-label="Consultation search results">
        <li v-for="result in visibleResults" :key="result.session.id" class="record-card">
          <div class="record-heading">
            <h3><HighlightedText :text="result.patientName" :keyword="keyword" /></h3>
            <span class="record-status" :class="result.session.status">{{ statusLabels[result.session.status] }}</span>
          </div>
          <div class="record-identifiers"><span>Patient: <HighlightedText :text="result.session.patientId" :keyword="keyword" /></span><span>Session: <HighlightedText :text="result.session.id" :keyword="keyword" /></span></div>
          <p class="activity-date">Last dated activity: {{ formatTime(result.activityTime) }}</p>
          <p v-if="!patientNames[result.session.patientId]" class="metadata-note">Current patient profile unavailable. The displayed name is the saved consultation snapshot.</p>
          <p v-else-if="patientNames[result.session.patientId] !== result.session.patientName" class="metadata-note">Name at consultation creation (snapshot): {{ result.session.patientName }}</p>
          <p v-if="result.session.summary" class="saved-summary-note">Clinician summary saved · Open conversation to view</p>
          <p class="record-complaint"><HighlightedText :text="excerpt(result.session.complaint)" :keyword="keyword" /></p>
          <p v-if="keyword && result.metadataMatch" class="metadata-note">Matches conversation details.</p>
          <p v-if="result.summaryMatch" class="metadata-note">Matches the saved consultation summary. Open the conversation, then Consultation Summary to view it.</p>
          <div class="record-actions"><el-button size="small" :disabled="disabled" @click="openConversation(result.session.id)">Open conversation</el-button></div>

          <div v-if="result.messages.length" class="message-results">
            <p class="message-result-count">{{ result.messages.length }} {{ messageCountLabel }}</p>
            <button
              v-for="message in result.messages.slice(0, messageLimits[result.session.id] ?? 3)"
              :key="message.id"
              class="message-result"
              type="button"
              :disabled="disabled"
              :aria-label="`Open message from ${senderLabel(message)} in ${result.patientName}'s conversation`"
              @click="openConversation(result.session.id, message.id)"
            >
              <span class="message-result-meta"><strong>{{ senderLabel(message) }}</strong><span>{{ formatTime(message.time) }}</span></span>
              <span v-if="message.content" class="message-excerpt"><HighlightedText :text="excerpt(message.content)" :keyword="keyword" /></span>
              <span v-if="fileName(message)" class="message-filename">{{ message.image ? 'Image' : 'Attachment reference' }}: <HighlightedText :text="excerpt(fileName(message), 180)" :keyword="keyword" /></span>
              <span class="message-open-hint">View in conversation →</span>
            </button>
            <el-button v-if="result.messages.length > (messageLimits[result.session.id] ?? 3)" class="more-messages" text size="small" :disabled="disabled" @click="showMoreMessages(result.session.id)">
              Show {{ Math.min(5, result.messages.length - (messageLimits[result.session.id] ?? 3)) }} more messages
            </el-button>
          </div>
        </li>
      </ol>

      <div v-else-if="!dateError" class="empty-records">
        <strong>No matching consultation records</strong>
        <p>Try a different keyword or clear the filters to see all saved conversations.</p>
        <el-button :disabled="disabled" @click="resetFilters()">Clear filters</el-button>
      </div>

      <div v-if="results.length > visibleResults.length" class="more-records">
        <p>Showing {{ visibleResults.length }} of {{ results.length }} conversations</p>
        <el-button :disabled="disabled" @click="sessionLimit += 10">Show {{ Math.min(10, results.length - visibleResults.length) }} more conversations</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.records-content { display: grid; gap: 16px; min-width: 0; color: var(--text-strong); }
.search-note { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
.record-filters { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; padding: 14px; border: 1px solid var(--border); border-radius: 4px; background: var(--panel-soft); }
.status-filter { grid-column: 1 / -1; min-width: 0; margin: 0; padding: 0; border: 0; }
.status-filter legend { margin-bottom: 8px; padding: 0; color: var(--text-strong); font-size: 12px; font-weight: 600; }
.status-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.status-tab { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 5px; min-width: 0; min-height: 42px; padding: 7px; border: 1px solid var(--border-strong); border-radius: 4px; color: var(--muted); background: #fff; cursor: pointer; }
.status-tab input { position: absolute; width: 1px; height: 1px; margin: 0; opacity: 0; }
.status-tab:hover { border-color: #9dbfc8; background: #f3f9fa; }
.status-tab:focus-within { outline: 2px solid var(--primary); outline-offset: 2px; }
.status-tab.selected { border-color: #78a8b4; color: #215662; background: #e8f3f5; box-shadow: inset 0 -2px 0 #3a7988; }
.status-tab.disabled { cursor: not-allowed; opacity: .6; }
.status-tab-name { min-width: 0; font-size: 11px; font-weight: 600; line-height: 1.45; overflow-wrap: anywhere; }
.status-tab-count { min-width: 17px; padding: 2px 4px; border-radius: 3px; color: #49616a; background: #edf2f4; font-size: 10px; text-align: center; }
.status-tab.selected .status-tab-count { color: #215662; background: #d1e8ed; }
.status-counts-note { margin: 7px 0 0; color: var(--muted); font-size: 10px; line-height: 1.6; }
.filter-field { display: grid; gap: 6px; min-width: 0; }
.filter-field label { color: var(--text-strong); font-size: 12px; font-weight: 600; }
.keyword-field { grid-column: 1 / -1; }
.filter-field input { box-sizing: border-box; width: 100%; min-width: 0; min-height: 34px; padding: 5px 9px; border: 1px solid var(--border-strong); border-radius: 4px; color: var(--text-strong); background: #fff; font: inherit; font-size: 13px; }
.filter-field input:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.filter-field input:disabled { cursor: not-allowed; opacity: .65; }
.filter-footer { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 11px; }
.date-error { grid-column: 1 / -1; margin: 0; color: var(--red); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.date-help { grid-column: 1 / -1; margin: 0; color: var(--muted); font-size: 11px; line-height: 1.6; }
.result-count { margin: 0; color: var(--muted); font-size: 12px; }
.result-count strong { color: var(--text-strong); }
.record-results { display: grid; gap: 14px; min-width: 0; margin: 0; padding: 0; list-style: none; }
.record-card { min-width: 0; padding: 14px; border: 1px solid var(--border); border-radius: 5px; background: #fff; }
.record-heading { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 8px; }
.record-heading h3 { min-width: 0; margin: 0; color: var(--text-strong); font-size: 15px; line-height: 1.5; overflow-wrap: anywhere; }
.record-status { flex-shrink: 0; padding: 3px 7px; border: 1px solid #d5e3e8; border-radius: 3px; color: #345762; background: #f2f6f8; font-size: 10px; line-height: 1.4; }
.record-status.active { border-color: #b6d6d9; color: #216067; background: #edf6f6; }
.record-status.waiting { border-color: #e8d5ae; color: #775624; background: #fcf7ed; }
.record-identifiers { display: grid; gap: 3px; margin-top: 9px; color: var(--muted); font-size: 11px; line-height: 1.6; overflow-wrap: anywhere; }
.activity-date { margin: 6px 0 0; color: var(--muted); font-size: 11px; line-height: 1.6; overflow-wrap: anywhere; }
.saved-summary-note { margin: 5px 0 0; color: var(--green); font-size: 11px; line-height: 1.6; }
.record-complaint { margin: 10px 0 0; color: var(--text-strong); font-size: 13px; line-height: 1.65; overflow-wrap: anywhere; white-space: pre-wrap; }
.metadata-note { margin: 5px 0 0; color: var(--muted); font-size: 11px; }
.record-actions { margin-top: 12px; }
.message-results { display: grid; gap: 8px; min-width: 0; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); }
.message-result-count { margin: 0; color: var(--muted); font-size: 11px; }
.message-result { display: grid; gap: 6px; box-sizing: border-box; width: 100%; min-width: 0; padding: 10px; border: 1px solid #dbe6e9; border-radius: 4px; color: var(--text-strong); text-align: left; background: #f7fafb; font: inherit; cursor: pointer; }
.message-result:hover { border-color: #a8cbd3; background: #eff6f8; }
.message-result:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.message-result:disabled { cursor: not-allowed; opacity: .6; }
.message-result-meta { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 5px 12px; color: var(--muted); font-size: 10px; line-height: 1.6; overflow-wrap: anywhere; }
.message-result-meta strong { color: var(--text-strong); font-size: 11px; }
.message-excerpt { color: var(--text-strong); font-size: 12px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
.message-filename { color: #36606b; font-size: 11px; line-height: 1.6; overflow-wrap: anywhere; }
.message-open-hint { color: var(--primary); font-size: 11px; }
.more-messages { justify-self: start; max-width: 100%; }
.empty-records { display: grid; justify-items: center; gap: 10px; padding: 32px 16px; border: 1px dashed var(--border-strong); border-radius: 4px; text-align: center; }
.empty-records strong { font-size: 14px; }
.empty-records p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
.more-records { display: grid; justify-items: center; gap: 8px; }
.more-records p { margin: 0; color: var(--muted); font-size: 11px; }
:global(.consultation-records-drawer .el-drawer__body) { min-width: 0; padding: 0 20px 24px; }
:global(.consultation-records-drawer .el-drawer__header) { margin-bottom: 18px; }
@media (max-width: 600px) { .status-tabs { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 420px) { .record-filters { grid-template-columns: minmax(0, 1fr); } .record-card, .record-filters { padding: 12px; } :global(.consultation-records-drawer .el-drawer__body) { padding: 0 14px 20px; } }
</style>
