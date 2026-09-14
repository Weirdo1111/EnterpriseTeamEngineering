import { patientsSeed } from '@/mocks/patients'
import { patientService, patientStorageWarning } from '@/services/patients'
import { useAuthStore } from '@/stores/auth'
import type { PatientInput, ClassificationChange } from '@/types/clinical'
import { computed, reactive, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type {
  AuditLog,
  ConsultationSession,
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




const consultationSeed: ConsultationSession[] = [
  {
    id: 'C-20260912-01',
    patientId: 'P-202609-001',
    patientName: 'Jianguo Zhang',
    complaint: 'Elevated morning blood pressure and head pressure',
    status: 'active',
    unread: 0,
    updatedAt: '09:19',
    messages: [
      { id: 'm1', sender: 'patient', content: 'Doctor, my blood pressure has still been high in the mornings for the past two days, and I feel some pressure in my head.', time: '09:12' },
      { id: 'm2', sender: 'doctor', content: 'What was your exact blood pressure this morning? Did you take your medication on time last night?', time: '09:14' },
      { id: 'm3', sender: 'patient', content: 'It was 152/94 this morning. I took my medicine last night, but I did not sleep well.', time: '09:16', attachment: 'Home-Blood-Pressure-Log.jpg' },
      { id: 'm4', sender: 'doctor', content: 'Please record your morning and bedtime blood pressure for three consecutive days. I will review it with your medication and sleep pattern before adjusting the plan.', time: '09:19' },
    ],
  },
  {
    id: 'C-20260912-02',
    patientId: 'P-202609-003',
    patientName: 'Desheng Wang',
    complaint: 'Worsening cough and exertional dyspnea',
    status: 'waiting',
    unread: 2,
    updatedAt: '09:31',
    messages: [
      { id: 'm5', sender: 'patient', content: 'Doctor, my cough has worsened over the past three days, and I get more breathless when walking.', time: '09:28' },
      { id: 'm6', sender: 'patient', content: 'My oxygen saturation at home is 91%. Do I need to go to the hospital?', time: '09:31' },
    ],
  },
  {
    id: 'C-20260911-03',
    patientId: 'P-202609-002',
    patientName: 'Xiulan Chen',
    complaint: 'Post-PCI follow-up',
    status: 'completed',
    unread: 0,
    updatedAt: 'Yesterday 16:32',
    messages: [
      { id: 'm7', sender: 'patient', content: 'I have had no recent chest pain, and walking feels easier than last month.', time: '16:18' },
      { id: 'm8', sender: 'doctor', content: 'Continue taking your medication regularly and repeat the lipid panel and ECG within two weeks.', time: '16:32' },
    ],
  },
]

const recordsSeed: MedicalRecord[] = [
  {
    id: 'MR-8842',
    patientId: 'P-202609-001',
    patientName: 'Jianguo Zhang',
    doctor: 'Dr. Riley Lin',
    chiefComplaint: 'Elevated morning blood pressure with head pressure for two days',
    presentIllness: 'For the past two mornings, the patient reported blood pressure around 152/94 mmHg with head pressure and poor sleep, while reporting regular use of antihypertensive medication.',
    diagnosis: 'Suboptimally Controlled Hypertension; Type 2 Diabetes Follow-up',
    orders: [
      { id: 'O-101', type: 'Nursing', content: 'Monitor morning and bedtime blood pressure for three days', status: 'active' },
      { id: 'O-102', type: 'Laboratory', content: 'Repeat fasting glucose', status: 'active' },
      { id: 'O-103', type: 'Examination', content: 'Assess sleep and medication adherence', status: 'active' },
    ],
    status: 'pending',
    aiGenerated: true,
    updatedAt: '2026-09-12 09:31',
  },
  {
    id: 'MR-8839',
    patientId: 'P-202609-002',
    patientName: 'Xiulan Chen',
    doctor: 'Dr. Michael Zhou',
    chiefComplaint: 'Post-PCI follow-up',
    presentIllness: 'The patient has taken antiplatelet and lipid-lowering medication regularly after surgery, reports no recent chest pain or tightness, and has improved walking tolerance.',
    diagnosis: 'Recovery after Coronary Stent Placement',
    orders: [
      { id: 'O-201', type: 'Medication', content: 'Continue secondary prevention medication', status: 'active' },
      { id: 'O-202', type: 'Laboratory', content: 'Repeat lipid panel within two weeks', status: 'active' },
      { id: 'O-203', type: 'Nursing', content: 'Continue cardiac rehabilitation', status: 'active' },
    ],
    status: 'approved',
    aiGenerated: false,
    reviewNote: 'The record is complete and the orders are appropriate.',
    updatedAt: '2026-09-11 16:40',
  },
]

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

  const consultations = reactive<ConsultationSession[]>(structuredClone(consultationSeed))
  const records = reactive<MedicalRecord[]>(structuredClone(recordsSeed))
  const auditLogs = reactive<AuditLog[]>(structuredClone(auditSeed))
  const ragReferences = reactive<RagReference[]>(structuredClone(referencesSeed))
  const remoteConsultations = reactive<RemoteConsultation[]>(structuredClone(remoteSeed))
  const healthPlans = reactive<HealthPlan[]>(structuredClone(healthPlansSeed))
  const reminders = reactive<ReminderTask[]>(structuredClone(remindersSeed))
  const assessments = reactive<HealthAssessment[]>(structuredClone(assessmentsSeed))
  const selectedPatientId = shallowRef(patients[0]!.id)
  const selectedConsultationId = shallowRef(consultations[0]!.id)

  const selectedPatient = computed<Patient>(() => patients.find((patient) => patient.id === selectedPatientId.value) ?? patients[0]!)
  const selectedConsultation = computed<ConsultationSession>(() => consultations.find((item) => item.id === selectedConsultationId.value) ?? consultations[0]!)
  const messages = computed(() => selectedConsultation.value.messages)
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

  function selectConsultation(id: string) {
    selectedConsultationId.value = id
    const session = consultations.find((item) => item.id === id)
    if (session) {
      session.unread = 0
      selectedPatientId.value = session.patientId
    }
  }

  function addMessage(content: string, sender: 'doctor' | 'patient' | 'ai' = 'doctor', attachment?: string) {
    selectedConsultation.value.messages.push({
      id: `m${Date.now()}`,
      sender,
      content,
      attachment,
      time: new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
    })
    selectedConsultation.value.updatedAt = 'Just now'
  }

  function startConsultation(id: string, actor: AuditActor) {
    const session = consultations.find((item) => item.id === id)
    if (!session) return
    session.status = 'active'
    session.unread = 0
    recordAudit(actor, 'Accepted online consultation', id)
  }

  function completeConsultation(id: string, actor: AuditActor) {
    const session = consultations.find((item) => item.id === id)
    if (!session) return
    session.status = 'completed'
    recordAudit(actor, 'Completed online consultation', id)
  }

  function createAiRecord(actor: AuditActor, patientId = selectedPatient.value.id) {
    const patient = patients.find((item) => item.id === patientId) ?? selectedPatient.value
    const existing = records.find((record) => record.patientId === patient.id && record.aiGenerated && record.status !== 'archived')
    if (existing) return existing

    const record: MedicalRecord = {
      id: `MR-${Math.floor(9000 + Math.random() * 900)}`,
      patientId: patient.id,
      patientName: patient.name,
      doctor: actor.name,
      chiefComplaint: patient.status === 'critical' ? 'Worsening cough and dyspnea with risk of acute exacerbation' : 'Structured follow-up record required after online consultation',
      presentIllness: `${patient.history} This draft combines the consultation record with home health data and requires physician review.`,
      diagnosis: patient.diagnosis,
      orders: [
        { id: `O-${Date.now()}-1`, type: 'Nursing', content: 'Continue monitoring key vital signs', status: 'active' },
        { id: `O-${Date.now()}-2`, type: 'Examination', content: 'Complete the relevant follow-up examinations', status: 'active' },
      ],
      status: 'draft',
      aiGenerated: true,
      updatedAt: displayTime(),
    }
    records.unshift(record)
    recordAudit(actor, 'Generated medical record draft with AI', record.id, 'Pending Review')
    return record
  }

  function saveRecord(id: string, fields: Pick<MedicalRecord, 'chiefComplaint' | 'presentIllness' | 'diagnosis'>, actor: AuditActor, submit = false) {
    const record = records.find((item) => item.id === id)
    if (!record) return
    Object.assign(record, fields)
    record.status = submit ? 'pending' : 'draft'
    record.updatedAt = displayTime()
    recordAudit(actor, submit ? 'Submitted medical record for review' : 'Saved medical record draft', id, submit ? 'Pending Review' : 'Success')
  }

  function addOrder(recordId: string, order: Pick<MedicalOrder, 'type' | 'content'>, actor: AuditActor) {
    const record = records.find((item) => item.id === recordId)
    if (!record) return
    record.orders.push({ ...order, id: `O-${Date.now()}`, status: 'active' })
    recordAudit(actor, 'Add Order', recordId)
  }

  function updateOrder(recordId: string, orderId: string, content: string, actor: AuditActor) {
    const order = records.find((item) => item.id === recordId)?.orders.find((item) => item.id === orderId)
    if (!order) return
    order.content = content
    recordAudit(actor, 'Edit Order', recordId)
  }

  function stopOrder(recordId: string, orderId: string, actor: AuditActor) {
    const order = records.find((item) => item.id === recordId)?.orders.find((item) => item.id === orderId)
    if (!order) return
    order.status = 'stopped'
    recordAudit(actor, 'Stop Order', recordId)
  }

  function updateRecordStatus(id: string, status: RecordStatus, reviewNote: string, actor: AuditActor) {
    const record = records.find((item) => item.id === id)
    if (!record) return
    record.status = status
    record.reviewNote = reviewNote
    record.updatedAt = displayTime()
    const action = status === 'approved' ? 'Approved medical record' : status === 'returned' ? 'Returned medical record' : status === 'archived' ? 'Archived medical record' : 'Updated medical record status'
    recordAudit(actor, action, id, status === 'returned' ? 'Pending Review' : 'Success')
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
      materials: ['Patient-Medical-Record.pdf'],
      status: 'pending',
      opinion: '',
    }
    remoteConsultations.unshift(consultation)
    recordAudit(actor, 'Start Remote Consultation', consultation.id)
    return consultation
  }

  function updateRemoteStatus(id: string, status: RemoteConsultationStatus, actor: AuditActor) {
    const item = remoteConsultations.find((consultation) => consultation.id === id)
    if (!item) return
    item.status = status
    const action = status === 'accepted' ? 'Accepted remote consultation' : status === 'inProgress' ? 'Started remote consultation' : 'Updated remote consultation'
    recordAudit(actor, action, id)
  }

  function addRemoteExpert(id: string, expert: string, actor: AuditActor) {
    const item = remoteConsultations.find((consultation) => consultation.id === id)
    if (!item || item.experts.includes(expert)) return
    item.experts.push(expert)
    recordAudit(actor, 'Add Consultation Specialist', id)
  }

  function completeRemoteConsultation(id: string, opinion: string, actor: AuditActor) {
    const item = remoteConsultations.find((consultation) => consultation.id === id)
    if (!item) return
    item.status = 'completed'
    item.opinion = opinion
    item.report = `Patient: ${item.patientName}\nSpecialty: ${item.specialty}\nParticipating specialists: ${item.experts.join(', ') || 'To be completed'}\nConsultation opinion: ${opinion}\nFollow-up plan: The responsible physician will implement the plan based on the patient's current condition and continue follow-up.`
    recordAudit(actor, 'Completed remote consultation and generated report', id)
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
    patientsLoading,
    patientsError,
    patientsWarning,
    selectConsultation,
    addMessage,
    startConsultation,
    completeConsultation,
    createAiRecord,
    saveRecord,
    addOrder,
    updateOrder,
    stopOrder,
    updateRecordStatus,
    createRemoteConsultation,
    updateRemoteStatus,
    addRemoteExpert,
    completeRemoteConsultation,
    saveHealthPlan,
    addReminder,
    completeReminder,
    addAssessment,
  }
})
