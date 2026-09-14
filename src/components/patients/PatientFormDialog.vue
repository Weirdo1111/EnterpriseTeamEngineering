<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { Patient, PatientInput } from '@/types/clinical'
import { emptyPatientInput, managementLabels, toPatientInput, validatePatient } from '@/utils/patients'
const props = defineProps<{ modelValue: boolean; patient: Patient | null; diseaseOptions: string[]; saving: boolean; saveError: string }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; save: [PatientInput] }>()
const form = reactive<PatientInput>(emptyPatientInput())
const errors = ref<Partial<Record<keyof PatientInput, string>>>({})
let original = ''
const dirty = computed(() => JSON.stringify(form) !== original)
watch(() => props.modelValue, visible => {
  if (!visible) return
  Object.assign(form, props.patient ? toPatientInput(props.patient) : emptyPatientInput())
  errors.value = {}; original = JSON.stringify(form)
})
async function close() {
  if (props.saving) return
  if (dirty.value) {
    try { await ElMessageBox.confirm('填写内容尚未保存，确定放弃修改吗？', '放弃修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }) }
    catch { return }
  }
  emit('update:modelValue', false)
}
function submit() {
  if (props.saving) return
  errors.value = validatePatient(form)
  if (!Object.keys(errors.value).length) emit('save', toPatientInput(form))
}
</script>
<template>
  <el-dialog :model-value="modelValue" :title="patient ? '编辑患者档案' : '新建患者档案'" width="min(720px, calc(100vw - 24px))" top="5vh" :before-close="close" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving">
    <el-alert v-if="saveError" :title="saveError" type="error" show-icon :closable="false" class="form-alert" />
    <p v-if="patient" class="identity-note">患者 ID：{{ patient.id }} · 责任医生：{{ patient.ownerDoctor }}</p>
    <el-form label-position="top" :model="form" :disabled="saving" @submit.prevent="submit">
      <h3 class="form-section">基础信息</h3>
      <div class="form-grid">
        <el-form-item label="姓名" required :error="errors.name"><el-input v-model="form.name" aria-label="姓名" maxlength="50" /></el-form-item>
        <el-form-item label="性别" required :error="errors.gender"><el-select v-model="form.gender" aria-label="性别"><el-option label="男" value="男" /><el-option label="女" value="女" /></el-select></el-form-item>
        <el-form-item label="年龄" required :error="errors.age"><el-input-number v-model="form.age" aria-label="年龄" :min="1" :max="120" :precision="0" /></el-form-item>
        <el-form-item label="联系电话" :error="errors.phone"><el-input v-model="form.phone" aria-label="联系电话" maxlength="24" placeholder="手机号、座机或国际号码" /></el-form-item>
        <el-form-item label="居住地址" class="full"><el-input v-model="form.address" aria-label="居住地址" maxlength="200" /></el-form-item>
        <el-form-item label="紧急联系人姓名" :error="errors.emergencyName"><el-input v-model="form.emergencyName" aria-label="紧急联系人姓名" maxlength="50" /></el-form-item>
        <el-form-item label="与患者关系"><el-input v-model="form.emergencyRelation" aria-label="与患者关系" maxlength="30" /></el-form-item>
        <el-form-item label="紧急联系电话" :error="errors.emergencyPhone" class="full"><el-input v-model="form.emergencyPhone" aria-label="紧急联系电话" maxlength="24" /></el-form-item>
      </div>
      <h3 class="form-section">医疗背景</h3>
      <el-form-item label="症状描述"><el-input v-model="form.symptoms" aria-label="症状描述" type="textarea" :rows="2" maxlength="2000" /></el-form-item>
      <el-form-item label="主要诊断"><el-input v-model="form.diagnosis" aria-label="主要诊断" maxlength="300" placeholder="尚未明确时可留空" /></el-form-item>
      <el-form-item label="既往病史"><el-input v-model="form.history" aria-label="既往病史" type="textarea" :rows="3" maxlength="5000" /></el-form-item>
      <el-form-item label="过敏史状态" :error="errors.allergyStatus"><el-select v-model="form.allergyStatus" aria-label="过敏史状态"><el-option label="未确认" value="unknown" /><el-option label="无已知过敏" value="none" /><el-option label="有过敏史" value="known" /></el-select></el-form-item>
      <el-form-item v-if="form.allergyStatus === 'known'" label="过敏项" required :error="errors.allergies"><el-select v-model="form.allergies" aria-label="过敏项" multiple filterable allow-create default-first-option :reserve-keyword="false" placeholder="输入过敏项后按回车"><el-option v-for="item in ['青霉素', '头孢类', '磺胺类']" :key="item" :value="item" :label="item" /></el-select></el-form-item>
      <h3 class="form-section">分类信息</h3>
      <el-form-item label="病种标签"><el-select v-model="form.diseaseTags" aria-label="病种标签" multiple filterable allow-create default-first-option :reserve-keyword="false" placeholder="可选择多个病种，输入新病种后按回车"><el-option v-for="tag in diseaseOptions" :key="tag" :value="tag" :label="tag" /></el-select></el-form-item>
      <el-form-item label="管理状态" required :error="errors.managementStatus"><el-select v-model="form.managementStatus" aria-label="管理状态"><el-option v-for="(label, value) in managementLabels" :key="value" :value="value" :label="label" /></el-select></el-form-item>
      <p class="identity-note">管理状态仅用于患者分类，不代表风险等级或病历归档状态。</p>
    </el-form>
    <template #footer><el-button :disabled="saving" @click="close">取消</el-button><el-button type="primary" :loading="saving" @click="submit">{{ patient ? '保存修改' : '建立档案' }}</el-button></template>
  </el-dialog>
</template>
<style scoped>
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.full { grid-column: 1 / -1; }
.form-section { margin: 18px 0 14px; color: var(--text-strong); font-size: 14px; }
.identity-note { margin: 0 0 12px; color: var(--muted); font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.form-alert { margin-bottom: 12px; }
:deep(.el-select), :deep(.el-input-number) { width: 100%; }
@media (max-width: 600px) { .form-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
