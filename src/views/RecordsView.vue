<script setup lang="ts">
import { allergyText } from '@/utils/patients'
import { computed, onBeforeUnmount, reactive, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Archive, Download, Edit3, Plus, Save, Send, Sparkles } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useClinicalStore } from '@/stores/clinical'
import { downloadText } from '@/utils/export'
import { formatConsultationTime } from '@/utils/consultations'
import { resolvePatientIdentity } from '@/utils/patient-identity'
import type { MedicalOrder, MedicalRecord } from '@/types/clinical'

const route = useRoute()
const router = useRouter()
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
const missingRequestedRecord = computed(() => typeof route.query.record === 'string' && !clinicalStore.records.some(record => record.id === route.query.record))
const recordIdentity = computed(() => resolvePatientIdentity(clinicalStore.patients, selectedRecord.value))
const profileUnavailable = computed(() => recordIdentity.value.profileMissing || Boolean(clinicalStore.patientsError))
function recordPatientName(record: MedicalRecord) {
  const identity = resolvePatientIdentity(clinicalStore.patientsError ? [] : clinicalStore.patients, record)
  return identity.currentName ?? `${identity.snapshotName} (snapshot)`
}
const actor = computed(() => ({ name: authStore.profile.name, role: authStore.roleLabel, department: authStore.profile.department }))
const canEdit = computed(() => authStore.currentRole !== 'admin' && !missingRequestedRecord.value && !profileUnavailable.value && !clinicalStore.consultationRecordsError
  && (selectedRecord.value.sourceConsultationId ? ['draft', 'returned'].includes(selectedRecord.value.status) : selectedRecord.value.status !== 'archived'))
const canReview = computed(() => authStore.currentRole === 'seniorDoctor' && !missingRequestedRecord.value && !profileUnavailable.value)
const saveError = shallowRef('')
const sourceSession = computed(() => clinicalStore.consultations.find(session => session.id === selectedRecord.value.sourceConsultationId))
const sourceChanged = computed(() => sourceSession.value?.summary && sourceSession.value.summary.updatedAt !== selectedRecord.value.sourceSummaryUpdatedAt)
const recordDirty = computed(() => Boolean(selectedRecord.value.sourceConsultationId) && canEdit.value
  && (Object.entries(editableRecord).some(([key, value]) => value !== selectedRecord.value[key as keyof typeof editableRecord]) || orderDialogVisible.value))

function runRecordAction(action: () => void, success: string) {
  saveError.value = ''
  try { action(); ElMessage.success(success); return true }
  catch (error) { saveError.value = error instanceof Error ? error.message : 'Unable to save this record. Your input has been kept.'; return false }
}

async function confirmLeaveRecord() {
  if (!recordDirty.value) return true
  try {
    await ElMessageBox.confirm('Your unsaved medical record changes will be discarded. Saved content will remain.', 'Leave with unsaved record changes?', { confirmButtonText: 'Leave and discard', cancelButtonText: 'Keep editing', type: 'warning' })
    return true
  } catch { return false }
}
onBeforeRouteLeave(confirmLeaveRecord)
function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (!recordDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
window.addEventListener('beforeunload', warnBeforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload))

async function reloadRecords() {
  try {
    await clinicalStore.loadConsultationRecords(true)
    const requested = clinicalStore.records.find(record => record.id === route.query.record)
    if (requested) { selectedRecordId.value = requested.id; syncRecord(requested) }
  } catch { /* Error remains visible without discarding the original storage. */ }
}

function syncRecord(record: MedicalRecord) {
  editableRecord.chiefComplaint = record.chiefComplaint
  editableRecord.presentIllness = record.presentIllness
  editableRecord.diagnosis = record.diagnosis
  reviewNote.value = record.reviewNote ?? (record.sourceConsultationId ? '' : 'The record is complete, with clear rationale for the diagnosis and orders.')
  saveError.value = ''
}

async function selectRecord(record: MedicalRecord) {
  if (record.id === selectedRecord.value.id) { void router.replace({ query: { ...route.query, record: record.id } }); return }
  if (!(await confirmLeaveRecord())) return
  selectedRecordId.value = record.id
  syncRecord(record)
  void router.replace({ query: { ...route.query, record: record.id } })
}

watch(() => route.query.record, (value) => {
  if (typeof value === 'string') {
    const record = clinicalStore.records.find((item) => item.id === value)
    if (record) selectRecord(record)
  }
})

function saveRecord(submit = false) {
  if (!canEdit.value) return
  runRecordAction(() => clinicalStore.saveRecord(selectedRecord.value.id, { ...editableRecord }, actor.value, submit), submit ? 'Medical record submitted for senior review.' : 'Medical record draft saved in this browser.')
}

