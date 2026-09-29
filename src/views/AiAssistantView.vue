<script setup lang="ts">
import { computed, onMounted, reactive, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ClipboardPlus, FilePlus2, SearchCheck, ShieldAlert, Sparkles } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { useAuthStore } from '@/stores/auth'
import { useClinicalStore } from '@/stores/clinical'
import { clinicalAiService, type ClinicalDraftSuggestion, type ConsultationSummary, type OrderSafetyCheck, type SimilarCaseResult } from '@/services/clinical-ai'
import type { MedicalOrder } from '@/types/clinical'

type Task = 'emr' | 'summary' | 'cases' | 'order'
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const clinicalStore = useClinicalStore()
const taskOptions = [
  { value: 'emr' as const, title: 'Record Draft', description: 'Structure the consultation into an editable draft', icon: ClipboardPlus },
  { value: 'summary' as const, title: 'Consultation Summary', description: 'Review complaints, history, and follow-up notes', icon: Sparkles },
  { value: 'cases' as const, title: 'Similar Records', description: 'Find comparable synthetic records', icon: SearchCheck },
  { value: 'order' as const, title: 'Order Safety Check', description: 'Review documented allergies and unchecked risks', icon: ShieldAlert },
]
const initialTask = typeof route.query.task === 'string' && taskOptions.some(item => item.value === route.query.task) ? route.query.task as Task : 'emr'
const form = reactive({
  task: initialTask,
  patientId: typeof route.query.patient === 'string' ? route.query.patient : clinicalStore.selectedPatientId,
  consultationId: '',
  notes: '',
  similarityQuery: '',
  orderType: 'Medication' as MedicalOrder['type'],
  orderContent: '',
  ingredient: '',
  approvalNumber: '',
  route: '',
  doseValue: null as number | null,
  doseUnit: 'mg' as 'mg' | 'g' | 'mcg',
  frequencyPerDay: null as number | null,
  currentMedications: [] as string[],
  medicationListConfirmed: false,
  egfr: null as number | null,
})
let initialPatientSelection = true
const requestedSessionUnavailable = shallowRef(false)
const busy = shallowRef(false)
const draft = shallowRef<ClinicalDraftSuggestion | null>(null)
const summary = shallowRef<ConsultationSummary | null>(null)
const cases = shallowRef<SimilarCaseResult | null>(null)
const orderCheck = shallowRef<OrderSafetyCheck | null>(null)
const draftFields = reactive({ chiefComplaint: '', presentIllness: '', diagnosis: '' })

const actor = computed(() => ({ name: authStore.profile.name, role: authStore.roleLabel, department: authStore.profile.department }))
const canOperate = computed(() => authStore.currentRole !== 'admin')
const patient = computed(() => clinicalStore.patients.find(item => item.id === form.patientId))
const consultations = computed(() => clinicalStore.consultations.filter(item => item.patientId === form.patientId))
const consultation = computed(() => consultations.value.find(item => item.id === form.consultationId))
const activeTask = computed(() => taskOptions.find(item => item.value === form.task)!)
const orderRisk = computed(() => {
  if (!orderCheck.value) return null
  if (orderCheck.value.findings.some(item => item.severity === 'critical')) return { label: 'High risk', conclusion: 'Hold this order until the identified risk and product are reviewed.', type: 'danger' as const }
  if (orderCheck.value.findings.length) return { label: 'Review required', conclusion: 'Potential safety concerns require physician assessment.', type: 'warning' as const }
  return { label: 'Safety review incomplete', conclusion: 'No direct conflict was detected, but missing data and knowledge prevent a safety conclusion.', type: 'warning' as const }
})
const canRun = computed(() => {
  if (!canOperate.value || !patient.value || busy.value) return false
  if (form.task === 'cases') return form.similarityQuery.trim().length >= 5
  if (form.task === 'order') return true
  return Boolean(consultation.value || form.notes.trim())
})

function clearResult() {
  draft.value = null
  summary.value = null
  cases.value = null
  orderCheck.value = null
}

