<script setup lang="ts">
import { computed, reactive, shallowRef } from 'vue'
import { Bot, ClipboardPlus, SearchCheck, ShieldAlert, Sparkles } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { useClinicalStore } from '@/stores/clinical'
const clinicalStore = useClinicalStore(); const loading = shallowRef(false)
const form = reactive({ task: 'emr', prompt: '患者张建国，72岁，高血压合并糖尿病，晨起血压 152/94，头胀，睡眠欠佳，青霉素过敏。' })
const resultTitle = computed(() => form.task === 'summary' ? '问诊摘要' : form.task === 'cases' ? '相似病例检索' : form.task === 'order' ? '医嘱风险核验' : '结构化病历草稿')
const generatedContent = shallowRef(['主诉：晨起血压升高伴头胀 2 天。', '现病史：患者既往高血压、2 型糖尿病，近期睡眠欠佳，晨起血压约 152/94mmHg。', '初步判断：高血压控制不佳，需结合连续家庭血压监测与用药依从性评估。', '处理建议：记录晨起及睡前血压三日，复查空腹血糖，医生复核后考虑调整降压方案。'])
const taskCards = [
  { value: 'emr', title: '病历草稿', description: '从问诊对话生成 SOAP/EMR 结构化内容', icon: ClipboardPlus },
  { value: 'summary', title: '问诊摘要', description: '提炼主诉、病史、风险和随访重点', icon: Sparkles },
  { value: 'cases', title: '相似病例', description: '检索脱敏历史病例与指南片段', icon: SearchCheck },
  { value: 'order', title: '医嘱核验', description: '提示过敏、相互作用和老年用药禁忌', icon: ShieldAlert },
]
function generate() {
  loading.value = true
  window.setTimeout(() => {
    generatedContent.value = form.task === 'cases'
      ? ['相似病例 A：高血压合并睡眠障碍导致晨峰血压升高，调整随访频率后改善。', '相似病例 B：糖尿病患者血压波动，需同步复核血糖与用药依从性。', '参考建议：优先进行连续家庭血压监测，避免单次读数直接调整长期方案。']
      : form.task === 'order'
        ? ['过敏史：青霉素过敏，相关药物需规避。', '老年用药：降压方案调整应关注体位性低血压与夜间跌倒风险。', '复核建议：正式医嘱提交前需医生人工确认。']
        : ['主诉：晨起血压升高伴头胀 2 天。', '现病史：既往高血压、2 型糖尿病，近期睡眠欠佳，晨起血压 152/94mmHg。', '初步诊断：高血压控制不佳；慢病随访。', '处理建议：连续三日监测晨起/睡前血压，复查空腹血糖，评估用药依从性。']
    loading.value = false
  }, 560)
}
</script>
<template>
  <div class="view-stack"><PageHeader eyebrow="AI / RAG Assistance" title="AI/RAG 医疗助手" description="围绕病历生成、问诊摘要、相似病例检索和医嘱核验建立独立 AI 服务层，输出仅作为医生参考。"><el-button :icon="Bot" type="primary" :loading="loading" @click="generate">生成结果</el-button></PageHeader>
    <section class="ai-layout"><article class="panel input-panel"><div class="panel-header"><div><h2 class="panel-title">任务配置</h2><p class="panel-subtitle">模拟 FastAPI + LangChain + Milvus + DeepSeek 的服务调用。</p></div></div><div class="panel-body"><div class="task-grid"><button v-for="task in taskCards" :key="task.value" class="task-card" :class="{ active: form.task === task.value }" type="button" @click="form.task = task.value"><component :is="task.icon" :size="20" /><strong>{{ task.title }}</strong><span>{{ task.description }}</span></button></div><el-form label-position="top" class="prompt-form"><el-form-item label="输入内容"><el-input v-model="form.prompt" type="textarea" :rows="8" resize="none" /></el-form-item></el-form></div></article>
      <article class="panel result-panel"><div class="panel-header"><div><h2 class="panel-title">{{ resultTitle }}</h2><p class="panel-subtitle">三层校验：RAG 引用、LLM Reviewer、医生人工确认。</p></div><el-tag effect="light" type="warning">AI 仅供参考</el-tag></div><div class="panel-body result-body"><div class="generated-list"><p v-for="item in generatedContent" :key="item">{{ item }}</p></div><div class="review-strip"><span>Review</span><strong>未发现明确禁忌，但正式诊疗建议需医生结合面诊与检查结果确认。</strong></div></div></article>
      <article class="panel reference-panel"><div class="panel-header"><div><h2 class="panel-title">RAG 引用来源</h2><p class="panel-subtitle">Top-K 召回结果和置信度。</p></div></div><div class="panel-body reference-list"><div v-for="reference in clinicalStore.ragReferences" :key="reference.id" class="reference-row"><div><strong>{{ reference.title }}</strong><span>{{ reference.source }}</span></div><el-progress :percentage="reference.confidence" :stroke-width="8" /></div></div></article>
    </section>
  </div>
</template>
<style scoped>
.ai-layout { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 18px; align-items: start; } .input-panel { grid-row: span 2; }
.task-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; } .task-card { display: grid; gap: 8px; min-height: 126px; padding: 14px; border: 1px solid var(--border); border-radius: var(--radius); color: var(--muted); text-align: left; background: var(--panel-soft); cursor: pointer; } .task-card strong { color: var(--text); font-size: 15px; } .task-card span { line-height: 1.5; } .task-card.active { color: var(--primary); border-color: rgba(23,105,224,.45); background: #eef6ff; }
.result-body, .reference-list, .generated-list { display: grid; gap: 14px; } .generated-list p, .reference-row { margin: 0; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--panel-soft); line-height: 1.7; }
.review-strip { display: grid; gap: 6px; padding: 14px; border-radius: var(--radius); background: #eaf7ef; } .review-strip span { color: var(--green); font-size: 12px; font-weight: 800; } .reference-row strong, .reference-row span { display: block; } .reference-row span { margin-top: 5px; color: var(--muted); font-size: 12px; }
@media (max-width: 980px) { .ai-layout { grid-template-columns: 1fr; } } @media (max-width: 620px) { .task-grid { grid-template-columns: 1fr; } }
</style>