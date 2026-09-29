import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useClinicalStore } from './clinical'

const actor = { name: 'Dr. Test', role: 'Physician', department: 'Medicine' }

describe('group case review', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, removeItem: () => {} })
    setActivePinia(createPinia())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps physician collaboration separate from patient visit messages', () => {
    const store = useClinicalStore()
    const patientVisitCount = store.consultations.length
    const review = store.createRemoteConsultation({ patientId: store.patients[0]!.id, specialty: 'Cardiology', reason: 'Second opinion', scheduledAt: '2026-09-27 14:00' }, actor)!
    expect(store.consultations).toHaveLength(patientVisitCount)
    expect(review.expertOpinions).toEqual([])

    store.addRemoteExpert(review.id, 'Dr. Specialist', actor)
    store.updateRemoteStatus(review.id, 'accepted', actor)
    store.updateRemoteStatus(review.id, 'inProgress', actor)
    expect(() => store.completeRemoteConsultation(review.id, 'Shared conclusion', actor)).toThrow(/contribution for each invited specialist/)

    store.recordRemoteExpertOpinion(review.id, 'Dr. Specialist', 'Assess the existing imaging record.', actor)
    store.completeRemoteConsultation(review.id, 'Shared conclusion', actor)
    expect(review.status).toBe('completed')
    expect(review.report).toContain('Dr. Specialist (recorded by Dr. Test')
    expect(review.report).toContain('Shared case conclusion: Shared conclusion')
    expect(store.consultations).toHaveLength(patientVisitCount)
  })
})
