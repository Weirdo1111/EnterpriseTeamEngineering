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
const reviewNote = shallowRef('The record is complete, with clear rationale for the diagnosis and orders.')
const editableRecord = reactive({ chiefComplaint: '', presentIllness: '', diagnosis: '' })
const orderForm = reactive<{ type: MedicalOrder['type']; content: string }>({ type: 'Medication', content: '' })

const selectedRecord = computed(() => clinicalStore.records.find((record) => record.id === selectedRecordId.value) ?? clinicalStore.records[0]!)
const actor = computed(() => ({ name: authStore.profile.name, role: authStore.roleLabel, department: authStore.profile.department }))
const canEdit = computed(() => authStore.currentRole !== 'admin' && selectedRecord.value.status !== 'archived')
const canReview = computed(() => authStore.currentRole === 'seniorDoctor')

function syncRecord(record: MedicalRecord) {
  editableRecord.chiefComplaint = record.chiefComplaint
  editableRecord.presentIllness = record.presentIllness
  editableRecord.diagnosis = record.diagnosis
  reviewNote.value = record.reviewNote ?? 'The record is complete, with clear rationale for the diagnosis and orders.'
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
  ElMessage.success(submit ? 'Medical record submitted for senior review.' : 'Medical record draft saved.')
}

function generateRecord() {
  if (!canEdit.value) return
  const record = clinicalStore.createAiRecord(actor.value)
  selectRecord(record)
  ElMessage.success('AI draft generated. Review each item.')
}

function openOrderDialog(order?: MedicalOrder) {
  editingOrderId.value = order?.id ?? ''
  orderForm.type = order?.type ?? 'Medication'
  orderForm.content = order?.content ?? ''
  orderDialogVisible.value = true
}

function submitOrder() {
  if (!orderForm.content.trim()) {
    ElMessage.warning('Enter the order details.')
    return
  }
  if (editingOrderId.value) clinicalStore.updateOrder(selectedRecord.value.id, editingOrderId.value, orderForm.content.trim(), actor.value)
  else clinicalStore.addOrder(selectedRecord.value.id, { type: orderForm.type, content: orderForm.content.trim() }, actor.value)
  orderDialogVisible.value = false
  ElMessage.success(editingOrderId.value ? 'Order updated.' : 'Order added.')
}

async function stopOrder(order: MedicalOrder) {
  try {
    await ElMessageBox.confirm('The order will remain in the medical record after it is stopped. Continue?', 'Stop Order', { confirmButtonText: 'Stop Order', cancelButtonText: 'Cancel', type: 'warning' })
    clinicalStore.stopOrder(selectedRecord.value.id, order.id, actor.value)
    ElMessage.success('Order stopped.')
  } catch {
    // Keep the current order status when the user cancels.
  }
}

function review(status: 'approved' | 'returned') {
  if (!reviewNote.value.trim()) {
    ElMessage.warning('Enter a review note.')
    return
  }
  clinicalStore.updateRecordStatus(selectedRecord.value.id, status, reviewNote.value.trim(), actor.value)
  ElMessage.success(status === 'approved' ? 'Medical record approved.' : 'Medical record returned for revision.')
}

function archiveRecord() {
  clinicalStore.updateRecordStatus(selectedRecord.value.id, 'archived', reviewNote.value || 'Review completed and archived.', actor.value)
  ElMessage.success('Medical record archived.')
}

function exportRecord() {
  const record = selectedRecord.value
  const orders = record.orders.map((order) => `${order.type}: ${order.content} (${order.status === 'active' ? 'Active' : 'Stopped'})`).join('\n')
  downloadText(`${record.patientName}-${record.id}-Medical-Record.txt`, `Medical Record ${record.id}\nPatient: ${record.patientName}\nPhysician: ${record.doctor}\nChief complaint: ${record.chiefComplaint}\nPresent illness: ${record.presentIllness}\nDiagnosis: ${record.diagnosis}\n\nOrders\n${orders}\n\nReview note: ${record.reviewNote ?? 'None'}`)
  ElMessage.success('Medical record exported.')
}

syncRecord(selectedRecord.value)
</script>

