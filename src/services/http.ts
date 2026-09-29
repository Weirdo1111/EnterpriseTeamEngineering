import { getActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { authApi } from './auth'
import { ApiError, backendConfig, validateApiToken } from './http-config'
export { ApiError } from './http-config'

const config = backendConfig(import.meta.env.VITE_API_BASE_URL, 'VITE_API_BASE_URL')
export const apiBaseUrl = config.baseUrl
export const apiEnabled = Boolean(apiBaseUrl) && import.meta.env.MODE !== 'test'

export async function apiRequest<T>(path: string, init: RequestInit = {}) {
  if (!apiEnabled) throw new ApiError(503, 'The backend API is not configured.')
  if (config.configurationError) throw new ApiError(503, config.configurationError)
  const auth = getActivePinia() ? useAuthStore() : undefined
  // Saved credentials are not trusted until /me verifies the current session.
  // Never attach the legacy demonstration token to a server request.
  if (!auth?.usesBackend || !auth.isAuthenticated || authApi.baseUrl !== apiBaseUrl) {
    throw new ApiError(401, 'Sign in with a verified server account before using the backend.')
  }
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  headers.set('Authorization', `Bearer ${validateApiToken(auth.token)}`)
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers })
  const payload = await response.json().catch(() => ({})) as { message?: string } & T
  if (!response.ok) throw new ApiError(response.status, payload.message || `Request failed with status ${response.status}.`)
  return payload
}
