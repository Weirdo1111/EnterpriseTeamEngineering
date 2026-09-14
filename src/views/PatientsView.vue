<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { TableInstance } from 'element-plus'
import { Edit3, FolderInput, Plus, Search, RotateCcw } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PatientFormDialog from '@/components/patients/PatientFormDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { useClinicalStore } from '@/stores/clinical'
import type { ClassificationChange, Patient, PatientInput, PatientManagementStatus } from '@/types/clinical'
import { allergyText, cleanTags, defaultDiseaseTags, filterPatients, managementLabels } from '@/utils/patients'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const store = useClinicalStore()
const filters = reactive({ keyword: '', disease: '', status: '' })
const page = ref(1)
const pageSize = ref(10)
const table = ref<TableInstance>()
const selectedId = ref('')
const invalidTarget = ref(false)
const selectedIds = ref<string[]>([])
const activeTab = ref('basic')
const formVisible = ref(false)
const editingPatient = ref<Patient | null>(null)
const saving = ref(false)
const saveError = ref('')
const batchVisible = ref(false)
const batchSaving = ref(false)
const batchError = ref('')
const batchKind = ref<ClassificationChange['kind']>('addDisease')
const batchTags = ref<string[]>([])
const batchStatus = ref<PatientManagementStatus>('active')
const canEdit = computed(() => auth.currentRole === 'doctor' || auth.currentRole === 'seniorDoctor')
const actor = computed(() => ({ name: auth.profile.name, role: auth.roleLabel, department: auth.profile.department }))
const filtered = computed(() => filterPatients(store.patients, filters))
const visiblePatients = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const selectedPatient = computed(() => !invalidTarget.value && !store.patientsError ? visiblePatients.value.find(p => p.id === selectedId.value) ?? null : null)
const diseaseOptions = computed(() => cleanTags([...defaultDiseaseTags, ...store.patients.flatMap(p => p.diseaseTags)]))
const batchDescription = computed(() => batchKind.value === 'managementStatus' ? `Set management status to ${managementLabels[batchStatus.value]}` : `${batchKind.value === 'addDisease' ? 'Add' : 'Remove'} conditions: ${cleanTags(batchTags.value).join(', ') || 'None selected'}`)
function clearSelection() { selectedIds.value = []; table.value?.clearSelection() }
function selectPatient(patient: Patient) {
  selectedId.value = patient.id; invalidTarget.value = false; activeTab.value = 'basic'
  store.selectPatient(patient.id, actor.value)
  void nextTick(() => table.value?.setCurrentRow(patient))
}
function settleSelection() {
  clearSelection()
  if (invalidTarget.value) return
  const patient = visiblePatients.value.find(p => p.id === selectedId.value) ?? visiblePatients.value[0]
  if (patient) {
    if (patient.id !== selectedId.value) selectPatient(patient)
    else void nextTick(() => table.value?.setCurrentRow(patient))
  } else selectedId.value = ''
}
watch(filters, () => { page.value = 1; invalidTarget.value = false; settleSelection() }, { flush: 'post' })
watch([page, pageSize], () => settleSelection(), { flush: 'post' })
watch(pageSize, () => { page.value = 1 })
watch(filtered, () => {
  page.value = Math.min(page.value, Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))
  settleSelection()
}, { flush: 'post' })
function resetFilters() { Object.assign(filters, { keyword: '', disease: '', status: '' }); page.value = 1; invalidTarget.value = false; settleSelection() }
async function locate(id: string) {
  resetFilters(); await nextTick()
  const index = filtered.value.findIndex(p => p.id === id)
  if (index < 0) { invalidTarget.value = true; selectedId.value = ''; table.value?.setCurrentRow(); ElMessage.warning('Patient not found'); return }
  page.value = Math.floor(index / pageSize.value) + 1
  selectPatient(filtered.value[index]!); await nextTick(); table.value?.setCurrentRow(filtered.value[index]!)
}
watch(() => route.query.patient, async id => { if (typeof id === 'string') await locate(id) })
async function load() {
  try {
    await store.loadPatients(true)
    if (typeof route.query.patient === 'string') await locate(route.query.patient)
    else { invalidTarget.value = false; settleSelection() }
  } catch { /* Store exposes the error and retry action. */ }
}
onMounted(() => {
  if (store.patientsError) return
  if (typeof route.query.patient === 'string') void locate(route.query.patient)
  else settleSelection()
})
function openForm(patient: Patient | null) {
  if (!canEdit.value) return
  editingPatient.value = patient; saveError.value = ''; formVisible.value = true
}
async function save(input: PatientInput) {
  if (!canEdit.value || saving.value) return
  saving.value = true; saveError.value = ''
  try {
    const patient = editingPatient.value ? await store.updatePatient(editingPatient.value.id, input, actor.value) : await store.addPatient(input, actor.value)
    formVisible.value = false
    if (!editingPatient.value) { await locate(patient.id); await router.replace({ query: { ...route.query, patient: patient.id } }) }
    else { await nextTick(); settleSelection() }
    ElMessage.success(editingPatient.value ? 'Patient profile updated.' : 'Patient profile created.')
  } catch (error) { saveError.value = error instanceof Error ? error.message : 'Save failed. Please retry.' }
  finally { saving.value = false }
}
function openBatch() {
  if (!canEdit.value || !selectedIds.value.length) return
  batchError.value = ''; batchTags.value = []; batchKind.value = 'addDisease'; batchStatus.value = 'active'; batchVisible.value = true
}
async function submitBatch() {
  if (!canEdit.value || batchSaving.value) return
  if (batchKind.value !== 'managementStatus' && !cleanTags(batchTags.value).length) { batchError.value = 'Select at least one condition.'; return }
  batchSaving.value = true; batchError.value = ''
  const ids = [...selectedIds.value]
  const change: ClassificationChange = batchKind.value === 'managementStatus' ? { kind: 'managementStatus', status: batchStatus.value } : { kind: batchKind.value, tags: cleanTags(batchTags.value) }
  try {
    await store.batchUpdateClassification(ids, change, actor.value)
    batchVisible.value = false; clearSelection(); await nextTick(); settleSelection()
    ElMessage.success(`Updated classifications for ${ids.length} patients.`)
  } catch (error) { batchError.value = error instanceof Error ? error.message : 'Update failed. Please retry.' }
  finally { batchSaving.value = false }
}
function selectionChanged(rows: Patient[]) { selectedIds.value = rows.map(p => p.id) }
const showValue = (value: string) => value || 'Not provided'
const showTime = (value: string) => new Date(value).toLocaleString('en-US', { hour12: false })
</script>
<template>
  <div class="view-stack">
    <PageHeader title="Patient Information Management" description="Find patients, maintain profiles, and classify by condition and management status">
      <el-button :icon="Plus" type="primary" :disabled="!canEdit || !!store.patientsError || store.patientsLoading" @click="openForm(null)">New Patient</el-button>
      <el-button :icon="FolderInput" :disabled="!canEdit || !selectedIds.length || !!store.patientsError" @click="openBatch">Bulk Update<span v-if="selectedIds.length"> ({{ selectedIds.length }})</span></el-button>
    </PageHeader>
    <el-alert title="All patients are fictional demo data. Saved profiles remain available after refreshing this browser." type="info" :closable="false" show-icon />
    <el-alert v-if="!canEdit" title="Administrator view: patient profiles are read-only." type="warning" :closable="false" />
    <el-alert v-if="store.patientsWarning" :title="store.patientsWarning" type="warning" :closable="false" show-icon />
    <section class="patients-layout">
      <article class="panel patient-table-panel" v-loading="store.patientsLoading" element-loading-text="Loading patient information">
        <div class="panel-header"><div><h2 class="panel-title">Patient List</h2><p class="panel-subtitle">{{ filtered.length }} patients · Select a row to view the profile</p></div></div>
        <div class="panel-body">
          <div class="filter-bar">
            <el-input v-model="filters.keyword" aria-label="Search patients" clearable placeholder="Name, ID, symptoms, diagnosis, or history"><template #prefix><Search :size="16" /></template></el-input>
            <el-select v-model="filters.disease" aria-label="Filter condition" clearable filterable placeholder="All conditions"><el-option v-for="tag in diseaseOptions" :key="tag" :label="tag" :value="tag" /></el-select>
            <el-select v-model="filters.status" aria-label="Filter management status" clearable placeholder="All statuses"><el-option v-for="(label, value) in managementLabels" :key="value" :label="label" :value="value" /></el-select>
            <el-button :icon="RotateCcw" @click="resetFilters">Reset</el-button>
          </div>
          <div v-if="store.patientsError" class="load-error" role="alert"><p>{{ store.patientsError }}</p><el-button @click="load">Reload</el-button></div>
          <template v-else>
            <el-table ref="table" :data="visiblePatients" row-key="id" highlight-current-row @row-click="selectPatient" @selection-change="selectionChanged">
              <el-table-column type="selection" width="42" :selectable="() => canEdit" />
              <el-table-column prop="id" label="Patient ID" min-width="145" show-overflow-tooltip />
              <el-table-column prop="name" label="Name" min-width="145" />
              <el-table-column label="Gender / Age" width="150"><template #default="{ row }">{{ row.gender }} / {{ row.age }} years</template></el-table-column>
              <el-table-column label="Primary Diagnosis" min-width="160" show-overflow-tooltip><template #default="{ row }">{{ showValue(row.diagnosis) }}</template></el-table-column>
              <el-table-column label="Condition Tags" min-width="160"><template #default="{ row }"><div class="tags"><el-tag v-for="tag in row.diseaseTags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag><span v-if="!row.diseaseTags.length" class="muted">Unclassified</span></div></template></el-table-column>
              <el-table-column label="Management Status" width="165"><template #default="{ row }"><el-tag :type="row.managementStatus === 'active' ? 'success' : row.managementStatus === 'pending' ? 'warning' : 'info'" size="small">{{ managementLabels[row.managementStatus as PatientManagementStatus] }}</el-tag></template></el-table-column>
              <el-table-column prop="lastVisit" label="Last Consultation" width="165" />
              <template #empty><el-empty :description="store.patients.length ? 'No matching patients. Adjust your filters.' : 'No patients yet. Create a patient profile.'" :image-size="64" /></template>
            </el-table>
            <div class="pagination"><span class="selection-note">{{ selectedIds.length }} selected (current page only)</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10, 20, 50]" :total="filtered.length" layout="sizes, prev, pager, next" :pager-count="5" size="small" /></div>
          </template>
        </div>
      </article>
      <article class="panel detail-panel">
        <div class="panel-header"><div><h2 class="panel-title">Patient Profile</h2><p class="panel-subtitle">Basic information and medical background</p></div><el-button :icon="Edit3" size="small" :disabled="!canEdit || !selectedPatient || store.patientsLoading" @click="openForm(selectedPatient)">Edit Profile</el-button></div>
        <div v-if="selectedPatient && !store.patientsLoading" class="detail-body">
          <div class="patient-heading"><h3>{{ selectedPatient.name }}</h3><span>{{ selectedPatient.gender }} · {{ selectedPatient.age }} years</span></div>
          <p class="patient-id">{{ selectedPatient.id }}</p>
          <el-tabs v-model="activeTab">
            <el-tab-pane label="Basic Information" name="basic"><dl class="record-detail">
              <div><dt>Phone</dt><dd>{{ showValue(selectedPatient.phone) }}</dd></div><div><dt>Address</dt><dd>{{ showValue(selectedPatient.address) }}</dd></div>
              <div><dt>Emergency Contact</dt><dd>{{ showValue(selectedPatient.emergencyName) }}<span v-if="selectedPatient.emergencyRelation"> ({{ selectedPatient.emergencyRelation }})</span></dd></div>
              <div><dt>Emergency Phone</dt><dd>{{ showValue(selectedPatient.emergencyPhone) }}</dd></div>
              <div><dt>Condition Tags</dt><dd class="tags"><el-tag v-for="tag in selectedPatient.diseaseTags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag><span v-if="!selectedPatient.diseaseTags.length">Unclassified</span></dd></div>
              <div><dt>Management Status</dt><dd>{{ managementLabels[selectedPatient.managementStatus] }}</dd></div><div><dt>Primary Physician</dt><dd>{{ selectedPatient.ownerDoctor }}</dd></div>
              <div><dt>Last Consultation</dt><dd>{{ selectedPatient.lastVisit }}</dd></div><div><dt>Created</dt><dd>{{ showTime(selectedPatient.createdAt) }}</dd></div><div><dt>Updated</dt><dd>{{ showTime(selectedPatient.updatedAt) }}</dd></div>
            </dl></el-tab-pane>
            <el-tab-pane label="Medical Background" name="medical"><dl class="record-detail">
              <div><dt>Symptoms</dt><dd>{{ showValue(selectedPatient.symptoms) }}</dd></div><div><dt>Primary Diagnosis</dt><dd>{{ showValue(selectedPatient.diagnosis) }}</dd></div>
              <div><dt>Medical History</dt><dd>{{ showValue(selectedPatient.history) }}</dd></div><div><dt>Allergies</dt><dd>{{ allergyText(selectedPatient) }}</dd></div>
            </dl></el-tab-pane>
          </el-tabs>
        </div>
        <el-empty v-else :description="store.patientsLoading ? 'Loading patient information' : store.patientsError ? 'Patient profiles are unavailable. Reload to retry.' : invalidTarget ? 'Patient not found. Select a patient from the list.' : filtered.length ? 'Select a patient to view their profile' : 'No patient profile to display'" :image-size="72" />
      </article>
    </section>
    <PatientFormDialog v-model="formVisible" :patient="editingPatient" :disease-options="diseaseOptions" :saving="saving" :save-error="saveError" @save="save" />
    <el-dialog v-model="batchVisible" title="Update Patient Classifications" width="min(500px, calc(100vw - 24px))" :close-on-click-modal="false" :close-on-press-escape="!batchSaving" :show-close="!batchSaving">
      <el-alert v-if="batchError" :title="batchError" type="error" :closable="false" class="batch-alert" />
      <el-form label-position="top" :disabled="batchSaving">
        <el-form-item label="Operation"><el-select v-model="batchKind" aria-label="Operation"><el-option label="Add Conditions" value="addDisease" /><el-option label="Remove Conditions" value="removeDisease" /><el-option label="Change Management Status" value="managementStatus" /></el-select></el-form-item>
        <el-form-item v-if="batchKind !== 'managementStatus'" label="Conditions"><el-select v-model="batchTags" aria-label="Batch conditions" multiple filterable :allow-create="batchKind === 'addDisease'" default-first-option :reserve-keyword="false" placeholder="Select conditions"><el-option v-for="tag in diseaseOptions" :key="tag" :value="tag" :label="tag" /></el-select></el-form-item>
        <el-form-item v-else label="Management Status"><el-select v-model="batchStatus" aria-label="Batch management status"><el-option v-for="(label, value) in managementLabels" :key="value" :value="value" :label="label" /></el-select></el-form-item>
      </el-form>
      <p class="batch-summary"><strong>{{ selectedIds.length }}</strong> patients: {{ batchDescription }}</p>
      <template #footer><el-button :disabled="batchSaving" @click="batchVisible = false">Cancel</el-button><el-button type="primary" :loading="batchSaving" :disabled="!selectedIds.length" @click="submitBatch">Apply Changes</el-button></template>
    </el-dialog>
  </div>
