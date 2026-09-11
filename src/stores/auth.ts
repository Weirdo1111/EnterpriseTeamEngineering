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
    name: '林若医生',
    role: 'doctor',
    department: '老年医学科',
    title: '主治医师',
  },
  seniorDoctor: {
    name: '周明主任',
    role: 'seniorDoctor',
    department: '心内与老年慢病中心',
    title: '主任医师',
  },
  admin: {
    name: '平台管理员',
    role: 'admin',
    department: '医养平台运营中心',
    title: '系统管理员',
  },
}

export const useAuthStore = defineStore('auth', () => {
  const token = shallowRef(localStorage.getItem('doctor-platform-token') ?? '')
  const currentRole = shallowRef<Role>((localStorage.getItem('doctor-platform-role') as Role) ?? 'doctor')

  const isAuthenticated = computed(() => token.value.length > 0)
  const profile = computed(() => roleProfiles[currentRole.value])
  const roleLabel = computed(() => {
    if (currentRole.value === 'admin') return '管理员'
    if (currentRole.value === 'seniorDoctor') return '上级医生'
    return '医生'
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
