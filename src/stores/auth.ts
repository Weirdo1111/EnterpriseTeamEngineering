import { computed, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Role } from '@/types/clinical'

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

  const isAuthenticated = computed(() => token.value.length > 0)
  const profile = computed(() => roleProfiles[currentRole.value])
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

  function logout() {
    token.value = ''
    localStorage.removeItem('doctor-platform-token')
  }

  return {
    token,
    currentRole,
    isAuthenticated,
    profile,
    roleLabel,
    login,
    logout,
  }
})
