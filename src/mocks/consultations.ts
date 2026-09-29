import type { ConsultationSession } from '@/types/clinical'

export const consultationSeed: ConsultationSession[] = [
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
