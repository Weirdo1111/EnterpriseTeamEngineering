<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Archive, Download, Edit3, Plus, Save, Send, Sparkles } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useClinicalStore } from '@/stores/clinical'
import { downloadText } from '@/utils/export'
import type { MedicalOrder, MedicalRecord } from '@/types/clinical'

const route = useRoute()
const authStore = useAuthStore()
const clinicalStore = useClinicalStore()
const requestedRecord = typeof route.query.record === 'string' ? route.query.record : ''
const selectedRecordId = shallowRef(clinicalStore.records.some((item) => item.id === requestedRecord) ? requestedRecord : clinicalStore.records[0]!.id)
const orderDialogVisible = shallowRef(false)
const editingOrderId = shallowRef('')
const reviewNote = shallowRef('记录完整，诊断与医嘱依据清晰。')
const editableRecord = reactive({ chiefComplaint: '', presentIllness: '', diagnosis: '' })
const orderForm = reactive<{ type: MedicalOrder['type']; content: string }>({ type: '药物', content: '' })

const selectedRecord = computed(() => clinicalStore.records.find((record) => record.id === selectedRecordId.value) ?? clinicalStore.records[0]!)
const actor = computed(() => ({ name: authStore.profile.name, role: authStore.roleLabel, department: authStore.profile.department }))
const canEdit = computed(() => authStore.currentRole !== 'admin' && selectedRecord.value.status !== 'archived')
const canReview = computed(() => authStore.currentRole === 'seniorDoctor')

function syncRecord(record: MedicalRecord) {
  editableRecord.chiefComplaint = record.chiefComplaint
  editableRecord.presentIllness = record.presentIllness
  editableRecord.diagnosis = record.diagnosis
  reviewNote.value = record.reviewNote ?? '记录完整，诊断与医嘱依据清晰。'
}

function selectRecord(record: MedicalRecord) {
  selectedRecordId.value = record.id
  syncRecord(record)
}

watch(() => route.query.record, (value) => {
  if (typeof value === 'string') {
    const record = clinicalStore.records.find((item) => item.id === value)
    if (record) selectRecord(record)
  }
})

function saveRecord(submit = false) {
  if (!canEdit.value) return
  clinicalStore.saveRecord(selectedRecord.value.id, { ...editableRecord }, actor.value, submit)
  ElMessage.success(submit ? '病历已提交上级医生审核' : '病历草稿已保存')
}

function generateRecord() {
  if (!canEdit.value) return
  const record = clinicalStore.createAiRecord(actor.value)
  selectRecord(record)
  ElMessage.success('智能草稿已生成，请逐项核对')
}

function openOrderDialog(order?: MedicalOrder) {
  editingOrderId.value = order?.id ?? ''
  orderForm.type = order?.type ?? '药物'
  orderForm.content = order?.content ?? ''
  orderDialogVisible.value = true
}

function submitOrder() {
  if (!orderForm.content.trim()) {
    ElMessage.warning('请填写医嘱内容')
    return
  }
  if (editingOrderId.value) clinicalStore.updateOrder(selectedRecord.value.id, editingOrderId.value, orderForm.content.trim(), actor.value)
  else clinicalStore.addOrder(selectedRecord.value.id, { type: orderForm.type, content: orderForm.content.trim() }, actor.value)
  orderDialogVisible.value = false
  ElMessage.success(editingOrderId.value ? '医嘱已修改' : '医嘱已新增')
}

async function stopOrder(order: MedicalOrder) {
  try {
    await ElMessageBox.confirm('停止后该医嘱仍会保留在病历中，是否继续？', '停止医嘱', { confirmButtonText: '确认停止', cancelButtonText: '取消', type: 'warning' })
    clinicalStore.stopOrder(selectedRecord.value.id, order.id, actor.value)
    ElMessage.success('医嘱已停止')
  } catch {
    // 用户取消时保持当前医嘱状态。
  }
}

function review(status: 'approved' | 'returned') {
  if (!reviewNote.value.trim()) {
    ElMessage.warning('请填写审核意见')
    return
  }
  clinicalStore.updateRecordStatus(selectedRecord.value.id, status, reviewNote.value.trim(), actor.value)
  ElMessage.success(status === 'approved' ? '病历已审核通过' : '病历已退回修改')
}

function archiveRecord() {
  clinicalStore.updateRecordStatus(selectedRecord.value.id, 'archived', reviewNote.value || '审核完成并归档。', actor.value)
  ElMessage.success('病历已归档')
}

