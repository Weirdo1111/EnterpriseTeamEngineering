<script setup lang="ts">
import { allergyText } from '@/utils/patients'
import { computed, onMounted, reactive, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Archive, Download, Edit3, Plus, Save, Send, Sparkles } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useClinicalStore } from '@/stores/clinical'
import { downloadText } from '@/utils/export'
import type { MedicalOrder, MedicalRecord } from '@/types/clinical'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const clinicalStore = useClinicalStore()
const requestedRecord = typeof route.query.record === 'string' ? route.query.record : ''
const selectedRecordId = shallowRef(clinicalStore.records.some((item) => item.id === requestedRecord) ? requestedRecord : clinicalStore.records[0]!.id)
const orderDialogVisible = shallowRef(false)
const editingOrderId = shallowRef('')
const busy = shallowRef(false)
const reviewNote = shallowRef('The record is complete, with clear rationale for the diagnosis and orders.')
const editableRecord = reactive({ chiefComplaint: '', presentIllness: '', diagnosis: '' })
const orderForm = reactive<{ type: MedicalOrder['type']; content: string }>({ type: 'Medication', content: '' })

const selectedRecord = computed(() => clinicalStore.records.find((record) => record.id === selectedRecordId.value) ?? clinicalStore.records[0]!)
const actor = computed(() => ({ name: authStore.profile.name, role: authStore.roleLabel, department: authStore.profile.department }))
const canCreate = computed(() => authStore.currentRole !== 'admin')
const canEdit = computed(() => canCreate.value && ['draft', 'returned'].includes(selectedRecord.value.status))
const canReview = computed(() => authStore.currentRole === 'seniorDoctor')

function errorMessage(error: unknown) {
  ElMessage.error(error instanceof Error ? error.message : 'The operation could not be completed.')
}

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

async function saveRecord(submit = false) {
  if (!canEdit.value) return
  busy.value = true
  try {
    await clinicalStore.saveRecord(selectedRecord.value.id, { ...editableRecord }, actor.value, submit)
    ElMessage.success(submit ? 'Medical record submitted for senior review.' : 'Medical record draft saved.')
  } catch (error) { errorMessage(error) }
  finally { busy.value = false }
}

function generateRecord() {
  if (!canCreate.value) return
  router.push({ path: '/ai-assistant', query: { task: 'emr', patient: selectedRecord.value.patientId } })
}

function openOrderDialog(order?: MedicalOrder) {
  editingOrderId.value = order?.id ?? ''
  orderForm.type = order?.type ?? 'Medication'
  orderForm.content = order?.content ?? ''
  orderDialogVisible.value = true
}

async function submitOrder() {
  if (!orderForm.content.trim()) {
    ElMessage.warning('Enter the order details.')
    return
  }
  busy.value = true
  try {
    if (editingOrderId.value) await clinicalStore.updateOrder(selectedRecord.value.id, editingOrderId.value, orderForm.content.trim(), actor.value)
    else await clinicalStore.addOrder(selectedRecord.value.id, { type: orderForm.type, content: orderForm.content.trim() }, actor.value)
    orderDialogVisible.value = false
    ElMessage.success(editingOrderId.value ? 'Order updated.' : 'Order added.')
  } catch (error) { errorMessage(error) }
  finally { busy.value = false }
}

async function stopOrder(order: MedicalOrder) {
  try {
    await ElMessageBox.confirm('The order will remain in the medical record after it is stopped. Continue?', 'Stop Order', { confirmButtonText: 'Stop Order', cancelButtonText: 'Cancel', type: 'warning' })
    await clinicalStore.stopOrder(selectedRecord.value.id, order.id, actor.value)
    ElMessage.success('Order stopped.')
  } catch (error) {
    if (error instanceof Error) errorMessage(error)
  }
}

