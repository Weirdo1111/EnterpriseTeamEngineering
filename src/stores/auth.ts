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
  const currentRole = shallowRef<Role>((localStorage.getItem('doctor-platform-role') as Role) ?? 'doctor')
  const currentUser = shallowRef<AuthenticatedUser | null>(null)

  const isAuthenticated = computed(() => token.value.length > 0)
  const profile = computed(() => ({ ...roleProfiles[currentRole.value], name: currentUser.value?.name ?? roleProfiles[currentRole.value].name }))
  const roleLabel = computed(() => {
    if (currentRole.value === 'admin') return 'Administrator'
    if (currentRole.value === 'seniorDoctor') return 'Senior Physician'
    return 'Physician'
  })

  function login(role: Role) {
    currentRole.value = role
    token.value = `demo-${role}-token`
    localStorage.setItem('doctor-platform-token', token.value)
    localStorage.setItem('doctor-platform-role', role)
  }

  async function loginWithPassword(account: string, password: string) {
    const result = await authApi.login(account, password)
    currentUser.value = result.user
    currentRole.value = result.user.role
    token.value = result.token
    localStorage.setItem('doctor-platform-token', result.token)
    localStorage.setItem('doctor-platform-role', result.user.role)
  }

  async function restoreSession() {
    if (!authApi.enabled || !token.value || token.value.startsWith('demo-')) return
    const result = await authApi.me()
    currentUser.value = result.user
    currentRole.value = result.user.role
    localStorage.setItem('doctor-platform-role', result.user.role)
  }

  async function logout() {
    if (authApi.enabled && token.value && !token.value.startsWith('demo-')) {
      try { await authApi.logout() } catch { /* Local logout must still succeed. */ }
    }
    token.value = ''
    currentUser.value = null
    localStorage.removeItem('doctor-platform-token')
  }

  return {
    token,
    currentRole,
    isAuthenticated,
    profile,
    roleLabel,
    usesBackend: authApi.enabled,
    login,
    loginWithPassword,
    restoreSession,
    logout,
  }
})
