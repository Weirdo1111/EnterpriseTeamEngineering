import { computed, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Role } from '@/types/clinical'
import { authApi, type AuthenticatedUser } from '@/services/auth'

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
  const token = shallowRef(localStorage.getItem('doctor-platform-token') ?? '')
  const currentRole = shallowRef<Role>('doctor')
  // Roles come from the backend, never from a cached demo selection.
  localStorage.removeItem('doctor-platform-role')
  if (token.value.startsWith('demo-')) {
    token.value = ''
    localStorage.removeItem('doctor-platform-token')
  }
  const currentUser = shallowRef<AuthenticatedUser | null>(null)

  const isAuthenticated = computed(() => Boolean(token.value && currentUser.value))
  const profile = computed(() => ({ ...roleProfiles[currentRole.value], name: currentUser.value?.name ?? roleProfiles[currentRole.value].name }))
  const roleLabel = computed(() => {
    if (currentRole.value === 'admin') return 'Administrator'
    if (currentRole.value === 'seniorDoctor') return 'Senior Physician'
    return 'Physician'
  })

  let sessionVersion = 0

  function clearSession() {
    sessionVersion++
    token.value = ''
    currentUser.value = null
    currentRole.value = 'doctor'
    localStorage.removeItem('doctor-platform-token')
    localStorage.removeItem('doctor-platform-role')
  }

  function applyUser(user: AuthenticatedUser) {
    if (!user || !['doctor', 'seniorDoctor', 'admin'].includes(user.role)) throw new Error('Invalid authenticated user')
    currentUser.value = user
    currentRole.value = user.role
  }

  async function completeLogin(request: Promise<{ token: string; user: AuthenticatedUser }>) {
    const version = ++sessionVersion
    const result = await request
    if (version !== sessionVersion) throw new Error('Sign-in cancelled')
    if (!result.token || result.token.startsWith('demo-')) throw new Error('Invalid authentication token')
    applyUser(result.user)
    token.value = result.token
    localStorage.setItem('doctor-platform-token', result.token)
  }

  async function loginWithPassword(account: string, password: string) {
    await completeLogin(authApi.login(account, password))
  }

  async function loginWithEmail(account: string, code: string) {
    await completeLogin(authApi.loginWithEmail(account, code))
  }

  async function loginWithFace(account: string, image: string) {
    await completeLogin(authApi.loginWithFace(account, image))
  }

  async function restoreSession() {
    if (!token.value) return
    const version = sessionVersion
    try {
      const result = await authApi.me()
      if (version === sessionVersion) applyUser(result.user)
    } catch (error) {
      if (version === sessionVersion) clearSession()
      throw error
    }
  }

  async function logout() {
    const pending = authApi.enabled && token.value ? authApi.logout().catch(() => {}) : Promise.resolve()
    clearSession()
    await pending
  }

  return {
    token,
    currentRole,
    currentUser,
    isAuthenticated,
    profile,
    roleLabel,
    usesBackend: authApi.enabled,
    clearSession,
    loginWithPassword,
    loginWithEmail,
    loginWithFace,
    restoreSession,
    logout,
  }
})
