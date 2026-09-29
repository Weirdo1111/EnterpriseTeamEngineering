import { patientsSeed } from '@/mocks/patients'
import { consultationService, type DemoConsultationRequestInput, type DemoConsultationMessageInput } from '@/services/consultations'
import { patientService, patientStorageWarning } from '@/services/patients'
import { consultationRecordService } from '@/services/consultation-records'
import { recordsSeed } from '@/mocks/records'
import { clinicalAiService, type ClinicalDraftSuggestion } from '@/services/clinical-ai'
import { medicalRecordService } from '@/services/records'
import { useAuthStore } from '@/stores/auth'
import type { PatientInput, ClassificationChange } from '@/types/clinical'
import { computed, reactive, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type {
  AuditLog,
  ConsultationSession,
  ConsultationImage,
  ConsultationSummaryInput,
  HealthAssessment,
  HealthPlan,
  MedicalOrder,
  MedicalRecord,
  Patient,
  RagReference,
  RecordStatus,
  ReminderTask,
  RemoteConsultation,
  RemoteConsultationStatus,
} from '@/types/clinical'

interface AuditActor {
  name: string
  role: string
  department: string
}





const auditSeed: AuditLog[] = [
  { id: 'L-901', user: 'Dr. Riley Lin', role: 'Physician', department: 'Geriatric Medicine', action: 'Viewed patient details', resource: 'P-202609-001', ip: '10.12.8.24', time: '2026-09-12 09:10', result: 'Success' },
  { id: 'L-902', user: 'Dr. Riley Lin', role: 'Physician', department: 'Geriatric Medicine', action: 'Generated medical record draft with AI', resource: 'MR-8842', ip: '10.12.8.24', time: '2026-09-12 09:29', result: 'Pending Review' },
  { id: 'L-903', user: 'Dr. Michael Zhou', role: 'Senior Physician', department: 'Cardiology & Geriatric Care', action: 'Reviewed medical record', resource: 'MR-8839', ip: '10.12.8.13', time: '2026-09-11 16:40', result: 'Success' },
  { id: 'L-904', user: 'External Account', role: 'Unknown', department: 'Unknown', action: 'Unauthorized record access', resource: 'MR-8842', ip: '172.16.5.21', time: '2026-09-11 22:18', result: 'Blocked' },
]

const referencesSeed: RagReference[] = [
  { id: 'R-01', title: 'Recommendations for Stratified Management of Geriatric Hypertension', kind: 'Clinical Guideline', excerpt: 'Home blood pressure monitoring should be interpreted using multiple days of readings together with medication adherence.' },
  { id: 'R-02', title: 'Medication Considerations for Diabetes with Hypertension', kind: 'Medication Information', excerpt: 'Before adjusting the plan, review allergies, concomitant medications, and the risk of orthostatic hypotension.' },
  { id: 'R-03', title: 'Follow-up Record for Elevated Morning Blood Pressure', kind: 'De-identified Case', excerpt: 'Similar records indicate that sleep may affect morning blood pressure and continuous monitoring is needed.' },
]

const remoteSeed: RemoteConsultation[] = [
  {
    id: 'RC-240912-01',
    patientId: 'P-202609-003',
    patientName: 'Desheng Wang',
    specialty: 'Respiratory Medicine',
    reason: 'The patient with COPD has had worsening cough and dyspnea for three days, with home oxygen saturation as low as 91%.',
    requester: 'Dr. Riley Lin',
    experts: ['Qihang Zhao Chief Physician'],
    expertOpinions: [],
    materials: ['Outpatient-Records-Last-3-Months.pdf', 'Chest-CT-Images.zip', 'Home-Oxygen-Log.xlsx'],
    status: 'accepted',
    scheduledAt: '2026-09-12 14:30',
    opinion: '',
  },
  {
    id: 'RC-240911-02',
    patientId: 'P-202609-002',
    patientName: 'Xiulan Chen',
    specialty: 'Cardiac Rehabilitation',
    reason: 'Assessment of the rehabilitation plan six months after coronary stent placement.',
    requester: 'Dr. Michael Zhou',
    experts: ['Ning Sun Associate Chief Physician', 'Rehabilitation Therapist He Li'],
    expertOpinions: [],
    materials: ['Postoperative-Record.pdf', 'Recent-ECG.pdf'],
    status: 'completed',
    scheduledAt: '2026-09-11 15:00',
    opinion: 'Continue secondary prevention medication and moderate-intensity rehabilitation; repeat the lipid panel within two weeks.',
    report: 'The consultation concluded that postoperative recovery is stable and the current plan may continue. Repeat the lipid panel and ECG within two weeks and adjust the exercise prescription based on the results.',
  },
]

const healthPlansSeed: HealthPlan[] = patientsSeed.map((patient) => ({
  patientId: patient.id,
  goals: patient.status === 'stable' ? 'Keep current indicators stable and improve exercise tolerance.' : 'Reduce recent abnormal readings and prevent further deterioration.',
  measures: patient.plan,
  reviewCycle: patient.status === 'critical' ? 'Weekly' : 'Every Two Weeks',
  updatedAt: '2026-09-11',
}))

const remindersSeed: ReminderTask[] = [
  { id: 'RT-01', patientId: 'P-202609-001', type: 'Monitoring', content: 'Measure blood pressure in the morning and at bedtime', dueAt: 'Daily 07:30 / 21:00', status: 'pending' },
  { id: 'RT-02', patientId: 'P-202609-001', type: 'Follow-up', content: 'Attend online follow-up and submit a three-day blood pressure log', dueAt: '2026-09-15 09:00', status: 'pending' },
  { id: 'RT-03', patientId: 'P-202609-002', type: 'Follow-up', content: 'Repeat lipid panel', dueAt: '2026-09-24 08:30', status: 'pending' },
]

const assessmentsSeed: HealthAssessment[] = [
  { id: 'HA-01', patientId: 'P-202609-001', date: '2026-09-10', level: 'Moderate Risk', summary: 'Morning blood pressure fluctuates and sleep quality has declined.', advice: 'Record blood pressure for three consecutive days and review medication adherence.' },
  { id: 'HA-02', patientId: 'P-202609-002', date: '2026-09-09', level: 'Low Risk', summary: 'Postoperative recovery is stable and exercise tolerance has improved.', advice: 'Continue the current rehabilitation and secondary prevention plan.' },
]

function displayTime() {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date()).replace(/\//g, '-')
}

export const useClinicalStore = defineStore('clinical', () => {
  const patients = reactive<Patient[]>(structuredClone(patientsSeed))
  const patientsLoading = shallowRef(false)
  const patientsError = shallowRef('')
  const patientsWarning = shallowRef('')
  let patientsLoaded = false
  let loadingPatients: Promise<void> | undefined

  const consultations = reactive<ConsultationSession[]>([])
  const consultationsLoading = shallowRef(false)
  const consultationsError = shallowRef('')
  let consultationsLoaded = false
  let loadingConsultations: Promise<void> | undefined
  const records = reactive<MedicalRecord[]>(useAuthStore().usesBackend ? [] : structuredClone(recordsSeed))
  const consultationRecordsLoading = shallowRef(false)
  const consultationRecordsError = shallowRef('')
  let consultationRecordsLoaded = false
  let loadingConsultationRecords: Promise<void> | undefined
  const recordsLoading = shallowRef(false)
  const recordsError = shallowRef('')
  let recordsLoaded = false
  let loadingRecords: Promise<void> | undefined
  const auditLogs = reactive<AuditLog[]>(structuredClone(auditSeed))
  const ragReferences = reactive<RagReference[]>(structuredClone(referencesSeed))
  const remoteConsultations = reactive<RemoteConsultation[]>(structuredClone(remoteSeed))
  const healthPlans = reactive<HealthPlan[]>(structuredClone(healthPlansSeed))
  const reminders = reactive<ReminderTask[]>(structuredClone(remindersSeed))
  const assessments = reactive<HealthAssessment[]>(structuredClone(assessmentsSeed))
  const selectedPatientId = shallowRef(patients[0]!.id)
  const selectedConsultationId = shallowRef('')

  const selectedPatient = computed<Patient>(() => patients.find((patient) => patient.id === selectedPatientId.value) ?? patients[0]!)
  const selectedConsultation = computed(() => consultations.find((item) => item.id === selectedConsultationId.value))
  const messages = computed(() => selectedConsultation.value?.messages ?? [])
  const warningPatients = computed(() => patients.filter((patient) => patient.status !== 'stable'))
  const pendingRecords = computed(() => records.filter((record) => record.status === 'pending'))
  const waitingConsultations = computed(() => consultations.filter((item) => item.status === 'waiting'))
  const pendingRemoteConsultations = computed(() => remoteConsultations.filter((item) => item.status === 'pending' || item.status === 'accepted'))

  function recordAudit(actor: AuditActor, action: string, resource: string, result: AuditLog['result'] = 'Success') {
    auditLogs.unshift({
      id: `L-${Date.now()}`,
      user: actor.name,
      role: actor.role,
      department: actor.department,
      action,
      resource,
      ip: '10.12.8.24',
      time: displayTime(),
      result,
    })
  }

  function selectPatient(id: string, actor?: AuditActor) {
    selectedPatientId.value = id
    if (actor) recordAudit(actor, 'Viewed patient details', id)
  }

  function syncPatients(incoming: Patient[], replace = false) {
    patientsWarning.value = patientStorageWarning
    const next = incoming.map(patient => {
      const current = patients.find(item => item.id === patient.id)
      if (!current) return patient
      // Keep runtime health data untouched when information is saved or reloaded.
      return { ...patient, status: current.status, group: current.group, plan: current.plan, metrics: current.metrics, lastVisit: current.lastVisit }
    })
    if (replace) patients.splice(0, patients.length, ...next)
    else next.forEach(patient => {
      const current = patients.find(item => item.id === patient.id)
      if (current) Object.assign(current, patient)
      else patients.unshift(patient)
    })
    incoming.forEach(patient => {
      if (!healthPlans.some(plan => plan.patientId === patient.id)) {
        healthPlans.push({ patientId: patient.id, goals: 'Not set', measures: 'Not set', reviewCycle: 'Monthly', updatedAt: displayTime().slice(0, 10) })
      }
    })
  }

  async function loadPatients(force = false) {
    if (loadingPatients) return loadingPatients
    if (patientsLoaded && !force) return
    patientsLoading.value = true
    patientsError.value = ''
    loadingPatients = (async () => {
      try {
        syncPatients(await patientService.list(), true)
        patientsWarning.value = patientStorageWarning
        patientsLoaded = true
      } catch (error) {
        patientsError.value = error instanceof Error ? error.message : 'Failed to load patient data.'
        throw error
      } finally { patientsLoading.value = false; loadingPatients = undefined }
    })()
    return loadingPatients
  }

  function assertPatientWrite() {
    if (!['doctor', 'seniorDoctor'].includes(useAuthStore().currentRole)) throw new Error('Your current role has read-only access to patient information.')
  }

  async function addPatient(input: PatientInput, actor: AuditActor) {
    assertPatientWrite()
    const patient = await patientService.create(input)
    syncPatients([patient])
    recordAudit(actor, 'Create Patient Profile', patient.id)
    return patient
  }

  async function updatePatient(id: string, input: PatientInput, actor: AuditActor) {
    assertPatientWrite()
    const patient = await patientService.update(id, input)
    syncPatients([patient])
    recordAudit(actor, 'Updated patient profile', id)
    return patient
  }

  async function batchUpdateClassification(ids: string[], change: ClassificationChange, actor: AuditActor) {
    assertPatientWrite()
    const updated = await patientService.batchUpdateClassification(ids, change)
    syncPatients(updated)
    recordAudit(actor, 'Update Patient Classifications', updated.map(patient => patient.id).join(', '))
  }

  async function loadConsultations(force = false) {
    if (loadingConsultations) return loadingConsultations
    if (consultationsLoaded && !force) return
    consultationsLoading.value = true
    consultationsError.value = ''
    loadingConsultations = (async () => {
      try {
        const incoming = await consultationService.list()
        consultations.splice(0, consultations.length, ...incoming)
        if (!consultations.some(item => item.id === selectedConsultationId.value)) {
          selectedConsultationId.value = (consultations.find(item => item.status !== 'completed') ?? consultations[0])?.id ?? ''
        }
        consultationsLoaded = true
      } catch (error) {
        consultationsError.value = error instanceof Error ? error.message : 'Unable to load local consultation history.'
        throw error
      } finally { consultationsLoading.value = false; loadingConsultations = undefined }
    })()
    return loadingConsultations
  }

  function syncRecord(record: MedicalRecord) {
    const current = records.find(item => item.id === record.id)
    if (current) Object.assign(current, structuredClone(record))
    else records.unshift(structuredClone(record))
    return current ?? records[0]!
  }

  async function loadRecords(force = false) {
    if (loadingRecords) return loadingRecords
    if (recordsLoaded && !force) return
    recordsLoading.value = true
    recordsError.value = ''
    loadingRecords = (async () => {
      try {
        const incoming = await medicalRecordService.list()
        const linked = records.filter(record => record.sourceConsultationId)
        records.splice(0, records.length, ...linked, ...incoming.filter(record => !record.sourceConsultationId))
        recordsLoaded = true
      } catch (error) {
        recordsError.value = error instanceof Error ? error.message : 'Failed to load medical records.'
        throw error
      } finally {
        recordsLoading.value = false
        loadingRecords = undefined
      }
    })()
    return loadingRecords
  }

  function selectConsultation(id: string) {
    const session = consultations.find(item => item.id === id)
    if (!session) return
    selectedConsultationId.value = id
    // Historical conversations can outlive their profile. Do not select another patient implicitly.
    if (patients.some(patient => patient.id === session.patientId)) selectedPatientId.value = session.patientId
  }

  function syncConsultation(incoming: ConsultationSession) {
    const current = consultations.find(item => item.id === incoming.id)
    if (current) Object.assign(current, incoming)
    else consultations.push(incoming)
  }

  async function verifyConsultationPatient(id: string): Promise<Patient> {
    if (typeof id !== 'string' || !id) throw new Error('A patient ID is required to create a linked consultation or record.')
    const patient = await patientService.getById(id)
    if (patient.id !== id) throw new Error('The patient lookup returned a different ID. Reload patient information before trying again.')
    return patient
  }

  async function createDemoConsultation(input: DemoConsultationRequestInput, actor: AuditActor) {
    assertPatientWrite()
    const request = { ...input }
    const existing = (await consultationService.list()).find(session => session.id === `C-DEMO-${request.clientRequestId.trim()}`)
    // A retry uses the original patient-name snapshot; renaming a profile must not create a second request.
    const patient = existing ? undefined : await verifyConsultationPatient(request.patientId)
    const session = await consultationService.createDemoRequest({ ...request, patientName: patient?.name ?? existing!.patientName })
    const existed = consultations.some(item => item.id === session.id)
    if (patient) syncPatients([patient])
    syncConsultation(session)
    if (!existed) recordAudit(actor, 'Demo: created patient consultation request', session.id)
    return session
  }

  async function receiveDemoConsultationMessage(id: string, input: DemoConsultationMessageInput, actor: AuditActor) {
    const session = await consultationService.receiveDemoMessage(id, input)
    const existed = consultations.find(item => item.id === id)?.messages.some(message => message.id === input.clientMessageId.trim())
    syncConsultation(session)
    if (!existed) recordAudit(actor, 'Demo: received patient consultation message', id)
    return session
  }

  async function markConsultationRead(id: string) {
    const session = await consultationService.markRead(id)
    syncConsultation(session)
    return session
  }

  async function addMessage(id: string, content: string, clientMessageId: string, actor: AuditActor) {
    const session = await consultationService.sendMessage(id, { content, clientMessageId })
    syncConsultation(session)
    recordAudit(actor, 'Saved local consultation reply', id)
  }

  async function addImageMessage(id: string, content: string, clientMessageId: string, image: ConsultationImage, blob: Blob, actor: AuditActor) {
    const session = await consultationService.sendImage(id, { content, clientMessageId, image, blob })
    syncConsultation(session)
    recordAudit(actor, 'Saved local consultation image', id)
  }

  async function startConsultation(id: string, actor: AuditActor) {
    const session = await consultationService.accept(id)
    syncConsultation(session)
    recordAudit(actor, 'Accepted online consultation', id)
  }

  async function saveConsultationSummary(id: string, input: ConsultationSummaryInput, actor: AuditActor) {
    const session = await consultationService.saveSummary(id, input, actor.name)
    syncConsultation(session)
    recordAudit(actor, 'Saved consultation summary', id)
  }

  async function completeConsultation(id: string, actor: AuditActor) {
    const session = await consultationService.complete(id)
    syncConsultation(session)
    recordAudit(actor, 'Completed online consultation', id)
  }

  function syncConsultationRecord(incoming: MedicalRecord) {
    const existing = records.find(record => record.id === incoming.id)
    if (existing) Object.assign(existing, incoming)
    else records.unshift(incoming)
  }

  async function loadConsultationRecords(force = false) {
    if (loadingConsultationRecords) return loadingConsultationRecords
    if (consultationRecordsLoaded && !force) return
    consultationRecordsLoading.value = true
    consultationRecordsError.value = ''
    loadingConsultationRecords = (async () => {
      try {
        const incoming = await Promise.resolve().then(() => consultationRecordService.list())
        const demos = records.filter(record => !record.sourceConsultationId)
        records.splice(0, records.length, ...incoming, ...demos)
        consultationRecordsLoaded = true
      } catch (error) {
        consultationRecordsError.value = error instanceof Error ? error.message : 'Unable to load consultation medical records.'
        throw error
      } finally { consultationRecordsLoading.value = false; loadingConsultationRecords = undefined }
    })()
    return loadingConsultationRecords
  }

  async function createConsultationRecord(sessionId: string, actor: AuditActor): Promise<MedicalRecord> {
    // Read the saved summary afresh; page drafts must never become record content.
    const sessions = await consultationService.list()
    const session = sessions.find(item => item.id === sessionId)
    if (!session) throw new Error('The saved consultation was not found. Reload consultations before creating a record.')
    const existing = consultationRecordService.list().find(record => record.sourceConsultationId === sessionId)
    const patient = existing ? undefined : await verifyConsultationPatient(session.patientId)
    const record = consultationRecordService.create(patient ? { ...session, patientName: patient.name } : session, actor.name)
    if (patient) syncPatients([patient])
    syncConsultationRecord(record)
    recordAudit(actor, 'Opened medical record from consultation summary', record.id)
    return record
  }

  async function createAiRecord(actor: AuditActor, patientId = selectedPatientId.value) {
    if (!patientsLoaded || patientsLoading.value || patientsError.value) throw new Error('Load patient information successfully before creating a record.')
    const patient = patients.find((item) => item.id === patientId)
    if (!patient) throw new Error('Patient not found. Reload patient information before creating a record.')
    const existing = records.find((record) => record.patientId === patient.id && record.aiGenerated && ['draft', 'returned'].includes(record.status))
    if (existing) return existing
    const consultation = consultations.find(item => item.patientId === patient.id)
    const suggestion = await clinicalAiService.generateRecordDraft({ patient, consultation, references: ragReferences })
    const record = await medicalRecordService.createDraft({
      patientId: patient.id,
      patientName: patient.name,
      chiefComplaint: suggestion.chiefComplaint,
      presentIllness: suggestion.presentIllness,
      diagnosis: suggestion.diagnosis,
      orders: suggestion.orders,
      aiMetadata: {
        generator: suggestion.generator,
        generatedAt: suggestion.generatedAt,
        safetyWarnings: suggestion.safetyWarnings,
        sourceIds: suggestion.sourceIds,
        evidence: suggestion.evidence,
        followUpItems: suggestion.followUpItems,
      },
    })
    syncRecord(record)
    recordAudit(actor, 'Generated medical record draft with AI', record.id, 'Pending Review')
    return record
  }

  async function createAssistantRecord(
    patientId: string,
    fields: Pick<MedicalRecord, 'chiefComplaint' | 'presentIllness' | 'diagnosis'>,
    suggestion: ClinicalDraftSuggestion,
    actor: AuditActor,
  ) {
    const patient = patients.find(item => item.id === patientId)
    if (!patient) throw new Error('Patient not found.')
    const record = await medicalRecordService.createDraft({
      patientId: patient.id,
      patientName: patient.name,
      chiefComplaint: fields.chiefComplaint,
      presentIllness: fields.presentIllness,
      diagnosis: fields.diagnosis,
      orders: [],
      aiMetadata: {
        generator: suggestion.generator,
        generatedAt: suggestion.generatedAt,
        safetyWarnings: suggestion.safetyWarnings,
        sourceIds: suggestion.sourceIds,
        evidence: suggestion.evidence,
        followUpItems: suggestion.followUpItems,
      },
    })
    syncRecord(record)
    recordAudit(actor, 'Created reviewed assistant record draft', record.id, 'Pending Review')
    return record
  }

  async function saveRecord(id: string, fields: Pick<MedicalRecord, 'chiefComplaint' | 'presentIllness' | 'diagnosis'>, actor: AuditActor, submit = false) {
    const record = records.find((item) => item.id === id)
    if (!record) throw new Error('Medical record not found.')
    let updated: MedicalRecord
    if (record.sourceConsultationId) updated = consultationRecordService.save(id, fields, submit, record.version)
    else {
      updated = await medicalRecordService.updateClinicalFields(id, fields, record.version)
      // Saving fields and submitting are separate commits. Keep the saved version
      // even if submission fails, so the clinician can correct orders and retry.
      syncRecord(updated)
      if (submit) updated = await medicalRecordService.submit(id, updated.version)
    }
    syncRecord(updated)
    recordAudit(actor, submit ? 'Submitted medical record for review' : 'Saved medical record draft', id, submit ? 'Pending Review' : 'Success')
    return updated
  }

  async function addOrder(recordId: string, order: Pick<MedicalOrder, 'type' | 'content'>, actor: AuditActor) {
    const record = records.find((item) => item.id === recordId)
    if (!record) throw new Error('Medical record not found.')
    const updated = record.sourceConsultationId
      ? consultationRecordService.addOrder(recordId, order, record.version)
      : await medicalRecordService.addOrder(recordId, order, record.version)
    syncRecord(updated)
    recordAudit(actor, 'Add Order', recordId)
    return updated
  }

  async function updateOrder(recordId: string, orderId: string, content: string, actor: AuditActor) {
    const record = records.find((item) => item.id === recordId)
    if (!record) throw new Error('Medical record not found.')
    const updated = record.sourceConsultationId
      ? consultationRecordService.updateOrder(recordId, orderId, content, record.version)
      : await medicalRecordService.updateOrder(recordId, orderId, content, record.version)
    syncRecord(updated)
    recordAudit(actor, 'Edit Order', recordId)
    return updated
  }

  async function stopOrder(recordId: string, orderId: string, actor: AuditActor) {
    const record = records.find((item) => item.id === recordId)
    if (!record) throw new Error('Medical record not found.')
    const updated = record.sourceConsultationId
      ? consultationRecordService.stopOrder(recordId, orderId, record.version)
      : await medicalRecordService.stopOrder(recordId, orderId, record.version)
    syncRecord(updated)
    recordAudit(actor, 'Stop Order', recordId)
    return updated
  }

  async function updateRecordStatus(id: string, status: RecordStatus, reviewNote: string, actor: AuditActor) {
    const record = records.find((item) => item.id === id)
    if (!record) throw new Error('Medical record not found.')
    if (!['approved', 'returned', 'archived'].includes(status)) throw new Error('Invalid review decision.')
    const decision = status as 'approved' | 'returned' | 'archived'
    const updated = record.sourceConsultationId
      ? consultationRecordService.review(id, decision, reviewNote, record.version)
      : await medicalRecordService.review(id, decision, reviewNote, record.version)
    syncRecord(updated)
    const action = status === 'approved' ? 'Approved medical record' : status === 'returned' ? 'Returned medical record' : status === 'archived' ? 'Archived medical record' : 'Updated medical record status'
    recordAudit(actor, action, id, status === 'returned' ? 'Pending Review' : 'Success')
    return updated
  }

  function createRemoteConsultation(input: Pick<RemoteConsultation, 'patientId' | 'specialty' | 'reason' | 'scheduledAt'>, actor: AuditActor) {
    const patient = patients.find((item) => item.id === input.patientId)
    if (!patient) return
    const consultation: RemoteConsultation = {
      ...input,
      id: `RC-${Date.now()}`,
      patientName: patient.name,
      requester: actor.name,
      experts: [],
      expertOpinions: [],
      materials: ['Patient-Medical-Record.pdf'],
      status: 'pending',
      opinion: '',
    }
    remoteConsultations.unshift(consultation)
    recordAudit(actor, 'Requested physician group case review', consultation.id)
    return consultation
  }

  function updateRemoteStatus(id: string, status: RemoteConsultationStatus, actor: AuditActor) {
    const item = remoteConsultations.find((consultation) => consultation.id === id)
    if (!item) return
    item.status = status
    const action = status === 'accepted' ? 'Accepted group case review' : status === 'inProgress' ? 'Started group case review' : 'Updated group case review'
    recordAudit(actor, action, id)
  }

  function addRemoteExpert(id: string, expert: string, actor: AuditActor) {
    const item = remoteConsultations.find((consultation) => consultation.id === id)
    if (!item || item.status === 'completed' || item.experts.includes(expert)) return
    item.experts.push(expert)
    recordAudit(actor, 'Added group case-review specialist', id)
  }

  function recordRemoteExpertOpinion(id: string, expert: string, text: string, actor: AuditActor) {
    const item = remoteConsultations.find((consultation) => consultation.id === id)
    if (!item || item.status !== 'inProgress') throw new Error('Start the group review before recording contributions.')
    if (!item.experts.includes(expert) || !text.trim()) throw new Error('Select an invited specialist and enter an opinion.')
    const contribution = { expert, text: text.trim(), recordedBy: actor.name, recordedAt: displayTime() }
    const existing = item.expertOpinions.findIndex(opinion => opinion.expert === expert)
    if (existing < 0) item.expertOpinions.push(contribution)
    else item.expertOpinions.splice(existing, 1, contribution)
    recordAudit(actor, 'Recorded group case-review contribution', id)
  }

  function completeRemoteConsultation(id: string, opinion: string, actor: AuditActor) {
    const item = remoteConsultations.find((consultation) => consultation.id === id)
    if (!item || item.status !== 'inProgress') throw new Error('The group review is not in progress.')
    if (!item.experts.length || item.experts.some(expert => !item.expertOpinions.some(entry => entry.expert === expert))) throw new Error('Record a contribution for each invited specialist before completing the review.')
    if (!opinion.trim()) throw new Error('Enter the shared case conclusion.')
    item.status = 'completed'
    item.opinion = opinion.trim()
    const contributions = item.expertOpinions.map(entry => `${entry.expert} (recorded by ${entry.recordedBy}, ${entry.recordedAt}): ${entry.text}`).join('\n')
    item.report = `Patient: ${item.patientName}\nRequesting physician: ${item.requester}\nSpecialty: ${item.specialty}\nParticipating specialists: ${item.experts.join(', ')}\n\nRecorded specialist contributions:\n${contributions}\n\nShared case conclusion: ${item.opinion}\nFollow-up responsibility: The requesting physician reviews this conclusion and determines the next clinical steps.`
    recordAudit(actor, 'Completed group case review and generated report', id)
  }

  function saveHealthPlan(patientId: string, fields: Pick<HealthPlan, 'goals' | 'measures' | 'reviewCycle'>, actor: AuditActor) {
    const plan = healthPlans.find((item) => item.patientId === patientId)
    if (!plan) return
    Object.assign(plan, fields, { updatedAt: displayTime().slice(0, 10) })
    const patient = patients.find((item) => item.id === patientId)
    if (patient) patient.plan = fields.measures
    recordAudit(actor, 'Updated health management plan', patientId)
  }

  function addReminder(input: Omit<ReminderTask, 'id' | 'status'>, actor: AuditActor) {
    reminders.unshift({ ...input, id: `RT-${Date.now()}`, status: 'pending' })
    recordAudit(actor, 'Add Health Reminder', input.patientId)
  }

  function completeReminder(id: string, actor: AuditActor) {
    const reminder = reminders.find((item) => item.id === id)
    if (!reminder) return
    reminder.status = 'completed'
    recordAudit(actor, 'Completed health reminder', reminder.patientId)
  }

  function addAssessment(input: Omit<HealthAssessment, 'id' | 'date'>, actor: AuditActor) {
    assessments.unshift({ ...input, id: `HA-${Date.now()}`, date: displayTime().slice(0, 10) })
    recordAudit(actor, 'Add Health Assessment', input.patientId)
  }

  return {
    patients,
    consultations,
    records,
    recordsLoading,
    recordsError,
    auditLogs,
    ragReferences,
    remoteConsultations,
    healthPlans,
    reminders,
    assessments,
    selectedPatientId,
    selectedConsultationId,
    selectedPatient,
    selectedConsultation,
    messages,
    warningPatients,
    pendingRecords,
    waitingConsultations,
    pendingRemoteConsultations,
    recordAudit,
    selectPatient,
    addPatient,
    updatePatient,
    batchUpdateClassification,
    loadPatients,
    loadRecords,
    patientsLoading,
    patientsError,
    patientsWarning,
    loadConsultations,
    consultationsLoading,
    consultationsError,
    selectConsultation,
    createDemoConsultation,
    receiveDemoConsultationMessage,
    markConsultationRead,
    addMessage,
    addImageMessage,
    saveConsultationSummary,
    startConsultation,
    completeConsultation,
    createAiRecord,
    createConsultationRecord,
    loadConsultationRecords,
    consultationRecordsLoading,
    consultationRecordsError,
    createAssistantRecord,
    saveRecord,
    addOrder,
    updateOrder,
    stopOrder,
    updateRecordStatus,
    createRemoteConsultation,
    updateRemoteStatus,
    addRemoteExpert,
    recordRemoteExpertOpinion,
    completeRemoteConsultation,
    saveHealthPlan,
    addReminder,
    completeReminder,
    addAssessment,
  }
})
