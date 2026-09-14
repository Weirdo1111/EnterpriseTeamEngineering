import { patientsSeed, patientLegacyDefaults } from '@/mocks/patients'
import { useAuthStore } from '@/stores/auth'
import type { ClassificationChange, Patient, PatientInput, Role } from '@/types/clinical'
import { cleanTags, managementLabels, toPatientInput, validatePatient } from '@/utils/patients'

export const PATIENT_STORAGE_KEY = 'doctor-platform-patient-information-v1'
type StoredPatient = PatientInput & Pick<Patient, 'id' | 'ownerDoctor' | 'createdAt' | 'updatedAt'>
export interface PatientService {
  list(): Promise<Patient[]>
  getById(id: string): Promise<Patient>
  create(input: PatientInput): Promise<Patient>
  update(id: string, input: PatientInput): Promise<Patient>
  batchUpdateClassification(ids: string[], change: ClassificationChange): Promise<Patient[]>
}

function serialize(patient: StoredPatient): StoredPatient {
  return { ...toPatientInput(patient), id: patient.id, ownerDoctor: patient.ownerDoctor, createdAt: patient.createdAt, updatedAt: patient.updatedAt }
}

function isStoredPatient(value: unknown): value is StoredPatient {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  const strings = ['id', 'name', 'gender', 'phone', 'address', 'emergencyName', 'emergencyRelation', 'emergencyPhone', 'symptoms', 'diagnosis', 'history', 'allergyStatus', 'managementStatus', 'ownerDoctor', 'createdAt', 'updatedAt']
  if (!strings.every(key => typeof p[key] === 'string') || !p.id || !p.ownerDoctor) return false
  if (!['allergies', 'diseaseTags'].every(key => Array.isArray(p[key]) && (p[key] as unknown[]).every(item => typeof item === 'string'))) return false
  return !Object.keys(validatePatient(value as StoredPatient)).length && Number.isFinite(Date.parse(p.createdAt as string)) && Number.isFinite(Date.parse(p.updatedAt as string))
}

export function createMockPatientService(options: {
  storage: () => Pick<Storage, 'getItem' | 'setItem'>
  role: () => Role
  owner: () => string
  onRecovery?: (message: string) => void
}): PatientService {
  let recoveryReported = false
  function read(): Patient[] {
    let raw: string | null
    try { raw = options.storage().getItem(PATIENT_STORAGE_KEY) }
    catch { throw new Error('无法读取本地患者数据，请检查浏览器存储权限后重试') }
    if (!raw) return structuredClone(patientsSeed)
    try {
      const saved = JSON.parse(raw)
      if (saved.version !== 1 || !Array.isArray(saved.patients) || !saved.patients.every(isStoredPatient) || new Set(saved.patients.map((p: StoredPatient) => p.id)).size !== saved.patients.length) throw new Error('Invalid stored data')
      // Only patient-information fields survive refresh; other modules keep their own data lifecycle.
      return saved.patients.map((p: StoredPatient) => ({
        ...structuredClone(patientsSeed.find(seed => seed.id === p.id) ?? patientLegacyDefaults(p.ownerDoctor)),
        ...serialize(p),
      }))
    } catch {
      if (!recoveryReported) options.onRecovery?.('本地患者档案格式异常，已使用初始模拟数据；下次成功保存将更新本地副本。')
      recoveryReported = true
      return structuredClone(patientsSeed)
    }
  }
  function checkWrite() {
    if (!['doctor', 'seniorDoctor'].includes(options.role())) throw new Error('当前身份只能查看患者信息，不能修改档案')
  }
  function validated(input: PatientInput) {
    const errors = validatePatient(input)
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0])
    return toPatientInput(input)
  }
  function commit(patients: Patient[]) {
    try { options.storage().setItem(PATIENT_STORAGE_KEY, JSON.stringify({ version: 1, patients: patients.map(serialize) })) }
    catch { throw new Error('保存失败：无法写入本地存储。请检查存储空间或浏览器权限后重试，填写内容已保留。') }
    if (recoveryReported) options.onRecovery?.('')
    recoveryReported = false
  }
  function find(patients: Patient[], id: string) {
    const patient = patients.find(p => p.id === id)
    if (!patient) throw new Error('患者不存在')
    return patient
  }
  return {
    async list() { return read() },
    async getById(id) { return find(read(), id) },
    async create(input) {
      checkWrite()
      const fields = validated(input)
      const patients = read()
      const now = new Date().toISOString()
      const patient: Patient = { ...patientLegacyDefaults(options.owner()), ...fields, id: `P-${crypto.randomUUID()}`, createdAt: now, updatedAt: now }
      patients.unshift(patient)
      commit(patients)
      return patient
    },
    async update(id, input) {
      checkWrite()
      const fields = validated(input)
      const patients = read()
      const patient = find(patients, id)
      Object.assign(patient, fields, { updatedAt: new Date().toISOString() })
      commit(patients)
      return patient
    },
    async batchUpdateClassification(ids, change) {
      checkWrite()
      if (!ids.length) throw new Error('请先选择患者')
      const patients = read()
      const selected = [...new Set(ids)].map(id => find(patients, id))
      const now = new Date().toISOString()
      if (change.kind === 'managementStatus') {
        if (!Object.prototype.hasOwnProperty.call(managementLabels, change.status)) throw new Error('请选择管理状态')
        selected.forEach(p => { p.managementStatus = change.status; p.updatedAt = now })
      } else {
        if (!['addDisease', 'removeDisease'].includes(change.kind)) throw new Error('无效分类操作')
        const tags = cleanTags(change.tags)
        if (!tags.length) throw new Error('请至少选择一个病种')
        selected.forEach(p => {
          p.diseaseTags = change.kind === 'addDisease' ? cleanTags([...p.diseaseTags, ...tags]) : p.diseaseTags.filter(tag => !tags.includes(tag))
          p.updatedAt = now
        })
      }
      commit(patients)
      return selected
    },
  }
}

// Replace this adapter when the team's real patient API is ready.
export let patientStorageWarning = ''
export const patientService = createMockPatientService({
  storage: () => window.localStorage,
  role: () => useAuthStore().currentRole,
  owner: () => useAuthStore().profile.name,
  onRecovery: message => { patientStorageWarning = message },
})
