import { describe, expect, it } from 'vitest'
import { createLocalConsultationRecordService, CONSULTATION_RECORDS_STORAGE_KEY } from './consultation-records'
import type { ConsultationSession, Role } from '@/types/clinical'

const session = (id = 'c1'): ConsultationSession => ({
  id, patientId: `p-${id}`, patientName: `Patient ${id}`, complaint: 'Original complaint', status: 'completed', unread: 0, updatedAt: '2026-09-27T12:00:00.000Z', messages: [],
  summary: { chiefComplaint: 'Saved complaint', consultationNotes: 'Clinician notes', assessment: '', plan: 'Clinician plan', followUp: 'Clinician follow-up', authorName: 'Dr A', updatedAt: '2026-09-27T11:00:00.000Z' },
})
function setup() {
  const data = new Map<string, string>()
  let role: Role = 'doctor', fail = false, n = 0
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { if (fail) throw Error('quota'); data.set(key, value) } }
  const create = () => createLocalConsultationRecordService({ storage: () => storage, role: () => role, uuid: () => String(++n), now: () => '2026-09-27T12:00:00.000Z' })
  return { data, service: create(), create, setRole: (value: Role) => { role = value }, failWrites: () => { fail = true } }
}
const fields = { chiefComplaint: 'Edited complaint', presentIllness: 'Edited illness', diagnosis: 'Entered diagnosis' }

describe('consultation medical record handoff', () => {
  it('copies only the saved manual summary with no invented assessment or orders', () => {
    const { service } = setup()
    const record = service.create(session(), 'Dr B')
    expect(record).toMatchObject({ patientId: 'p-c1', chiefComplaint: 'Saved complaint', diagnosis: '', orders: [], aiGenerated: false, status: 'draft', sourceConsultationId: 'c1' })
    expect(record.presentIllness).toBe('Clinician notes\n\nAdvice / plan:\nClinician plan\n\nFollow-up:\nClinician follow-up')
  })
  it('reopening after refresh deduplicates by session and preserves edited content', () => {
    const f = setup(), record = f.service.create(session(), 'Dr B')
    f.service.save(record.id, fields)
    const changed = session(); changed.summary!.consultationNotes = 'Newer summary'
    const reopened = f.create().create(changed, 'Dr C')
    expect(reopened.id).toBe(record.id)
    expect(reopened.presentIllness).toBe('Edited illness')
    expect(f.create().list()).toHaveLength(1)
    expect(f.service.create(session('c2'), 'Dr B').patientId).toBe('p-c2')
  })
  it('rejects missing summaries and waiting consultations without writing', () => {
    const f = setup(), waiting = session(); waiting.status = 'waiting'
    expect(() => f.service.create(waiting, 'Dr')).toThrow('Accept')
    const noSummary = session(); delete noSummary.summary
    expect(() => f.service.create(noSummary, 'Dr')).toThrow('Save a consultation summary')
    expect(f.data.size).toBe(0)
  })
  it('keeps persisted content unchanged when an edit fails', () => {
    const f = setup(), record = f.service.create(session(), 'Dr')
    const original = f.data.get(CONSULTATION_RECORDS_STORAGE_KEY)
    f.failWrites()
    expect(() => f.service.save(record.id, fields)).toThrow('Unable to save')
    expect(f.data.get(CONSULTATION_RECORDS_STORAGE_KEY)).toBe(original)
    expect(record.chiefComplaint).toBe('Saved complaint')
  })
  it.each(['{broken', '{"version":99,"records":[]}', '{"version":1,"records":[{}]}'])('preserves corrupt or unsupported data: %s', raw => {
    const f = setup(); f.data.set(CONSULTATION_RECORDS_STORAGE_KEY, raw)
    expect(() => f.service.list()).toThrow('damaged')
    expect(() => f.service.create(session(), 'Dr')).toThrow('damaged')
    expect(f.data.get(CONSULTATION_RECORDS_STORAGE_KEY)).toBe(raw)
  })
  it('preserves unrelated browser keys', () => {
    const f = setup(); f.data.set('patient-profiles', 'untouched')
    f.service.create(session(), 'Dr')
    expect(f.data.get('patient-profiles')).toBe('untouched')
  })
  it('blocks administrator mutations while allowing reads', () => {
    const f = setup(), record = f.service.create(session(), 'Dr')
    f.setRole('admin')
    expect(f.service.list()).toHaveLength(1)
    expect(() => f.service.create(session('c2'), 'Admin')).toThrow('read-only')
    expect(() => f.service.save(record.id, fields)).toThrow('read-only')
    expect(() => f.service.addOrder(record.id, { type: 'Nursing', content: 'Manual order' })).toThrow('read-only')
  })
  it('requires completed fields for submission and enforces review transitions', () => {
    const f = setup(), record = f.service.create(session(), 'Dr')
    expect(() => f.service.save(record.id, { ...fields, diagnosis: '' }, true)).toThrow('Complete')
    f.service.save(record.id, fields, true)
    expect(() => f.service.save(record.id, fields)).toThrow('read-only')
    expect(() => f.service.review(record.id, 'approved', 'review')).toThrow('senior')
    f.setRole('seniorDoctor')
    f.service.review(record.id, 'returned', 'Please revise')
    f.service.save(record.id, fields, true)
    f.service.review(record.id, 'approved', 'Reviewed')
    expect(() => f.service.review(record.id, 'returned', 'Again')).toThrow('status has changed')
    f.service.review(record.id, 'archived', 'Archived')
    expect(f.create().list()[0]?.status).toBe('archived')
    expect(() => f.service.save(record.id, fields)).toThrow('read-only')
  })
  it('persists manual order add, edit and stop without creating extra orders', () => {
    const f = setup(), record = f.service.create(session(), 'Dr')
    const added = f.service.addOrder(record.id, { type: 'Nursing', content: 'Manual example' })
    const orderId = added.orders[0]!.id
    f.service.updateOrder(record.id, orderId, 'Revised example')
    f.service.stopOrder(record.id, orderId)
    expect(f.create().list()[0]?.orders).toEqual([{ id: orderId, type: 'Nursing', content: 'Revised example', status: 'stopped' }])
    expect(() => f.service.updateOrder(record.id, orderId, 'Later')).toThrow('active order')
  })
})
