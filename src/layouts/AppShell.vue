<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter, RouterView } from 'vue-router'
import {
  Activity,
  Bot,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Search,
  ShieldCheck,
  Users,
} from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const navItems = computed(() => [
  { path: '/', label: '工作台', icon: LayoutDashboard, visible: true },
  { path: '/patients', label: '患者管理', icon: Users, visible: true },
  { path: '/consultation', label: '图文问诊', icon: MessageSquareText, visible: true },
  { path: '/records', label: '电子病历', icon: FileText, visible: true },
  { path: '/ai-assistant', label: 'AI 助手', icon: Bot, visible: true },
  { path: '/audit', label: '审计日志', icon: ShieldCheck, visible: authStore.currentRole !== 'doctor' },
])

const visibleNavItems = computed(() => navItems.value.filter((navItem) => navItem.visible))

function isActive(path: string) {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}

function logout() {
  authStore.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">
          <Activity :size="22" />
        </div>
        <div class="brand-copy">
          <strong>智慧医养</strong>
          <span>Doctor Service</span>
        </div>
      </div>

      <nav class="nav-list" aria-label="主导航">
        <RouterLink
          v-for="item in visibleNavItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
        >
          <component :is="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-foot">
        <div class="security-card">
          <ShieldCheck :size="18" />
          <div>
            <strong>RBAC 已启用</strong>
            <span>最小权限 · 全量审计</span>
          </div>
        </div>
      </div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <div class="search-box">
          <Search :size="18" />
          <span>搜索患者、病历、问诊记录</span>
        </div>
        <div class="top-actions">
          <div class="user-chip">
            <span class="avatar">{{ authStore.profile.name.slice(0, 1) }}</span>
            <div class="user-copy">
              <strong>{{ authStore.profile.name }}</strong>
              <span>{{ authStore.roleLabel }} · {{ authStore.profile.department }}</span>
            </div>
          </div>
          <el-button :icon="LogOut" plain @click="logout">退出</el-button>
        </div>
      </header>

      <section class="content">
        <RouterView />
      </section>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: 252px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 22px 16px;
  background: var(--nav);
  color: #f8fafc;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 6px 24px;
}

.brand-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 8px;
  color: #ffffff;
  background: var(--primary);
}

.brand-copy {
  display: grid;
  gap: 3px;
}

.brand-copy strong {
  font-size: 17px;
}

.brand-copy span {
  color: #9fb4ce;
  font-size: 12px;
}

.nav-list {
  display: grid;
  gap: 6px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 42px;
  padding: 0 12px;
  border-radius: 8px;
  color: #c9d7e8;
  text-decoration: none;
  transition: background 0.18s ease, color 0.18s ease;
}

.nav-item.active,
.nav-item:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.nav-item.active {
  box-shadow: inset 3px 0 0 #68d8cc;
}

.sidebar-foot {
  margin-top: auto;
}

.security-card {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.06);
}

.security-card strong,
.security-card span {
  display: block;
}

.security-card span {
  margin-top: 4px;
  color: #9fb4ce;
  font-size: 12px;
}

.main-area {
  min-width: 0;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-height: 74px;
  padding: 14px 26px;
  border-bottom: 1px solid var(--border);
  background: rgba(244, 247, 251, 0.92);
  backdrop-filter: blur(14px);
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  width: min(460px, 100%);
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--muted);
  background: var(--panel);
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 8px;
  color: #ffffff;
  font-weight: 800;
  background: var(--teal);
}

.user-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.user-copy strong {
  font-size: 14px;
}

.user-copy span {
  color: var(--muted);
  font-size: 12px;
}

.content {
  padding: 26px;
}

@media (max-width: 920px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: static;
    height: auto;
  }

  .nav-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .topbar {
    align-items: stretch;
    flex-direction: column;
  }
}

@media (max-width: 620px) {
  .nav-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .content,
  .topbar {
    padding-inline: 16px;
  }

  .top-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>