watch(() => form.patientId, id => {
  clinicalStore.selectPatient(id)
  const requested = initialPatientSelection && typeof route.query.session === 'string' ? route.query.session : undefined
  initialPatientSelection = false
  const matchingSessions = clinicalStore.consultations.filter(item => item.patientId === id)
  form.consultationId = requested !== undefined
    ? matchingSessions.find(item => item.id === requested)?.id ?? ''
    : matchingSessions[0]?.id ?? ''
  requestedSessionUnavailable.value = requested !== undefined && !form.consultationId
  const current = patient.value
  form.similarityQuery = [current?.diseaseTags.join(' '), current?.symptoms].filter(Boolean).join(' ').slice(0, 500)
  form.currentMedications = []
  form.medicationListConfirmed = false
  form.egfr = null
  clearResult()
}, { immediate: true })
watch(form, clearResult, { deep: true })

function context() {
  if (!patient.value) throw new Error('Select a patient first.')
  return { patient: patient.value, consultation: consultation.value, additionalNotes: form.notes.trim() }
}

async function runTask() {
  if (!canRun.value) return
  if (form.task === 'order' && form.orderType !== 'Medication' && !form.orderContent.trim()) {
    ElMessage.warning('Enter the order details to check this non-medication order.')
    return
  }
  busy.value = true
  clearResult()
  try {
    if (form.task === 'emr') {
      draft.value = await clinicalAiService.generateRecordDraft({ ...context(), references: [] })
      Object.assign(draftFields, {
        chiefComplaint: draft.value.chiefComplaint,
        presentIllness: draft.value.presentIllness,
        diagnosis: draft.value.diagnosis,
      })
      await saveDraft()
    } else if (form.task === 'summary') {
      summary.value = await clinicalAiService.summarizeConsultation(context())
    } else if (form.task === 'cases') {
      cases.value = await clinicalAiService.findSimilarCases(form.similarityQuery.trim())
    } else {
      orderCheck.value = await clinicalAiService.checkOrder({
        patient: { ...patient.value!, currentMedications: form.currentMedications, medicationListConfirmed: form.medicationListConfirmed, ...(form.egfr !== null ? { egfr: form.egfr } : {}) },
        order: { type: form.orderType, content: form.orderContent.trim(), ...(form.orderType === 'Medication' ? { medication: { ingredient: form.ingredient.trim(), approvalNumber: form.approvalNumber.trim(), route: form.route.trim(), dose: { value: form.doseValue, unit: form.doseUnit }, frequencyPerDay: form.frequencyPerDay } } : {}) },
      })
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'The assistant could not complete this task.')
  } finally {
    busy.value = false
  }
}

async function saveDraft() {
  if (!draft.value || !patient.value || !canOperate.value) return
  if (!draftFields.chiefComplaint.trim() || !draftFields.presentIllness.trim() || !draftFields.diagnosis.trim()) {
    ElMessage.warning('Complete the complaint, present illness, and preliminary diagnosis before saving.')
    return
  }
  busy.value = true
  try {
    const record = await clinicalStore.createAssistantRecord(form.patientId, { ...draftFields }, draft.value, actor.value)
    ElMessage.success('Draft saved. Review it in Medical Records before submission.')
    await router.push({ path: '/records', query: { record: record.id } })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'Unable to save the draft.')
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  try { await clinicalStore.loadPatients() }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : 'Unable to load patients.') }
})
</script>

