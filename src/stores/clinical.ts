import { computed, reactive, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { AuditLog, ConsultationMessage, MedicalRecord, Patient, RagReference, RecordStatus } from '@/types/clinical'

const patientsSeed: Patient[] = [
  {
    id: 'P-202609-001',
    name: '张建国',
    gender: '男',
    age: 72,
    diagnosis: '高血压合并糖尿病',
    group: '慢病重点随访',
    status: 'warning',
    allergies: ['青霉素'],
    history: '高血压病史 12 年，2 型糖尿病 8 年，近期夜间血压波动明显。',
    plan: '低盐饮食，监测晨起血压，每两周线上随访一次。',
    lastVisit: '2026-09-10',
    ownerDoctor: '林若医生',
    metrics: { bloodPressure: '152/94', glucose: '8.6', heartRate: 86, riskScore: 74 },
  },
  {
    id: 'P-202609-002',
    name: '陈秀兰',
    gender: '女',
    age: 68,
    diagnosis: '冠心病术后康复',
    group: '康复随访',
    status: 'stable',
    allergies: ['无明确药物过敏'],
    history: '冠脉支架术后 6 个月，规律服药，近期运动耐量提升。',
    plan: '保持心脏康复训练，复诊前完成血脂与心电图检查。',
    lastVisit: '2026-09-09',
    ownerDoctor: '周明主任',
    metrics: { bloodPressure: '126/78', glucose: '5.9', heartRate: 72, riskScore: 38 },
  },
  {
    id: 'P-202609-003',
    name: '王德胜',
    gender: '男',
    age: 81,
    diagnosis: '慢阻肺急性加重风险',
    group: '呼吸风险预警',
    status: 'critical',
    allergies: ['磺胺类'],
    history: '慢阻肺 15 年，近三天咳嗽加重，活动后气促明显。',
    plan: '重点监测血氧和呼吸频率，必要时转诊呼吸专科。',
    lastVisit: '2026-09-11',
    ownerDoctor: '林若医生',
    metrics: { bloodPressure: '138/82', glucose: '6.4', heartRate: 96, riskScore: 89 },
  },
  {
    id: 'P-202609-004',
    name: '刘玉梅',
    gender: '女',
    age: 75,
    diagnosis: '骨质疏松与跌倒风险',
    group: '居家安全管理',
    status: 'warning',
    allergies: ['头孢类'],
    history: '一年内跌倒两次，腰椎骨密度下降，夜间起身频繁。',
    plan: '补充钙剂与维生素 D，安排居家环境安全评估。',
    lastVisit: '2026-09-08',
    ownerDoctor: '林若医生',
    metrics: { bloodPressure: '132/80', glucose: '6.8', heartRate: 78, riskScore: 67 },
  },
]

const messagesSeed: ConsultationMessage[] = [
  { id: 'm1', sender: 'patient', content: '医生，我这两天早上血压还是偏高，头有点胀。', time: '09:12' },
  { id: 'm2', sender: 'doctor', content: '今天晨起血压具体是多少？昨晚是否按时服药？', time: '09:14' },
  { id: 'm3', sender: 'patient', content: '早上 152/94，昨晚药吃了，但是睡得不好。', time: '09:16', attachment: '居家血压记录.jpg' },
  { id: 'm4', sender: 'doctor', content: '先连续记录三天晨起和睡前血压，我会结合用药和睡眠情况调整方案。', time: '09:19' },
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
    orders: ['连续三日血压监测', '复查空腹血糖', '评估睡眠与用药依从性'],
    status: 'pending',
    aiGenerated: true,
    updatedAt: '2026-09-11 09:31',
  },
  {
    id: 'MR-8839',
    patientId: 'P-202609-002',
    patientName: '陈秀兰',
    doctor: '周明主任',
    chiefComplaint: '冠心病术后复诊',
    presentIllness: '术后规律服用抗血小板及调脂药物，近期无胸痛胸闷，步行耐量较前改善。',
    diagnosis: '冠心病支架术后恢复期',
    orders: ['继续二级预防用药', '两周内复查血脂', '心脏康复训练维持'],
    status: 'approved',
    aiGenerated: false,
    reviewNote: '记录完整，医嘱合理。',
    updatedAt: '2026-09-10 16:40',
  },
]

