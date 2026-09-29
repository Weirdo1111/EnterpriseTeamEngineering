import { afterEach, describe, expect, it, vi } from 'vitest'

const baseUrl = 'https://api.example.test'
const user = { id: 12, account: 'riley', name: 'Real Doctor', role: 'doctor' }
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function setup(configuredBaseUrl = baseUrl) {
  vi.resetModules()
  vi.stubEnv('MODE', 'development')
  vi.stubEnv('VITE_API_BASE_URL', configuredBaseUrl)
  vi.stubEnv('VITE_AUTH_API_BASE_URL', configuredBaseUrl)
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const fetch = vi.fn<typeof globalThis.fetch>()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('fetch', fetch)
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useAuthStore } = await import('@/stores/auth')
  const { apiRequest, apiBaseUrl, apiEnabled } = await import('./http')
  return { storage, fetch, useAuthStore, apiRequest, apiBaseUrl, apiEnabled }
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })

describe('verified session propagation to clinical APIs', () => {
  it('sends the verified API token to medical records and ignores a legacy demo token', async () => {
    const { storage, fetch, useAuthStore, apiRequest } = await setup(`${baseUrl}/`)
    storage.setItem('doctor-platform-token', 'demo-admin-token')
    storage.setItem('doctor-platform-role', 'admin')
    fetch.mockResolvedValueOnce(response({ token: 'verified-server-token', user }))
      .mockResolvedValueOnce(response({ records: [] }))
    const auth = useAuthStore()
    await auth.loginWithPassword('riley', 'example-password')
    await expect(apiRequest('/api/records', { headers: { 'X-Request-Id': 'test', Authorization: 'Bearer old-token' } }))
      .resolves.toEqual({ records: [] })
    const [url, init] = fetch.mock.calls[1]!
    expect(url).toBe(`${baseUrl}/api/records`)
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer verified-server-token')
    expect(headers.get('X-Request-Id')).toBe('test')
    expect(storage.getItem('doctor-platform-token')).toBe('verified-server-token')
  })

  it('does not use a saved API token until session restoration verifies /me', async () => {
    const { storage, fetch, useAuthStore, apiRequest } = await setup()
    storage.setItem('doctor-platform-token', 'saved-api-token')
    const auth = useAuthStore()
    await expect(apiRequest('/api/records')).rejects.toMatchObject({ status: 401 })
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockResolvedValueOnce(response({ user })).mockResolvedValueOnce(response({ records: [] }))
    await auth.restoreSession()
    await apiRequest('/api/records')
    expect(new Headers(fetch.mock.calls[1]![1]?.headers).get('Authorization')).toBe('Bearer saved-api-token')
  })

  it('does not send a clinical request after verification fails', async () => {
    const { fetch, useAuthStore, apiRequest } = await setup()
    fetch.mockResolvedValueOnce(response({ token: 'unverified-token', user }))
      .mockResolvedValueOnce(response({ message: 'Expired token' }, 401))
    const auth = useAuthStore()
    await auth.loginWithPassword('riley', 'example-password')
    await expect(auth.restoreSession()).rejects.toThrow('Expired token')
    await expect(apiRequest('/api/records')).rejects.toMatchObject({ status: 401 })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('prevents further clinical requests as soon as local sign-out clears the session', async () => {
    const { fetch, useAuthStore, apiRequest } = await setup()
    fetch.mockResolvedValueOnce(response({ token: 'server-token', user }))
      .mockResolvedValueOnce(response({ success: true }))
    const auth = useAuthStore()
    await auth.loginWithPassword('riley', 'example-password')
    const logout = auth.logout()
    await expect(apiRequest('/api/records')).rejects.toMatchObject({ status: 401 })
    await logout
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps business APIs disabled when only authentication is configured', async () => {
    const { fetch, useAuthStore, apiRequest, apiEnabled } = await setup('')
    expect(useAuthStore().isAuthenticated).toBe(false)
    expect(apiEnabled).toBe(false)
    await expect(apiRequest('/api/records')).rejects.toMatchObject({ status: 503 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects an invalid configured origin without falling back to demonstration mode', async () => {
    const { fetch, apiRequest, apiEnabled } = await setup('https://name:secret@example.test')
    expect(apiEnabled).toBe(true)
    await expect(apiRequest('/api/records')).rejects.toThrow('VITE_API_BASE_URL')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves server error status and message for record views', async () => {
    const { fetch, useAuthStore, apiRequest } = await setup()
    fetch.mockResolvedValueOnce(response({ token: 'server-token', user }))
      .mockResolvedValueOnce(response({ message: 'Record version changed' }, 409))
    await useAuthStore().loginWithPassword('riley', 'example-password')
    await expect(apiRequest('/api/records/MR-1', { method: 'PATCH', body: JSON.stringify({ version: 1 }) }))
      .rejects.toMatchObject({ status: 409, message: 'Record version changed' })
    expect(new Headers(fetch.mock.calls[1]![1]?.headers).get('Content-Type')).toBe('application/json')
  })
})
