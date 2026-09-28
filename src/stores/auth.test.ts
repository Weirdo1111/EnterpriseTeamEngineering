import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { authApi } from '@/services/auth'
import { useAuthStore } from './auth'

vi.mock('@/services/auth', () => ({ authApi: { enabled: true, login: vi.fn(), loginWithEmail: vi.fn(), loginWithFace: vi.fn(), me: vi.fn(), logout: vi.fn() } }))
const doctor = { id: '9007199254740993', account: 'doctor', name: 'Doctor Name', role: 'doctor' as const }
beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) })
  vi.resetAllMocks()
  setActivePinia(createPinia())
})
it('rejects old demo tokens and does not trust cached roles', () => {
  localStorage.setItem('doctor-platform-token', 'demo-admin-token')
  localStorage.setItem('doctor-platform-role', 'admin')
  const auth = useAuthStore()
  expect(auth.isAuthenticated).toBe(false)
  expect(auth.token).toBe('')
  expect(auth.currentRole).toBe('doctor')
  expect(localStorage.getItem('doctor-platform-role')).toBeNull()
})
it('requires /me before accepting a stored token and refreshes the database role', async () => {
  localStorage.setItem('doctor-platform-token', 'signed-token')
  const auth = useAuthStore()
  expect(auth.isAuthenticated).toBe(false)
  vi.mocked(authApi.me).mockResolvedValue({ user: doctor })
  await auth.restoreSession()
  expect(auth.isAuthenticated).toBe(true)
  expect(auth.currentUser?.id).toBe(doctor.id)
  vi.mocked(authApi.me).mockResolvedValue({ user: { ...doctor, role: 'seniorDoctor' } })
  await auth.restoreSession()
  expect(auth.currentRole).toBe('seniorDoctor')
})
it('email login stores the backend token and identity', async () => {
  vi.mocked(authApi.loginWithEmail).mockResolvedValue({ token: 'signed-email-token', user: doctor })
  const auth = useAuthStore()
  await auth.loginWithEmail('doctor', '123456')
  expect(authApi.loginWithEmail).toHaveBeenCalledWith('doctor', '123456')
  expect(auth.isAuthenticated).toBe(true)
  expect(auth.profile.name).toBe(doctor.name)
  expect(localStorage.getItem('doctor-platform-token')).toBe('signed-email-token')
})
it('password failure cannot fall back to a demo login', async () => {
  vi.mocked(authApi.login).mockRejectedValue(new Error('Unauthorized'))
  const auth = useAuthStore()
  await expect(auth.loginWithPassword('doctor', 'wrong')).rejects.toThrow('Unauthorized')
  expect(auth.isAuthenticated).toBe(false)
  expect(auth.token).toBe('')
})
it('logout clears local state even if the server is unavailable', async () => {
  vi.mocked(authApi.login).mockResolvedValue({ token: 'signed-token', user: doctor })
  vi.mocked(authApi.logout).mockRejectedValue(new Error('offline'))
  const auth = useAuthStore()
  await auth.loginWithPassword('doctor', 'password')
  await auth.logout()
  expect(auth.isAuthenticated).toBe(false)
  expect(localStorage.getItem('doctor-platform-token')).toBeNull()
})
it('late session restoration cannot resurrect a logged-out user', async () => {
  localStorage.setItem('doctor-platform-token', 'signed-token')
  let resolve!: (value: { user: typeof doctor }) => void
  vi.mocked(authApi.me).mockReturnValue(new Promise(done => { resolve = done }))
  const auth = useAuthStore()
  const restoring = auth.restoreSession()
  auth.clearSession()
  resolve({ user: doctor })
  await restoring
  expect(auth.currentUser).toBeNull()
  expect(auth.isAuthenticated).toBe(false)
})

it('face login uses only the backend identity and shares token storage', async () => {
  vi.mocked(authApi.loginWithFace).mockResolvedValue({ token: 'signed-face-token', user: doctor })
  const auth = useAuthStore()
  await auth.loginWithFace('doctor', 'synthetic-photo')
  expect(authApi.loginWithFace).toHaveBeenCalledWith('doctor', 'synthetic-photo')
  expect(auth.currentRole).toBe('doctor')
  expect(auth.isAuthenticated).toBe(true)
  expect(localStorage.getItem('doctor-platform-token')).toBe('signed-face-token')
})
it('face rejection never creates a local session', async () => {
  vi.mocked(authApi.loginWithFace).mockRejectedValue(new Error('Face verification failed'))
  const auth = useAuthStore()
  await expect(auth.loginWithFace('doctor', 'other-photo')).rejects.toThrow()
  expect(auth.isAuthenticated).toBe(false)
  expect(auth.token).toBe('')
})