function generateRecord() {
  if (!canEdit.value) return
  runRecordAction(() => {
    const record = clinicalStore.createAiRecord(actor.value, selectedRecord.value.patientId)
    void selectRecord(record)
  }, 'Demo AI draft generated for the selected patient. Review each item.')
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
  const saved = runRecordAction(() => {
    if (editingOrderId.value) clinicalStore.updateOrder(selectedRecord.value.id, editingOrderId.value, orderForm.content.trim(), actor.value)
    else clinicalStore.addOrder(selectedRecord.value.id, { type: orderForm.type, content: orderForm.content.trim() }, actor.value)
  }, editingOrderId.value ? 'Order updated.' : 'Order added.')
  if (saved) orderDialogVisible.value = false
}

async function stopOrder(order: MedicalOrder) {
  try {
    await ElMessageBox.confirm('The order will remain in the medical record after it is stopped. Continue?', 'Stop Order', { confirmButtonText: 'Stop Order', cancelButtonText: 'Cancel', type: 'warning' })
    runRecordAction(() => clinicalStore.stopOrder(selectedRecord.value.id, order.id, actor.value), 'Order stopped.')
  } catch {
    // Keep the current order status when the user cancels.
  }
}

function review(status: 'approved' | 'returned') {
  if (!reviewNote.value.trim()) {
    ElMessage.warning('Enter a review note.')
    return
  }
  runRecordAction(() => clinicalStore.updateRecordStatus(selectedRecord.value.id, status, reviewNote.value.trim(), actor.value), status === 'approved' ? 'Medical record approved.' : 'Medical record returned for revision.')
}

function archiveRecord() {
  runRecordAction(() => clinicalStore.updateRecordStatus(selectedRecord.value.id, 'archived', reviewNote.value || 'Review completed and archived.', actor.value), 'Medical record archived.')
}

function exportRecord() {
  if (missingRequestedRecord.value) return
  const record = selectedRecord.value
  const orders = record.orders.map((order) => `${order.type}: ${order.content} (${order.status === 'active' ? 'Active' : 'Stopped'})`).join('\n')
  downloadText(`${record.patientName}-${record.id}-Medical-Record.txt`, `Medical Record ${record.id}\nPatient ID: ${record.patientId}\nCurrent patient name: ${profileUnavailable.value ? 'Profile unavailable' : recordIdentity.value.currentName}\nPatient name recorded in this document (snapshot): ${record.patientName}\nPhysician: ${record.doctor}\nChief complaint: ${record.chiefComplaint}\nPresent illness: ${record.presentIllness}\nDiagnosis: ${record.diagnosis}\n\nOrders\n${orders}\n\nReview note: ${record.reviewNote ?? 'None'}`)
  ElMessage.success('Medical record exported.')
}

syncRecord(selectedRecord.value)
function recordAllergyText(patientId: string) {
  const patient = clinicalStore.patients.find(item => item.id === patientId)
  return patient && !clinicalStore.patientsError ? allergyText(patient) : 'Profile unavailable; current allergy status cannot be verified'
}
</script>

