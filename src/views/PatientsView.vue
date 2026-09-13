<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Edit3, FolderInput, Plus, Search } from '@lucide/vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PatientSummary from '@/components/patients/PatientSummary.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import VitalTrendChart from '@/components/charts/VitalTrendChart.vue'
import { useAuthStore } from '@/stores/auth'
import { useClinicalStore } from '@/stores/clinical'
import type { Patient } from '@/types/clinical'

const route = useRoute()
const authStore = useAuthStore()
const clinicalStore = useClinicalStore()
const filters = reactive({ keyword: '', group: '', status: '' })
const requestedPatient = typeof route.query.patient === 'string' ? route.query.patient : ''
const selectedPatientId = shallowRef(clinicalStore.patients.some((item) => item.id === requestedPatient) ? requestedPatient : clinicalStore.selectedPatientId)
const selectedRows = shallowRef<Patient[]>([])
const activeTab = shallowRef('overview')
const newDialogVisible = shallowRef(false)
const editDialogVisible = shallowRef(false)
const groupDialogVisible = shallowRef(false)
const groupName = shallowRef('Priority Chronic Care')

const newForm = reactive({ name: '', gender: 'Male' as Patient['gender'], age: 65, diagnosis: '', group: 'Routine Follow-up' })
const editForm = reactive({ diagnosis: '', history: '', allergies: '', plan: '' })

const actor = computed(() => ({ name: authStore.profile.name, role: authStore.roleLabel, department: authStore.profile.department }))
const canEdit = computed(() => authStore.currentRole !== 'admin')
const groupOptions = computed(() => Array.from(new Set(clinicalStore.patients.map((patient) => patient.group))))
const selectedPatient = computed(() => clinicalStore.patients.find((patient) => patient.id === selectedPatientId.value) ?? clinicalStore.patients[0]!)
const filteredPatients = computed(() => clinicalStore.patients.filter((patient) => {
  const text = `${patient.id}${patient.name}${patient.diagnosis}${patient.group}${patient.history}`.toLowerCase()
  const keyword = filters.keyword.trim().toLowerCase()
  return (!keyword || text.includes(keyword)) && (!filters.group || patient.group === filters.group) && (!filters.status || patient.status === filters.status)
}))

watch(() => route.query.patient, (value) => {
  if (typeof value === 'string' && clinicalStore.patients.some((item) => item.id === value)) handleRowClick({ id: value })
})

function handleRowClick(row: { id: string }) {
  selectedPatientId.value = row.id
  activeTab.value = 'overview'
  clinicalStore.selectPatient(row.id, actor.value)
}

function handleSelectionChange(rows: Patient[]) {
  selectedRows.value = rows
}

function submitNewPatient() {
  if (!canEdit.value) return
  if (!newForm.name.trim() || !newForm.diagnosis.trim()) {
    ElMessage.warning('Enter the patient name and primary diagnosis.')
    return
  }
  const patient = clinicalStore.addPatient({ ...newForm, name: newForm.name.trim(), diagnosis: newForm.diagnosis.trim() }, actor.value)
  selectedPatientId.value = patient.id
  newDialogVisible.value = false
  Object.assign(newForm, { name: '', gender: 'Male', age: 65, diagnosis: '', group: 'Routine Follow-up' })
  ElMessage.success('Patient profile created.')
}

function openEditDialog() {
  if (!canEdit.value) return
  Object.assign(editForm, {
    diagnosis: selectedPatient.value.diagnosis,
    history: selectedPatient.value.history,
    allergies: selectedPatient.value.allergies.join(', '),
    plan: selectedPatient.value.plan,
  })
  editDialogVisible.value = true
}

function submitEdit() {
  if (!canEdit.value) return
  clinicalStore.updatePatient(selectedPatient.value.id, {
    diagnosis: editForm.diagnosis,
    history: editForm.history,
    allergies: editForm.allergies.split(',').map((item) => item.trim()).filter(Boolean),
    plan: editForm.plan,
  }, actor.value)
  editDialogVisible.value = false
  ElMessage.success('Patient profile updated.')
}

