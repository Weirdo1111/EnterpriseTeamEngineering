export type EvaluationCase = {
  id: string
  question: string
  relevant: { title: string; location: string }[]
  requiredConcepts: string[][]
  shouldAbstain?: boolean
}

export const evaluationCases: EvaluationCase[] = [
  {
    id: 'authentication', question: 'What authentication and authorization controls are required?',
    relevant: [
      { title: 'Doctor Work Platform', location: 'Slide 3' },
      { title: 'System Architecture', location: 'Slide 8' },
      { title: '智慧医养', location: 'Slide 5' },
    ],
    requiredConcepts: [['multi-factor', 'MFA'], ['role-based', 'RBAC'], ['temporary permission', 'time-bound access'], ['data scope', 'least-privilege']],
  },
  {
    id: 'patient-management', question: 'Which patient information management capabilities must doctors have?',
    relevant: [{ title: 'Doctor Work Platform', location: 'Slide 4' }, { title: 'System Architecture', location: 'Slide 5' }],
    requiredConcepts: [['search', 'filter'], ['profile', 'medical history'], ['allergy'], ['group', 'categorize']],
  },
  {
    id: 'emr-workflow', question: 'Describe the required EMR and medical order workflow.',
    relevant: [{ title: 'Doctor Work Platform', location: 'Slide 6' }, { title: '智慧医养', location: 'Slide 6' }],
    requiredConcepts: [['template', 'structured'], ['order'], ['review'], ['archive']],
  },
  {
    id: 'remote-consultation', question: 'What must the remote consultation module support?',
    relevant: [{ title: 'Doctor Work Platform', location: 'Slide 7' }, { title: 'System Architecture', location: 'Slide 5' }],
    requiredConcepts: [['specialist', 'expert'], ['share', 'upload'], ['multi-disciplinary', 'multi-specialty'], ['report']],
  },
  {
    id: 'health-management', question: 'What functions are required for ongoing patient health management?',
    relevant: [{ title: 'Doctor Work Platform', location: 'Slide 8' }, { title: 'System Architecture', location: 'Slide 5' }],
    requiredConcepts: [['health plan'], ['monitor', 'vital'], ['reminder'], ['assessment', 'evaluation']],
  },
  {
    id: 'audit', question: 'What logging, monitoring, and audit capabilities are required?',
    relevant: [{ title: 'Doctor Work Platform', location: 'Slide 10' }, { title: 'System Architecture', location: 'Slide 8' }, { title: 'System Architecture', location: 'Slide 14' }],
    requiredConcepts: [['activity', 'action'], ['timestamp', 'trace'], ['system health', 'monitor'], ['report']],
  },
  {
    id: 'rag-design', question: 'How is the proposed RAG medical intelligence module designed and governed?',
    relevant: [{ title: '智慧医养', location: 'Slide 9' }, { title: '智慧医养', location: 'Slide 7' }],
    requiredConcepts: [['vector', 'retriev'], ['guideline', 'case'], ['doctor confirmation', 'physician confirmation'], ['advisory']],
  },
  {
    id: 'phase-one-scope', question: 'Which features are in Phase 1 and which are deferred to Phase 2?',
    relevant: [{ title: '智慧医养', location: 'Slide 6' }, { title: '智慧医养', location: 'Slide 12' }],
    requiredConcepts: [['login'], ['patient management'], ['EMR'], ['video consultation'], ['social community']],
  },
  {
    id: 'out-of-scope-dose', question: 'What exact aspirin dose should be prescribed to a 72-year-old patient?',
    relevant: [], requiredConcepts: [], shouldAbstain: true,
  },
]
