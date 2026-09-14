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
    try { await ElMessageBox.confirm('You have unsaved changes. Discard them?', 'Discard Changes', { confirmButtonText: 'Discard Changes', cancelButtonText: 'Keep Editing', type: 'warning' }) }
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
  <el-dialog :model-value="modelValue" :title="patient ? 'Edit Patient Profile' : 'Create Patient Profile'" width="min(720px, calc(100vw - 24px))" top="5vh" :before-close="close" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving">
    <el-alert v-if="saveError" :title="saveError" type="error" show-icon :closable="false" class="form-alert" />
    <p v-if="patient" class="identity-note">Patient ID: {{ patient.id }} · Primary Physician: {{ patient.ownerDoctor }}</p>
    <el-form label-position="top" :model="form" :disabled="saving" @submit.prevent="submit">
      <h3 class="form-section">Basic Information</h3>
      <div class="form-grid">
        <el-form-item label="Name" required :error="errors.name"><el-input v-model="form.name" aria-label="Name" maxlength="50" /></el-form-item>
        <el-form-item label="Gender" required :error="errors.gender"><el-select v-model="form.gender" aria-label="Gender"><el-option label="Male" value="Male" /><el-option label="Female" value="Female" /></el-select></el-form-item>
        <el-form-item label="Age" required :error="errors.age"><el-input-number v-model="form.age" aria-label="Age" :min="1" :max="120" :precision="0" /></el-form-item>
        <el-form-item label="Phone" :error="errors.phone"><el-input v-model="form.phone" aria-label="Phone" maxlength="24" placeholder="Mobile, landline, or international number" /></el-form-item>
        <el-form-item label="Address" class="full"><el-input v-model="form.address" aria-label="Address" maxlength="200" /></el-form-item>
        <el-form-item label="Emergency Contact Name" :error="errors.emergencyName"><el-input v-model="form.emergencyName" aria-label="Emergency Contact Name" maxlength="50" /></el-form-item>
        <el-form-item label="Relationship"><el-input v-model="form.emergencyRelation" aria-label="Relationship" maxlength="30" /></el-form-item>
        <el-form-item label="Emergency Phone" :error="errors.emergencyPhone" class="full"><el-input v-model="form.emergencyPhone" aria-label="Emergency Phone" maxlength="24" /></el-form-item>
      </div>
      <h3 class="form-section">Medical Background</h3>
      <el-form-item label="Symptoms"><el-input v-model="form.symptoms" aria-label="Symptoms" type="textarea" :rows="2" maxlength="2000" /></el-form-item>
      <el-form-item label="Primary Diagnosis"><el-input v-model="form.diagnosis" aria-label="Primary Diagnosis" maxlength="300" placeholder="Leave blank if not yet diagnosed" /></el-form-item>
      <el-form-item label="Medical History"><el-input v-model="form.history" aria-label="Medical History" type="textarea" :rows="3" maxlength="5000" /></el-form-item>
      <el-form-item label="Allergy Status" :error="errors.allergyStatus"><el-select v-model="form.allergyStatus" aria-label="Allergy Status"><el-option label="Unconfirmed" value="unknown" /><el-option label="No known allergies" value="none" /><el-option label="Known allergies" value="known" /></el-select></el-form-item>
      <el-form-item v-if="form.allergyStatus === 'known'" label="Allergens" required :error="errors.allergies"><el-select v-model="form.allergies" aria-label="Allergens" multiple filterable allow-create default-first-option :reserve-keyword="false" placeholder="Type an allergen and press Enter"><el-option v-for="item in ['Penicillin', 'Cephalosporins', 'Sulfonamides']" :key="item" :value="item" :label="item" /></el-select></el-form-item>
      <h3 class="form-section">Classification</h3>
      <el-form-item label="Condition Tags"><el-select v-model="form.diseaseTags" aria-label="Condition Tags" multiple filterable allow-create default-first-option :reserve-keyword="false" placeholder="Select conditions, or type a new one and press Enter"><el-option v-for="tag in diseaseOptions" :key="tag" :value="tag" :label="tag" /></el-select></el-form-item>
      <el-form-item label="Management Status" required :error="errors.managementStatus"><el-select v-model="form.managementStatus" aria-label="Management Status"><el-option v-for="(label, value) in managementLabels" :key="value" :value="value" :label="label" /></el-select></el-form-item>
      <p class="identity-note">Management status classifies patients separately from clinical risk and record archival status.</p>
    </el-form>
    <template #footer><el-button :disabled="saving" @click="close">Cancel</el-button><el-button type="primary" :loading="saving" @click="submit">{{ patient ? 'Save Changes' : 'Create Profile' }}</el-button></template>
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