</template>
<style scoped>
.patients-layout { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(310px, 1fr); gap: 16px; align-items: start; }
.patient-table-panel { overflow: hidden; }
.detail-panel { position: sticky; top: 80px; }
.filter-bar { display: grid; grid-template-columns: minmax(180px, 1fr) 150px 155px auto; gap: 8px; margin-bottom: 14px; }
.tags { display: flex; flex-wrap: wrap; gap: 5px; }
.tags :deep(.el-tag) { max-width: 100%; height: auto; min-height: 22px; white-space: normal; overflow-wrap: anywhere; }
.pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-top: 15px; }
.selection-note { color: var(--muted); font-size: 12px; }
.detail-body { padding: 16px 18px; }
.patient-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px; }
.patient-heading h3 { margin: 0; color: var(--text-strong); font-size: 21px; }
.patient-heading span, .patient-id { color: var(--muted); font-size: 12px; }
.patient-id { margin: 8px 0 14px; overflow-wrap: anywhere; }
.record-detail { margin: 0; }
.record-detail > div { display: grid; grid-template-columns: 105px minmax(0, 1fr); gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--border); }
.record-detail dt { color: var(--muted); font-size: 12px; }
.record-detail dd { margin: 0; font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; white-space: pre-wrap; }
.load-error { padding: 30px 12px; text-align: center; color: var(--red); }
.batch-summary { padding: 12px; background: var(--panel-soft); font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
.batch-alert { margin-bottom: 12px; }
@media (max-width: 1250px) { .patients-layout { grid-template-columns: minmax(0, 1fr); } .detail-panel { position: static; } }
@media (max-width: 720px) { .filter-bar { grid-template-columns: minmax(0, 1fr); } .panel-body { padding: 12px; } .pagination :deep(.el-pagination) { flex-wrap: wrap; gap: 8px; } .pagination :deep(.el-pagination__sizes) { margin-right: 0; } }
</style>