<template>
  <div class="view-stack">
    <PageHeader title="Medical Records" description="Review and complete structured medical records">
      <el-button v-if="!selectedRecord.sourceConsultationId" :icon="Sparkles" :disabled="!canEdit" @click="generateRecord">Generate AI Draft</el-button>
      <el-button :icon="Download" :disabled="missingRequestedRecord" @click="exportRecord">Export Record</el-button>
      <el-button :icon="Save" :disabled="!canEdit" @click="saveRecord(false)">Save Draft</el-button>
      <el-button :icon="Send" type="primary" :disabled="!canEdit" @click="saveRecord(true)">Submit for Review</el-button>
    </PageHeader>
    <el-alert v-if="clinicalStore.consultationRecordsError" title="Consultation records could not be loaded" type="error" :closable="false"><p>{{ clinicalStore.consultationRecordsError }}</p><el-button :loading="clinicalStore.consultationRecordsLoading" @click="reloadRecords">Retry loading records</el-button></el-alert>
    <el-alert v-if="saveError" title="Record changes were not saved" type="error" :closable="false"><p>{{ saveError }} Your form input is kept for retry.</p></el-alert>
    <el-alert v-if="missingRequestedRecord" title="Medical record not found" type="warning" :closable="false"><p>The requested record ID does not exist. Choose a record from the queue.</p></el-alert>
    <section v-else class="source-note patient-identity"><strong>Patient ID: {{ recordIdentity.patientId }}</strong><p>Current patient profile: {{ profileUnavailable ? 'Profile unavailable' : recordIdentity.currentName }}</p><p>Name recorded in this document (snapshot): {{ recordIdentity.snapshotName }}</p><p v-if="profileUnavailable">Saved content remains readable. Current patient details are unavailable, so clinical changes are disabled.</p><el-button v-else size="small" @click="router.push({ path: '/patients', query: { patient: recordIdentity.patientId } })">Open Patient Profile</el-button></section>
    <section v-if="!missingRequestedRecord && selectedRecord.sourceConsultationId" class="source-note"><strong>From saved consultation summary</strong><p>Copied from session {{ selectedRecord.sourceConsultationId }}. This record is saved in this browser. Review the copied content before submission; no orders are generated.</p><p v-if="sourceChanged">The consultation summary has changed since this draft was created. Review the source and update this record manually; your edits have been kept.</p><el-button size="small" @click="router.push({ path: '/consultation', query: { session: selectedRecord.sourceConsultationId } })">View Source Consultation</el-button></section>

    <p v-if="authStore.currentRole === 'admin'" class="permission-note">You are viewing as an administrator. Administrators can audit records but cannot edit clinical content.</p>

    <section class="records-layout">
      <article class="panel record-list-panel">
        <div class="panel-header"><div><h2 class="panel-title">Record Queue</h2><p class="panel-subtitle">Sorted by most recent update</p></div></div>
        <div class="record-list">
          <button v-for="record in clinicalStore.records" :key="record.id" type="button" :class="{ active: record.id === selectedRecord.id }" @click="selectRecord(record)">
            <div><span>{{ record.id }}</span><StatusBadge :status="record.status" type="record" /></div>
            <strong>{{ recordPatientName(record) }}</strong>
            <p>{{ record.chiefComplaint }}</p>
            <small>{{ formatConsultationTime(record.updatedAt) }}</small>
          </button>
        </div>
      </article>

      <article v-if="!missingRequestedRecord" class="panel workspace-panel">
        <div class="panel-header">
          <div><h2 class="panel-title">{{ recordPatientName(selectedRecord) }} · Structured Medical Record</h2><p class="panel-subtitle">{{ selectedRecord.doctor }} · {{ formatConsultationTime(selectedRecord.updatedAt) }}</p></div>
          <StatusBadge :status="selectedRecord.status" type="record" />
        </div>

        <div class="emr-layout">
          <div class="emr-main">
            <el-form label-position="top" class="emr-form">
              <el-form-item label="Chief Complaint"><el-input v-model="editableRecord.chiefComplaint" aria-label="Chief Complaint" :maxlength="1000" :disabled="!canEdit" /></el-form-item>
              <el-form-item label="Present Illness"><el-input v-model="editableRecord.presentIllness" aria-label="Present Illness" :maxlength="12000" type="textarea" :rows="5" resize="none" :disabled="!canEdit" /></el-form-item>
              <el-form-item label="Preliminary Diagnosis"><el-input v-model="editableRecord.diagnosis" aria-label="Preliminary Diagnosis" :maxlength="3000" :disabled="!canEdit" /></el-form-item>
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
            <section class="risk-section"><h3>Order Risk Alert</h3><p>Patient allergies: {{ recordAllergyText(selectedRecord.patientId) }}. Confirm again before prescribing related medication.</p></section>
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

    <el-dialog v-model="orderDialogVisible" append-to-body :title="editingOrderId ? 'Edit Order' : 'Add Order'" width="min(520px, 95vw)">
      <el-form label-position="top"><el-form-item label="Order Type"><el-select v-model="orderForm.type" :disabled="Boolean(editingOrderId)"><el-option v-for="type in ['Medication', 'Examination', 'Laboratory', 'Nursing']" :key="type" :label="type" :value="type" /></el-select></el-form-item><el-form-item label="Order Details"><el-input v-model="orderForm.content" type="textarea" :rows="4" /></el-form-item></el-form>
      <template #footer><el-button @click="orderDialogVisible = false">Cancel</el-button><el-button type="primary" @click="submitOrder">Save Order</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.source-note { padding: 14px; border: 1px solid var(--border); border-radius: 4px; background: #eff6f8; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.source-note p { margin: 5px 0 10px; color: var(--muted); }
.permission-note { margin: 0; padding: 10px 13px; border: 1px solid #d6c28f; border-radius: var(--radius); color: #75551c; background: #fffaf0; font-size: 12px; }
.records-layout { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 16px; align-items: start; }
.record-list-panel { position: sticky; top: 80px; }
.record-list { display: grid; }
.record-list > button { display: grid; gap: 7px; width: 100%; min-height: 116px; padding: 13px; border: 0; border-bottom: 1px solid var(--border); text-align: left; background: #fff; cursor: pointer; }
.record-list > button:last-child { border-bottom: 0; }
.record-list > button:hover { background: var(--panel-soft); }
.record-list > button.active { background: #eef5f7; box-shadow: inset 3px 0 0 var(--primary); }
.record-list > button > div { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.record-list > button > div > span:first-child { min-width: 0; overflow-wrap: anywhere; }
.record-list > button > div > :last-child { flex-shrink: 0; }
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
