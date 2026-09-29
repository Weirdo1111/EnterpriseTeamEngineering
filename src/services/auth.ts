import { apiBaseUrl, ApiError } from './http'
import type { Role } from '@/types/clinical'

// Authentication can use the real backend without switching unrelated demo services.
const authBaseUrl = ((import.meta.env.VITE_AUTH_API_BASE_URL as string | undefined) ?? apiBaseUrl).replace(/\/$/, '')
async function authRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('doctor-platform-token')
  const response = await fetch(`${authBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token && !token.startsWith('demo-') ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(response.status, payload.message || `Request failed with status ${response.status}`)
  return payload as T
}

export interface AuthenticatedUser {
  id: number | string
  account: string
  name: string
  role: Role
}

export const authApi = {
  enabled: true,
  async login(account: string, password: string) {
    return authRequest<{ token: string; user: AuthenticatedUser }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ account, password }),
    })
  },
  async requestEmailCode(account: string) {
    return authRequest<{ status: 'accepted'; message: string }>('/api/auth/code/request', {
      method: 'POST', body: JSON.stringify({ account, channel: 'email' }),
    })
  },
  async loginWithEmail(account: string, code: string) {
    return authRequest<{ token: string; user: AuthenticatedUser }>('/api/auth/code/login', {
      method: 'POST', body: JSON.stringify({ account, channel: 'email', code }),
    })
  },
  async loginWithFace(account: string, image: string) {
    return authRequest<{ token: string; user: AuthenticatedUser }>('/api/auth/face/login', {
      method: 'POST', body: JSON.stringify({ account, image }),
    })
  },
  async me() { return authRequest<{ user: AuthenticatedUser }>('/api/auth/me') },
  async logout() { return authRequest<{ success: boolean }>('/api/auth/logout', { method: 'POST' }) },
}
