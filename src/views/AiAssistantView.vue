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
const updatedAt = shallowRef('根据当前患者资料生成')
const form = reactive<{ task: AssistantTask; prompt: string }>({
  task: 'emr',
  prompt: '张建国，72 岁，高血压合并糖尿病。晨起血压 152/94mmHg，伴头胀、睡眠欠佳，青霉素过敏。',
})

const actor = computed(() => ({ name: authStore.profile.name, role: authStore.roleLabel, department: authStore.profile.department }))
const canOperate = computed(() => authStore.currentRole !== 'admin')
const resultTitle = computed(() => form.task === 'summary' ? '问诊摘要' : form.task === 'cases' ? '相似记录' : form.task === 'order' ? '医嘱风险核验' : '结构化病历草稿')
const generatedContent = shallowRef([
  '主诉：晨起血压升高伴头胀 2 天。',
  '现病史：既往高血压、2 型糖尿病，近期睡眠欠佳，晨起血压约 152/94mmHg。',
  '初步判断：血压控制欠佳，需结合连续家庭血压监测与用药依从性评估。',
  '处理建议：记录晨起及睡前血压三日，复查空腹血糖，由医生复核后决定是否调整方案。',
])

const taskOptions = [
  { value: 'emr' as const, title: '病历草稿', description: '从问诊内容整理结构化记录', icon: ClipboardPlus },
  { value: 'summary' as const, title: '问诊摘要', description: '提取主诉、病史与随访重点', icon: Sparkles },
  { value: 'cases' as const, title: '相似记录', description: '查找脱敏病例与相关指南', icon: SearchCheck },
  { value: 'order' as const, title: '医嘱核验', description: '核对过敏史和老年用药风险', icon: ShieldAlert },
]

function selectTask(task: AssistantTask) {
  form.task = task
}

function generate() {
  if (!canOperate.value) return
  if (!form.prompt.trim()) {
    ElMessage.warning('请先输入需要处理的患者资料或问诊内容')
    return
  }
  loading.value = true
  window.setTimeout(() => {
    if (form.task === 'cases') {
      generatedContent.value = [
        '脱敏记录一：高血压合并睡眠障碍患者出现晨峰血压升高，连续监测后调整随访频率。',
        '脱敏记录二：糖尿病患者血压波动，复核血糖和用药依从性后再调整长期方案。',
        '参考要点：单次血压读数不能直接作为长期用药调整依据。',
      ]
    } else if (form.task === 'order') {
      generatedContent.value = [
        '过敏史：患者记录青霉素过敏，相关药物应规避。',
        '老年用药：调整降压方案时需关注体位性低血压与夜间跌倒风险。',
        '核验结论：当前内容未发现明确冲突，正式医嘱仍需医生结合检查结果确认。',
      ]
    } else if (form.task === 'summary') {
      generatedContent.value = [
        '主诉：晨起血压偏高并伴头胀。',
        '相关病史：高血压、2 型糖尿病，近期睡眠欠佳。',
        '已知风险：青霉素过敏，晨峰血压波动。',
        '下一步：完成三日家庭血压记录并复查空腹血糖。',
      ]
    } else {
      generatedContent.value = [
        '主诉：晨起血压升高伴头胀 2 天。',
        '现病史：既往高血压、2 型糖尿病，近期睡眠欠佳，晨起血压 152/94mmHg。',
        '初步诊断：高血压控制欠佳；慢病随访。',
        '处理建议：连续三日监测晨起和睡前血压，复查空腹血糖，评估用药依从性。',
      ]
    }
    updatedAt.value = '刚刚更新 · 待医生确认'
    clinicalStore.recordAudit(actor.value, `使用智能辅助：${resultTitle.value}`, clinicalStore.selectedPatient.id, '待复核')
    loading.value = false
    ElMessage.success('辅助结果已生成')
  }, 560)
}

function createDraft() {
  if (authStore.currentRole === 'admin') {
    ElMessage.warning('管理员不能创建诊疗病历')
    return
  }
  const record = clinicalStore.createAiRecord(actor.value)
  ElMessage.success('内容已写入病历草稿，请继续核对')
  router.push({ path: '/records', query: { record: record.id } })
}
</script>

<template>
  <div class="view-stack">
    <PageHeader title="智能辅助" description="整理问诊内容、检索参考资料并核对常见风险，生成结果不直接写入正式病历">
      <el-button :icon="Sparkles" type="primary" :loading="loading" :disabled="!canOperate" @click="generate">生成结果</el-button>
    </PageHeader>

    <p v-if="!canOperate" class="permission-note">当前以管理员身份查看。管理员可检查辅助记录与参考来源，但不能生成诊疗内容。</p>

    <section class="assistant-layout">
      <article class="panel task-panel">
        <div class="panel-header"><div><h2 class="panel-title">辅助任务</h2><p class="panel-subtitle">选择当前需要处理的内容</p></div></div>
        <div class="task-list">
          <button v-for="task in taskOptions" :key="task.value" type="button" :class="{ active: form.task === task.value }" @click="selectTask(task.value)">
            <component :is="task.icon" :size="18" />
            <div><strong>{{ task.title }}</strong><span>{{ task.description }}</span></div>
          </button>
        </div>
      </article>

      <div class="assistant-main">
        <article class="panel input-panel">
          <div class="panel-header"><div><h2 class="panel-title">输入内容</h2><p class="panel-subtitle">可粘贴患者摘要、问诊对话或拟开医嘱</p></div></div>
          <div class="panel-body"><el-input v-model="form.prompt" type="textarea" :rows="6" resize="none" :disabled="!canOperate" /><div class="input-foot"><span>请勿将生成内容直接作为诊疗结论</span><el-button :loading="loading" type="primary" :disabled="!canOperate" @click="generate">开始处理</el-button></div></div>
        </article>

        <article class="panel result-panel">
          <div class="panel-header"><div><h2 class="panel-title">{{ resultTitle }}</h2><p class="panel-subtitle">{{ updatedAt }}</p></div><el-tag type="warning" effect="plain">待医生确认</el-tag></div>
          <div class="panel-body result-body">
            <ol class="generated-list"><li v-for="item in generatedContent" :key="item">{{ item }}</li></ol>
            <div class="review-note"><ShieldAlert :size="17" /><div><strong>复核提示</strong><span>当前结果仅依据输入内容和演示参考资料生成，医生需结合面诊、检查结果和完整病史判断。</span></div></div>
            <div class="result-actions"><el-button :icon="FilePlus2" type="primary" :disabled="!canOperate" @click="createDraft">写入病历草稿</el-button></div>
          </div>
        </article>

        <article class="panel source-panel">
          <div class="panel-header"><div><h2 class="panel-title">参考来源</h2><p class="panel-subtitle">展示本次整理所使用的资料类型和相关片段</p></div></div>
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
