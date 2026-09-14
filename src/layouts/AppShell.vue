<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Activity,
  Bell,
  ClipboardList,
  FileText,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  X,
} from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import { useClinicalStore } from '@/stores/clinical'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const clinicalStore = useClinicalStore()
const mobileOpen = shallowRef(false)
const searchQuery = shallowRef('')
const searchFocused = shallowRef(false)

const navGroups = [
  {
    label: '',
    items: [{ path: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Clinical Services',
    items: [
      { path: '/patients', label: 'Patient Information Management', icon: Users },
      { path: '/consultation', label: 'Online Consultation', icon: MessageSquareText },
      { path: '/records', label: 'Medical Records', icon: FileText },
      { path: '/remote-consultations', label: 'Remote Consultation', icon: Video },
      { path: '/health-management', label: 'Health Management', icon: HeartPulse },
    ],
  },
  {
    label: 'Clinical Tools',
    items: [
      { path: '/ai-assistant', label: 'AI Assistant', icon: Sparkles },
      { path: '/audit', label: 'Audit Log', icon: ClipboardList },
    ],
  },
]

const searchResults = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  if (!keyword) return []
  const patientResults = clinicalStore.patients
    .filter((patient) => `${patient.name}${patient.id}${patient.diagnosis}`.toLowerCase().includes(keyword))
    .slice(0, 4)
    .map((patient) => ({
      key: patient.id,
      type: 'Patient',
      label: `${patient.name} · ${patient.id}`,
      detail: patient.diagnosis,
      path: { path: '/patients', query: { patient: patient.id } },
    }))
  const recordResults = clinicalStore.records
    .filter((record) => `${record.patientName}${record.id}${record.chiefComplaint}`.toLowerCase().includes(keyword))
    .slice(0, 4)
    .map((record) => ({
      key: record.id,
      type: 'Medical Record',
      label: `${record.patientName} · ${record.id}`,
      detail: record.chiefComplaint,
      path: { path: '/records', query: { record: record.id } },
    }))
  return [...patientResults, ...recordResults]
})

const todayLabel = computed(() => new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
}).format(new Date()))

function isActive(path: string) {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}

function closeNavigation() {
  mobileOpen.value = false
}

function openSearchResult(result: (typeof searchResults.value)[number]) {
  searchQuery.value = ''
  searchFocused.value = false
  router.push(result.path)
}

function closeSearchResults() {
  window.setTimeout(() => {
    searchFocused.value = false
  }, 150)
}

function showNotifications() {
  ElMessage.info('You have 2 consultation messages and 1 remote consultation task.')
}

function logout() {
  authStore.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="app-shell">
    <button v-if="mobileOpen" class="sidebar-overlay" type="button" aria-label="Close navigation" @click="closeNavigation" />

    <aside class="sidebar" :class="{ open: mobileOpen }">
      <div class="brand">
        <div class="brand-mark"><Activity :size="21" /></div>
        <div class="brand-copy">
          <strong>Smart Healthcare</strong>
          <span>Doctor Service System</span>
        </div>
        <button class="mobile-close" type="button" aria-label="Close navigation" @click="closeNavigation"><X :size="20" /></button>
      </div>

      <nav class="nav-list" aria-label="Main navigation">
        <section v-for="group in navGroups" :key="group.label || 'main'" class="nav-group">
          <p v-if="group.label" class="nav-group-label">{{ group.label }}</p>
          <RouterLink
            v-for="item in group.items"
            :key="item.path"
            :to="item.path"
            class="nav-item"
            :class="{ active: isActive(item.path) }"
            :title="item.label"
            @click="closeNavigation"
          >
            <component :is="item.icon" :size="18" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </section>
      </nav>

      <div class="sidebar-foot">
        <ShieldCheck :size="16" />
        <div><strong>Secure access enabled</strong><span>Role-based data scope</span></div>
      </div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <button class="menu-button" type="button" aria-label="Open navigation" @click="mobileOpen = true"><Menu :size="21" /></button>

        <div class="global-search" @focusin="searchFocused = true" @focusout="closeSearchResults">
          <Search :size="17" />
          <input v-model="searchQuery" type="search" placeholder="Search patients, IDs, or records" aria-label="Global search" />
          <div v-if="searchFocused && searchQuery" class="search-results">
            <button v-for="result in searchResults" :key="result.key" type="button" @mousedown.prevent="openSearchResult(result)">
              <span>{{ result.type }}</span>
              <div><strong>{{ result.label }}</strong><small>{{ result.detail }}</small></div>
            </button>
            <p v-if="!searchResults.length">No matching patients or records found</p>
          </div>
        </div>

        <div class="top-actions">
          <span class="today">{{ todayLabel }}</span>
          <button class="icon-button" type="button" aria-label="View notifications" @click="showNotifications"><Bell :size="18" /><i /></button>
          <div class="user-chip">
            <span class="avatar">{{ authStore.profile.name.slice(0, 1) }}</span>
            <div class="user-copy">
              <strong>{{ authStore.profile.name }}</strong>
              <span>{{ authStore.profile.title }} · {{ authStore.profile.department }}</span>
            </div>
          </div>
          <el-button :icon="LogOut" text @click="logout">Sign out</el-button>
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
  grid-template-columns: 232px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 18px 13px 14px;
  color: #eef5f8;
  background: var(--nav);
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 50px;
  padding: 0 8px 18px;
}