async function review(status: 'approved' | 'returned') {
  if (!reviewNote.value.trim()) {
    ElMessage.warning('Enter a review note.')
    return
  }
  busy.value = true
  try {
    await clinicalStore.updateRecordStatus(selectedRecord.value.id, status, reviewNote.value.trim(), actor.value)
    ElMessage.success(status === 'approved' ? 'Medical record approved.' : 'Medical record returned for revision.')
  } catch (error) { errorMessage(error) }
  finally { busy.value = false }
}

async function archiveRecord() {
  busy.value = true
  try {
    await clinicalStore.updateRecordStatus(selectedRecord.value.id, 'archived', reviewNote.value || 'Review completed and archived.', actor.value)
    ElMessage.success('Medical record archived.')
  } catch (error) { errorMessage(error) }
  finally { busy.value = false }
}

function exportRecord() {
  const record = selectedRecord.value
  const orders = record.orders.map((order) => `${order.type}: ${order.content} (${order.status === 'active' ? 'Active' : 'Stopped'})`).join('\n')
  downloadText(`${record.patientName}-${record.id}-Medical-Record.txt`, `Medical Record ${record.id}\nPatient: ${record.patientName}\nPhysician: ${record.doctor}\nChief complaint: ${record.chiefComplaint}\nPresent illness: ${record.presentIllness}\nDiagnosis: ${record.diagnosis}\n\nOrders\n${orders}\n\nReview note: ${record.reviewNote ?? 'None'}`)
  ElMessage.success('Medical record exported.')
}

syncRecord(selectedRecord.value)
onMounted(async () => {
  try {
    await clinicalStore.loadRecords()
    const requested = typeof route.query.record === 'string' ? route.query.record : ''
    selectRecord(clinicalStore.records.find(item => item.id === requested) ?? clinicalStore.records[0]!)
  } catch (error) { errorMessage(error) }
})
function recordAllergyText(patientId: string) {
  const patient = clinicalStore.patients.find(item => item.id === patientId)
  return patient ? allergyText(patient) : 'Unconfirmed'
}
</script>

