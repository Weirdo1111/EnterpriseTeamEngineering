import { computed, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Role } from '@/types/clinical'
import { authApi, isAuthRole, validateApiToken, validateAuthenticatedUser, type AuthenticatedUser } from '@/services/auth'

export const API_SESSION_STORAGE_KEY = 'doctor-platform-api-session-v1'
const DEMO_TOKEN_KEY = 'doctor-platform-token'
const DEMO_ROLE_KEY = 'doctor-platform-role'

interface UserProfile {
  name: string
  role: Role
  department: string
  title: string
}

const roleProfiles: Record<Role, UserProfile> = {
  doctor: {
    name: 'Dr. Riley Lin',
    role: 'doctor',
    department: 'Geriatric Medicine',
    title: 'Attending Physician',
  },
  seniorDoctor: {
    name: 'Dr. Michael Zhou',
    role: 'seniorDoctor',
    department: 'Cardiology & Geriatric Care',
    title: 'Chief Physician',
  },
  admin: {
    name: 'Platform Admin',
    role: 'admin',
    department: 'Platform Operations',
    title: 'System Administrator',
  },
}

export const useAuthStore = defineStore('auth', () => {
  const token = shallowRef('')
  const currentRole = shallowRef<Role>('doctor')
  const currentUser = shallowRef<AuthenticatedUser | null>(null)
  const verifiedToken = shallowRef('')
  const sessionError = shallowRef(authApi.configurationError)
  let generation = 0
  let restoring: { generation: number; promise: Promise<void> } | undefined

  try {
    if (authApi.enabled) {
      const raw = localStorage.getItem(API_SESSION_STORAGE_KEY)
      if (raw) {
        const saved: unknown = JSON.parse(raw)
        if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !('baseUrl' in saved) || typeof saved.baseUrl !== 'string' || !('token' in saved)) throw new Error('Invalid saved session')
        if (saved.baseUrl === authApi.baseUrl) token.value = validateApiToken(saved.token)
      }
    } else {
      const savedRole = localStorage.getItem(DEMO_ROLE_KEY)
      const savedToken = localStorage.getItem(DEMO_TOKEN_KEY)
      if (isAuthRole(savedRole) && savedToken === `demo-${savedRole}-token`) {
        currentRole.value = savedRole
        token.value = savedToken
      }
    }
  } catch { sessionError.value = 'The saved sign-in session could not be read. Please sign in again.' }

  const isAuthenticated = computed(() => authApi.enabled ? Boolean(verifiedToken.value && token.value === verifiedToken.value && !/^demo-/i.test(token.value) && currentUser.value)
    : isAuthRole(currentRole.value) && token.value === `demo-${currentRole.value}-token`)
  const identityKey = computed(() => !isAuthenticated.value ? '' : authApi.enabled ? `api:${authApi.baseUrl}:${currentUser.value!.id}` : `demo:${currentRole.value}`)
  const profile = computed(() => authApi.enabled
    ? { id: currentUser.value?.id ?? '', name: currentUser.value?.name ?? '', role: currentUser.value?.role ?? 'doctor' as Role, department: '', title: '' }
    : { id: `demo:${isAuthRole(currentRole.value) ? currentRole.value : 'doctor'}`, ...roleProfiles[isAuthRole(currentRole.value) ? currentRole.value : 'doctor'] })
  const roleLabel = computed(() => {
    const role = authApi.enabled ? currentUser.value?.role : currentRole.value
    return role === 'admin' ? 'Administrator' : role === 'seniorDoctor' ? 'Senior Physician' : 'Physician'
  })

  function clearSessionStorage() {
    try { localStorage.removeItem(authApi.enabled ? API_SESSION_STORAGE_KEY : DEMO_TOKEN_KEY) }
    catch { sessionError.value = 'Signed out in this page, but the browser could not remove the saved session. Check storage permissions.' }
  }
  function clearState() { token.value = ''; verifiedToken.value = ''; currentUser.value = null; currentRole.value = 'doctor' }
  function stale(operation: number) {
    if (operation !== generation) throw new Error('This sign-in request was superseded. Please use the current session.')
  }
  function login(role: Role) {
    if (authApi.enabled) throw new Error('Demo sign-in is unavailable while the authentication API is configured.')
    if (!isAuthRole(role)) throw new Error('Select a valid demo role.')
    generation++
    const value = `demo-${role}-token`
    try {
      localStorage.setItem(DEMO_ROLE_KEY, role)
      localStorage.setItem(DEMO_TOKEN_KEY, value)
    } catch { throw new Error('Unable to save the demo session. Check browser storage permissions.') }
    currentRole.value = role
    token.value = value
    currentUser.value = null
    sessionError.value = ''
  }

  async function loginWithPassword(account: string, password: string) {
    if (!authApi.enabled) throw new Error('Configure the authentication API before using password sign-in.')
    const operation = ++generation
    restoring = undefined
    clearState()
    clearSessionStorage()
    sessionError.value = ''
    try {
      const result = await authApi.login(account, password)
      stale(operation)
      const incomingToken = validateApiToken(result.token)
      const loginUser = validateAuthenticatedUser(result.user)
      const verified = await authApi.me(incomingToken)
      stale(operation)
      const user = validateAuthenticatedUser(verified.user)
      if (user.id !== loginUser.id) throw new Error('The authentication server returned inconsistent user identities. Please sign in again.')
      localStorage.setItem(API_SESSION_STORAGE_KEY, JSON.stringify({ baseUrl: authApi.baseUrl, token: incomingToken }))
      currentUser.value = user
      currentRole.value = user.role
      verifiedToken.value = incomingToken
      token.value = incomingToken
    } catch (error) {
      if (operation === generation) {
        clearState()
        clearSessionStorage()
        sessionError.value = error instanceof Error ? error.message : 'Unable to sign in. Please retry.'
      }
      throw error
    }
  }

  function restoreSession(force = false): Promise<void> {
    if (!authApi.enabled) return Promise.resolve()
    if (restoring?.generation === generation) return restoring.promise
    if (isAuthenticated.value && !force) return Promise.resolve()
    if (!token.value) {
      if (authApi.configurationError || sessionError.value) {
        const error = authApi.configurationError || sessionError.value
        clearState()
        clearSessionStorage()
        sessionError.value = error
        return Promise.reject(new Error(error))
      }
      return Promise.resolve()
    }
    const operation = ++generation
    const savedToken = token.value
    currentUser.value = null
    verifiedToken.value = ''
    sessionError.value = ''
    // Register in-flight restoration before even a synchronous validation failure.
    const promise = Promise.resolve().then(async () => {
      try {
        stale(operation)
        if (authApi.configurationError) throw new Error(authApi.configurationError)
        if (!savedToken) throw new Error('Please sign in to connect to the backend.')
        const verified = await authApi.me(validateApiToken(savedToken))
        stale(operation)
        const user = validateAuthenticatedUser(verified.user)
        currentUser.value = user
        currentRole.value = user.role
        verifiedToken.value = savedToken
        token.value = savedToken
      } catch (error) {
        if (operation === generation) {
          clearState()
          clearSessionStorage()
          sessionError.value = error instanceof Error ? error.message : 'Unable to restore your sign-in session.'
        }
        throw error
      } finally { if (restoring?.generation === operation) restoring = undefined }
    })
    restoring = { generation: operation, promise }
    return promise
  }

  function logout(): Promise<void> {
    const previous = token.value
    generation++
    restoring = undefined
    clearState()
    sessionError.value = ''
    clearSessionStorage()
    if (!authApi.enabled || !previous || /^demo-/i.test(previous)) return Promise.resolve()
    try { return authApi.logout(previous).then(() => undefined).catch(() => undefined) }
    catch { return Promise.resolve() }
  }

  return {
    token,
    currentRole,
    currentUser,
    sessionError,
    identityKey,
    usesBackend: authApi.enabled,
    apiBaseUrl: authApi.baseUrl,
    configurationError: authApi.configurationError,
    isAuthenticated,
    profile,
    roleLabel,
    login,
    loginWithPassword,
    restoreSession,
    logout,
  }
})
