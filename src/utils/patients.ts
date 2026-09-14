import type { Patient, PatientInput, PatientManagementStatus } from '@/types/clinical'

export const managementLabels: Record<PatientManagementStatus, string> = { pending: 'Pending Intake', active: 'Active', closed: 'Closed' }
export const defaultDiseaseTags = ['Hypertension', 'Diabetes', 'Coronary Heart Disease', 'COPD', 'Osteoporosis']
export const cleanTags = (tags: string[]) => [...new Set(tags.map(tag => tag.trim()).filter(Boolean))]
export const isPhone = (value: string) => /^\+?[\d\s()（）-]{6,24}$/.test(value) && value.replace(/\D/g, '').length >= 6

export function emptyPatientInput(): PatientInput {
  return { name: '', gender: 'Male', age: 65, phone: '', address: '', emergencyName: '', emergencyRelation: '', emergencyPhone: '', symptoms: '', diagnosis: '', history: '', allergyStatus: 'unknown', allergies: [], diseaseTags: [], managementStatus: 'pending' }
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
  if (!input.name.trim()) errors.name = 'Enter the patient name.'
  if (!['Male', 'Female'].includes(input.gender)) errors.gender = 'Select a gender.'
  if (!Number.isInteger(input.age) || input.age < 1 || input.age > 120) errors.age = 'Age must be a whole number from 1 to 120.'
  if (input.phone.trim() && !isPhone(input.phone.trim())) errors.phone = 'Enter a valid phone number.'
  if (input.emergencyName.trim() || input.emergencyRelation.trim() || input.emergencyPhone.trim()) {
    if (!input.emergencyName.trim()) errors.emergencyName = 'Enter the emergency contact name.'
    if (!isPhone(input.emergencyPhone.trim())) errors.emergencyPhone = 'Enter a valid emergency phone number.'
  }
  if (!['unknown', 'none', 'known'].includes(input.allergyStatus)) errors.allergyStatus = 'Select an allergy status.'
  if (input.allergyStatus === 'known' && !cleanTags(input.allergies).length) errors.allergies = 'Enter at least one allergen.'
  if (!Object.prototype.hasOwnProperty.call(managementLabels, input.managementStatus)) errors.managementStatus = 'Select a management status.'
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
  return patient.allergyStatus === 'unknown' ? 'Unconfirmed' : patient.allergyStatus === 'none' ? 'No known allergies' : patient.allergies.join(', ')
}
