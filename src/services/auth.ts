import type { Role } from '@/types/clinical'

export interface AuthenticatedUser { id: string; account: string; name: string; role: Role }
export class AuthenticationError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); this.name = 'AuthenticationError' }
}
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
export function isAuthRole(value: unknown): value is Role { return value === 'doctor' || value === 'seniorDoctor' || value === 'admin' }

export function validateAuthenticatedUser(value: unknown): AuthenticatedUser {
  if (!object(value)) throw new AuthenticationError('The authentication server returned an invalid user.')
  const id = typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id > 0 ? String(value.id) : typeof value.id === 'string' ? value.id : ''
  if (!id.trim() || !isAuthRole(value.role) || typeof value.account !== 'string' || !value.account.trim() || typeof value.name !== 'string' || !value.name.trim()) {
    throw new AuthenticationError('The authentication server returned an invalid user.')
  }
  return { id, account: value.account.trim(), name: value.name.trim(), role: value.role }
}
export function validateApiToken(value: unknown): string {
  if (typeof value !== 'string' || !value || /\s/.test(value) || /^demo-/i.test(value)) throw new AuthenticationError('The authentication server returned an invalid session token.')
  return value
}

export function createAuthApi(options: { baseURL: string | undefined; fetch?: typeof globalThis.fetch; timeoutMs?: number }) {
  const configured = options.baseURL?.trim() ?? ''
  const enabled = Boolean(configured)
  let baseUrl = configured.replace(/\/+$/, '')
  let configurationError = ''
  if (enabled) {
    try {
      const url = new URL(configured)
      if (!/^https?:\/\//i.test(configured) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || configured.includes('?') || configured.includes('#')) throw new Error('Invalid URL')
      baseUrl = url.toString().replace(/\/+$/, '')
    } catch {
      baseUrl = ''
      configurationError = 'VITE_API_BASE_URL must be an absolute HTTP or HTTPS URL without credentials, query parameters, or a fragment.'
    }
  }
  async function request(path: string, method: 'GET' | 'POST', body?: unknown, token?: string): Promise<unknown> {
    if (configurationError) throw new AuthenticationError(configurationError)
    if (!enabled) throw new AuthenticationError('The authentication API is not configured.')
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new AuthenticationError('The authentication request timed out. Please retry.')) }, options.timeoutMs ?? 10_000)
    })
    try {
      return await Promise.race([
        (async () => {
          const response = await (options.fetch ?? globalThis.fetch)(`${baseUrl}${path}`, {
            method,
            headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${validateApiToken(token)}` } : {}) },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: controller.signal,
          })
          const payload: unknown = await response.json().catch(() => undefined)
          if (!response.ok) {
            const message = object(payload) && typeof payload.message === 'string' && payload.message.trim() ? payload.message : `Authentication request failed (${response.status}).`
            throw new AuthenticationError(message, response.status)
          }
          if (!object(payload)) throw new AuthenticationError('The authentication server returned an invalid response.')
          return payload
        })(), timeout,
      ])
    } catch (error) {
      if (timedOut) throw new AuthenticationError('The authentication request timed out. Please retry.')
      if (error instanceof AuthenticationError) throw error
      throw new AuthenticationError('Unable to reach the authentication server. Check the backend connection and retry.')
    } finally { if (timer !== undefined) clearTimeout(timer) }
  }
  return {
    enabled, baseUrl, configurationError,
    async login(account: string, password: string) {
      const result = await request('/api/auth/login', 'POST', { account, password }) as Record<string, unknown>
      return { token: validateApiToken(result.token), user: validateAuthenticatedUser(result.user) }
    },
    async me(token: string) {
      const result = await request('/api/auth/me', 'GET', undefined, validateApiToken(token)) as Record<string, unknown>
      return { user: validateAuthenticatedUser(result.user) }
    },
    async logout(token: string) {
      const result = await request('/api/auth/logout', 'POST', undefined, validateApiToken(token)) as Record<string, unknown>
      if (result.success !== true) throw new AuthenticationError('The authentication server returned an invalid logout response.')
      return { success: true as const }
    },
  }
}
export type AuthApi = ReturnType<typeof createAuthApi>
export const authApi = createAuthApi({ baseURL: import.meta.env.VITE_API_BASE_URL })
