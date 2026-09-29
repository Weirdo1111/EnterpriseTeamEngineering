import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Role } from '@/types/clinical'

const api = vi.hoisted(() => ({ enabled: false, baseUrl: '', configurationError: '', login: vi.fn(), me: vi.fn(), logout: vi.fn() }))
vi.mock('@/services/auth', async importOriginal => ({ ...await importOriginal<typeof import('@/services/auth')>(), authApi: api }))
import { API_SESSION_STORAGE_KEY, useAuthStore } from './auth'

const user = { id: '12', account: 'riley', name: 'Real Doctor', role: 'doctor' as Role }
function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    removeItem: vi.fn((key: string) => { values.delete(key) }),
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
let storage: ReturnType<typeof memoryStorage>
function backend() { api.enabled = true; api.baseUrl = 'https://api.example.test'; return useAuthStore() }
function saveApiSession(token = 'saved-token', baseUrl = 'https://api.example.test') { storage.setItem(API_SESSION_STORAGE_KEY, JSON.stringify({ baseUrl, token })) }

beforeEach(() => {
  storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
  setActivePinia(createPinia())
  api.enabled = false; api.baseUrl = ''; api.configurationError = ''
  api.login.mockReset().mockResolvedValue({ token: 'server-token', user })
  api.me.mockReset().mockResolvedValue({ user })
  api.logout.mockReset().mockResolvedValue({ success: true })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('demo authentication isolation', () => {
  it.each(['doctor', 'seniorDoctor', 'admin'] as const)('keeps the existing synchronous %s demo login', role => {
    const store = useAuthStore()
    expect(store.login(role)).toBeUndefined()
    expect(store.isAuthenticated).toBe(true)
    expect(store.identityKey).toBe(`demo:${role}`)
    expect(store.profile.role).toBe(role)
    expect(store.currentUser).toBeNull()
    expect(storage.getItem('doctor-platform-token')).toBe(`demo-${role}-token`)
    expect(storage.getItem(API_SESSION_STORAGE_KEY)).toBeNull()
    expect(api.login).not.toHaveBeenCalled()
  })
  it('restores only a whitelisted matching demo role/token pair', () => {
    storage.setItem('doctor-platform-role', 'seniorDoctor')
    storage.setItem('doctor-platform-token', 'demo-seniorDoctor-token')
    expect(useAuthStore().isAuthenticated).toBe(true)
    expect(useAuthStore().currentRole).toBe('seniorDoctor')
  })
  it.each([
    ['doctor', 'arbitrary-token'], ['admin', 'demo-doctor-token'], ['root', 'demo-root-token'], ['doctor', 'real.jwt.token'], ['', 'demo-doctor-token'],
  ])('does not authenticate tampered role=%s token=%s', (role, token) => {
    storage.setItem('doctor-platform-role', role)
    storage.setItem('doctor-platform-token', token)
    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(false)
    expect(store.identityKey).toBe('')
    expect(store.profile.name).toBe('Dr. Riley Lin')
  })
  it('handles runtime-invalid roles without crashing and rejects invalid login', () => {
    const store = useAuthStore()
    store.currentRole = 'root' as Role
    expect(store.profile.name).toBe('Dr. Riley Lin')
    expect(store.isAuthenticated).toBe(false)
    expect(() => store.login('root' as Role)).toThrow('valid demo role')
  })
  it('does not consume the API session key in demo mode', () => {
    saveApiSession()
    expect(useAuthStore().isAuthenticated).toBe(false)
    expect(useAuthStore().token).toBe('')
  })
})

describe('verified backend session', () => {
  it('requires both login and me, uses verified identity, and never sends a role', async () => {
    const verification = deferred<{ user: typeof user }>()
    api.me.mockReturnValue(verification.promise)
    const store = backend()
    const pending = store.loginWithPassword('riley', 'example-password')
    await Promise.resolve()
    expect(store.isAuthenticated).toBe(false)
    expect(storage.getItem(API_SESSION_STORAGE_KEY)).toBeNull()
    verification.resolve({ user: { ...user, name: 'Verified Name', role: 'seniorDoctor' } })
    await pending
    expect(api.login).toHaveBeenCalledWith('riley', 'example-password')
    expect(api.me).toHaveBeenCalledWith('server-token')
    expect(store.currentUser?.id).toBe('12')
    expect(store.currentRole).toBe('seniorDoctor')
    expect(store.profile).toEqual({ id: '12', name: 'Verified Name', role: 'seniorDoctor', department: '', title: '' })
    expect(store.identityKey).toBe('api:https://api.example.test:12')
    expect(JSON.parse(storage.getItem(API_SESSION_STORAGE_KEY)!)).toEqual({ baseUrl: api.baseUrl, token: 'server-token' })
    expect(storage.getItem('doctor-platform-token')).toBeNull()
  })
  it('normalizes a numeric ID at the store boundary as well', async () => {
    api.login.mockResolvedValue({ token: 'server-token', user: { ...user, id: 12 } })
    api.me.mockResolvedValue({ user: { ...user, id: 12 } })
    const store = backend()
    await store.loginWithPassword('a', 'b')
    expect(store.currentUser?.id).toBe('12')
  })
  it('clears state when verification fails after successful password login', async () => {
    api.me.mockRejectedValue(new Error('Unauthorized'))
    const store = backend()
    await expect(store.loginWithPassword('a', 'b')).rejects.toThrow('Unauthorized')
    expect(store.isAuthenticated).toBe(false)
    expect(store.token).toBe('')
    expect(store.currentUser).toBeNull()
    expect(storage.getItem(API_SESSION_STORAGE_KEY)).toBeNull()
    expect(store.sessionError).toBe('Unauthorized')
  })
  it.each(['demo-doctor-token', '', 'bad token'])('rejects returned token %j even from an injected adapter', async token => {
    api.login.mockResolvedValue({ token, user })
    const store = backend()
    await expect(store.loginWithPassword('a', 'b')).rejects.toThrow('invalid session token')
    expect(store.isAuthenticated).toBe(false)
    expect(api.me).not.toHaveBeenCalled()
  })
  it('rejects invalid or inconsistent verified users', async () => {
    const store = backend()
    api.me.mockResolvedValueOnce({ user: { ...user, role: 'root' } }).mockResolvedValueOnce({ user: { ...user, id: 'different-id' } })
    await expect(store.loginWithPassword('a', 'b')).rejects.toThrow('invalid user')
    await expect(store.loginWithPassword('a', 'b')).rejects.toThrow('inconsistent')
    expect(store.isAuthenticated).toBe(false)
  })
  it('never enables demo login while the API is configured', () => {
    expect(() => backend().login('admin')).toThrow('unavailable')
  })
  it('requires the exact token verified by me, including after exposed state changes', async () => {
    const store = backend()
    await store.loginWithPassword('a', 'b')
    store.token = 'different-token'
    expect(store.isAuthenticated).toBe(false)
    store.token = 'demo-doctor-token'
    expect(store.isAuthenticated).toBe(false)
    expect(store.identityKey).toBe('')
  })
  it('starts an ordinary empty API session without a sign-in error', async () => {
    const store = backend()
    await expect(store.restoreSession()).resolves.toBeUndefined()
    expect(store.sessionError).toBe('')
    expect(store.isAuthenticated).toBe(false)
    expect(api.me).not.toHaveBeenCalled()
  })
  it('ignores legacy tokens/roles and API sessions for a different endpoint', () => {
    storage.setItem('doctor-platform-token', 'demo-admin-token')
    storage.setItem('doctor-platform-role', 'admin')
    saveApiSession('other-token', 'https://another.example.test')
    const store = backend()
    expect(store.token).toBe('')
    expect(store.currentRole).toBe('doctor')
    expect(store.isAuthenticated).toBe(false)
  })
  it('restores matching endpoint sessions only after me and deduplicates verification', async () => {
    saveApiSession()
    const store = backend()
    expect(store.token).toBe('saved-token')
    expect(store.isAuthenticated).toBe(false)
    await Promise.all([store.restoreSession(), store.restoreSession(), store.restoreSession(true)])
    expect(api.me).toHaveBeenCalledTimes(1)
    expect(store.isAuthenticated).toBe(true)
    await store.restoreSession()
    expect(api.me).toHaveBeenCalledTimes(1)
    await store.restoreSession(true)
    expect(api.me).toHaveBeenCalledTimes(2)
  })
  it('clears a rejected persisted session without touching demo storage', async () => {
    saveApiSession()
    storage.setItem('doctor-platform-token', 'demo-admin-token')
    api.me.mockRejectedValue(new Error('Expired token'))
    const store = backend()
    await expect(store.restoreSession()).rejects.toThrow('Expired token')
    expect(store.isAuthenticated).toBe(false)
    expect(storage.getItem(API_SESSION_STORAGE_KEY)).toBeNull()
    expect(storage.getItem('doctor-platform-token')).toBe('demo-admin-token')
  })
  it.each(['demo-doctor-token', ''])('rejects missing or demo persisted API token %j', async token => {
    saveApiSession(token)
    const store = backend()
    await expect(store.restoreSession()).rejects.toThrow()
    expect(store.isAuthenticated).toBe(false)
    expect(api.me).not.toHaveBeenCalled()
  })
  it('does not restore authentication after logout during me', async () => {
    saveApiSession()
    const verification = deferred<{ user: typeof user }>()
    api.me.mockReturnValue(verification.promise)
    const store = backend()
    const pending = store.restoreSession()
    await Promise.resolve()
    await store.logout()
    verification.resolve({ user })
    await expect(pending).rejects.toThrow('superseded')
    expect(store.isAuthenticated).toBe(false)
    expect(storage.getItem(API_SESSION_STORAGE_KEY)).toBeNull()
  })
  it('does not restore authentication after logout during password login', async () => {
    const authentication = deferred<{ token: string; user: typeof user }>()
    api.login.mockReturnValue(authentication.promise)
    const store = backend()
    const pending = store.loginWithPassword('a', 'b')
    await store.logout()
    authentication.resolve({ token: 'old-token', user })
    await expect(pending).rejects.toThrow('superseded')
    expect(store.isAuthenticated).toBe(false)
    expect(api.me).not.toHaveBeenCalled()
  })
  it('does not restore authentication after logout during password-login verification', async () => {
    const verification = deferred<{ user: typeof user }>()
    api.me.mockReturnValue(verification.promise)
    const store = backend()
    const pending = store.loginWithPassword('a', 'b')
    await Promise.resolve()
    await store.logout()
    verification.resolve({ user })
    await expect(pending).rejects.toThrow('superseded')
    expect(store.currentUser).toBeNull()
    expect(storage.getItem(API_SESSION_STORAGE_KEY)).toBeNull()
  })
  it('does not clear a newer login when an old restoration fails', async () => {
    saveApiSession()
    const verification = deferred<{ user: typeof user }>()
    api.me.mockReturnValueOnce(verification.promise).mockResolvedValueOnce({ user: { ...user, id: '99' } })
    api.login.mockResolvedValue({ token: 'new-token', user: { ...user, id: '99' } })
    const store = backend()
    const restore = store.restoreSession()
    await Promise.resolve()
    await store.loginWithPassword('new', 'b')
    verification.reject(new Error('Old token expired'))
    await expect(restore).rejects.toThrow('Old token expired')
    expect(store.currentUser?.id).toBe('99')
    expect(store.isAuthenticated).toBe(true)
    expect(store.sessionError).toBe('')
  })
  it.each(['{broken', '{}', 'null', '[]'])('rejects and clears a malformed stored API session: %s', async raw => {
    storage.setItem(API_SESSION_STORAGE_KEY, raw)
    const store = backend()
    await expect(store.restoreSession()).rejects.toThrow('could not be read')
    expect(store.isAuthenticated).toBe(false)
    expect(storage.getItem(API_SESSION_STORAGE_KEY)).toBeNull()
    expect(api.me).not.toHaveBeenCalled()
  })
  it('does not let an earlier login overwrite a newer identity', async () => {
    const first = deferred<{ token: string; user: typeof user }>()
    api.login.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ token: 'new-token', user: { ...user, id: '99' } })
    api.me.mockResolvedValue({ user: { ...user, id: '99' } })
    const store = backend()
    const pending = store.loginWithPassword('first', 'b')
    await store.loginWithPassword('new', 'b')
    first.resolve({ token: 'old-token', user })
    await expect(pending).rejects.toThrow('superseded')
    expect(store.currentUser?.id).toBe('99')
    expect(store.token).toBe('new-token')
  })
  it('clears local authentication synchronously and tolerates failed logout notification', async () => {
    const notification = deferred<{ success: boolean }>()
    const store = backend()
    await store.loginWithPassword('a', 'b')
    api.logout.mockReturnValue(notification.promise)
    const pending = store.logout()
    expect(store.isAuthenticated).toBe(false)
    expect(store.currentUser).toBeNull()
    expect(storage.getItem(API_SESSION_STORAGE_KEY)).toBeNull()
    notification.reject(new Error('offline'))
    await expect(pending).resolves.toBeUndefined()
  })
  it('does not authenticate when the API session cannot be persisted', async () => {
    const store = backend()
    storage.setItem.mockImplementationOnce(() => { throw new Error('Storage is full') })
    await expect(store.loginWithPassword('a', 'b')).rejects.toThrow('Storage is full')
    expect(store.isAuthenticated).toBe(false)
    expect(store.currentUser).toBeNull()
  })
})