function openGroupDialog() {
  if (!canEdit.value) return
  if (!selectedRows.value.length) {
    ElMessage.warning('Select patients before changing their group.')
    return
  }
  groupDialogVisible.value = true
}

function submitGroup() {
  if (!canEdit.value) return
  if (!groupName.value.trim()) return
  clinicalStore.batchGroup(selectedRows.value.map((item) => item.id), groupName.value.trim(), actor.value)
  groupDialogVisible.value = false
  ElMessage.success(`Updated the care group for ${selectedRows.value.length} patients.`)
}
</script>

<template>
  <div class="view-stack">
    <PageHeader title="Patient Management" description="Find patients by name, ID, symptom, diagnosis, or care status and maintain complete health profiles">
      <el-button :icon="Plus" type="primary" :disabled="!canEdit" @click="newDialogVisible = true">New Patient</el-button>
      <el-button :icon="FolderInput" :disabled="!canEdit" @click="openGroupDialog">Bulk Group</el-button>
    </PageHeader>

    <p v-if="!canEdit" class="permission-note">You are viewing as an administrator. Administrators can inspect patient information and access logs but cannot edit clinical records.</p>

    <section class="patients-layout">
      <article class="panel patient-table-panel">
        <div class="panel-header">
          <div><h2 class="panel-title">Patient List</h2><p class="panel-subtitle">{{ filteredPatients.length }} patients · Select a row to view the profile</p></div>
        </div>
        <div class="panel-body table-body">
          <div class="filter-bar">
            <el-input v-model="filters.keyword" clearable placeholder="Name, ID, symptom, or diagnosis"><template #prefix><Search :size="16" /></template></el-input>
            <el-select v-model="filters.group" clearable placeholder="Patient Group"><el-option v-for="group in groupOptions" :key="group" :label="group" :value="group" /></el-select>
            <el-select v-model="filters.status" clearable placeholder="Risk Status"><el-option label="Stable" value="stable" /><el-option label="Needs Attention" value="warning" /><el-option label="High Risk" value="critical" /></el-select>
          </div>
          <el-table :data="filteredPatients" height="560" highlight-current-row @row-click="handleRowClick" @selection-change="handleSelectionChange">
            <el-table-column type="selection" width="42" />
            <el-table-column prop="name" label="Name" min-width="95" />
            <el-table-column prop="age" label="Age" width="66" />
            <el-table-column prop="diagnosis" label="Primary Diagnosis" min-width="170" show-overflow-tooltip />
            <el-table-column prop="group" label="Care Group" min-width="125" show-overflow-tooltip />
            <el-table-column label="Status" width="88"><template #default="{ row }"><StatusBadge :status="row.status" type="patient" /></template></el-table-column>
            <el-table-column prop="lastVisit" label="Last Consultation" width="112" />
          </el-table>
        </div>
      </article>

      <article class="panel detail-panel">
        <div class="panel-header">
          <div><h2 class="panel-title">Patient Profile</h2><p class="panel-subtitle">{{ selectedPatient.id }} · Primary Physician {{ selectedPatient.ownerDoctor }}</p></div>
          <el-button :icon="Edit3" size="small" :disabled="!canEdit" @click="openEditDialog">Edit Profile</el-button>
        </div>
        <div class="detail-tabs">
          <el-tabs v-model="activeTab">
            <el-tab-pane label="Overview" name="overview"><PatientSummary :patient="selectedPatient" /></el-tab-pane>
            <el-tab-pane label="Medical History" name="history">
              <dl class="record-detail">
                <div><dt>Primary Diagnosis</dt><dd>{{ selectedPatient.diagnosis }}</dd></div>
                <div><dt>Medical History</dt><dd>{{ selectedPatient.history }}</dd></div>
                <div><dt>Drug Allergies</dt><dd>{{ selectedPatient.allergies.join(', ') }}</dd></div>
              </dl>
            </el-tab-pane>
            <el-tab-pane label="Health Data" name="health"><VitalTrendChart :patient="selectedPatient" /></el-tab-pane>
            <el-tab-pane label="Care Plan" name="plan">
              <dl class="record-detail"><div><dt>Current Plan</dt><dd>{{ selectedPatient.plan }}</dd></div><div><dt>Last Consultation</dt><dd>{{ selectedPatient.lastVisit }}</dd></div></dl>
            </el-tab-pane>
          </el-tabs>
        </div>
      </article>
    </section>

    <el-dialog v-model="newDialogVisible" title="Create Patient Profile" width="520px">
      <el-form label-position="top">
        <div class="form-grid"><el-form-item label="Name"><el-input v-model="newForm.name" /></el-form-item><el-form-item label="Gender"><el-select v-model="newForm.gender"><el-option label="Male" value="Male" /><el-option label="Female" value="Female" /></el-select></el-form-item></div>
        <div class="form-grid"><el-form-item label="Age"><el-input-number v-model="newForm.age" :min="1" :max="120" /></el-form-item><el-form-item label="Care Group"><el-input v-model="newForm.group" /></el-form-item></div>
        <el-form-item label="Primary Diagnosis"><el-input v-model="newForm.diagnosis" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="newDialogVisible = false">Cancel</el-button><el-button type="primary" @click="submitNewPatient">Create Profile</el-button></template>
    </el-dialog>

    <el-dialog v-model="editDialogVisible" title="Edit Patient Profile" width="620px">
      <el-form label-position="top">
        <el-form-item label="Primary Diagnosis"><el-input v-model="editForm.diagnosis" /></el-form-item>
        <el-form-item label="Medical History"><el-input v-model="editForm.history" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="Allergies"><el-input v-model="editForm.allergies" placeholder="Separate multiple items with commas" /></el-form-item>
        <el-form-item label="Care Plan"><el-input v-model="editForm.plan" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="editDialogVisible = false">Cancel</el-button><el-button type="primary" @click="submitEdit">Save Changes</el-button></template>
    </el-dialog>

    <el-dialog v-model="groupDialogVisible" title="Bulk Change Group" width="440px">
      <p class="dialog-note">Selected {{ selectedRows.length }} patients</p>
      <el-input v-model="groupName" placeholder="Enter a care group name" />
      <template #footer><el-button @click="groupDialogVisible = false">Cancel</el-button><el-button type="primary" @click="submitGroup">Apply Changes</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.permission-note { margin: 0; padding: 10px 13px; border: 1px solid #d6c28f; border-radius: var(--radius); color: #75551c; background: #fffaf0; font-size: 12px; }
.patients-layout { display: grid; grid-template-columns: minmax(560px, 1.45fr) minmax(360px, .75fr); gap: 16px; align-items: start; }
.detail-panel { position: sticky; top: 80px; }
.filter-bar { display: grid; grid-template-columns: minmax(220px, 1fr) 150px 130px; gap: 9px; margin-bottom: 13px; }
.table-body { padding-top: 13px; }
.detail-tabs { padding: 5px 18px 18px; }
.detail-tabs :deep(.el-tabs__content) { padding-top: 8px; }
.record-detail { display: grid; gap: 0; margin: 0; border-top: 1px solid var(--border); }
.record-detail div { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--border); }
.record-detail dt { color: var(--muted); font-size: 12px; }
.record-detail dd { margin: 0; font-size: 13px; line-height: 1.7; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-grid :deep(.el-select), .form-grid :deep(.el-input-number) { width: 100%; }
.dialog-note { margin: 0 0 13px; color: var(--muted); font-size: 13px; }
@media (max-width: 1180px) { .patients-layout { grid-template-columns: 1fr; } .detail-panel { position: static; } }
@media (max-width: 720px) { .filter-bar, .form-grid { grid-template-columns: 1fr; } .patient-table-panel { overflow: hidden; } }
</style>
