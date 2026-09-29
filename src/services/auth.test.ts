import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuthApi, validateAuthenticatedUser } from './auth'

const user = { id: 12, account: 'riley', name: 'Dr. Riley', role: 'doctor' }
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }
function fixture() {
  const fetch = vi.fn<typeof globalThis.fetch>()
  const api = createAuthApi({ baseURL: 'https://api.example.test/gateway/', fetch })
  return { api, fetch }
}
afterEach(() => { vi.useRealTimers() })

describe('authentication HTTP adapter', () => {
  it('sends only account/password and validates the normalized login response', async () => {
    const { api, fetch } = fixture()
    fetch.mockResolvedValue(response({ token: 'server-token', user }))
    expect(await api.login('riley', 'example-password')).toEqual({ token: 'server-token', user: { ...user, id: '12' } })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.example.test/gateway/api/auth/login')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ account: 'riley', password: 'example-password' })
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
  })
  it('uses the supplied token for me and logout without reading legacy storage', async () => {
    const { api, fetch } = fixture()
    fetch.mockResolvedValueOnce(response({ user })).mockResolvedValueOnce(response({ success: true }))
    expect(await api.me('selected-token')).toEqual({ user: { ...user, id: '12' } })
    expect(await api.logout('selected-token')).toEqual({ success: true })
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: 'GET', headers: { Authorization: 'Bearer selected-token' } })
    expect(fetch.mock.calls[1]![1]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer selected-token' } })
    expect(fetch.mock.calls[1]![0]).toBe('https://api.example.test/gateway/api/auth/logout')
  })
  it.each([undefined, '', '   '])('disables API only for an empty configuration: %j', async baseURL => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const api = createAuthApi({ baseURL, fetch })
    expect(api.enabled).toBe(false)
    await expect(api.login('a', 'b')).rejects.toThrow('not configured')
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each(['relative/path', 'http:example.test', 'ftp://example.test', 'https://name:secret@example.test', 'https://example.test?query=1', 'https://example.test#fragment', 'https://example.test?', 'https://example.test#'])('rejects invalid configuration without switching to demo: %s', async baseURL => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const api = createAuthApi({ baseURL, fetch })
    expect(api.enabled).toBe(true)
    expect(api.baseUrl).toBe('')
    await expect(api.login('a', 'b')).rejects.toThrow('VITE_API_BASE_URL')
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([null, {}, { ...user, id: 0 }, { ...user, id: -1 }, { ...user, id: 1.5 }, { ...user, id: Number.MAX_SAFE_INTEGER + 1 }, { ...user, id: '' }, { ...user, id: '  ' }, { ...user, role: 'patient' }, { ...user, name: '' }, { ...user, account: null }])('rejects invalid user contracts: %j', invalid => {
    expect(() => validateAuthenticatedUser(invalid)).toThrow('invalid user')
  })
  it('preserves large string IDs and only returns defined public fields', () => {
    expect(validateAuthenticatedUser({ ...user, id: '9007199254740993', password_hash: 'not-public', name: ' Doctor ' })).toEqual({ ...user, id: '9007199254740993', name: 'Doctor' })
  })
  it('preserves opaque string user IDs exactly', () => {
    expect(validateAuthenticatedUser({ ...user, id: ' opaque-user-id ' }).id).toBe(' opaque-user-id ')
  })
  it.each(['', 'demo-doctor-token', 'DEMO-admin-token', 'has space', null, 42])('rejects invalid server tokens: %j', async token => {
    const { api, fetch } = fixture()
    fetch.mockResolvedValue(response({ token, user }))
    await expect(api.login('a', 'b')).rejects.toThrow('invalid session token')
  })
  it('rejects an invalid me user and malformed successful response', async () => {
    const { api, fetch } = fixture()
    fetch.mockResolvedValueOnce(response({ user: { ...user, role: 'root' } })).mockResolvedValueOnce(new Response('not-json'))
    await expect(api.me('server-token')).rejects.toThrow('invalid user')
    await expect(api.login('a', 'b')).rejects.toThrow('invalid response')
  })
  it('retains HTTP status and server error message', async () => {
    const { api, fetch } = fixture()
    fetch.mockResolvedValue(response({ message: 'Invalid credentials' }, 401))
    await expect(api.login('a', 'b')).rejects.toMatchObject({ status: 401, message: 'Invalid credentials' })
  })
  it('reports network failures without returning a demo session', async () => {
    const { api, fetch } = fixture()
    fetch.mockRejectedValue(new TypeError('fetch failed'))
    await expect(api.login('a', 'b')).rejects.toThrow('Unable to reach')
  })
  it('times out even when a fetch adapter ignores abort', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() => new Promise(() => {}))
    const api = createAuthApi({ baseURL: 'http://localhost:3000', fetch, timeoutMs: 100 })
    const pending = expect(api.me('server-token')).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(101)
    await pending
    expect(fetch.mock.calls[0]![1]?.signal?.aborted).toBe(true)
  })
  it('does not acknowledge an invalid logout response', async () => {
    const { api, fetch } = fixture()
    fetch.mockResolvedValue(response({ success: false }))
    await expect(api.logout('server-token')).rejects.toThrow('invalid logout')
  })
})
