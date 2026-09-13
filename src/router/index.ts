import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

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
          meta: { title: 'Patient Management' },
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

router.beforeEach((to) => {
  const authStore = useAuthStore()
  const isPublic = Boolean(to.meta.public)

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (isPublic && authStore.isAuthenticated) {
    return { name: 'dashboard' }
  }

  const roles = to.meta.roles as string[] | undefined
  if (roles && !roles.includes(authStore.currentRole)) {
    ElMessage.warning('Your current role cannot access this page. The blocked attempt has been logged.')
    return { name: 'dashboard' }
  }
})

export default router
