export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''
export const apiEnabled = Boolean(apiBaseUrl) && import.meta.env.MODE !== 'test'

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}) {
  if (!apiEnabled) throw new ApiError(503, 'The backend API is not configured.')
  const token = localStorage.getItem('doctor-platform-token')
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  const payload = await response.json().catch(() => ({})) as { message?: string } & T
  if (!response.ok) throw new ApiError(response.status, payload.message || `Request failed with status ${response.status}.`)
  return payload
}
