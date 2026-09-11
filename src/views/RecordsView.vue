<script setup lang="ts">
import { computed, reactive, shallowRef } from 'vue'
import { Bot, CheckCircle2, FileDown, Save, XCircle } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useClinicalStore } from '@/stores/clinical'
import type { MedicalRecord } from '@/types/clinical'
const authStore = useAuthStore(); const clinicalStore = useClinicalStore(); const selectedRecordId = shallowRef(clinicalStore.records[0]?.id ?? '')
const selectedRecord = computed(() => clinicalStore.records.find((record) => record.id === selectedRecordId.value) ?? clinicalStore.records[0])
const canReview = computed(() => authStore.currentRole === 'seniorDoctor' || authStore.currentRole === 'admin')
const editableRecord = reactive({ chiefComplaint: '', presentIllness: '', diagnosis: '', orderText: '' })
function syncRecord(record: MedicalRecord) { editableRecord.chiefComplaint = record.chiefComplaint; editableRecord.presentIllness = record.presentIllness; editableRecord.diagnosis = record.diagnosis; editableRecord.orderText = record.orders.join('\n') }
function selectRecord(record: MedicalRecord) { selectedRecordId.value = record.id; syncRecord(record) }
function saveDraft() { const record = selectedRecord.value; record.chiefComplaint = editableRecord.chiefComplaint; record.presentIllness = editableRecord.presentIllness; record.diagnosis = editableRecord.diagnosis; record.orders = editableRecord.orderText.split('\n').filter(Boolean); record.status = 'pending'; record.updatedAt = '2026-09-11 10:48' }
function approveRecord() { clinicalStore.updateRecordStatus(selectedRecord.value.id, 'approved', '审核通过，记录完整，建议继续随访。') }
function returnRecord() { clinicalStore.updateRecordStatus(selectedRecord.value.id, 'returned', '请补充用药调整依据与风险告知。') }
if (selectedRecord.value) syncRecord(selectedRecord.value)
</script>
<template>
  <div class="view-stack"><PageHeader eyebrow="Electronic Medical Record" title="电子病历管理" description="结构化模板、AI 草稿、医嘱管理与上级医生分级审核共同保证病历质量。"><el-button :icon="Bot" plain @click="clinicalStore.createAiRecord">AI 生成</el-button><el-button :icon="FileDown" plain>导出病历</el-button><el-button :icon="Save" type="primary" @click="saveDraft">提交审核</el-button></PageHeader>
    <section class="records-layout"><article class="panel record-list"><div class="panel-header"><div><h2 class="panel-title">病历队列</h2><p class="panel-subtitle">草稿、待审核、已通过和退回记录。</p></div></div><div class="record-items"><button v-for="record in clinicalStore.records" :key="record.id" class="record-item" :class="{ active: record.id === selectedRecord.id }" type="button" @click="selectRecord(record)"><span class="record-id">{{ record.id }}</span><strong>{{ record.patientName }}</strong><small>{{ record.chiefComplaint }}</small><StatusBadge :status="record.status" type="record" /></button></div></article>
      <article class="panel editor-panel"><div class="panel-header"><div><h2 class="panel-title">{{ selectedRecord.patientName }} · 结构化病历</h2><p class="panel-subtitle">{{ selectedRecord.doctor }} · {{ selectedRecord.updatedAt }}</p></div><StatusBadge :status="selectedRecord.status" type="record" /></div><div class="panel-body emr-form"><el-form label-position="top"><el-form-item label="主诉"><el-input v-model="editableRecord.chiefComplaint" /></el-form-item><el-form-item label="现病史"><el-input v-model="editableRecord.presentIllness" type="textarea" :rows="5" resize="none" /></el-form-item><el-form-item label="初步诊断"><el-input v-model="editableRecord.diagnosis" /></el-form-item><el-form-item label="医嘱"><el-input v-model="editableRecord.orderText" type="textarea" :rows="5" resize="none" /></el-form-item></el-form><div v-if="selectedRecord.aiGenerated" class="ai-disclaimer"><Bot :size="18" /><span>该记录由 AI 生成草稿，医生确认后才能成为正式病历。</span></div></div></article>
      <article class="panel review-panel"><div class="panel-header"><div><h2 class="panel-title">分级审核</h2><p class="panel-subtitle">上级医生审核、退回意见和合规留痕。</p></div></div><div class="panel-body review-body"><div class="review-status"><StatusBadge :status="selectedRecord.status" type="record" /><p>{{ selectedRecord.reviewNote ?? '当前记录尚未填写审核意见。' }}</p></div><div class="risk-box"><strong>医嘱风险提示</strong><span>患者过敏史已校验，涉及青霉素相关药品需二次确认。</span></div><div class="review-actions"><el-button :icon="CheckCircle2" type="success" :disabled="!canReview" @click="approveRecord">通过</el-button><el-button :icon="XCircle" type="danger" plain :disabled="!canReview" @click="returnRecord">退回</el-button></div></div></article>
    </section>
  </div>
</template>
<style scoped>
.records-layout { display: grid; grid-template-columns: 280px minmax(0, 1fr) 300px; gap: 18px; align-items: start; } .record-list, .review-panel { position: sticky; top: 94px; }
.record-items, .emr-form, .review-body, .review-status { display: grid; gap: 12px; } .record-items { padding: 14px; }
.record-item { display: grid; gap: 7px; width: 100%; min-height: 132px; padding: 13px; border: 1px solid var(--border); border-radius: var(--radius); text-align: left; background: var(--panel-soft); cursor: pointer; } .record-item.active { border-color: rgba(23,105,224,.48); background: #eef6ff; }
.record-id, .record-item small, .review-status p { color: var(--muted); } .record-item strong { font-size: 16px; }
.ai-disclaimer { display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid #f3d591; border-radius: var(--radius); color: #7a4a06; background: #fff8e7; }
.risk-box { display: grid; gap: 8px; padding: 14px; border-radius: var(--radius); background: #fff4dc; } .risk-box span { color: #7a4a06; line-height: 1.6; } .review-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 1180px) { .records-layout { grid-template-columns: 1fr; } .record-list, .review-panel { position: static; } }
</style>