function exportRecord() {
  const record = selectedRecord.value
  const orders = record.orders.map((order) => `${order.type}：${order.content}（${order.status === 'active' ? '执行中' : '已停止'}）`).join('\n')
  downloadText(`${record.patientName}-${record.id}-电子病历.txt`, `电子病历 ${record.id}\n患者：${record.patientName}\n医生：${record.doctor}\n主诉：${record.chiefComplaint}\n现病史：${record.presentIllness}\n诊断：${record.diagnosis}\n\n医嘱\n${orders}\n\n审核意见：${record.reviewNote ?? '无'}`)
  ElMessage.success('电子病历已导出')
}

syncRecord(selectedRecord.value)
</script>

<template>
  <div class="view-stack">
    <PageHeader title="电子病历" description="使用结构化模板记录诊疗过程，医嘱和审核操作均保留变更记录">
      <el-button :icon="Sparkles" :disabled="!canEdit" @click="generateRecord">生成辅助草稿</el-button>
      <el-button :icon="Download" @click="exportRecord">导出病历</el-button>
      <el-button :icon="Save" :disabled="!canEdit" @click="saveRecord(false)">保存草稿</el-button>
      <el-button :icon="Send" type="primary" :disabled="!canEdit" @click="saveRecord(true)">提交审核</el-button>
    </PageHeader>

    <p v-if="authStore.currentRole === 'admin'" class="permission-note">当前以管理员身份查看。管理员可审计记录，但不能修改诊疗内容。</p>

    <section class="records-layout">
      <article class="panel record-list-panel">
        <div class="panel-header"><div><h2 class="panel-title">病历队列</h2><p class="panel-subtitle">按最近更新时间排列</p></div></div>
        <div class="record-list">
          <button v-for="record in clinicalStore.records" :key="record.id" type="button" :class="{ active: record.id === selectedRecord.id }" @click="selectRecord(record)">
            <div><span>{{ record.id }}</span><StatusBadge :status="record.status" type="record" /></div>
            <strong>{{ record.patientName }}</strong>
            <p>{{ record.chiefComplaint }}</p>
            <small>{{ record.updatedAt }}</small>
          </button>
        </div>
      </article>

      <article class="panel workspace-panel">
        <div class="panel-header">
          <div><h2 class="panel-title">{{ selectedRecord.patientName }} · 结构化病历</h2><p class="panel-subtitle">{{ selectedRecord.doctor }} · {{ selectedRecord.updatedAt }}</p></div>
          <StatusBadge :status="selectedRecord.status" type="record" />
        </div>

        <div class="emr-layout">
          <div class="emr-main">
            <el-form label-position="top" class="emr-form">
              <el-form-item label="主诉"><el-input v-model="editableRecord.chiefComplaint" :disabled="!canEdit" /></el-form-item>
              <el-form-item label="现病史"><el-input v-model="editableRecord.presentIllness" type="textarea" :rows="5" resize="none" :disabled="!canEdit" /></el-form-item>
              <el-form-item label="初步诊断"><el-input v-model="editableRecord.diagnosis" :disabled="!canEdit" /></el-form-item>
            </el-form>

            <section class="orders-section">
              <div class="orders-heading"><div><h3>医嘱</h3><p>支持新增、修改和停止，历史状态不会删除</p></div><el-button :icon="Plus" size="small" :disabled="!canEdit" @click="openOrderDialog()">新增医嘱</el-button></div>
              <div class="order-table-wrap">
                <table class="order-table">
                  <thead><tr><th>类型</th><th>医嘱内容</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    <tr v-for="order in selectedRecord.orders" :key="order.id" :class="{ stopped: order.status === 'stopped' }">
                      <td>{{ order.type }}</td><td>{{ order.content }}</td><td><el-tag :type="order.status === 'active' ? 'success' : 'info'" size="small" effect="plain">{{ order.status === 'active' ? '执行中' : '已停止' }}</el-tag></td>
                      <td><el-button :icon="Edit3" link type="primary" :disabled="!canEdit || order.status === 'stopped'" @click="openOrderDialog(order)">修改</el-button><el-button link type="danger" :disabled="!canEdit || order.status === 'stopped'" @click="stopOrder(order)">停止</el-button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside class="review-column">
            <section v-if="selectedRecord.aiGenerated" class="assist-warning"><Sparkles :size="17" /><div><strong>辅助生成草稿</strong><span>请核对患者信息、诊断与每条医嘱后再提交</span></div></section>
            <section class="risk-section"><h3>医嘱风险提示</h3><p>患者过敏史：{{ clinicalStore.patients.find((item) => item.id === selectedRecord.patientId)?.allergies.join('、') }}。开具相关药物前需再次确认。</p></section>
            <section class="review-section">
              <h3>分级审核</h3>
              <el-input v-model="reviewNote" type="textarea" :rows="5" resize="none" :disabled="!canReview" placeholder="填写审核意见" />
              <p v-if="!canReview" class="review-hint">切换为上级医生身份后可执行审核。</p>
              <div class="review-actions"><el-button type="success" :disabled="!canReview || selectedRecord.status !== 'pending'" @click="review('approved')">审核通过</el-button><el-button type="danger" plain :disabled="!canReview || selectedRecord.status !== 'pending'" @click="review('returned')">退回修改</el-button></div>
              <el-button class="archive-button" :icon="Archive" :disabled="!canReview || selectedRecord.status !== 'approved'" @click="archiveRecord">归档病历</el-button>
            </section>
          </aside>
        </div>
      </article>
    </section>

    <el-dialog v-model="orderDialogVisible" :title="editingOrderId ? '修改医嘱' : '新增医嘱'" width="520px">
      <el-form label-position="top"><el-form-item label="医嘱类型"><el-select v-model="orderForm.type"><el-option v-for="type in ['药物', '检查', '检验', '护理']" :key="type" :label="type" :value="type" /></el-select></el-form-item><el-form-item label="医嘱内容"><el-input v-model="orderForm.content" type="textarea" :rows="4" /></el-form-item></el-form>
      <template #footer><el-button @click="orderDialogVisible = false">取消</el-button><el-button type="primary" @click="submitOrder">保存医嘱</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.permission-note { margin: 0; padding: 10px 13px; border: 1px solid #d6c28f; border-radius: var(--radius); color: #75551c; background: #fffaf0; font-size: 12px; }
