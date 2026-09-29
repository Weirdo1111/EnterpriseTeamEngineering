import { useClinicalStore } from '@/stores/clinical'
import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { getActivePinia } from 'pinia'

let loadedClinical: ReturnType<typeof useClinicalStore> | undefined
let lastIdentity = ''
function clearClinicalCache() {
  if (!loadedClinical) return
  const storeId = loadedClinical.$id
  loadedClinical.$dispose()
  const pinia = getActivePinia()
  if (pinia) delete pinia.state.value[storeId]
  loadedClinical = undefined
}

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior() {
    return { top: 0 }
  },
  routes: [
    {
      path: '/connection',
      name: 'backend-connection',
      component: () => import('@/views/BackendConnectionView.vue'),
      meta: { requiresAuth: true },
    },
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
          meta: { title: 'Online Consultation' },
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
          meta: { title: 'Remote Consultation' },
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
  const isPublic = Boolean(to.meta.public)

  // Leave guards run before this hook, so cancelled sign-out keeps the identity and drafts.
  if (to.name === 'login' && to.query.signout === '1') return
  if (authStore.usesBackend) {
    try { await authStore.restoreSession() } catch { /* The login page displays the verification failure. */ }
  }
  if (lastIdentity !== authStore.identityKey) {
    clearClinicalCache()
    lastIdentity = authStore.identityKey
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // This checkout has no patient/consultation server adapter. Never load local clinical
  // fixtures into a verified server account or treat a local save as a server write.
  if (authStore.usesBackend) {
    clearClinicalCache()
    if (authStore.isAuthenticated && to.name !== 'backend-connection') return { name: 'backend-connection' }
    return
  }
  if (to.name === 'backend-connection') return { name: 'dashboard' }

  if (isPublic && authStore.isAuthenticated && to.query.signout !== '1') {
    return { name: 'dashboard' }
  }

  if (authStore.isAuthenticated) {
    const clinical = loadedClinical ??= useClinicalStore()
    await Promise.allSettled([clinical.loadPatients(), clinical.loadConsultations(), clinical.loadConsultationRecords()]) // Each page exposes load failures and retry.
  }

  const roles = to.meta.roles as string[] | undefined
  if (roles && !roles.includes(authStore.currentRole)) {
    ElMessage.warning('Your current role cannot access this page. The blocked attempt has been logged.')
    return { name: 'dashboard' }
  }
})

router.beforeResolve(to => {
  if (to.name === 'login' && to.query.signout === '1') {
    // Local identity is cleared synchronously; a server outage must not delay local sign-out.
    void useAuthStore().logout()
    clearClinicalCache()
    lastIdentity = ''
  }
})

export default router
