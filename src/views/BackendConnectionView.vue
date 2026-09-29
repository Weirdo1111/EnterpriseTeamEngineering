<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/services/auth'

const auth = useAuthStore()
const router = useRouter()
const checking = ref(false)
const message = ref('')
async function verifyAgain() {
  if (checking.value) return
  checking.value = true
  message.value = ''
  try { await auth.restoreSession(true); message.value = 'Your account is still verified.' }
  catch { await router.replace('/login') }
  finally { checking.value = false }
}
</script>

<template>
  <main class="connection-page">
    <section class="connection-card">
      <p class="eyebrow">Doctor Workspace · Server mode</p>
      <h1>Account verified</h1>
      <p class="intro">Your account is signed in. Medical records and clinical AI use the configured server.</p>
      <dl v-if="auth.currentUser">
        <div><dt>Name</dt><dd>{{ auth.currentUser.name }}</dd></div>
        <div><dt>Account</dt><dd>{{ auth.currentUser.account }}</dd></div>
        <div><dt>User ID</dt><dd>{{ auth.currentUser.id }}</dd></div>
        <div><dt>Role</dt><dd>{{ auth.roleLabel }}</dd></div>
        <div><dt>Server</dt><dd>{{ authApi.baseUrl }}</dd></div>
      </dl>
      <div class="connection-note"><strong>Patient consultations are a local demonstration</strong><p>Patient profiles, messages, consultation summaries, and records linked from those summaries are stored in this browser. They are separate from server medical records and are not automatically uploaded.</p></div>
      <p v-if="message" role="status">{{ message }}</p>
      <div class="connection-actions"><el-button type="primary" :disabled="checking" @click="router.push('/')">Open workspace</el-button><el-button :loading="checking" @click="verifyAgain">Verify session again</el-button><el-button :disabled="checking" @click="router.push({ name: 'login', query: { signout: '1' } })">Sign out</el-button></div>
      <p class="logout-note">Signing out clears this browser session. The current server does not revoke an already issued token.</p>
    </section>
  </main>
</template>

<style scoped>
.connection-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f3f6f8; }
.connection-card { width: min(650px, 100%); padding: clamp(20px, 4vw, 36px); border: 1px solid var(--border); border-radius: 6px; background: white; }
.eyebrow { margin: 0 0 12px; color: var(--primary); font-size: 12px; }
h1 { margin: 0 0 16px; font-size: 27px; color: var(--text-strong); }
.intro, .connection-note p, .logout-note { font-size: 13px; line-height: 1.7; color: var(--muted); }
dl { margin: 24px 0; }
dl div { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; }
.connection-note { padding: 14px; border-left: 3px solid var(--primary); background: #eff6f8; font-size: 13px; }
.connection-note p { margin: 8px 0 0; }
.connection-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 24px 0 12px; }
.connection-actions .el-button { margin: 0; }
.logout-note { font-size: 11px; }
</style>
