import type { Patient } from '@/types/clinical'

export function patientLegacyDefaults(ownerDoctor: string) {
  return {
    group: 'Routine Follow-up', status: 'stable' as const, plan: 'Health plan not yet created.',
    lastVisit: 'No consultations yet', ownerDoctor,
    metrics: { bloodPressure: '--', glucose: '--', heartRate: 0, riskScore: 0 },
  }
}

const originalPatients = [
  {
    id: 'P-202609-001',
    name: 'Jianguo Zhang',
    gender: 'Male',
    age: 72,
    diagnosis: 'Hypertension with Diabetes',
    group: 'Priority Chronic Care',
    status: 'warning',
    allergies: ['Penicillin'],
    history: 'Twelve-year history of hypertension and eight-year history of type 2 diabetes, with marked nighttime blood pressure fluctuations recently.',
    plan: 'Maintain a low-sodium diet, monitor morning blood pressure, and attend an online follow-up every two weeks.',
    lastVisit: '2026-09-10',
    ownerDoctor: 'Dr. Riley Lin',
    metrics: { bloodPressure: '152/94', glucose: '8.6', heartRate: 86, riskScore: 74 },
  },
  {
    id: 'P-202609-002',
    name: 'Xiulan Chen',
    gender: 'Female',
    age: 68,
    diagnosis: 'Post-PCI Cardiac Rehabilitation',
    group: 'Rehabilitation Follow-up',
    status: 'stable',
    allergies: ['No known drug allergies'],
    history: 'Six months after coronary stent placement; medication adherence is good and exercise tolerance has recently improved.',
    plan: 'Continue cardiac rehabilitation and complete lipid and ECG tests before follow-up.',
    lastVisit: '2026-09-09',
    ownerDoctor: 'Dr. Michael Zhou',
    metrics: { bloodPressure: '126/78', glucose: '5.9', heartRate: 72, riskScore: 38 },
  },
  {
    id: 'P-202609-003',
    name: 'Desheng Wang',
    gender: 'Male',
    age: 81,
    diagnosis: 'Risk of Acute COPD Exacerbation',
    group: 'Respiratory Risk Alert',
    status: 'critical',
    allergies: ['Sulfonamides'],
    history: 'Fifteen-year history of COPD, with worsening cough over the past three days and pronounced exertional dyspnea.',
    plan: 'Closely monitor oxygen saturation and respiratory rate, with referral to respiratory medicine if needed.',
    lastVisit: '2026-09-11',
    ownerDoctor: 'Dr. Riley Lin',
    metrics: { bloodPressure: '138/82', glucose: '6.4', heartRate: 96, riskScore: 89 },
  },
  {
    id: 'P-202609-004',
    name: 'Yumei Liu',
    gender: 'Female',
    age: 75,
    diagnosis: 'Osteoporosis and Fall Risk',
    group: 'Home Safety Management',
    status: 'warning',
    allergies: ['Cephalosporins'],
    history: 'Two falls in the past year, reduced lumbar bone density, and frequent nighttime awakenings.',
    plan: 'Take calcium and vitamin D supplements and arrange a home safety assessment.',
    lastVisit: '2026-09-08',
    ownerDoctor: 'Dr. Riley Lin',
    metrics: { bloodPressure: '132/80', glucose: '6.8', heartRate: 78, riskScore: 67 },
  },
] satisfies Omit<Patient, 'phone' | 'address' | 'emergencyName' | 'emergencyRelation' | 'emergencyPhone' | 'symptoms' | 'allergyStatus' | 'diseaseTags' | 'managementStatus' | 'createdAt' | 'updatedAt'>[]

const seedDate = '2026-09-01T08:00:00.000Z'
const originalTags = [['Hypertension', 'Diabetes'], ['Coronary Heart Disease'], ['COPD'], ['Osteoporosis']]
const originalSymptoms = ['Morning head pressure with occasional thirst', 'Improved exercise tolerance', 'Worsening cough and exertional dyspnea', 'Lower back pain']

export const patientsSeed: Patient[] = originalPatients.map((patient, index) => ({
  ...patient,
  phone: '', address: `${index + 1} Example Street, Demo City (fictional)`,
  emergencyName: '', emergencyRelation: '', emergencyPhone: '',
  symptoms: originalSymptoms[index]!, diseaseTags: originalTags[index]!,
  allergyStatus: index === 1 ? 'none' : 'known',
  allergies: index === 1 ? [] : patient.allergies,
  managementStatus: 'active', createdAt: seedDate, updatedAt: seedDate,
}))

const demoNames = ['Minghua Zhao', 'Guifen Sun', 'Wenqing Zhou', 'Chunlan Wu', 'Zhiyuan Zheng', 'Shuzhen Wang', 'Yongan Chen', 'Qiuyue Feng', 'Lixin Zhu', 'Xiuying Xu', 'Deming He', 'Yuqin Lu', 'Wenhai Shi', 'Huifang Zhang', 'Xianglin Kong', 'Meiling Cao', 'Guoping Yan', 'Sumei Hua', 'Changqing Jin', 'Yuee Wei']
const diseasePresets = ['Hypertension', 'Diabetes', 'Coronary Heart Disease', 'COPD', 'Osteoporosis']
demoNames.forEach((name, index) => {
  const tags = index % 3 === 0 ? [diseasePresets[index % 5]!, diseasePresets[(index + 1) % 5]!] : [diseasePresets[index % 5]!]
  patientsSeed.push({
    ...patientLegacyDefaults(index % 2 ? 'Dr. Michael Zhou' : 'Dr. Riley Lin'),
    id: `P-202609-${String(index + 5).padStart(3, '0')}`,
    name, gender: index % 2 ? 'Female' : 'Male', age: 60 + index,
    phone: '', address: index % 4 ? `${index + 5} Example Community, Demo City (fictional)` : '',
    emergencyName: '', emergencyRelation: '', emergencyPhone: '',
    diagnosis: index % 6 === 0 ? '' : tags.join(', '),
    symptoms: index % 4 === 0 ? '' : ['Occasional dizziness', 'Thirst and fatigue', 'Chest tightness on exertion', 'Recurrent cough', 'Lower back pain'][index % 5]!,
    history: index % 4 === 0 ? '' : index === 7 ? 'Fictional demo history. Previous care was self-reported and requires verification against original records. '.repeat(12) : `Fictional demo history with previous records of ${tags.join(', ')}.`,
    allergyStatus: index % 3 === 0 ? 'unknown' : index % 3 === 1 ? 'known' : 'none',
    allergies: index % 3 === 1 ? ['Penicillin', 'Sulfonamides'] : [],
    diseaseTags: tags, managementStatus: index % 5 === 0 ? 'pending' : index % 5 === 1 ? 'closed' : 'active',
    createdAt: seedDate, updatedAt: seedDate,
  })
})
