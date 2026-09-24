import { apiEnabled, apiRequest } from './http'
import type { Role } from '@/types/clinical'

export interface AuthenticatedUser {
  id: number | string
  account: string
  name: string
  role: Role
}

export const authApi = {
  enabled: apiEnabled,
  async login(account: string, password: string) {
    return apiRequest<{ token: string; user: AuthenticatedUser }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ account, password }),
    })
  },
  async me() { return apiRequest<{ user: AuthenticatedUser }>('/api/auth/me') },
  async logout() { return apiRequest<{ success: boolean }>('/api/auth/logout', { method: 'POST' }) },
}
