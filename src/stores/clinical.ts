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
    patientName: '张建国',
    complaint: '晨起血压偏高、头胀',
    status: 'active',
    unread: 0,
    updatedAt: '09:19',
    messages: [
      { id: 'm1', sender: 'patient', content: '医生，我这两天早上血压还是偏高，头有点胀。', time: '09:12' },
      { id: 'm2', sender: 'doctor', content: '今天晨起血压具体是多少？昨晚是否按时服药？', time: '09:14' },
      { id: 'm3', sender: 'patient', content: '早上 152/94，昨晚药吃了，但是睡得不好。', time: '09:16', attachment: '居家血压记录.jpg' },
      { id: 'm4', sender: 'doctor', content: '先连续记录三天晨起和睡前血压，我会结合用药和睡眠情况调整方案。', time: '09:19' },
    ],
  },
  {
    id: 'C-20260912-02',
    patientId: 'P-202609-003',
    patientName: '王德胜',
    complaint: '咳嗽加重、活动后气促',
    status: 'waiting',
    unread: 2,
    updatedAt: '09:31',
    messages: [
      { id: 'm5', sender: 'patient', content: '医生，这三天咳嗽比之前重，走路也更喘。', time: '09:28' },
      { id: 'm6', sender: 'patient', content: '家里测的血氧是 91%，需要去医院吗？', time: '09:31' },
    ],
  },
  {
    id: 'C-20260911-03',
    patientId: 'P-202609-002',
    patientName: '陈秀兰',
    complaint: '冠心病术后复诊',
    status: 'completed',
    unread: 0,
    updatedAt: '昨天 16:32',
    messages: [
      { id: 'm7', sender: 'patient', content: '最近没有胸痛，步行比上个月轻松。', time: '16:18' },
      { id: 'm8', sender: 'doctor', content: '继续规律服药，两周内复查血脂和心电图。', time: '16:32' },
    ],
  },
]

const recordsSeed: MedicalRecord[] = [
  {
    id: 'MR-8842',
    patientId: 'P-202609-001',
    patientName: '张建国',
    doctor: '林若医生',
    chiefComplaint: '晨起血压升高伴头胀 2 天',
    presentIllness: '患者近两日晨起血压约 152/94mmHg，诉头胀，夜间睡眠欠佳，降压药物自述规律服用。',
    diagnosis: '高血压控制不佳；2 型糖尿病随访',
    orders: [
      { id: 'O-101', type: '护理', content: '连续三日监测晨起及睡前血压', status: 'active' },
      { id: 'O-102', type: '检验', content: '复查空腹血糖', status: 'active' },
      { id: 'O-103', type: '检查', content: '评估睡眠与用药依从性', status: 'active' },
    ],
    status: 'pending',
    aiGenerated: true,
    updatedAt: '2026-09-12 09:31',
  },
  {
    id: 'MR-8839',
    patientId: 'P-202609-002',
    patientName: '陈秀兰',
    doctor: '周明主任',
    chiefComplaint: '冠心病术后复诊',
    presentIllness: '术后规律服用抗血小板及调脂药物，近期无胸痛胸闷，步行耐量较前改善。',
    diagnosis: '冠心病支架术后恢复期',
    orders: [
      { id: 'O-201', type: '药物', content: '继续二级预防用药', status: 'active' },
      { id: 'O-202', type: '检验', content: '两周内复查血脂', status: 'active' },
      { id: 'O-203', type: '护理', content: '维持心脏康复训练', status: 'active' },
    ],
    status: 'approved',
    aiGenerated: false,
    reviewNote: '记录完整，医嘱合理。',
    updatedAt: '2026-09-11 16:40',
  },
]

