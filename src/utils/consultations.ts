/** Preserve legacy demo labels; format full timestamps from saved messages. */
export function formatConsultationTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}