<template>
  <div class="view-stack">
    <PageHeader title="Medical Records" description="Document care with structured templates; all order and review changes are retained">
      <el-button :icon="Sparkles" :loading="busy" :disabled="!canCreate" @click="generateRecord">Generate AI Draft</el-button>
      <el-button :icon="Download" @click="exportRecord">Export Record</el-button>
      <el-button :icon="Save" :loading="busy" :disabled="!canEdit" @click="saveRecord(false)">Save Draft</el-button>
      <el-button :icon="Send" type="primary" :loading="busy" :disabled="!canEdit" @click="saveRecord(true)">Submit for Review</el-button>
    </PageHeader>

    <p v-if="authStore.currentRole === 'admin'" class="permission-note">You are viewing as an administrator. Administrators can audit records but cannot edit clinical content.</p>
    <el-alert v-if="clinicalStore.recordsError" :title="clinicalStore.recordsError" type="error" show-icon :closable="false" />

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
          <div><h2 class="panel-title">{{ selectedRecord.patientName }} · Structured Medical Record</h2><p class="panel-subtitle">{{ selectedRecord.doctor }} · Version {{ selectedRecord.version }} · {{ selectedRecord.updatedAt }}</p></div>
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
            <section v-if="selectedRecord.aiGenerated" class="assist-warning"><Sparkles :size="17" /><div><strong>Assistant-prepared Draft</strong><span>{{ selectedRecord.aiMetadata?.generator === 'ark-synthetic-source-linked-v1' ? 'Model summary of a synthetic consultation' : 'Recorded-text extraction' }}. Resolve flagged items, assess the diagnosis, and review orders before submission.</span><ul v-if="selectedRecord.aiMetadata?.safetyWarnings.length"><li v-for="warning in selectedRecord.aiMetadata.safetyWarnings" :key="warning">{{ warning }}</li></ul><div v-if="selectedRecord.aiMetadata?.followUpItems?.length" class="assist-follow-up"><b>Recorded follow-up</b><p v-for="item in selectedRecord.aiMetadata.followUpItems" :key="item">{{ item }}</p></div><details v-if="selectedRecord.aiMetadata?.evidence?.length"><summary>Source excerpts</summary><p v-for="(item, index) in selectedRecord.aiMetadata.evidence" :key="index"><b>{{ item.sourceId }}</b> {{ item.quote }}</p></details></div></section>
            <section class="risk-section"><h3>Order Risk Alert</h3><p>Patient allergies: {{ recordAllergyText(selectedRecord.patientId) }}. Confirm again before prescribing related medication.</p></section>
            <section class="review-section">
              <h3>Tiered Review</h3>
              <el-input v-model="reviewNote" type="textarea" :rows="5" resize="none" :disabled="!canReview" placeholder="Enter review notes" />
              <p v-if="!canReview" class="review-hint">Switch to the Senior Physician role to review this record.</p>
              <div class="review-actions"><el-button type="success" :disabled="!canReview || selectedRecord.status !== 'pending'" @click="review('approved')">Approve</el-button><el-button type="danger" plain :disabled="!canReview || selectedRecord.status !== 'pending'" @click="review('returned')">Return for Revision</el-button></div>
              <el-button class="archive-button" :icon="Archive" :disabled="!canReview || selectedRecord.status !== 'approved'" @click="archiveRecord">Archive Record</el-button>
              <div v-if="selectedRecord.reviewHistory.length" class="review-history">
                <h4>Review History</h4>
                <div v-for="item in [...selectedRecord.reviewHistory].reverse()" :key="item.id"><strong>{{ item.decision }}</strong><span>{{ item.reviewer }} · {{ item.createdAt }}</span><p>{{ item.note }}</p></div>
              </div>
            </section>
          </aside>
        </div>
      </article>
    </section>

    <el-dialog v-model="orderDialogVisible" :title="editingOrderId ? 'Edit Order' : 'Add Order'" width="520px">
      <el-form label-position="top"><el-form-item label="Order Type"><el-select v-model="orderForm.type"><el-option v-for="type in ['Medication', 'Examination', 'Laboratory', 'Nursing']" :key="type" :label="type" :value="type" /></el-select></el-form-item><el-form-item label="Order Details"><el-input v-model="orderForm.content" type="textarea" :rows="4" /></el-form-item></el-form>
      <template #footer><el-button @click="orderDialogVisible = false">Cancel</el-button><el-button type="primary" :loading="busy" @click="submitOrder">Save Order</el-button></template>
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
.assist-warning ul { margin: 8px 0 0; padding-left: 17px; color: var(--text); font-size: 10px; line-height: 1.55; }
.assist-warning details { margin-top: 10px; color: var(--text); font-size: 11px; }.assist-warning summary { cursor: pointer; font-weight: 600; }.assist-warning details p { margin: 7px 0 0; line-height: 1.5; overflow-wrap: anywhere; }
.assist-follow-up { margin-top: 10px; padding-top: 10px; border-top: 1px solid #c6d9d6; color: var(--text); font-size: 11px; }.assist-follow-up p { margin: 5px 0 0; line-height: 1.5; }
.risk-section, .review-section { padding-top: 2px; }
.risk-section h3, .review-section h3, .orders-heading h3 { margin: 0; color: var(--text-strong); font-size: 14px; }
.risk-section p { margin: 8px 0 0; color: #76531c; font-size: 12px; line-height: 1.7; }
.review-section { display: grid; gap: 10px; padding-top: 14px; border-top: 1px solid var(--border); }
.review-hint { margin: 0; color: var(--muted); font-size: 10px; }
.review-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.archive-button { width: 100%; }
.review-history { display: grid; gap: 8px; margin-top: 14px; padding-top: 13px; border-top: 1px solid var(--border); }
.review-history h4 { margin: 0; color: var(--text-strong); font-size: 12px; }
.review-history > div { padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: #fff; }
.review-history strong { display: block; text-transform: capitalize; font-size: 11px; }
.review-history span { color: var(--muted); font-size: 9px; }
.review-history p { margin: 5px 0 0; font-size: 10px; line-height: 1.45; }

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
