<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Bot, FilePlus2, ImagePlus, SendHorizontal } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PatientSummary from '@/components/patients/PatientSummary.vue'
import { useClinicalStore } from '@/stores/clinical'
const clinicalStore = useClinicalStore()
const draftMessage = shallowRef('患者反馈晨起血压仍偏高，昨晚睡眠不足，建议连续监测三日。')
const aiSummaryVisible = shallowRef(true)
const selectedPatient = computed(() => clinicalStore.selectedPatient)
const dialogueText = computed(() => clinicalStore.messages.map((message) => `${message.sender}: ${message.content}`).join('\n'))
const aiSummary = computed(() => ['主诉：晨起血压升高伴头胀 2 天。', '重点信息：既往高血压、糖尿病，青霉素过敏，近期睡眠欠佳。', '建议：连续监测晨起/睡前血压，复查血糖，医生复核后调整用药。'])
function sendMessage() { const content = draftMessage.value.trim(); if (!content) return; clinicalStore.addMessage(content); draftMessage.value = '' }
function generateRecord() { clinicalStore.createAiRecord() }
</script>
<template>
  <div class="view-stack"><PageHeader eyebrow="Online Consultation" title="图文在线问诊" description="支持文字、图片检查单、自动归档和 AI 摘要，当前阶段聚焦图文问诊，视频问诊留到第二期。"><el-button :icon="FilePlus2" type="primary" @click="generateRecord">生成病历草稿</el-button><el-button :icon="Bot" plain @click="aiSummaryVisible = !aiSummaryVisible">AI 摘要</el-button></PageHeader>
    <section class="consultation-layout"><article class="panel patient-side"><div class="panel-body"><PatientSummary :patient="selectedPatient" /></div></article>
      <article class="panel chat-panel"><div class="panel-header"><div><h2 class="panel-title">{{ selectedPatient.name }} · 问诊会话</h2><p class="panel-subtitle">会话记录自动保存，可按患者、日期和关键词追溯。</p></div><el-tag effect="light">图文问诊</el-tag></div><div class="chat-body"><div v-for="message in clinicalStore.messages" :key="message.id" class="message-row" :class="`sender-${message.sender}`"><div class="message-bubble"><span class="message-time">{{ message.time }}</span><p>{{ message.content }}</p><button v-if="message.attachment" class="attachment" type="button"><ImagePlus :size="16" />{{ message.attachment }}</button></div></div></div><div class="composer"><el-input v-model="draftMessage" type="textarea" :rows="3" resize="none" placeholder="输入问诊回复或随访建议" /><div class="composer-actions"><el-button :icon="ImagePlus" plain>上传检查单</el-button><el-button :icon="SendHorizontal" type="primary" @click="sendMessage">发送</el-button></div></div></article>
      <article v-show="aiSummaryVisible" class="panel ai-side"><div class="panel-header"><div><h2 class="panel-title">AI 问诊摘要</h2><p class="panel-subtitle">由对话生成，仅供医生参考。</p></div></div><div class="panel-body ai-body"><div class="summary-list"><p v-for="item in aiSummary" :key="item">{{ item }}</p></div><div class="dialogue-box"><span>RAG 输入片段</span><pre>{{ dialogueText }}</pre></div><div class="safety-note">AI 草稿不会自动进入正式病历，必须由医生确认并记录审计日志。</div></div></article>
    </section>
  </div>
</template>
<style scoped>
.consultation-layout { display: grid; grid-template-columns: 310px minmax(0, 1fr) 340px; gap: 18px; align-items: start; } .patient-side, .ai-side { position: sticky; top: 94px; } .chat-panel { overflow: hidden; }
.chat-body { display: grid; gap: 14px; height: 510px; padding: 20px; overflow: auto; background: #f8fafc; } .message-row { display: flex; } .sender-doctor { justify-content: flex-end; } .sender-patient, .sender-ai { justify-content: flex-start; }
.message-bubble { width: min(560px, 82%); padding: 12px 14px; border: 1px solid var(--border); border-radius: 8px; background: #fff; } .sender-doctor .message-bubble { color: #fff; border-color: var(--primary); background: var(--primary); }
.message-time { display: block; margin-bottom: 6px; color: var(--subtle); font-size: 12px; } .sender-doctor .message-time { color: #dcecff; } .message-bubble p { margin: 0; line-height: 1.6; }
.attachment { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; padding: 7px 9px; border: 1px solid currentColor; border-radius: 7px; color: inherit; background: transparent; cursor: pointer; }
.composer { display: grid; gap: 12px; padding: 16px; border-top: 1px solid var(--border); background: #fff; } .composer-actions { display: flex; justify-content: flex-end; gap: 10px; }
.ai-body, .summary-list, .dialogue-box { display: grid; gap: 12px; } .summary-list p { margin: 0; padding: 12px; border-radius: var(--radius); background: var(--panel-soft); line-height: 1.6; }
.dialogue-box span { color: var(--muted); font-size: 12px; font-weight: 700; } .dialogue-box pre { max-height: 190px; margin: 0; padding: 12px; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius); color: var(--muted); background: #fbfdff; font-size: 12px; line-height: 1.6; white-space: pre-wrap; }
.safety-note { padding: 12px; border: 1px solid #f3d591; border-radius: var(--radius); color: #7a4a06; background: #fff8e7; line-height: 1.6; }
@media (max-width: 1220px) { .consultation-layout { grid-template-columns: minmax(0, 1fr); } .patient-side, .ai-side { position: static; } }
</style>