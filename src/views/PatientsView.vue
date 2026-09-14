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
const batchDescription = computed(() => batchKind.value === 'managementStatus' ? `修改管理状态为「${managementLabels[batchStatus.value]}」` : `${batchKind.value === 'addDisease' ? '添加' : '移除'}病种：${cleanTags(batchTags.value).join('、') || '尚未选择'}`)
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
  if (index < 0) { invalidTarget.value = true; selectedId.value = ''; table.value?.setCurrentRow(); ElMessage.warning('患者不存在'); return }
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
    ElMessage.success(editingPatient.value ? '患者档案已更新' : '患者档案已建立')
  } catch (error) { saveError.value = error instanceof Error ? error.message : '保存失败，请重试' }
  finally { saving.value = false }
}
function openBatch() {
  if (!canEdit.value || !selectedIds.value.length) return
  batchError.value = ''; batchTags.value = []; batchKind.value = 'addDisease'; batchStatus.value = 'active'; batchVisible.value = true
}
async function submitBatch() {
  if (!canEdit.value || batchSaving.value) return
  if (batchKind.value !== 'managementStatus' && !cleanTags(batchTags.value).length) { batchError.value = '请至少选择一个病种'; return }
  batchSaving.value = true; batchError.value = ''
  const ids = [...selectedIds.value]
  const change: ClassificationChange = batchKind.value === 'managementStatus' ? { kind: 'managementStatus', status: batchStatus.value } : { kind: batchKind.value, tags: cleanTags(batchTags.value) }
  try {
    await store.batchUpdateClassification(ids, change, actor.value)
    batchVisible.value = false; clearSelection(); await nextTick(); settleSelection()
    ElMessage.success(`已调整 ${ids.length} 名患者的分类`)
  } catch (error) { batchError.value = error instanceof Error ? error.message : '调整失败，请重试' }
  finally { batchSaving.value = false }
}
function selectionChanged(rows: Patient[]) { selectedIds.value = rows.map(p => p.id) }
const showValue = (value: string) => value || '未填写'
const showTime = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false })
</script>
<template>
  <div class="view-stack">
    <PageHeader title="患者信息管理" description="检索患者、维护基础档案，按病种与管理状态分类">
      <el-button :icon="Plus" type="primary" :disabled="!canEdit || !!store.patientsError || store.patientsLoading" @click="openForm(null)">新建患者</el-button>
      <el-button :icon="FolderInput" :disabled="!canEdit || !selectedIds.length || !!store.patientsError" @click="openBatch">批量调整<span v-if="selectedIds.length">（{{ selectedIds.length }}）</span></el-button>
    </PageHeader>
    <el-alert title="当前为本地模拟数据，所有患者均为虚构；已保存的档案在本浏览器刷新后保留。" type="info" :closable="false" show-icon />
    <el-alert v-if="!canEdit" title="当前以管理员身份查看，不能新建或修改患者档案。" type="warning" :closable="false" />
    <el-alert v-if="store.patientsWarning" :title="store.patientsWarning" type="warning" :closable="false" show-icon />
    <section class="patients-layout">
      <article class="panel patient-table-panel" v-loading="store.patientsLoading" element-loading-text="正在加载患者信息">
        <div class="panel-header"><div><h2 class="panel-title">患者列表</h2><p class="panel-subtitle">共 {{ filtered.length }} 名患者 · 点击行查看档案</p></div></div>
        <div class="panel-body">
          <div class="filter-bar">
            <el-input v-model="filters.keyword" aria-label="搜索患者" clearable placeholder="姓名、ID、症状、诊断或病史"><template #prefix><Search :size="16" /></template></el-input>
            <el-select v-model="filters.disease" aria-label="筛选病种" clearable filterable placeholder="全部病种"><el-option v-for="tag in diseaseOptions" :key="tag" :label="tag" :value="tag" /></el-select>
            <el-select v-model="filters.status" aria-label="筛选管理状态" clearable placeholder="全部管理状态"><el-option v-for="(label, value) in managementLabels" :key="value" :label="label" :value="value" /></el-select>
            <el-button :icon="RotateCcw" @click="resetFilters">重置</el-button>
          </div>
          <div v-if="store.patientsError" class="load-error" role="alert"><p>{{ store.patientsError }}</p><el-button @click="load">重新加载</el-button></div>
          <template v-else>
            <el-table ref="table" :data="visiblePatients" row-key="id" highlight-current-row @row-click="selectPatient" @selection-change="selectionChanged">
              <el-table-column type="selection" width="42" :selectable="() => canEdit" />
              <el-table-column prop="id" label="患者 ID" min-width="145" show-overflow-tooltip />
              <el-table-column prop="name" label="姓名" width="96" />
              <el-table-column label="性别 / 年龄" width="105"><template #default="{ row }">{{ row.gender }} / {{ row.age }} 岁</template></el-table-column>
              <el-table-column label="主要诊断" min-width="160" show-overflow-tooltip><template #default="{ row }">{{ showValue(row.diagnosis) }}</template></el-table-column>
              <el-table-column label="病种标签" min-width="160"><template #default="{ row }"><div class="tags"><el-tag v-for="tag in row.diseaseTags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag><span v-if="!row.diseaseTags.length" class="muted">未分类</span></div></template></el-table-column>
              <el-table-column label="管理状态" width="100"><template #default="{ row }"><el-tag :type="row.managementStatus === 'active' ? 'success' : row.managementStatus === 'pending' ? 'warning' : 'info'" size="small">{{ managementLabels[row.managementStatus as PatientManagementStatus] }}</el-tag></template></el-table-column>
              <el-table-column prop="lastVisit" label="最近问诊" width="112" />
              <template #empty><el-empty :description="store.patients.length ? '未找到匹配患者，请调整筛选条件' : '暂无患者，可新建患者档案'" :image-size="64" /></template>
            </el-table>
            <div class="pagination"><span class="selection-note">已选 {{ selectedIds.length }} 名（仅当前页）</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10, 20, 50]" :total="filtered.length" layout="sizes, prev, pager, next" :pager-count="5" size="small" /></div>
          </template>
        </div>
      </article>
      <article class="panel detail-panel">
        <div class="panel-header"><div><h2 class="panel-title">患者档案</h2><p class="panel-subtitle">基础信息与医疗背景</p></div><el-button :icon="Edit3" size="small" :disabled="!canEdit || !selectedPatient || store.patientsLoading" @click="openForm(selectedPatient)">编辑档案</el-button></div>
        <div v-if="selectedPatient && !store.patientsLoading" class="detail-body">
          <div class="patient-heading"><h3>{{ selectedPatient.name }}</h3><span>{{ selectedPatient.gender }} · {{ selectedPatient.age }} 岁</span></div>
          <p class="patient-id">{{ selectedPatient.id }}</p>
          <el-tabs v-model="activeTab">
            <el-tab-pane label="基础信息" name="basic"><dl class="record-detail">
              <div><dt>联系电话</dt><dd>{{ showValue(selectedPatient.phone) }}</dd></div><div><dt>居住地址</dt><dd>{{ showValue(selectedPatient.address) }}</dd></div>
              <div><dt>紧急联系人</dt><dd>{{ showValue(selectedPatient.emergencyName) }}<span v-if="selectedPatient.emergencyRelation">（{{ selectedPatient.emergencyRelation }}）</span></dd></div>
              <div><dt>紧急电话</dt><dd>{{ showValue(selectedPatient.emergencyPhone) }}</dd></div>
              <div><dt>病种标签</dt><dd class="tags"><el-tag v-for="tag in selectedPatient.diseaseTags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag><span v-if="!selectedPatient.diseaseTags.length">未分类</span></dd></div>
              <div><dt>管理状态</dt><dd>{{ managementLabels[selectedPatient.managementStatus] }}</dd></div><div><dt>责任医生</dt><dd>{{ selectedPatient.ownerDoctor }}</dd></div>
              <div><dt>最近问诊</dt><dd>{{ selectedPatient.lastVisit }}</dd></div><div><dt>创建时间</dt><dd>{{ showTime(selectedPatient.createdAt) }}</dd></div><div><dt>更新时间</dt><dd>{{ showTime(selectedPatient.updatedAt) }}</dd></div>
            </dl></el-tab-pane>
            <el-tab-pane label="医疗背景" name="medical"><dl class="record-detail">
              <div><dt>症状描述</dt><dd>{{ showValue(selectedPatient.symptoms) }}</dd></div><div><dt>主要诊断</dt><dd>{{ showValue(selectedPatient.diagnosis) }}</dd></div>
              <div><dt>既往病史</dt><dd>{{ showValue(selectedPatient.history) }}</dd></div><div><dt>过敏史</dt><dd>{{ allergyText(selectedPatient) }}</dd></div>
            </dl></el-tab-pane>
          </el-tabs>
        </div>
        <el-empty v-else :description="store.patientsLoading ? '正在加载患者信息' : store.patientsError ? '患者档案暂不可用，请重新加载' : invalidTarget ? '患者不存在，请从列表选择患者' : filtered.length ? '请选择患者查看档案' : '暂无可显示的患者档案'" :image-size="72" />
      </article>
    </section>
    <PatientFormDialog v-model="formVisible" :patient="editingPatient" :disease-options="diseaseOptions" :saving="saving" :save-error="saveError" @save="save" />
    <el-dialog v-model="batchVisible" title="批量调整患者分类" width="min(500px, calc(100vw - 24px))" :close-on-click-modal="false" :close-on-press-escape="!batchSaving" :show-close="!batchSaving">
      <el-alert v-if="batchError" :title="batchError" type="error" :closable="false" class="batch-alert" />
      <el-form label-position="top" :disabled="batchSaving">
        <el-form-item label="调整方式"><el-select v-model="batchKind" aria-label="调整方式"><el-option label="添加病种" value="addDisease" /><el-option label="移除病种" value="removeDisease" /><el-option label="修改管理状态" value="managementStatus" /></el-select></el-form-item>
        <el-form-item v-if="batchKind !== 'managementStatus'" label="病种"><el-select v-model="batchTags" aria-label="批量病种" multiple filterable :allow-create="batchKind === 'addDisease'" default-first-option :reserve-keyword="false" placeholder="选择病种"><el-option v-for="tag in diseaseOptions" :key="tag" :value="tag" :label="tag" /></el-select></el-form-item>
        <el-form-item v-else label="管理状态"><el-select v-model="batchStatus" aria-label="批量管理状态"><el-option v-for="(label, value) in managementLabels" :key="value" :value="value" :label="label" /></el-select></el-form-item>
      </el-form>
      <p class="batch-summary">将对 <strong>{{ selectedIds.length }}</strong> 名患者执行：{{ batchDescription }}</p>
      <template #footer><el-button :disabled="batchSaving" @click="batchVisible = false">取消</el-button><el-button type="primary" :loading="batchSaving" :disabled="!selectedIds.length" @click="submitBatch">确认调整</el-button></template>
    </el-dialog>
  </div>
</template>
<style scoped>
.patients-layout { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(310px, 1fr); gap: 16px; align-items: start; }
.patient-table-panel { overflow: hidden; }
.detail-panel { position: sticky; top: 80px; }
.filter-bar { display: grid; grid-template-columns: minmax(180px, 1fr) 130px 140px auto; gap: 8px; margin-bottom: 14px; }
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
.record-detail > div { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--border); }
.record-detail dt { color: var(--muted); font-size: 12px; }
.record-detail dd { margin: 0; font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; white-space: pre-wrap; }
.load-error { padding: 30px 12px; text-align: center; color: var(--red); }
.batch-summary { padding: 12px; background: var(--panel-soft); font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
.batch-alert { margin-bottom: 12px; }
@media (max-width: 1250px) { .patients-layout { grid-template-columns: minmax(0, 1fr); } .detail-panel { position: static; } }
@media (max-width: 720px) { .filter-bar { grid-template-columns: minmax(0, 1fr); } .panel-body { padding: 12px; } .pagination :deep(.el-pagination) { flex-wrap: wrap; gap: 8px; } .pagination :deep(.el-pagination__sizes) { margin-right: 0; } }
</style>
