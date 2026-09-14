import { patientsSeed, patientLegacyDefaults } from '@/mocks/patients'
import { useAuthStore } from '@/stores/auth'
import type { ClassificationChange, Patient, PatientInput, Role } from '@/types/clinical'
import { cleanTags, managementLabels, toPatientInput, validatePatient } from '@/utils/patients'

export const PATIENT_STORAGE_KEY = 'doctor-platform-patient-information-v1'
export const PATIENT_STORAGE_VERSION = 2

// Keep the existing key so saved profiles are discovered. Reads never write storage.
// Only legacy enums and built-in classifications are translated; user text stays intact.
const legacyTags: Record<string, string> = {
  '高血压': 'Hypertension', '糖尿病': 'Diabetes', '冠心病': 'Coronary Heart Disease',
  '慢阻肺': 'COPD', '骨质疏松': 'Osteoporosis',
}
function migrateV1(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const patient = value as Record<string, unknown>
  return {
    ...patient,
    gender: patient.gender === '男' ? 'Male' : patient.gender === '女' ? 'Female' : patient.gender,
    diseaseTags: Array.isArray(patient.diseaseTags)
      ? [...new Set(patient.diseaseTags.map(tag => typeof tag === 'string' ? legacyTags[tag] ?? tag : tag))]
      : patient.diseaseTags,
    ownerDoctor: patient.ownerDoctor === '林若医生' ? 'Dr. Riley Lin'
      : patient.ownerDoctor === '周明主任' ? 'Dr. Michael Zhou' : patient.ownerDoctor,
  }
}
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
    catch { throw new Error('Unable to read local patient data. Check browser storage permissions and retry.') }
    if (!raw) return structuredClone(patientsSeed)
    try {
      const saved = JSON.parse(raw)
      if (![1, PATIENT_STORAGE_VERSION].includes(saved.version) || !Array.isArray(saved.patients)) throw new Error('Invalid stored data')
      const records = saved.version === 1 ? saved.patients.map(migrateV1) : saved.patients
      if (!records.every(isStoredPatient) || new Set(records.map((p: StoredPatient) => p.id)).size !== records.length) throw new Error('Invalid stored data')
      // Only patient-information fields survive refresh; other modules keep their own data lifecycle.
      return records.map((p: StoredPatient) => ({
        ...structuredClone(patientsSeed.find(seed => seed.id === p.id) ?? patientLegacyDefaults(p.ownerDoctor)),
        ...serialize(p),
      }))
    } catch {
      if (!recoveryReported) options.onRecovery?.('Invalid local patient data. Initial demo data is shown; the next successful save will replace the local copy.')
      recoveryReported = true
      return structuredClone(patientsSeed)
    }
  }
  function checkWrite() {
    if (!['doctor', 'seniorDoctor'].includes(options.role())) throw new Error('Your current role has read-only access to patient information.')
  }
  function validated(input: PatientInput) {
    const errors = validatePatient(input)
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0])
    return toPatientInput(input)
  }
  function commit(patients: Patient[]) {
    try { options.storage().setItem(PATIENT_STORAGE_KEY, JSON.stringify({ version: PATIENT_STORAGE_VERSION, patients: patients.map(serialize) })) }
    catch { throw new Error('Save failed: unable to write to local storage. Check storage space or browser permissions and retry. Your input has been kept.') }
    if (recoveryReported) options.onRecovery?.('')
    recoveryReported = false
  }
  function find(patients: Patient[], id: string) {
    const patient = patients.find(p => p.id === id)
    if (!patient) throw new Error('Patient not found')
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
      if (!ids.length) throw new Error('Select patients first.')
      const patients = read()
      const selected = [...new Set(ids)].map(id => find(patients, id))
      const now = new Date().toISOString()
      if (change.kind === 'managementStatus') {
        if (!Object.prototype.hasOwnProperty.call(managementLabels, change.status)) throw new Error('Select a management status.')
        selected.forEach(p => { p.managementStatus = change.status; p.updatedAt = now })
      } else {
        if (!['addDisease', 'removeDisease'].includes(change.kind)) throw new Error('Invalid classification operation.')
        const tags = cleanTags(change.tags)
        if (!tags.length) throw new Error('Select at least one condition.')
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