const auditSeed: AuditLog[] = [
  { id: 'L-901', user: '林若医生', role: '医生', action: '查看患者详情', resource: 'P-202609-001', ip: '10.12.8.24', time: '2026-09-11 09:10', result: '成功' },
  { id: 'L-902', user: '林若医生', role: '医生', action: 'AI 生成病历草稿', resource: 'MR-8842', ip: '10.12.8.24', time: '2026-09-11 09:29', result: '待复核' },
  { id: 'L-903', user: '周明主任', role: '上级医生', action: '审核电子病历', resource: 'MR-8839', ip: '10.12.8.13', time: '2026-09-10 16:40', result: '成功' },
  { id: 'L-904', user: '外部账号', role: '未知', action: '越权访问病历', resource: 'MR-8842', ip: '172.16.5.21', time: '2026-09-10 22:18', result: '拦截' },
]

const referencesSeed: RagReference[] = [
  { id: 'R-01', title: '老年高血压分层管理建议', source: '公开临床指南片段 Demo', confidence: 92 },
  { id: 'R-02', title: '糖尿病合并高血压用药注意事项', source: '药品说明书与禁忌证 Demo', confidence: 88 },
  { id: 'R-03', title: '相似病例：睡眠差导致晨峰血压升高', source: '脱敏历史病例库 Demo', confidence: 84 },
]

export const useClinicalStore = defineStore('clinical', () => {
  const patients = reactive<Patient[]>([...patientsSeed])
  const messages = reactive<ConsultationMessage[]>([...messagesSeed])
  const records = reactive<MedicalRecord[]>([...recordsSeed])
  const auditLogs = reactive<AuditLog[]>([...auditSeed])
  const ragReferences = reactive<RagReference[]>([...referencesSeed])
  const selectedPatientId = shallowRef(patients[0].id)

  const selectedPatient = computed(() => patients.find((patient) => patient.id === selectedPatientId.value) ?? patients[0])
  const warningPatients = computed(() => patients.filter((patient) => patient.status !== 'stable'))
  const pendingRecords = computed(() => records.filter((record) => record.status === 'pending'))

  function selectPatient(id: string) {
    selectedPatientId.value = id
  }

  function addMessage(content: string, sender: ConsultationMessage['sender'] = 'doctor') {
    messages.push({
      id: `m${Date.now()}`,
      sender,
      content,
      time: new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
    })
  }

  function createAiRecord() {
    const patient = selectedPatient.value
    const existing = records.find((record) => record.patientId === patient.id && record.aiGenerated)
    if (existing) return existing

    const record: MedicalRecord = {
      id: `MR-${Math.floor(9000 + Math.random() * 900)}`,
      patientId: patient.id,
      patientName: patient.name,
      doctor: patient.ownerDoctor,
      chiefComplaint: patient.status === 'critical' ? '咳嗽气促加重，存在急性加重风险' : '线上问诊后需生成结构化随访记录',
      presentIllness: `${patient.history} 本次结合问诊对话与居家健康数据，建议医生复核后形成正式病历。`,
      diagnosis: patient.diagnosis,
      orders: ['持续监测关键生命体征', '完善相关复查项目', '根据风险等级安排随访'],
      status: 'draft',
      aiGenerated: true,
      updatedAt: '2026-09-11 10:16',
    }

    records.unshift(record)
    auditLogs.unshift({
      id: `L-${Date.now()}`,
      user: patient.ownerDoctor,
      role: '医生',
      action: 'AI 生成病历草稿',
      resource: record.id,
      ip: '10.12.8.24',
      time: '2026-09-11 10:16',
      result: '待复核',
    })

    return record
  }

  function updateRecordStatus(id: string, status: RecordStatus, reviewNote?: string) {
    const record = records.find((item) => item.id === id)
    if (!record) return

    record.status = status
    record.reviewNote = reviewNote
    record.updatedAt = '2026-09-11 10:35'
  }

  return {
    patients,
    messages,
    records,
    auditLogs,
    ragReferences,
    selectedPatientId,
    selectedPatient,
    warningPatients,
    pendingRecords,
    selectPatient,
    addMessage,
    createAiRecord,
    updateRecordStatus,
  }
})