.records-layout { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 16px; align-items: start; }
.record-list-panel { position: sticky; top: 80px; }
.record-list { display: grid; }
.record-list > button { display: grid; gap: 7px; width: 100%; min-height: 116px; padding: 13px; border: 0; border-bottom: 1px solid var(--border); text-align: left; background: #fff; cursor: pointer; }
.record-list > button:last-child { border-bottom: 0; }
.record-list > button:hover { background: var(--panel-soft); }
.record-list > button.active { background: #eef5f7; box-shadow: inset 3px 0 0 var(--primary); }
.record-list > button > div { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.record-list span, .record-list p, .record-list small { color: var(--muted); }
.record-list span { font-size: 10px; }
.record-list strong { color: var(--text-strong); font-size: 14px; }
.record-list p { margin: 0; overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.record-list small { font-size: 10px; }

.emr-layout { display: grid; grid-template-columns: minmax(0, 1fr) 290px; }
.emr-main { min-width: 0; padding: 17px 18px 20px; }
.review-column { display: grid; align-content: start; gap: 14px; padding: 17px; border-left: 1px solid var(--border); background: #fafbfb; }
.assist-warning { display: flex; gap: 9px; padding: 11px; border: 1px solid #c6d9d6; border-radius: 4px; color: var(--teal); background: #f0f7f5; }
.assist-warning strong, .assist-warning span { display: block; }
.assist-warning strong { font-size: 12px; }
.assist-warning span { margin-top: 4px; color: var(--muted); font-size: 10px; line-height: 1.5; }
.risk-section, .review-section { padding-top: 2px; }
.risk-section h3, .review-section h3, .orders-heading h3 { margin: 0; color: var(--text-strong); font-size: 14px; }
.risk-section p { margin: 8px 0 0; color: #76531c; font-size: 12px; line-height: 1.7; }
.review-section { display: grid; gap: 10px; padding-top: 14px; border-top: 1px solid var(--border); }
.review-hint { margin: 0; color: var(--muted); font-size: 10px; }
.review-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.archive-button { width: 100%; }

.orders-section { margin-top: 5px; border-top: 1px solid var(--border); padding-top: 17px; }
.orders-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; margin-bottom: 12px; }
.orders-heading p { margin: 4px 0 0; color: var(--muted); font-size: 10px; }
.order-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 4px; }
.order-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.order-table th { padding: 10px; color: var(--muted); text-align: left; background: #f3f6f8; }
.order-table td { padding: 10px; border-top: 1px solid var(--border); }
.order-table th:first-child { width: 64px; }.order-table th:nth-child(3) { width: 82px; }.order-table th:last-child { width: 135px; }
.order-table tr.stopped td { color: var(--subtle); text-decoration: line-through; }
.order-table tr.stopped td:nth-last-child(-n + 2) { text-decoration: none; }

@media (max-width: 1180px) { .emr-layout { grid-template-columns: 1fr; } .review-column { border-top: 1px solid var(--border); border-left: 0; } }
@media (max-width: 820px) { .records-layout { grid-template-columns: 1fr; } .record-list-panel { position: static; } .record-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } .record-list > button:nth-child(odd) { border-right: 1px solid var(--border); } }
@media (max-width: 560px) { .record-list { grid-template-columns: 1fr; } .record-list > button:nth-child(odd) { border-right: 0; } .review-actions { grid-template-columns: 1fr; } }
</style>