const auditSeed: AuditLog[] = [
  { id: 'L-901', user: '林若医生', role: '医生', department: '老年医学科', action: '查看患者详情', resource: 'P-202609-001', ip: '10.12.8.24', time: '2026-09-12 09:10', result: '成功' },
  { id: 'L-902', user: '林若医生', role: '医生', department: '老年医学科', action: 'AI 生成病历草稿', resource: 'MR-8842', ip: '10.12.8.24', time: '2026-09-12 09:29', result: '待复核' },
  { id: 'L-903', user: '周明主任', role: '上级医生', department: '心内与老年慢病中心', action: '审核电子病历', resource: 'MR-8839', ip: '10.12.8.13', time: '2026-09-11 16:40', result: '成功' },
  { id: 'L-904', user: '外部账号', role: '未知', department: '未知', action: '越权访问病历', resource: 'MR-8842', ip: '172.16.5.21', time: '2026-09-11 22:18', result: '拦截' },
]

const referencesSeed: RagReference[] = [
  { id: 'R-01', title: '老年高血压分层管理建议', kind: '临床指南', excerpt: '家庭血压监测应结合多日读数和用药依从性综合判断。' },
  { id: 'R-02', title: '糖尿病合并高血压用药注意事项', kind: '药品说明', excerpt: '调整方案前需核对过敏史、合并用药和体位性低血压风险。' },
  { id: 'R-03', title: '晨峰血压升高随访记录', kind: '脱敏病例', excerpt: '相似记录显示睡眠情况可能影响晨起血压，需要连续监测。' },
]

const remoteSeed: RemoteConsultation[] = [
  {
    id: 'RC-240912-01',
    patientId: 'P-202609-003',
    patientName: '王德胜',
    specialty: '呼吸内科',
    reason: '慢阻肺患者近三日咳嗽、气促加重，居家血氧最低 91%。',
    requester: '林若医生',
    experts: ['赵启航 主任医师'],
    materials: ['近三月门诊病历.pdf', '胸部 CT 影像.zip', '居家血氧记录.xlsx'],
    status: 'accepted',
    scheduledAt: '2026-09-12 14:30',
    opinion: '',
  },
  {
    id: 'RC-240911-02',
    patientId: 'P-202609-002',
    patientName: '陈秀兰',
    specialty: '心脏康复',
    reason: '冠心病支架术后六个月康复方案评估。',
    requester: '周明主任',
    experts: ['孙宁 副主任医师', '康复治疗师 李禾'],
    materials: ['术后病历.pdf', '近期心电图.pdf'],
    status: 'completed',
    scheduledAt: '2026-09-11 15:00',
    opinion: '继续二级预防用药，维持中等强度康复训练，两周内复查血脂。',
    report: '会诊认为患者术后恢复平稳，当前方案可继续执行。建议两周内完成血脂与心电图复查，并根据结果调整运动处方。',
  },
]

const healthPlansSeed: HealthPlan[] = patientsSeed.map((patient) => ({
  patientId: patient.id,
  goals: patient.status === 'stable' ? '维持当前指标稳定，提升运动耐量。' : '降低近期异常指标，避免病情进一步加重。',
  measures: patient.plan,
  reviewCycle: patient.status === 'critical' ? '每周评估' : '每两周评估',
  updatedAt: '2026-09-11',
}))

const remindersSeed: ReminderTask[] = [
  { id: 'RT-01', patientId: 'P-202609-001', type: '监测', content: '晨起及睡前测量血压', dueAt: '每日 07:30 / 21:00', status: 'pending' },
  { id: 'RT-02', patientId: 'P-202609-001', type: '复诊', content: '线上复诊并提交三日血压记录', dueAt: '2026-09-15 09:00', status: 'pending' },
  { id: 'RT-03', patientId: 'P-202609-002', type: '复诊', content: '复查血脂', dueAt: '2026-09-24 08:30', status: 'pending' },
]

const assessmentsSeed: HealthAssessment[] = [
  { id: 'HA-01', patientId: 'P-202609-001', date: '2026-09-10', level: '中风险', summary: '晨峰血压波动，睡眠质量下降。', advice: '连续记录血压三日，复核用药依从性。' },
  { id: 'HA-02', patientId: 'P-202609-002', date: '2026-09-09', level: '低风险', summary: '术后恢复平稳，运动耐量提升。', advice: '保持现有康复训练与二级预防方案。' },
]

