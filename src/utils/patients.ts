import type { Patient, PatientInput, PatientManagementStatus } from '@/types/clinical'

export const managementLabels: Record<PatientManagementStatus, string> = { pending: '待建档', active: '管理中', closed: '已结束' }
export const defaultDiseaseTags = ['高血压', '糖尿病', '冠心病', '慢阻肺', '骨质疏松']
export const cleanTags = (tags: string[]) => [...new Set(tags.map(tag => tag.trim()).filter(Boolean))]
export const isPhone = (value: string) => /^\+?[\d\s()（）-]{6,24}$/.test(value) && value.replace(/\D/g, '').length >= 6

export function emptyPatientInput(): PatientInput {
  return { name: '', gender: '男', age: 65, phone: '', address: '', emergencyName: '', emergencyRelation: '', emergencyPhone: '', symptoms: '', diagnosis: '', history: '', allergyStatus: 'unknown', allergies: [], diseaseTags: [], managementStatus: 'pending' }
}

// Whitelist the editable fields. Never spread a request over a shared clinical record.
export function toPatientInput(value: PatientInput): PatientInput {
  return {
    name: value.name.trim(), gender: value.gender, age: value.age,
    phone: value.phone.trim(), address: value.address.trim(),
    emergencyName: value.emergencyName.trim(), emergencyRelation: value.emergencyRelation.trim(), emergencyPhone: value.emergencyPhone.trim(),
    symptoms: value.symptoms.trim(), diagnosis: value.diagnosis.trim(), history: value.history.trim(),
    allergyStatus: value.allergyStatus, allergies: value.allergyStatus === 'known' ? cleanTags(value.allergies) : [],
    diseaseTags: cleanTags(value.diseaseTags), managementStatus: value.managementStatus,
  }
}

export function validatePatient(input: PatientInput): Partial<Record<keyof PatientInput, string>> {
  const errors: Partial<Record<keyof PatientInput, string>> = {}
  if (!input.name.trim()) errors.name = '请填写患者姓名'
  if (!['男', '女'].includes(input.gender)) errors.gender = '请选择性别'
  if (!Number.isInteger(input.age) || input.age < 1 || input.age > 120) errors.age = '年龄须为 1–120 的整数'
  if (input.phone.trim() && !isPhone(input.phone.trim())) errors.phone = '请输入有效联系电话'
  if (input.emergencyName.trim() || input.emergencyRelation.trim() || input.emergencyPhone.trim()) {
    if (!input.emergencyName.trim()) errors.emergencyName = '请填写紧急联系人姓名'
    if (!isPhone(input.emergencyPhone.trim())) errors.emergencyPhone = '请填写有效的紧急联系电话'
  }
  if (!['unknown', 'none', 'known'].includes(input.allergyStatus)) errors.allergyStatus = '请选择过敏史状态'
  if (input.allergyStatus === 'known' && !cleanTags(input.allergies).length) errors.allergies = '请至少填写一项过敏项'
  if (!Object.prototype.hasOwnProperty.call(managementLabels, input.managementStatus)) errors.managementStatus = '请选择管理状态'
  return errors
}

export interface PatientFilters { keyword: string; disease: string; status: string }
export function filterPatients(patients: Patient[], filters: PatientFilters): Patient[] {
  const keyword = filters.keyword.trim().toLocaleLowerCase()
  return patients.filter(patient => {
    const text = [patient.id, patient.name, patient.symptoms, patient.diagnosis, patient.history].join(' ').toLocaleLowerCase()
    return (!keyword || text.includes(keyword)) && (!filters.disease || patient.diseaseTags.includes(filters.disease)) && (!filters.status || patient.managementStatus === filters.status)
  })
}

export function allergyText(patient: PatientInput) {
  return patient.allergyStatus === 'unknown' ? '未确认' : patient.allergyStatus === 'none' ? '无已知过敏' : patient.allergies.join('、')
}