<template>
  <div class="view-stack">
    <PageHeader title="AI Assistant" description="Clinical documentation and reference support for the selected patient">
      <el-button :icon="activeTask.icon" type="primary" :loading="busy" :disabled="!canRun" @click="runTask">{{ form.task === 'emr' ? 'Create Record Draft' : `Run ${activeTask.title}` }}</el-button>
    </PageHeader>

    <el-alert v-if="!canOperate" title="Administrators can view this workspace but cannot run clinical tasks." type="warning" show-icon :closable="false" />

    <section class="assistant-layout">
      <aside class="panel task-panel">
        <div class="panel-header"><div><h2 class="panel-title">Assistant Task</h2><p class="panel-subtitle">Choose a clinical workflow</p></div></div>
        <div class="task-list">
          <button v-for="task in taskOptions" :key="task.value" type="button" :class="{ active: form.task === task.value }" @click="form.task = task.value">
            <component :is="task.icon" :size="18" />
            <span><strong>{{ task.title }}</strong><small>{{ task.description }}</small></span>
          </button>
        </div>
      </aside>

      <main class="assistant-main">
        <section class="panel context-panel">
          <div class="panel-header"><div><h2 class="panel-title">Patient & Consultation</h2><p class="panel-subtitle">Current patient context for this task</p></div></div>
          <div class="panel-body">
            <div class="context-controls">
              <label><span>Patient</span><el-select v-model="form.patientId" filterable placeholder="Select patient" style="width: 100%"><el-option v-for="item in clinicalStore.patients" :key="item.id" :label="`${item.name} · ${item.id}`" :value="item.id" /></el-select></label>
              <label v-if="form.task === 'emr' || form.task === 'summary'"><span>Consultation</span><el-select v-model="form.consultationId" placeholder="No linked consultation" style="width: 100%"><el-option v-for="item in consultations" :key="item.id" :label="`${item.complaint} · ${item.id}`" :value="item.id" /><el-option label="No linked consultation" value="" /></el-select></label>
            </div>
            <div v-if="patient" class="patient-facts">
              <span>{{ patient.age }} years</span><span>{{ patient.diagnosis || 'No recorded diagnosis' }}</span><span>Allergies: {{ patient.allergyStatus === 'known' ? patient.allergies.join(', ') : patient.allergyStatus === 'none' ? 'None recorded' : 'Unconfirmed' }}</span>
            </div>
          </div>
        </section>

        <section class="panel input-panel">
          <div class="panel-header"><div><h2 class="panel-title">{{ activeTask.title }}</h2><p class="panel-subtitle">{{ activeTask.description }}</p></div></div>
          <div class="panel-body input-body">
            <template v-if="form.task === 'emr' || form.task === 'summary'">
              <div v-if="consultation" class="transcript">
                <strong>Consultation {{ consultation.id }}</strong>
                <p v-for="message in consultation.messages" :key="message.id"><b>{{ message.sender === 'patient' ? 'Patient' : message.sender === 'doctor' ? 'Physician' : 'Assistant' }}:</b> {{ message.content }}</p>
              </div>
              <p v-else class="empty-note">{{ requestedSessionUnavailable ? 'The requested consultation is unavailable for this patient. Select a consultation or add physician notes to continue.' : 'No consultation is linked to this patient. Add physician notes to continue.' }}</p>
              <label class="field-label"><span>Physician notes</span><el-input v-model="form.notes" type="textarea" :rows="4" resize="none" maxlength="4000" show-word-limit placeholder="Add findings from the consultation or examination" :disabled="!canOperate" /></label>
            </template>
            <label v-else-if="form.task === 'cases'" class="field-label"><span>Clinical features for matching</span><el-input v-model="form.similarityQuery" type="textarea" :rows="3" resize="none" maxlength="500" show-word-limit :disabled="!canOperate" /></label>
            <template v-else>
              <div class="order-input">
                <label class="field-label"><span>Order type</span><el-select v-model="form.orderType" style="width: 100%" :disabled="!canOperate"><el-option v-for="type in ['Medication', 'Examination', 'Laboratory', 'Nursing']" :key="type" :label="type" :value="type" /></el-select></label>
                <label v-if="form.orderType === 'Medication'" class="field-label"><span>Generic ingredient</span><el-input v-model="form.ingredient" maxlength="200" placeholder="Enter the proposed medication ingredient" :disabled="!canOperate" /></label>
                <label v-else class="field-label"><span>Order details</span><el-input v-model="form.orderContent" maxlength="2000" placeholder="Describe the proposed order" :disabled="!canOperate" /></label>
              </div>
              <details v-if="form.orderType === 'Medication'" class="optional-details">
                <summary>Additional medication details</summary>
                <div class="medication-fields">
                <label class="field-label"><span>China approval number</span><el-input v-model="form.approvalNumber" maxlength="100" placeholder="Product approval number" :disabled="!canOperate" /></label>
                <label class="field-label"><span>Route</span><el-select v-model="form.route" placeholder="Select route" style="width: 100%" :disabled="!canOperate"><el-option label="Oral" value="oral" /><el-option label="Intravenous" value="intravenous" /><el-option label="Topical" value="topical" /><el-option label="Other" value="other" /></el-select></label>
                <label class="field-label"><span>Dose per administration</span><el-input-number v-model="form.doseValue" :min="0.001" :max="100000" :precision="3" :controls="false" style="width: 100%" :disabled="!canOperate" /></label>
                <label class="field-label"><span>Dose unit</span><el-select v-model="form.doseUnit" style="width: 100%" :disabled="!canOperate"><el-option label="mg" value="mg" /><el-option label="g" value="g" /><el-option label="mcg" value="mcg" /></el-select></label>
                <label class="field-label"><span>Administrations per day</span><el-input-number v-model="form.frequencyPerDay" :min="0.01" :max="24" :precision="2" :controls="false" style="width: 100%" :disabled="!canOperate" /></label>
                <label class="field-label current-medications"><span>Current medications (generic ingredients)</span><el-select v-model="form.currentMedications" multiple filterable allow-create default-first-option placeholder="Add one ingredient at a time" style="width: 100%" :disabled="!canOperate" /></label>
                <label class="field-label"><span>eGFR (mL/min/1.73 m²)</span><el-input-number v-model="form.egfr" :min="1" :max="200" :precision="1" :controls="false" style="width: 100%" :disabled="!canOperate" /></label>
                <label class="field-label current-medications"><span>Order notes</span><el-input v-model="form.orderContent" maxlength="2000" placeholder="Optional context" :disabled="!canOperate" /></label>
                <el-checkbox v-model="form.medicationListConfirmed" class="medication-confirm" :disabled="!canOperate">Current medication list confirmed with the patient or record</el-checkbox>
                </div>
              </details>
            </template>
            <div class="input-actions"><span v-if="form.task === 'cases'">Only clinical features are sent for matching. Results are synthetic examples.</span><span v-else-if="form.task === 'order'">A result marked incomplete does not establish medication safety.</span><span v-else-if="form.task === 'emr'">A draft is created automatically. Review and complete it in Medical Records.</span><span v-else>Review source notes and any missing information.</span><el-button :icon="activeTask.icon" type="primary" :loading="busy" :disabled="!canRun" @click="runTask">{{ form.task === 'emr' ? 'Create Record Draft' : `Run ${activeTask.title}` }}</el-button></div>
          </div>
        </section>

        <section class="panel result-panel">
          <div class="panel-header"><div><h2 class="panel-title">Result</h2><p class="panel-subtitle">Physician review is required before clinical use</p></div><el-tag v-if="draft || summary || cases || orderCheck" type="warning" effect="plain">Review required</el-tag></div>
          <div v-if="draft" class="panel-body result-body">
            <el-alert title="Draft only. No diagnosis or orders were inferred." type="warning" show-icon :closable="false" />
            <label class="field-label"><span>Chief Complaint</span><el-input v-model="draftFields.chiefComplaint" maxlength="500" /></label>
            <label class="field-label"><span>Present Illness</span><el-input v-model="draftFields.presentIllness" type="textarea" :rows="7" /></label>
            <label class="field-label"><span>Preliminary Diagnosis</span><el-input v-model="draftFields.diagnosis" maxlength="1000" /></label>
            <ul class="warning-list"><li v-for="warning in draft.safetyWarnings" :key="warning">{{ warning }}</li></ul>
            <div class="result-actions"><el-button :icon="FilePlus2" type="primary" :loading="busy" @click="saveDraft">Save Record Draft</el-button></div>
          </div>
          <div v-else-if="summary" class="panel-body summary-grid">
            <div><h3>Chief Complaint</h3><p>{{ summary.chiefComplaint }}</p></div>
            <div><h3>Recorded History</h3><p>{{ summary.recordedHistory }}</p></div>
            <div><h3>Existing Diagnosis</h3><p>{{ summary.existingDiagnosis }}</p></div>
            <div><h3>Patient Statements</h3><p v-for="(statement, index) in summary.patientStatements" :key="index">{{ statement }}</p><p v-if="!summary.patientStatements.length" class="muted">None recorded.</p></div>
            <div><h3>Physician Statements</h3><p v-for="(statement, index) in summary.clinicianStatements" :key="index">{{ statement }}</p><p v-if="!summary.clinicianStatements.length" class="muted">None recorded.</p></div>
            <div><h3>Follow-up Items</h3><p v-for="(item, index) in summary.followUpItems" :key="index">{{ item }}</p><p v-if="!summary.followUpItems.length" class="muted">No follow-up item identified. Review the full consultation.</p></div>
            <div v-if="summary.additionalNotes"><h3>Additional Notes</h3><p>{{ summary.additionalNotes }}</p></div>
            <div class="missing"><h3>Information to Verify</h3><p v-for="item in summary.missingInformation" :key="item">{{ item }}</p></div>
            <div v-if="summary.evidence?.length" class="source-excerpts"><h3>Source Excerpts</h3><p v-for="(item, index) in summary.evidence" :key="index"><b>{{ item.sourceId }}</b> {{ item.quote }}</p></div>
          </div>
          <div v-else-if="cases" class="case-list">
            <article v-for="item in cases.cases" :key="item.documentId"><div><strong>{{ item.title }}</strong><el-tag size="small" effect="plain">Synthetic · similarity {{ item.score.toFixed(2) }}</el-tag></div><p>{{ item.excerpt }}</p><small>{{ item.location || 'Record passage' }}</small></article>
            <p v-if="!cases.cases.length" class="empty-note">No synthetic cases were available for matching.</p>
            <div class="guidance-list"><h3>Related Guidance</h3><article v-for="item in cases.guidance" :key="item.documentId"><strong>{{ item.title }}</strong><p>{{ item.excerpt }}</p><a v-if="item.sourceUrl" :href="item.sourceUrl" target="_blank" rel="noopener noreferrer">Open source</a></article><p v-if="!cases.guidance.length" class="empty-note">No relevant approved guidance was found for these features.</p></div>
          </div>
          <div v-else-if="orderCheck" class="panel-body check-body">
            <div class="risk-summary"><el-tag :type="orderRisk?.type" effect="dark">{{ orderRisk?.label }}</el-tag><strong>{{ orderRisk?.conclusion }}</strong></div>
            <p class="catalog-version">{{ orderCheck.catalogVersion ? `Reviewed product rules: ${orderCheck.catalogVersion}` : 'No reviewed China product-rule catalog connected' }}. {{ orderCheck.interactionSource ? `Interaction source: ${orderCheck.interactionSource}.` : 'No interaction dataset connected.' }} This result never clears an order for prescribing.</p>
            <div v-if="orderCheck.findings.length"><h3>Alerts</h3><article v-for="(finding, index) in orderCheck.findings" :key="index" class="finding"><el-tag :type="finding.severity === 'critical' ? 'danger' : 'warning'" size="small">{{ finding.category }}</el-tag><p>{{ finding.message }}</p><a v-if="finding.evidence" :href="finding.evidence.url" target="_blank" rel="noopener noreferrer">{{ finding.evidence.title }} · {{ finding.evidence.version }} · reviewed {{ finding.evidence.reviewedAt }}</a><a v-else-if="finding.reference" :href="finding.reference.url" target="_blank" rel="noopener noreferrer">{{ finding.reference.title }} · preliminary reference, local pharmacy review pending</a></article></div>
            <div v-else><h3>Alerts</h3><p>No directly matched alert. This does not establish safety.</p></div>
            <div><h3>Documented Allergies</h3><p>{{ orderCheck.documentedAllergies.length ? orderCheck.documentedAllergies.join(', ') : 'No confirmed allergy list available.' }}</p></div>
            <div><h3>Checked</h3><p v-for="item in orderCheck.checked" :key="item">{{ item }}</p><p v-if="!orderCheck.checked.length">No safety domain was fully checked.</p></div>
            <div class="missing"><h3>Not Checked</h3><p v-for="item in orderCheck.notChecked" :key="item">{{ item }}</p><p v-if="!orderCheck.notChecked.length">No additional gaps recorded for the available rules; physician review is still required.</p></div>
            <div><h3>Physician Review</h3><p>{{ orderRisk?.type === 'danger' ? 'Do not proceed until the allergy or other critical finding, the exact product, and the patient history are verified. Consult pharmacy when needed.' : 'Confirm the exact product, complete medication list, relevant measurements, and indication before prescribing.' }}</p></div>
          </div>
          <div v-else class="empty-result"><component :is="activeTask.icon" :size="26" /><span>Select the clinical context and run the task.</span></div>
        </section>
      </main>
    </section>
  </div>
