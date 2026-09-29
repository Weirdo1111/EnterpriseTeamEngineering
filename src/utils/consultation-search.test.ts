import { describe, expect, it } from 'vitest'
import type { ConsultationMessage, ConsultationSession } from '@/types/clinical'
import { searchConsultationRecords, validateConsultationDateRange, type ConsultationSearchFilters } from './consultation-search'

const filters = (fields: Partial<ConsultationSearchFilters> = {}): ConsultationSearchFilters => ({ keyword: '', status: 'all', from: '', to: '', ...fields })
const localTime = (day: number, hour = 12, minute = 0, second = 0, millisecond = 0) => new Date(2026, 8, day, hour, minute, second, millisecond).toISOString()
const message = (id: string, content: string, time = localTime(20)): ConsultationMessage => ({ id, content, time, sender: 'doctor' })
const session = (id: string, messages: ConsultationMessage[] = [], fields: Partial<ConsultationSession> = {}): ConsultationSession => ({
  id, patientId: `patient-${id}`, patientName: 'Original Name', complaint: 'Review monitoring results', status: 'active', unread: 0, updatedAt: '09:19', messages, ...fields,
})
const ids = (results: ReturnType<typeof searchConsultationRecords>) => results.map(result => result.session.id)

describe('consultation search dates', () => {
  it('allows empty, one-sided and same-day ranges', () => {
    expect(validateConsultationDateRange('', '')).toBeNull()
    expect(validateConsultationDateRange('2026-09-20', '')).toBeNull()
    expect(validateConsultationDateRange('', '2026-09-20')).toBeNull()
    expect(validateConsultationDateRange('2026-09-20', '2026-09-20')).toBeNull()
    expect(validateConsultationDateRange('2024-02-29', '2024-03-01')).toBeNull()
  })

  it.each(['20/09/2026', '2026-9-20', '2026-02-29', '2026-04-31', '2026-00-10', '2026-13-01', '2026-01-00', '2026-01-32', '2026-09-20T00:00:00Z', ' 2026-09-20 '])('rejects invalid start and end dates: %s', value => {
    expect(validateConsultationDateRange(value, '')).toContain('start date')
    expect(validateConsultationDateRange('', value)).toContain('end date')
  })

  it('reports reversed dates and makes an invalid range return no results', () => {
    expect(validateConsultationDateRange('2026-09-21', '2026-09-20')).toContain('on or before')
    const records = [session('one', [message('a', 'reply')])]
    expect(searchConsultationRecords(records, filters({ from: '2026-09-21', to: '2026-09-20' }))).toEqual([])
    expect(searchConsultationRecords(records, filters({ from: 'bad' }))).toEqual([])
  })
})