function displayTime() {
  return new Intl.DateTimeFormat('zh-CN', {
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

  function recordAudit(actor: AuditActor, action: string, resource: string, result: AuditLog['result'] = '成功') {
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
    if (actor) recordAudit(actor, '查看患者详情', id)
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
        healthPlans.push({ patientId: patient.id, goals: '待设置', measures: '待设置', reviewCycle: '每月评估', updatedAt: displayTime().slice(0, 10) })
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
        patientsError.value = error instanceof Error ? error.message : '患者数据加载失败'
        throw error
      } finally { patientsLoading.value = false; loadingPatients = undefined }
    })()
    return loadingPatients
  }

  function assertPatientWrite() {
    if (!['doctor', 'seniorDoctor'].includes(useAuthStore().currentRole)) throw new Error('当前身份只能查看患者信息')
  }

  async function addPatient(input: PatientInput, actor: AuditActor) {
    assertPatientWrite()
    const patient = await patientService.create(input)
    syncPatients([patient])
    recordAudit(actor, '新建患者档案', patient.id)
    return patient
  }

  async function updatePatient(id: string, input: PatientInput, actor: AuditActor) {
    assertPatientWrite()
    const patient = await patientService.update(id, input)
    syncPatients([patient])
    recordAudit(actor, '修改患者档案', id)
    return patient
  }

  async function batchUpdateClassification(ids: string[], change: ClassificationChange, actor: AuditActor) {
    assertPatientWrite()
    const updated = await patientService.batchUpdateClassification(ids, change)
    syncPatients(updated)
    recordAudit(actor, '批量调整患者分类', updated.map(patient => patient.id).join('、'))
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
      time: new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
    })
    selectedConsultation.value.updatedAt = '刚刚'
  }

  function startConsultation(id: string, actor: AuditActor) {
    const session = consultations.find((item) => item.id === id)
    if (!session) return
    session.status = 'active'
    session.unread = 0
    recordAudit(actor, '接收图文问诊', id)
  }

  function completeConsultation(id: string, actor: AuditActor) {
    const session = consultations.find((item) => item.id === id)
    if (!session) return
    session.status = 'completed'
    recordAudit(actor, '结束图文问诊', id)
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
      chiefComplaint: patient.status === 'critical' ? '咳嗽气促加重，存在急性加重风险' : '线上问诊后需生成结构化随访记录',
      presentIllness: `${patient.history} 本次结合问诊记录与居家健康数据形成草稿，需医生复核。`,
      diagnosis: patient.diagnosis,
      orders: [
        { id: `O-${Date.now()}-1`, type: '护理', content: '持续监测关键生命体征', status: 'active' },
        { id: `O-${Date.now()}-2`, type: '检查', content: '完善相关复查项目', status: 'active' },
      ],
      status: 'draft',
      aiGenerated: true,
      updatedAt: displayTime(),
    }
    records.unshift(record)
    recordAudit(actor, 'AI 生成病历草稿', record.id, '待复核')
    return record
  }

  function saveRecord(id: string, fields: Pick<MedicalRecord, 'chiefComplaint' | 'presentIllness' | 'diagnosis'>, actor: AuditActor, submit = false) {
    const record = records.find((item) => item.id === id)
    if (!record) return
    Object.assign(record, fields)
    record.status = submit ? 'pending' : 'draft'
    record.updatedAt = displayTime()
    recordAudit(actor, submit ? '提交电子病历审核' : '保存电子病历草稿', id, submit ? '待复核' : '成功')
  }

  function addOrder(recordId: string, order: Pick<MedicalOrder, 'type' | 'content'>, actor: AuditActor) {
    const record = records.find((item) => item.id === recordId)
    if (!record) return
    record.orders.push({ ...order, id: `O-${Date.now()}`, status: 'active' })
    recordAudit(actor, '新增医嘱', recordId)
  }

  function updateOrder(recordId: string, orderId: string, content: string, actor: AuditActor) {
    const order = records.find((item) => item.id === recordId)?.orders.find((item) => item.id === orderId)
    if (!order) return
    order.content = content
    recordAudit(actor, '修改医嘱', recordId)
  }

  function stopOrder(recordId: string, orderId: string, actor: AuditActor) {
    const order = records.find((item) => item.id === recordId)?.orders.find((item) => item.id === orderId)
    if (!order) return
    order.status = 'stopped'
    recordAudit(actor, '停止医嘱', recordId)
  }

  function updateRecordStatus(id: string, status: RecordStatus, reviewNote: string, actor: AuditActor) {
    const record = records.find((item) => item.id === id)
    if (!record) return
    record.status = status
    record.reviewNote = reviewNote
    record.updatedAt = displayTime()
    const action = status === 'approved' ? '审核通过电子病历' : status === 'returned' ? '退回电子病历' : status === 'archived' ? '归档电子病历' : '更新电子病历状态'
    recordAudit(actor, action, id, status === 'returned' ? '待复核' : '成功')
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
      materials: ['患者电子病历.pdf'],
      status: 'pending',
      opinion: '',
    }
    remoteConsultations.unshift(consultation)
    recordAudit(actor, '发起远程会诊', consultation.id)
    return consultation
  }

  function updateRemoteStatus(id: string, status: RemoteConsultationStatus, actor: AuditActor) {
    const item = remoteConsultations.find((consultation) => consultation.id === id)
    if (!item) return
    item.status = status
    const action = status === 'accepted' ? '接收远程会诊' : status === 'inProgress' ? '开始远程会诊' : '更新远程会诊'
    recordAudit(actor, action, id)
  }

  function addRemoteExpert(id: string, expert: string, actor: AuditActor) {
    const item = remoteConsultations.find((consultation) => consultation.id === id)
    if (!item || item.experts.includes(expert)) return
    item.experts.push(expert)
    recordAudit(actor, '添加会诊专家', id)
  }

  function completeRemoteConsultation(id: string, opinion: string, actor: AuditActor) {
    const item = remoteConsultations.find((consultation) => consultation.id === id)
    if (!item) return
    item.status = 'completed'
    item.opinion = opinion
    item.report = `患者：${item.patientName}\n会诊专科：${item.specialty}\n参加专家：${item.experts.join('、') || '待补充'}\n会诊意见：${opinion}\n后续安排：由责任医生结合患者当前情况执行并持续随访。`
    recordAudit(actor, '完成远程会诊并生成报告', id)
  }

  function saveHealthPlan(patientId: string, fields: Pick<HealthPlan, 'goals' | 'measures' | 'reviewCycle'>, actor: AuditActor) {
    const plan = healthPlans.find((item) => item.patientId === patientId)
    if (!plan) return
    Object.assign(plan, fields, { updatedAt: displayTime().slice(0, 10) })
    const patient = patients.find((item) => item.id === patientId)
    if (patient) patient.plan = fields.measures
    recordAudit(actor, '修改健康管理计划', patientId)
  }

  function addReminder(input: Omit<ReminderTask, 'id' | 'status'>, actor: AuditActor) {
    reminders.unshift({ ...input, id: `RT-${Date.now()}`, status: 'pending' })
    recordAudit(actor, '新增健康提醒', input.patientId)
  }

  function completeReminder(id: string, actor: AuditActor) {
    const reminder = reminders.find((item) => item.id === id)
    if (!reminder) return
    reminder.status = 'completed'
    recordAudit(actor, '完成健康提醒', reminder.patientId)
  }

  function addAssessment(input: Omit<HealthAssessment, 'id' | 'date'>, actor: AuditActor) {
    assessments.unshift({ ...input, id: `HA-${Date.now()}`, date: displayTime().slice(0, 10) })
    recordAudit(actor, '新增健康评估', input.patientId)
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