</template>

<style scoped>
.assistant-layout { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 16px; align-items: start; }
.task-panel { position: sticky; top: 80px; }.task-list { display: grid; }
.task-list button { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; width: 100%; min-height: 72px; padding: 12px 14px; border: 0; border-bottom: 1px solid var(--border); background: #fff; text-align: left; cursor: pointer; }
.task-list button:last-child { border-bottom: 0; }.task-list button:hover { background: var(--panel-soft); }.task-list button.active { color: var(--primary); background: #eef5f7; box-shadow: inset 3px 0 0 var(--primary); }
.task-list strong, .task-list small { display: block; }.task-list strong { color: var(--text-strong); font-size: 12px; }.task-list small { margin-top: 5px; color: var(--muted); font-size: 10px; line-height: 1.45; }
.assistant-main { display: grid; gap: 16px; min-width: 0; }.context-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.context-controls label, .field-label { display: grid; gap: 7px; color: var(--text-strong); font-size: 12px; font-weight: 600; }
.patient-facts { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 12px; color: var(--muted); font-size: 11px; }.patient-facts span + span { border-left: 1px solid var(--border); padding-left: 16px; }
.input-body, .result-body { display: grid; gap: 14px; }.transcript { max-height: 240px; overflow-y: auto; padding: 12px; border: 1px solid var(--border); background: var(--panel-soft); }.transcript strong { color: var(--text-strong); font-size: 12px; }.transcript p { margin: 9px 0 0; font-size: 11px; line-height: 1.55; }.transcript b { color: var(--primary); }
.empty-note { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }.input-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.input-actions span { color: var(--muted); font-size: 10px; line-height: 1.5; }.order-input { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 12px; }
.warning-list { margin: 0; padding-left: 19px; color: var(--amber); font-size: 11px; line-height: 1.65; }.result-actions { display: flex; justify-content: flex-end; }
.summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 22px; }.summary-grid > div { min-width: 0; }.summary-grid h3, .check-body h3 { margin: 0 0 6px; color: var(--text-strong); font-size: 12px; }.summary-grid p, .check-body p { margin: 4px 0; color: var(--text); font-size: 11px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }.missing { border-left: 3px solid var(--amber); padding-left: 10px; }
.source-excerpts { grid-column: 1 / -1; border-top: 1px solid var(--border); padding-top: 12px; }.source-excerpts b { color: var(--primary); margin-right: 5px; }
.case-list article { padding: 14px 18px; border-top: 1px solid var(--border); }.case-list article > div { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; }.case-list strong { color: var(--text-strong); font-size: 12px; }.case-list p { margin: 7px 0; font-size: 11px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }.case-list small { color: var(--muted); font-size: 10px; }.case-notice { margin: 0; padding: 12px 18px; color: var(--muted); font-size: 11px; }.case-list > .empty-note { padding: 18px; }
.guidance-list { border-top: 1px solid var(--border); }.guidance-list h3 { margin: 0; padding: 13px 18px; color: var(--text-strong); font-size: 12px; }.guidance-list a { color: var(--primary); font-size: 11px; }
.check-body { display: grid; gap: 14px; }.empty-result { display: grid; min-height: 165px; place-items: center; align-content: center; gap: 9px; color: var(--subtle); font-size: 12px; }
.medication-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }.current-medications { grid-column: span 2; }.medication-confirm { grid-column: 1 / -1; height: auto; white-space: normal; }.medication-confirm :deep(.el-checkbox__label) { white-space: normal; line-height: 1.4; }.catalog-version { margin: 0; color: var(--muted); font-size: 11px; }.finding { padding: 10px 0; border-bottom: 1px solid var(--border); }.finding a { color: var(--primary); font-size: 11px; }
.risk-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }.risk-summary strong { color: var(--text-strong); font-size: 13px; line-height: 1.5; }
.optional-details { border-top: 1px solid var(--border); padding-top: 12px; }.optional-details summary { width: fit-content; color: var(--primary); font-size: 12px; font-weight: 600; cursor: pointer; }.optional-details .medication-fields { margin-top: 14px; }
@media (max-width: 840px) { .assistant-layout { grid-template-columns: 1fr; }.task-panel { position: static; }.task-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }.task-list button:nth-child(odd) { border-right: 1px solid var(--border); } }
@media (max-width: 560px) { .task-list, .context-controls, .summary-grid, .order-input, .medication-fields { grid-template-columns: 1fr; }.current-medications { grid-column: auto; }.task-list button:nth-child(odd) { border-right: 0; }.input-actions { align-items: stretch; flex-direction: column; }.input-actions .el-button, .result-actions .el-button { width: 100%; }.patient-facts span + span { border-left: 0; padding-left: 0; } }
</style>
