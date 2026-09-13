<script setup lang="ts">
import { computed, reactive, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ClipboardPlus, FilePlus2, SearchCheck, ShieldAlert, Sparkles } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { useAuthStore } from '@/stores/auth'
import { useClinicalStore } from '@/stores/clinical'

type AssistantTask = 'emr' | 'summary' | 'cases' | 'order'

const router = useRouter()
const authStore = useAuthStore()
const clinicalStore = useClinicalStore()
const loading = shallowRef(false)
const updatedAt = shallowRef('Generated from the current patient data')
const form = reactive<{ task: AssistantTask; prompt: string }>({
  task: 'emr',
  prompt: 'Jianguo Zhang, age 72, has hypertension and diabetes. Morning blood pressure is 152/94 mmHg, with head pressure, poor sleep, and a penicillin allergy.',
})

const actor = computed(() => ({ name: authStore.profile.name, role: authStore.roleLabel, department: authStore.profile.department }))
const canOperate = computed(() => authStore.currentRole !== 'admin')
const resultTitle = computed(() => form.task === 'summary' ? 'Consultation Summary' : form.task === 'cases' ? 'Similar Records' : form.task === 'order' ? 'Order Safety Check' : 'Structured Medical Record Draft')
const generatedContent = shallowRef([
  'Chief complaint: Elevated morning blood pressure with head pressure for two days.',
  'Present illness: History of hypertension and type 2 diabetes, recent poor sleep, and morning blood pressure around 152/94 mmHg.',
  'Initial assessment: Blood pressure is not adequately controlled; evaluate continuous home readings and medication adherence.',
  'Plan: Record morning and bedtime blood pressure for three days and repeat fasting glucose; a physician should review the results before adjusting treatment.',
])

const taskOptions = [
  { value: 'emr' as const, title: 'Record Draft', description: 'Create a structured record from consultation content', icon: ClipboardPlus },
  { value: 'summary' as const, title: 'Consultation Summary', description: 'Extract the complaint, history, and follow-up priorities', icon: Sparkles },
  { value: 'cases' as const, title: 'Similar Records', description: 'Find de-identified cases and relevant guidelines', icon: SearchCheck },
  { value: 'order' as const, title: 'Order Safety Check', description: 'Check allergies and geriatric medication risks', icon: ShieldAlert },
]

function selectTask(task: AssistantTask) {
  form.task = task
}

function generate() {
  if (!canOperate.value) return
  if (!form.prompt.trim()) {
    ElMessage.warning('Enter patient information or consultation content first.')
    return
  }
  loading.value = true
  window.setTimeout(() => {
    if (form.task === 'cases') {
      generatedContent.value = [
        'De-identified record 1: A patient with hypertension and sleep disturbance developed elevated morning blood pressure; follow-up frequency was adjusted after continuous monitoring.',
        'De-identified record 2: A patient with diabetes had fluctuating blood pressure; the long-term plan was adjusted after reviewing glucose and medication adherence.',
        'Reference point: A single blood pressure reading should not be used alone to adjust long-term medication.',
      ]
    } else if (form.task === 'order') {
      generatedContent.value = [
        'Allergy history: A penicillin allergy is documented; related medications should be avoided.',
        'Geriatric medication: When adjusting antihypertensive therapy, consider orthostatic hypotension and nighttime fall risk.',
        'Check result: No clear conflict was found, but formal orders must still be confirmed by a physician using examination results.',
      ]
    } else if (form.task === 'summary') {
      generatedContent.value = [
        'Chief complaint: Elevated morning blood pressure with head pressure.',
        'Relevant history: Hypertension, type 2 diabetes, and recent poor sleep.',
        'Known risks: Penicillin allergy and fluctuating morning blood pressure.',
        'Next step: Complete a three-day home blood pressure log and repeat fasting glucose.',
      ]
    } else {
      generatedContent.value = [
        'Chief complaint: Elevated morning blood pressure with head pressure for two days.',
        'Present illness: History of hypertension and type 2 diabetes, recent poor sleep, and morning blood pressure of 152/94 mmHg.',
        'Preliminary diagnosis: Suboptimally controlled hypertension; chronic disease follow-up.',
        'Plan: Monitor morning and bedtime blood pressure for three days, repeat fasting glucose, and assess medication adherence.',
      ]
    }
    updatedAt.value = 'Updated just now · Awaiting physician confirmation'
    clinicalStore.recordAudit(actor.value, `Used AI assistant: ${resultTitle.value}`, clinicalStore.selectedPatient.id, 'Pending Review')
    loading.value = false
    ElMessage.success('Assistant result generated.')
  }, 560)
}

function createDraft() {
  if (authStore.currentRole === 'admin') {
    ElMessage.warning('Administrators cannot create clinical records.')
    return
  }
  const record = clinicalStore.createAiRecord(actor.value)
  ElMessage.success('Content added to the record draft. Continue reviewing it.')
  router.push({ path: '/records', query: { record: record.id } })
}
</script>

