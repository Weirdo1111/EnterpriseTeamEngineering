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
          meta: { title: '医生工作台' },
        },
        {
          path: 'patients',
          name: 'patients',
          component: () => import('@/views/PatientsView.vue'),
          meta: { title: '患者管理' },
        },
        {
          path: 'consultation',
          name: 'consultation',
          component: () => import('@/views/ConsultationView.vue'),
          meta: { title: '图文问诊' },
        },
        {
          path: 'records',
          name: 'records',
          component: () => import('@/views/RecordsView.vue'),
          meta: { title: '电子病历' },
        },
        {
          path: 'ai-assistant',
          name: 'ai-assistant',
          component: () => import('@/views/AiAssistantView.vue'),
          meta: { title: '智能辅助' },
        },
        {
          path: 'remote-consultations',
          name: 'remote-consultations',
          component: () => import('@/views/RemoteConsultationsView.vue'),
          meta: { title: '远程会诊' },
        },
        {
          path: 'health-management',
          name: 'health-management',
          component: () => import('@/views/HealthManagementView.vue'),
          meta: { title: '健康管理' },
        },
        {
          path: 'audit',
          name: 'audit',
          component: () => import('@/views/AuditView.vue'),
          meta: { title: '操作记录' },
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
    ElMessage.warning('当前身份没有访问该页面的权限，系统已记录本次拦截')
    return { name: 'dashboard' }
  }
})

export default router
