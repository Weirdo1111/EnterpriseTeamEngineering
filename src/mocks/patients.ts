import type { Patient } from '@/types/clinical'

export function patientLegacyDefaults(ownerDoctor: string) {
  return {
    group: '常规随访', status: 'stable' as const, plan: '待制定健康管理计划。',
    lastVisit: '尚未问诊', ownerDoctor,
    metrics: { bloodPressure: '--', glucose: '--', heartRate: 0, riskScore: 0 },
  }
}

const originalPatients = [
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
] satisfies Omit<Patient, 'phone' | 'address' | 'emergencyName' | 'emergencyRelation' | 'emergencyPhone' | 'symptoms' | 'allergyStatus' | 'diseaseTags' | 'managementStatus' | 'createdAt' | 'updatedAt'>[]

const seedDate = '2026-09-01T08:00:00.000Z'
const originalTags = [['高血压', '糖尿病'], ['冠心病'], ['慢阻肺'], ['骨质疏松']]
const originalSymptoms = ['晨起头胀，偶有口渴', '活动耐量改善', '咳嗽加重、活动后气促', '腰背酸痛']

export const patientsSeed: Patient[] = originalPatients.map((patient, index) => ({
  ...patient,
  phone: '', address: `演示市示例街道 ${index + 1} 号（虚构）`,
  emergencyName: '', emergencyRelation: '', emergencyPhone: '',
  symptoms: originalSymptoms[index]!, diseaseTags: originalTags[index]!,
  allergyStatus: index === 1 ? 'none' : 'known',
  allergies: index === 1 ? [] : patient.allergies,
  managementStatus: 'active', createdAt: seedDate, updatedAt: seedDate,
}))

const demoNames = ['赵明华', '孙桂芬', '周文清', '吴春兰', '郑志远', '王淑珍', '陈永安', '冯秋月', '朱立新', '许秀英', '何德明', '吕玉琴', '施文海', '张慧芳', '孔祥林', '曹美玲', '严国平', '华素梅', '金长青', '魏月娥']
const diseasePresets = ['高血压', '糖尿病', '冠心病', '慢阻肺', '骨质疏松']
demoNames.forEach((name, index) => {
  const tags = index % 3 === 0 ? [diseasePresets[index % 5]!, diseasePresets[(index + 1) % 5]!] : [diseasePresets[index % 5]!]
  patientsSeed.push({
    ...patientLegacyDefaults(index % 2 ? '周明主任' : '林若医生'),
    id: `P-202609-${String(index + 5).padStart(3, '0')}`,
    name, gender: index % 2 ? '女' : '男', age: 60 + index,
    phone: '', address: index % 4 ? `演示市示例社区 ${index + 5} 号（虚构）` : '',
    emergencyName: '', emergencyRelation: '', emergencyPhone: '',
    diagnosis: index % 6 === 0 ? '' : tags.join('、'),
    symptoms: index % 4 === 0 ? '' : ['偶有头晕', '口渴、乏力', '活动后胸闷', '反复咳嗽', '腰背酸痛'][index % 5]!,
    history: index % 4 === 0 ? '' : index === 7 ? '此为虚构演示病史。既往诊疗经过由本人提供，尚需结合原始资料核实。'.repeat(12) : `此为虚构演示病史，既往有${tags.join('、')}相关记录。`,
    allergyStatus: index % 3 === 0 ? 'unknown' : index % 3 === 1 ? 'known' : 'none',
    allergies: index % 3 === 1 ? ['青霉素', '磺胺类'] : [],
    diseaseTags: tags, managementStatus: index % 5 === 0 ? 'pending' : index % 5 === 1 ? 'closed' : 'active',
    createdAt: seedDate, updatedAt: seedDate,
  })
})
