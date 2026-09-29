import type { ConsultationMessage, ConsultationSession } from '@/types/clinical'

export interface ConsultationSearchFilters {
  keyword: string
  status: 'all' | 'waiting' | 'active' | 'completed'
  from: string
  to: string
}

export interface ConsultationSearchResult {
  session: ConsultationSession
  patientName: string
  messages: ConsultationMessage[]
  metadataMatch: boolean
  summaryMatch: boolean
  activityTime: string | null
}

function isCalendarDate(value: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!parts) return false
  const year = Number(parts[1])
  const month = Number(parts[2])
  const day = Number(parts[3])
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!
}

export function validateConsultationDateRange(from: string, to: string): string | null {
  if (from && !isCalendarDate(from)) return 'Enter a valid start date (YYYY-MM-DD).'
  if (to && !isCalendarDate(to)) return 'Enter a valid end date (YYYY-MM-DD).'
  if (from && to && from > to) return 'Start date must be on or before end date.'
  return null
}

/** Only zoned ISO timestamps carry enough information for dependable date filtering. */
function reliableTimestamp(value: string): number | null {
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value)
  if (!parts || !isCalendarDate(parts[1]!) || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4]) > 59) return null
  if (parts[5] !== 'Z' && (Number(parts[7]) > 23 || Number(parts[8]) > 59)) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function localCalendarDate(timestamp: number) {
  const date = new Date(timestamp)
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function searchConsultationRecords(
  sessions: ConsultationSession[],
  filters: ConsultationSearchFilters,
  resolvePatientName?: (session: ConsultationSession) => string,
): ConsultationSearchResult[] {
  if (validateConsultationDateRange(filters.from, filters.to)) return []
  const keyword = filters.keyword.trim().toLowerCase()
  const dateFiltered = Boolean(filters.from || filters.to)
  const matchesText = (value: string) => value.toLowerCase().includes(keyword)
  const inRange = (timestamp: number | null) => {
    if (!dateFiltered) return true
    if (timestamp === null) return false
    const date = localCalendarDate(timestamp)
    return (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to)
  }

  return sessions.flatMap((session, index) => {
    if (filters.status !== 'all' && session.status !== filters.status) return []
    const patientName = resolvePatientName?.(session) || session.patientName
    const metadataMatch = Boolean(keyword) && [patientName, session.patientName, session.patientId, session.id, session.complaint].some(matchesText)
    const updated = reliableTimestamp(session.updatedAt)
    const summaryTime = session.summary ? reliableTimestamp(session.summary.updatedAt) : null
    const summaryMatch = Boolean(keyword && session.summary && inRange(summaryTime)
      && [session.summary.chiefComplaint, session.summary.consultationNotes, session.summary.assessment, session.summary.plan, session.summary.followUp, session.summary.authorName].some(matchesText))
    let activityTimestamp = updated
    let activityTime = updated === null ? null : session.updatedAt
    if (summaryTime !== null && (activityTimestamp === null || summaryTime > activityTimestamp)) {
      activityTimestamp = summaryTime
      activityTime = session.summary!.updatedAt
    }
    let eligibleActivity = inRange(updated) || (summaryTime !== null && inRange(summaryTime))
    const messages = session.messages.filter(message => {
      const timestamp = reliableTimestamp(message.time)
      if (timestamp !== null && (activityTimestamp === null || timestamp > activityTimestamp)) {
        activityTimestamp = timestamp
        activityTime = message.time
      }
      const eligibleDate = inRange(timestamp)
      if (eligibleDate) eligibleActivity = true
      const textMatch = !keyword || [message.content, message.image?.name ?? '', message.attachment ?? ''].some(matchesText)
      return eligibleDate && textMatch
    })
    if (!(messages.length || summaryMatch || ((!keyword || metadataMatch) && eligibleActivity))) return []
    return [{ result: { session, patientName, messages, metadataMatch, summaryMatch, activityTime }, activityTimestamp, index }]
  }).sort((left, right) => {
    if (left.activityTimestamp === null && right.activityTimestamp !== null) return 1
    if (left.activityTimestamp !== null && right.activityTimestamp === null) return -1
    return (right.activityTimestamp ?? 0) - (left.activityTimestamp ?? 0) || left.index - right.index
  }).map(item => item.result)
}