describe('consultation record search', () => {
  it('finds a saved summary without matching message text', () => {
    const summary = { chiefComplaint: 'Concern', consultationNotes: 'Unique summary marker', assessment: '', plan: '', followUp: '', authorName: 'Dr Test', updatedAt: localTime(20) }
    const found = searchConsultationRecords([session('summary', [message('m', 'Other text')], { summary })], filters({ keyword: 'SUMMARY MARKER' }))
    expect(ids(found)).toEqual(['summary'])
    expect(found[0]).toMatchObject({ summaryMatch: true, metadataMatch: false, messages: [] })
  })

  it('requires summary keyword and date to match the same saved summary', () => {
    const summary = { chiefComplaint: 'Concern', consultationNotes: 'Old summary marker', assessment: '', plan: '', followUp: '', authorName: 'Dr Test', updatedAt: localTime(19) }
    const records = [session('summary', [message('new', 'Other new message', localTime(20))], { summary, updatedAt: localTime(20) })]
    expect(searchConsultationRecords(records, filters({ keyword: 'summary marker', from: '2026-09-20' }))).toEqual([])
    expect(ids(searchConsultationRecords(records, filters({ keyword: 'summary marker', from: '2026-09-19', to: '2026-09-19' })))).toEqual(['summary'])
  })

  it('searches optional summary fields and author as literal text', () => {
    const summary = { chiefComplaint: 'c', consultationNotes: 'n', assessment: '<b>review</b>', plan: 'plan-text', followUp: 'follow-text', authorName: 'Dr Example', updatedAt: localTime(20) }
    for (const keyword of ['<b>review</b>', 'plan-text', 'follow-text', 'Dr Example']) {
      expect(searchConsultationRecords([session('s', [], { summary })], filters({ keyword }))[0]?.summaryMatch).toBe(true)
    }
  })

  it('counts the saved summary timestamp as dated activity without making all summaries keyword matches', () => {
    const summary = { chiefComplaint: 'c', consultationNotes: 'n', assessment: '', plan: '', followUp: '', authorName: 'Dr', updatedAt: localTime(21) }
    const found = searchConsultationRecords([session('s', [], { summary })], filters({ from: '2026-09-21', to: '2026-09-21' }))
    expect(found[0]).toMatchObject({ activityTime: localTime(21), summaryMatch: false })
  })

  it('includes all sessions without filters, including empty and legacy histories', () => {
    const records = [session('empty'), session('legacy', [message('old', 'Historical reply', 'Yesterday 16:32')]), session('dated', [message('new', 'Recent reply')])]
    const found = searchConsultationRecords(records, filters())
    expect(ids(found)).toEqual(['dated', 'empty', 'legacy'])
    expect(found.every(item => !item.metadataMatch)).toBe(true)
    expect(found[0]!.messages).toEqual(records[2]!.messages)
    expect(found[1]!.activityTime).toBeNull()
  })

  it('trims the keyword and performs case-insensitive literal substring matching', () => {
    const records = [session('one', [message('match', 'Bring your BLOOD PRESSURE record'), message('other', 'Review sleep')])]
    const found = searchConsultationRecords(records, filters({ keyword: '  blood pressure  ' }))
    expect(ids(found)).toEqual(['one'])
    expect(found[0]!.messages.map(item => item.id)).toEqual(['match'])
    expect(found[0]!.metadataMatch).toBe(false)
  })

  it.each(['[a-z]+', '.*', '<img src=x onerror=alert(1)>', 'a\\b'])('treats regex and HTML-looking queries as literal text: %s', keyword => {
    const records = [session('exact', [message('literal', `Text ${keyword} ending`)]), session('unrelated', [message('normal', 'Anything else')])]
    expect(ids(searchConsultationRecords(records, filters({ keyword })))).toEqual(['exact'])
  })

  it('finds both current and saved patient names after a rename, while displaying the current name', () => {
    const records = [session('one', [], { patientName: 'Older Patient Name' })]
    const resolve = () => 'Updated Patient Name'
    for (const keyword of ['older patient', 'updated patient']) {
      const found = searchConsultationRecords(records, filters({ keyword }), resolve)
      expect(found).toHaveLength(1)
      expect(found[0]).toMatchObject({ patientName: 'Updated Patient Name', metadataMatch: true, messages: [] })
    }
    expect(searchConsultationRecords(records, filters(), () => '')[0]!.patientName).toBe('Older Patient Name')
  })

  it.each(['patient-abc', 'abc', 'monitoring results'])('searches session metadata: %s', keyword => {
    const found = searchConsultationRecords([session('abc')], filters({ keyword }))
    expect(found).toHaveLength(1)
    expect(found[0]!.metadataMatch).toBe(true)
  })

  it('finds image filenames and legacy attachment names even when there is no caption', () => {
    const image: ConsultationMessage = { ...message('image', ''), image: { id: 'image-1', name: 'Home-Blood-Pressure.png', mimeType: 'image/png', size: 200, width: 20, height: 10 } }
    const attachment: ConsultationMessage = { ...message('attachment', 'Attached report'), attachment: 'Kidney-Report.pdf' }
    const records = [session('one', [image, attachment])]
    expect(searchConsultationRecords(records, filters({ keyword: 'blood-pressure.PNG' }))[0]!.messages).toEqual([image])
    expect(searchConsultationRecords(records, filters({ keyword: 'kidney-report' }))[0]!.messages).toEqual([attachment])
  })

  it('combines status, query and date on the same matching message', () => {
    const records = [
      session('active', [message('yes', 'Specific reply', localTime(20))]),
      session('completed', [message('yes', 'Specific reply', localTime(20))], { status: 'completed' }),
      session('waiting', [message('yes', 'Specific reply', localTime(20))], { status: 'waiting' }),
      session('wrong-day', [message('old-match', 'Specific reply', localTime(19)), message('new-nonmatch', 'Unrelated', localTime(20))], { status: 'completed' }),
    ]
    const found = searchConsultationRecords(records, filters({ keyword: 'specific', status: 'completed', from: '2026-09-20', to: '2026-09-20' }))
    expect(ids(found)).toEqual(['completed'])
    expect(found[0]!.messages.map(item => item.id)).toEqual(['yes'])
  })

  it('does not use the session update date to qualify an out-of-range keyword message', () => {
    const records = [session('one', [message('old', 'Matching reply', localTime(19))], { updatedAt: localTime(20) })]
    expect(searchConsultationRecords(records, filters({ keyword: 'matching', from: '2026-09-20', to: '2026-09-20' }))).toEqual([])
  })

  it('allows matching metadata with any in-range activity, even when no messages match the keyword', () => {
    const records = [
      session('message-activity', [message('a', 'Unrelated reply')], { patientName: 'Alice' }),
      session('update-activity', [], { patientName: 'Alice', updatedAt: localTime(20, 14) }),
      session('old-activity', [message('a', 'Unrelated reply', localTime(19))], { patientName: 'Alice' }),
    ]
    const found = searchConsultationRecords(records, filters({ keyword: 'alice', from: '2026-09-20', to: '2026-09-20' }))
    expect(ids(found)).toEqual(['update-activity', 'message-activity'])
    expect(found.every(item => item.metadataMatch && !item.messages.length)).toBe(true)
  })

  it('with dates but no keyword includes all in-range messages and sessions updated in range', () => {
    const records = [session('messages', [message('before', 'Before', localTime(19)), message('inside', 'Inside', localTime(20)), message('legacy', 'Unknown', '09:20')]), session('updated-only', [], { updatedAt: localTime(20, 16) })]
    const found = searchConsultationRecords(records, filters({ from: '2026-09-20', to: '2026-09-20' }))
    expect(ids(found)).toEqual(['updated-only', 'messages'])
    expect(found[1]!.messages.map(item => item.id)).toEqual(['inside'])
    expect(found.every(item => !item.metadataMatch)).toBe(true)
  })

  it('includes exact local start/end boundaries but excludes the adjacent milliseconds', () => {
    const times = [localTime(19, 23, 59, 59, 999), localTime(20, 0), localTime(20, 23, 59, 59, 999), localTime(21, 0)]
    const records = [session('one', times.map((time, index) => message(String(index), 'reply', time)))]
    const found = searchConsultationRecords(records, filters({ from: '2026-09-20', to: '2026-09-20' }))
    expect(found[0]!.messages.map(item => item.id)).toEqual(['1', '2'])
    expect(found[0]!.activityTime).toBe(times[3])
  })

  it('supports each one-sided bound inclusively', () => {
    const records = [session('one', [message('before', 'reply', localTime(19)), message('on', 'reply', localTime(20)), message('after', 'reply', localTime(21))])]
    expect(searchConsultationRecords(records, filters({ from: '2026-09-20' }))[0]!.messages.map(item => item.id)).toEqual(['on', 'after'])
    expect(searchConsultationRecords(records, filters({ to: '2026-09-20' }))[0]!.messages.map(item => item.id)).toEqual(['before', 'on'])
  })

  it('interprets explicit numeric timezone offsets as instants in the local calendar', () => {
    const instant = new Date(2026, 8, 20, 0, 30).getTime()
    const offsetClock = new Date(instant + 8 * 60 * 60 * 1000).toISOString().slice(0, -1) + '+08:00'
    const records = [session('offset', [message('offset-message', 'reply', offsetClock)])]
    const found = searchConsultationRecords(records, filters({ from: '2026-09-20', to: '2026-09-20' }))
    expect(ids(found)).toEqual(['offset'])
    expect(found[0]!.activityTime).toBe(offsetClock)
  })

  it('uses the local day when the encoded timezone timestamp shows a different calendar date', () => {
    const instant = new Date(2026, 8, 20, 0, 30).getTime()
    const offsetClock = [-14, 14].map(hours => {
      const clock = new Date(instant + hours * 60 * 60 * 1000).toISOString().slice(0, -1)
      return `${clock}${hours < 0 ? '-' : '+'}14:00`
    }).find(value => value.slice(0, 10) !== '2026-09-20')!
    expect(offsetClock.slice(0, 10)).not.toBe('2026-09-20')
    expect(Date.parse(offsetClock)).toBe(instant)
    const records = [session('offset', [message('offset-message', 'reply', offsetClock)])]
    expect(ids(searchConsultationRecords(records, filters({ from: '2026-09-20', to: '2026-09-20' })))).toEqual(['offset'])
  })

  it.each(['09:19', 'Yesterday 16:32', 'Just now', '2026-09-20', '2026-09-20T09:19:00', '2026-02-30T10:00:00Z', '2026-09-20T24:00:00Z', '2026-09-20T12:60:00Z', '2026-09-20T12:00:60Z', '2026-09-20T12:00:00+24:00'])('never infers a date from unreliable timestamps: %s', time => {
    const records = [session('C-20260920-01', [message('legacy', 'reply', time)], { updatedAt: time })]
    expect(searchConsultationRecords(records, filters())[0]!.activityTime).toBeNull()
    expect(searchConsultationRecords(records, filters({ keyword: 'C-20260920', from: '2026-09-20' }))).toEqual([])
  })

  it('excludes undated keyword messages even when another dated message qualifies the session activity', () => {
    const records = [session('one', [message('legacy', 'Find me', '09:19'), message('dated', 'Something else', localTime(20))])]
    expect(searchConsultationRecords(records, filters({ keyword: 'find me', from: '2026-09-20' }))).toEqual([])
  })

  it('sorts by the latest reliable timestamp across updates and all messages, retaining original tie and undated order', () => {
    const records = [
      session('undated-first'),
      session('tied-first', [message('a', 'find', localTime(21))]),
      session('latest-message', [message('old', 'find', localTime(18)), message('new', 'unmatched', localTime(23))], { updatedAt: localTime(19) }),
      session('tied-second', [], { updatedAt: localTime(21), complaint: 'find' }),
      session('latest-update', [message('a', 'find', localTime(19))], { updatedAt: localTime(24) }),
      session('undated-second', [message('a', 'find', 'Yesterday')]),
    ]
    expect(ids(searchConsultationRecords(records, filters()))).toEqual(['latest-update', 'latest-message', 'tied-first', 'tied-second', 'undated-first', 'undated-second'])
    const matching = searchConsultationRecords(records, filters({ keyword: 'find' }))
    expect(ids(matching)).toEqual(['latest-update', 'latest-message', 'tied-first', 'tied-second', 'undated-second'])
    expect(matching[1]!.activityTime).toBe(localTime(23))
    expect(matching[1]!.messages.map(item => item.id)).toEqual(['old'])
  })

  it('does not mutate input sessions, messages, or filter values while searching and sorting', () => {
    const records = [session('one', [message('a', 'reply', localTime(20)), message('b', 'old', localTime(19))]), session('two', [], { updatedAt: localTime(21) })]
    const original = structuredClone(records)
    const query = filters({ keyword: 'reply', from: '2026-09-20' })
    const originalQuery = { ...query }
    const found = searchConsultationRecords(records, query)
    expect(records).toEqual(original)
    expect(query).toEqual(originalQuery)
    expect(found[0]!.session).toBe(records[0])
    expect(found[0]!.messages).not.toBe(records[0]!.messages)
  })
})