.brand-mark {
  display: grid;
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid rgba(255,255,255,.18);
  border-radius: 5px;
  color: #d9f1ef;
  background: #24465b;
}

.brand-copy { display: grid; gap: 3px; min-width: 0; }
.brand-copy strong { font-size: 16px; }
.brand-copy span { color: #aebec8; font-size: 11px; }

.nav-list { display: grid; gap: 16px; overflow-y: auto; }
.nav-group { display: grid; gap: 4px; }
.nav-group-label { margin: 0 10px 5px; color: #8098a7; font-size: 11px; }

.nav-item {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 40px;
  padding: 0 11px;
  border-radius: 4px;
  color: #c9d6de;
  font-size: 14px;
  text-decoration: none;
  transition: background .15s ease, color .15s ease;
}

.nav-item:hover { color: #fff; background: var(--nav-hover); }
.nav-item.active { color: #fff; background: #2b5067; box-shadow: inset 3px 0 0 #6ec0b4; }

.sidebar-foot {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: auto;
  padding: 14px 10px 2px;
  border-top: 1px solid rgba(255,255,255,.12);
  color: #b9cbd5;
}

.sidebar-foot div { display: grid; gap: 3px; }
.sidebar-foot strong { color: #dfe9ee; font-size: 12px; }
.sidebar-foot span { font-size: 10px; }
.mobile-close { display: none; }

.main-area { min-width: 0; }

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 64px;
  padding: 10px 22px;
  border-bottom: 1px solid var(--border);
  background: rgba(255,255,255,.96);
}

.menu-button,
.icon-button,
.mobile-close {
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.menu-button { display: none; width: 36px; height: 36px; }

.global-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  width: min(440px, 42vw);
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  color: var(--muted);
  background: #fff;
}

.global-search:focus-within { border-color: var(--primary); }
.global-search input { min-width: 0; width: 100%; border: 0; outline: 0; color: var(--text); background: transparent; }

.search-results {
  position: absolute;
  top: calc(100% + 7px);
  left: 0;
  right: 0;
  z-index: 40;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: #fff;
  box-shadow: var(--shadow-float);
}

.search-results button {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 7px;
  width: 100%;
  padding: 9px;
  border: 0;
  border-radius: 3px;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.search-results button:hover { background: var(--panel-soft); }
.search-results button > span { color: var(--primary); font-size: 11px; font-weight: 700; }
.search-results strong, .search-results small { display: block; }
.search-results strong { font-size: 13px; }
.search-results small { margin-top: 3px; color: var(--muted); font-size: 11px; }
.search-results p { margin: 0; padding: 14px; color: var(--muted); font-size: 12px; text-align: center; }

.top-actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.today { color: var(--muted); font-size: 12px; white-space: nowrap; }

.icon-button { position: relative; display: flex; width: 34px; height: 34px; color: var(--muted); }
.icon-button i { position: absolute; top: 6px; right: 6px; width: 6px; height: 6px; border: 1px solid #fff; border-radius: 50%; background: var(--red); }

.user-chip { display: flex; align-items: center; gap: 9px; padding-left: 8px; border-left: 1px solid var(--border); }
.avatar { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 4px; color: #fff; font-weight: 700; background: var(--teal); }
.user-copy { display: grid; gap: 2px; }
.user-copy strong { color: var(--text-strong); font-size: 13px; }
.user-copy span { color: var(--muted); font-size: 10px; }

.content { padding: 22px; }
.sidebar-overlay { display: none; }

@media (max-width: 1099px) and (min-width: 768px) {
  .app-shell { grid-template-columns: 72px minmax(0, 1fr); }
  .sidebar { padding-inline: 10px; }
  .brand { justify-content: center; padding-inline: 0; }
  .brand-copy, .nav-group-label, .nav-item span, .sidebar-foot div { display: none; }
  .nav-item { justify-content: center; padding: 0; }
  .sidebar-foot { justify-content: center; padding-inline: 0; }
}

@media (max-width: 767px) {
  .app-shell { grid-template-columns: minmax(0, 1fr); }
  .sidebar {
    position: fixed;
    left: 0;
    width: 252px;
    transform: translateX(-102%);
    box-shadow: var(--shadow-float);
    transition: transform .2s ease;
  }
  .sidebar.open { transform: translateX(0); }
  .sidebar-overlay { position: fixed; inset: 0; z-index: 25; display: block; border: 0; background: rgba(14, 25, 32, .42); }
  .mobile-close { display: flex; width: 34px; height: 34px; margin-left: auto; color: #dfe9ee; }
  .menu-button { display: flex; flex: 0 0 36px; }
  .topbar { gap: 8px; padding: 9px 12px; }
  .global-search { width: auto; flex: 1; }
  .today, .user-copy, .top-actions .el-button { display: none; }
  .user-chip { padding-left: 4px; border-left: 0; }
  .content { padding: 16px 12px 24px; }
}

@media (max-width: 440px) {
  .top-actions .icon-button { display: none; }
  .global-search input::placeholder { color: transparent; }
}
</style>