<template>
  <div class="view-stack">
    <PageHeader title="AI Assistant" description="Organize consultation content, retrieve references, and check common risks without writing results directly to the official record">
      <el-button :icon="Sparkles" type="primary" :loading="loading" :disabled="!canOperate" @click="generate">Generate Result</el-button>
    </PageHeader>

    <p v-if="!canOperate" class="permission-note">You are viewing as an administrator. Administrators can inspect assistant activity and sources but cannot generate clinical content.</p>

    <section class="assistant-layout">
      <article class="panel task-panel">
        <div class="panel-header"><div><h2 class="panel-title">Assistant Task</h2><p class="panel-subtitle">Choose the content to process</p></div></div>
        <div class="task-list">
          <button v-for="task in taskOptions" :key="task.value" type="button" :class="{ active: form.task === task.value }" @click="selectTask(task.value)">
            <component :is="task.icon" :size="18" />
            <div><strong>{{ task.title }}</strong><span>{{ task.description }}</span></div>
          </button>
        </div>
      </article>

      <div class="assistant-main">
        <article class="panel input-panel">
          <div class="panel-header"><div><h2 class="panel-title">Input</h2><p class="panel-subtitle">Paste a patient summary, consultation dialogue, or proposed orders</p></div></div>
          <div class="panel-body"><el-input v-model="form.prompt" type="textarea" :rows="6" resize="none" :disabled="!canOperate" /><div class="input-foot"><span>Do not use generated content directly as a clinical conclusion</span><el-button :loading="loading" type="primary" :disabled="!canOperate" @click="generate">Process</el-button></div></div>
        </article>

        <article class="panel result-panel">
          <div class="panel-header"><div><h2 class="panel-title">{{ resultTitle }}</h2><p class="panel-subtitle">{{ updatedAt }}</p></div><el-tag type="warning" effect="plain">Awaiting Physician Confirmation</el-tag></div>
          <div class="panel-body result-body">
            <ol class="generated-list"><li v-for="item in generatedContent" :key="item">{{ item }}</li></ol>
            <div class="review-note"><ShieldAlert :size="17" /><div><strong>Review Required</strong><span>This result is based only on the input and demo references. A physician must assess it with the examination, test results, and complete history.</span></div></div>
            <div class="result-actions"><el-button :icon="FilePlus2" type="primary" :disabled="!canOperate" @click="createDraft">Add to Record Draft</el-button></div>
          </div>
        </article>

        <article class="panel source-panel">
          <div class="panel-header"><div><h2 class="panel-title">References</h2><p class="panel-subtitle">Sources and relevant excerpts used for this result</p></div></div>
          <div class="source-list">
            <div v-for="reference in clinicalStore.ragReferences" :key="reference.id">
              <el-tag size="small" effect="plain">{{ reference.kind }}</el-tag>
              <div><strong>{{ reference.title }}</strong><p>{{ reference.excerpt }}</p></div>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.permission-note { margin: 0; padding: 10px 13px; border: 1px solid #d6c28f; border-radius: var(--radius); color: #75551c; background: #fffaf0; font-size: 12px; }
.assistant-layout { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 16px; align-items: start; }
.task-panel { position: sticky; top: 80px; }
.task-list { display: grid; }
.task-list button { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; width: 100%; min-height: 76px; padding: 13px 15px; border: 0; border-bottom: 1px solid var(--border); color: var(--muted); text-align: left; background: #fff; cursor: pointer; }
.task-list button:last-child { border-bottom: 0; }
.task-list button:hover { background: var(--panel-soft); }
.task-list button.active { color: var(--primary); background: #eef5f7; box-shadow: inset 3px 0 0 var(--primary); }
.task-list strong, .task-list span { display: block; }
.task-list strong { color: var(--text-strong); font-size: 13px; }
.task-list span { margin-top: 5px; font-size: 10px; line-height: 1.45; }
.assistant-main { display: grid; gap: 16px; }
.input-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; }
.input-foot span { color: var(--muted); font-size: 10px; }
.result-body { display: grid; gap: 16px; }
.generated-list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; counter-reset: result; border-top: 1px solid var(--border); }
.generated-list li { position: relative; padding: 13px 10px 13px 38px; border-bottom: 1px solid var(--border); font-size: 13px; line-height: 1.7; counter-increment: result; }
.generated-list li::before { position: absolute; left: 8px; top: 14px; content: counter(result, decimal-leading-zero); color: var(--primary); font-size: 10px; font-weight: 700; }
.review-note { display: flex; gap: 9px; padding: 12px; border: 1px solid #d8c698; border-radius: 4px; color: var(--amber); background: #fffaf0; }
.review-note strong, .review-note span { display: block; }
.review-note strong { color: #6e501b; font-size: 12px; }
.review-note span { margin-top: 4px; color: var(--muted); font-size: 11px; line-height: 1.6; }
.result-actions { display: flex; justify-content: flex-end; }
.source-list { display: grid; }
.source-list > div { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 13px; padding: 13px 18px; border-bottom: 1px solid var(--border); }
.source-list > div:last-child { border-bottom: 0; }
.source-list strong { color: var(--text-strong); font-size: 12px; }
.source-list p { margin: 5px 0 0; color: var(--muted); font-size: 11px; line-height: 1.6; }
@media (max-width: 780px) { .assistant-layout { grid-template-columns: 1fr; } .task-panel { position: static; } .task-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } .task-list button:nth-child(odd) { border-right: 1px solid var(--border); } }
@media (max-width: 520px) { .task-list { grid-template-columns: 1fr; } .task-list button:nth-child(odd) { border-right: 0; } .input-foot { align-items: stretch; flex-direction: column; } }
</style>
