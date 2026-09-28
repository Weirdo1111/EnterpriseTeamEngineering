import { useClinicalStore } from '@/stores/clinical'
import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/services/http'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior() {
    return { top: 0 }
  },
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/AppShell.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
          meta: { title: 'Doctor Dashboard' },
        },
        {
          path: 'patients',
          name: 'patients',
          component: () => import('@/views/PatientsView.vue'),
          meta: { title: 'Patient Information Management' },
        },
        {
          path: 'consultation',
          name: 'consultation',
          component: () => import('@/views/ConsultationView.vue'),
          meta: { title: 'Patient Online Visit' },
        },
        {
          path: 'records',
          name: 'records',
          component: () => import('@/views/RecordsView.vue'),
          meta: { title: 'Medical Records' },
        },
        {
          path: 'ai-assistant',
          name: 'ai-assistant',
          component: () => import('@/views/AiAssistantView.vue'),
          meta: { title: 'AI Assistant' },
        },
        {
          path: 'remote-consultations',
          name: 'remote-consultations',
          component: () => import('@/views/RemoteConsultationsView.vue'),
          meta: { title: 'Physician Group Consultation' },
        },
        {
          path: 'health-management',
          name: 'health-management',
          component: () => import('@/views/HealthManagementView.vue'),
          meta: { title: 'Health Management' },
        },
        {
          path: 'audit',
          name: 'audit',
          component: () => import('@/views/AuditView.vue'),
          meta: { title: 'Audit Log' },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  if (authStore.token) {
    try {
      await authStore.restoreSession()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) authStore.clearSession()
      else {
        ElMessage.error('Unable to verify your session. Please retry when the authentication service is available.')
        // Allow the login page for recovery, but never enter a protected route on a failed check.
        if (to.name !== 'login') return { name: 'login', query: { redirect: to.fullPath } }
        return true
      }
    }
  }
  const isPublic = Boolean(to.meta.public)

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (isPublic && authStore.isAuthenticated) {
    return { name: 'dashboard' }
  }

  if (authStore.isAuthenticated) {
    try { await useClinicalStore().loadPatients() } catch { /* Patients page exposes retry and the error. */ }
  }

  const roles = to.meta.roles as string[] | undefined
  if (roles && !roles.includes(authStore.currentRole)) {
    ElMessage.warning('Your current role cannot access this page. The blocked attempt has been logged.')
    return { name: 'dashboard' }
  }
})

export default router
