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
const groupName = shallowRef('慢病重点随访')

const newForm = reactive({ name: '', gender: '男' as Patient['gender'], age: 65, diagnosis: '', group: '常规随访' })
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
    ElMessage.warning('请填写患者姓名和主要诊断')
    return
  }
  const patient = clinicalStore.addPatient({ ...newForm, name: newForm.name.trim(), diagnosis: newForm.diagnosis.trim() }, actor.value)
  selectedPatientId.value = patient.id
  newDialogVisible.value = false
  Object.assign(newForm, { name: '', gender: '男', age: 65, diagnosis: '', group: '常规随访' })
  ElMessage.success('患者档案已建立')
}

function openEditDialog() {
  if (!canEdit.value) return
  Object.assign(editForm, {
    diagnosis: selectedPatient.value.diagnosis,
    history: selectedPatient.value.history,
    allergies: selectedPatient.value.allergies.join('、'),
    plan: selectedPatient.value.plan,
  })
  editDialogVisible.value = true
}

function submitEdit() {
  if (!canEdit.value) return
  clinicalStore.updatePatient(selectedPatient.value.id, {
    diagnosis: editForm.diagnosis,
    history: editForm.history,
    allergies: editForm.allergies.split(/[、,，]/).map((item) => item.trim()).filter(Boolean),
    plan: editForm.plan,
  }, actor.value)
  editDialogVisible.value = false
  ElMessage.success('患者档案已更新')
}

function openGroupDialog() {
  if (!canEdit.value) return
  if (!selectedRows.value.length) {
    ElMessage.warning('请先勾选需要调整分组的患者')
    return
  }
  groupDialogVisible.value = true
}

function submitGroup() {
  if (!canEdit.value) return
  if (!groupName.value.trim()) return
  clinicalStore.batchGroup(selectedRows.value.map((item) => item.id), groupName.value.trim(), actor.value)
  groupDialogVisible.value = false
  ElMessage.success(`已调整 ${selectedRows.value.length} 名患者的分组`)
}
</script>

<template>
  <div class="view-stack">
    <PageHeader title="患者管理" description="按姓名、编号、症状、疾病或管理状态查找患者，维护完整健康档案">
      <el-button :icon="Plus" type="primary" :disabled="!canEdit" @click="newDialogVisible = true">新建患者</el-button>
      <el-button :icon="FolderInput" :disabled="!canEdit" @click="openGroupDialog">批量分组</el-button>
    </PageHeader>

    <p v-if="!canEdit" class="permission-note">当前以管理员身份查看。管理员可核查患者资料和访问记录，但不能修改诊疗档案。</p>

    <section class="patients-layout">
      <article class="panel patient-table-panel">
        <div class="panel-header">
          <div><h2 class="panel-title">患者列表</h2><p class="panel-subtitle">共 {{ filteredPatients.length }} 名患者，点击行查看档案</p></div>
        </div>
        <div class="panel-body table-body">
          <div class="filter-bar">
            <el-input v-model="filters.keyword" clearable placeholder="姓名、编号、症状或疾病"><template #prefix><Search :size="16" /></template></el-input>
            <el-select v-model="filters.group" clearable placeholder="患者分组"><el-option v-for="group in groupOptions" :key="group" :label="group" :value="group" /></el-select>
            <el-select v-model="filters.status" clearable placeholder="风险状态"><el-option label="平稳" value="stable" /><el-option label="需关注" value="warning" /><el-option label="高风险" value="critical" /></el-select>
          </div>
          <el-table :data="filteredPatients" height="560" highlight-current-row @row-click="handleRowClick" @selection-change="handleSelectionChange">
            <el-table-column type="selection" width="42" />
            <el-table-column prop="name" label="姓名" min-width="95" />
            <el-table-column prop="age" label="年龄" width="66" />
            <el-table-column prop="diagnosis" label="主要诊断" min-width="170" show-overflow-tooltip />
            <el-table-column prop="group" label="管理分组" min-width="125" show-overflow-tooltip />
            <el-table-column label="状态" width="88"><template #default="{ row }"><StatusBadge :status="row.status" type="patient" /></template></el-table-column>
            <el-table-column prop="lastVisit" label="最近问诊" width="112" />
          </el-table>
        </div>
      </article>

      <article class="panel detail-panel">
        <div class="panel-header">
          <div><h2 class="panel-title">患者档案</h2><p class="panel-subtitle">{{ selectedPatient.id }} · 责任医生 {{ selectedPatient.ownerDoctor }}</p></div>
          <el-button :icon="Edit3" size="small" :disabled="!canEdit" @click="openEditDialog">编辑档案</el-button>
        </div>
        <div class="detail-tabs">
          <el-tabs v-model="activeTab">
            <el-tab-pane label="概览" name="overview"><PatientSummary :patient="selectedPatient" /></el-tab-pane>
            <el-tab-pane label="病史" name="history">
              <dl class="record-detail">
                <div><dt>主要诊断</dt><dd>{{ selectedPatient.diagnosis }}</dd></div>
                <div><dt>既往病史</dt><dd>{{ selectedPatient.history }}</dd></div>
                <div><dt>药物过敏</dt><dd>{{ selectedPatient.allergies.join('、') }}</dd></div>
              </dl>
            </el-tab-pane>
            <el-tab-pane label="健康数据" name="health"><VitalTrendChart :patient="selectedPatient" /></el-tab-pane>
            <el-tab-pane label="管理计划" name="plan">
              <dl class="record-detail"><div><dt>当前计划</dt><dd>{{ selectedPatient.plan }}</dd></div><div><dt>最近问诊</dt><dd>{{ selectedPatient.lastVisit }}</dd></div></dl>
            </el-tab-pane>
          </el-tabs>
        </div>
      </article>
    </section>

    <el-dialog v-model="newDialogVisible" title="新建患者档案" width="520px">
      <el-form label-position="top">
        <div class="form-grid"><el-form-item label="姓名"><el-input v-model="newForm.name" /></el-form-item><el-form-item label="性别"><el-select v-model="newForm.gender"><el-option label="男" value="男" /><el-option label="女" value="女" /></el-select></el-form-item></div>
        <div class="form-grid"><el-form-item label="年龄"><el-input-number v-model="newForm.age" :min="1" :max="120" /></el-form-item><el-form-item label="管理分组"><el-input v-model="newForm.group" /></el-form-item></div>
        <el-form-item label="主要诊断"><el-input v-model="newForm.diagnosis" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="newDialogVisible = false">取消</el-button><el-button type="primary" @click="submitNewPatient">建立档案</el-button></template>
    </el-dialog>

    <el-dialog v-model="editDialogVisible" title="编辑患者档案" width="620px">
      <el-form label-position="top">
        <el-form-item label="主要诊断"><el-input v-model="editForm.diagnosis" /></el-form-item>
        <el-form-item label="既往病史"><el-input v-model="editForm.history" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="过敏史"><el-input v-model="editForm.allergies" placeholder="多项内容使用顿号分隔" /></el-form-item>
        <el-form-item label="管理计划"><el-input v-model="editForm.plan" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="editDialogVisible = false">取消</el-button><el-button type="primary" @click="submitEdit">保存修改</el-button></template>
    </el-dialog>

    <el-dialog v-model="groupDialogVisible" title="批量调整分组" width="440px">
      <p class="dialog-note">已选择 {{ selectedRows.length }} 名患者</p>
      <el-input v-model="groupName" placeholder="输入管理分组名称" />
      <template #footer><el-button @click="groupDialogVisible = false">取消</el-button><el-button type="primary" @click="submitGroup">确认调整</el-button></template>
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