<template>
  <div class="view-stack">
    <PageHeader title="Medical Records" description="Document care with structured templates; all order and review changes are retained">
      <el-button :icon="Sparkles" :disabled="!canEdit" @click="generateRecord">Generate AI Draft</el-button>
      <el-button :icon="Download" @click="exportRecord">Export Record</el-button>
      <el-button :icon="Save" :disabled="!canEdit" @click="saveRecord(false)">Save Draft</el-button>
      <el-button :icon="Send" type="primary" :disabled="!canEdit" @click="saveRecord(true)">Submit for Review</el-button>
    </PageHeader>

    <p v-if="authStore.currentRole === 'admin'" class="permission-note">You are viewing as an administrator. Administrators can audit records but cannot edit clinical content.</p>

    <section class="records-layout">
      <article class="panel record-list-panel">
        <div class="panel-header"><div><h2 class="panel-title">Record Queue</h2><p class="panel-subtitle">Sorted by most recent update</p></div></div>
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
          <div><h2 class="panel-title">{{ selectedRecord.patientName }} · Structured Medical Record</h2><p class="panel-subtitle">{{ selectedRecord.doctor }} · {{ selectedRecord.updatedAt }}</p></div>
          <StatusBadge :status="selectedRecord.status" type="record" />
        </div>

        <div class="emr-layout">
          <div class="emr-main">
            <el-form label-position="top" class="emr-form">
              <el-form-item label="Chief Complaint"><el-input v-model="editableRecord.chiefComplaint" :disabled="!canEdit" /></el-form-item>
              <el-form-item label="Present Illness"><el-input v-model="editableRecord.presentIllness" type="textarea" :rows="5" resize="none" :disabled="!canEdit" /></el-form-item>
              <el-form-item label="Preliminary Diagnosis"><el-input v-model="editableRecord.diagnosis" :disabled="!canEdit" /></el-form-item>
            </el-form>

            <section class="orders-section">
              <div class="orders-heading"><div><h3>Orders</h3><p>Orders can be added, edited, or stopped; historical states are retained</p></div><el-button :icon="Plus" size="small" :disabled="!canEdit" @click="openOrderDialog()">Add Order</el-button></div>
              <div class="order-table-wrap">
                <table class="order-table">
                  <thead><tr><th>Type</th><th>Order Details</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    <tr v-for="order in selectedRecord.orders" :key="order.id" :class="{ stopped: order.status === 'stopped' }">
                      <td>{{ order.type }}</td><td>{{ order.content }}</td><td><el-tag :type="order.status === 'active' ? 'success' : 'info'" size="small" effect="plain">{{ order.status === 'active' ? 'Active' : 'Stopped' }}</el-tag></td>
                      <td><el-button :icon="Edit3" link type="primary" :disabled="!canEdit || order.status === 'stopped'" @click="openOrderDialog(order)">Edit</el-button><el-button link type="danger" :disabled="!canEdit || order.status === 'stopped'" @click="stopOrder(order)">Stop</el-button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside class="review-column">
            <section v-if="selectedRecord.aiGenerated" class="assist-warning"><Sparkles :size="17" /><div><strong>AI-generated Draft</strong><span>Verify patient details, diagnosis, and every order before submission</span></div></section>
            <section class="risk-section"><h3>Order Risk Alert</h3><p>Patient allergies: {{ clinicalStore.patients.find((item) => item.id === selectedRecord.patientId)?.allergies.join(', ') }}. Confirm again before prescribing related medication.</p></section>
            <section class="review-section">
              <h3>Tiered Review</h3>
              <el-input v-model="reviewNote" type="textarea" :rows="5" resize="none" :disabled="!canReview" placeholder="Enter review notes" />
              <p v-if="!canReview" class="review-hint">Switch to the Senior Physician role to review this record.</p>
              <div class="review-actions"><el-button type="success" :disabled="!canReview || selectedRecord.status !== 'pending'" @click="review('approved')">Approve</el-button><el-button type="danger" plain :disabled="!canReview || selectedRecord.status !== 'pending'" @click="review('returned')">Return for Revision</el-button></div>
              <el-button class="archive-button" :icon="Archive" :disabled="!canReview || selectedRecord.status !== 'approved'" @click="archiveRecord">Archive Record</el-button>
            </section>
          </aside>
        </div>
      </article>
    </section>

    <el-dialog v-model="orderDialogVisible" :title="editingOrderId ? 'Edit Order' : 'Add Order'" width="520px">
      <el-form label-position="top"><el-form-item label="Order Type"><el-select v-model="orderForm.type"><el-option v-for="type in ['Medication', 'Examination', 'Laboratory', 'Nursing']" :key="type" :label="type" :value="type" /></el-select></el-form-item><el-form-item label="Order Details"><el-input v-model="orderForm.content" type="textarea" :rows="4" /></el-form-item></el-form>
      <template #footer><el-button @click="orderDialogVisible = false">Cancel</el-button><el-button type="primary" @click="submitOrder">Save Order</el-button></template>
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
