<script setup lang="ts">
import { computed, reactive, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bot, CheckCircle2, LockKeyhole, ShieldCheck, Stethoscope } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types/clinical'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const form = reactive({ account: 'doctor.demo', password: '123456', code: '0926' })
const selectedRole = shallowRef<Role>('doctor')
const loading = shallowRef(false)
const roleOptions = [
  { value: 'doctor' as const, label: '普通医生', description: '问诊、病历、患者管理' },
  { value: 'seniorDoctor' as const, label: '上级医生', description: '病历审核、审计查看' },
  { value: 'admin' as const, label: '管理员', description: '权限配置、操作审计' },
]
const canSubmit = computed(() => form.account.length > 0 && form.password.length > 0 && form.code.length === 4)
function submitLogin() {
  if (!canSubmit.value) return
  loading.value = true
  window.setTimeout(() => {
    authStore.login(selectedRole.value)
    router.replace(typeof route.query.redirect === 'string' ? route.query.redirect : '/')
  }, 420)
}
</script>

<template>
  <main class="login-page">
    <section class="login-visual" aria-label="系统概览">
      <div class="visual-header">
        <div class="visual-mark"><Stethoscope :size="28" /></div>
        <div><strong>智慧医养大数据公共服务平台</strong><span>Doctor Service System</span></div>
      </div>
      <div class="visual-board">
        <div class="board-pulse"><span /><span /><span /></div>
        <div class="board-row"><span>患者风险预警</span><strong>24</strong></div>
        <div class="board-row"><span>AI 病历草稿</span><strong>18</strong></div>
        <div class="board-row"><span>待审核记录</span><strong>7</strong></div>
      </div>
      <div class="visual-note"><Bot :size="20" /><p>RAG 检索、问诊摘要、结构化病历生成与医生人工确认形成完整闭环。</p></div>
    </section>

    <section class="login-panel">
      <div class="login-copy">
        <p class="eyebrow">安全登录</p>
        <h1>医生工作平台</h1>
        <p>多角色演示入口，覆盖 MFA、RBAC、数据范围隔离和操作审计。</p>
      </div>
      <div class="role-grid" role="radiogroup" aria-label="选择角色">
        <button v-for="role in roleOptions" :key="role.value" class="role-card" :class="{ active: selectedRole === role.value }" type="button" @click="selectedRole = role.value">
          <CheckCircle2 :size="18" /><strong>{{ role.label }}</strong><span>{{ role.description }}</span>
        </button>
      </div>
      <el-form label-position="top" class="login-form" @submit.prevent="submitLogin">
        <el-form-item label="账号"><el-input v-model="form.account" size="large" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="form.password" size="large" type="password" show-password /></el-form-item>
        <el-form-item label="动态验证码"><el-input v-model="form.code" size="large" maxlength="4"><template #prefix><LockKeyhole :size="16" /></template></el-input></el-form-item>
        <el-button class="login-button" type="primary" size="large" :loading="loading" :disabled="!canSubmit" @click="submitLogin">进入系统</el-button>
      </el-form>
      <div class="security-line"><ShieldCheck :size="16" /><span>演示验证码：0926 · AI 输出需医生确认后入库</span></div>
    </section>
  </main>
</template>

<style scoped>
.login-page { display: grid; grid-template-columns: minmax(360px, 1fr) minmax(360px, 480px); min-height: 100vh; background: var(--app-bg); }
.login-visual { display: flex; flex-direction: column; justify-content: space-between; min-height: 100vh; padding: 48px; color: #fff; background: linear-gradient(145deg, rgba(16,32,51,.96), rgba(19,77,96,.92)), url("https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1600&q=80") center/cover; background-blend-mode: multiply; }
.visual-header { display: flex; align-items: center; gap: 14px; }
.visual-header strong, .visual-header span { display: block; }
.visual-header span, .visual-note { color: #cfe5f2; }
.visual-mark { display: grid; width: 54px; height: 54px; place-items: center; border-radius: 8px; background: rgba(255,255,255,.14); }
.visual-board { display: grid; gap: 14px; width: min(440px, 100%); padding: 24px; border: 1px solid rgba(255,255,255,.18); border-radius: 8px; background: rgba(255,255,255,.12); backdrop-filter: blur(18px); }
.board-pulse { display: flex; align-items: end; gap: 8px; height: 54px; }
.board-pulse span { width: 16px; border-radius: 4px 4px 0 0; background: #68d8cc; }
.board-pulse span:nth-child(1) { height: 26px; } .board-pulse span:nth-child(2) { height: 48px; } .board-pulse span:nth-child(3) { height: 36px; }
.board-row { display: flex; align-items: center; justify-content: space-between; min-height: 46px; padding: 0 14px; border-radius: 7px; background: rgba(255,255,255,.12); }
.board-row strong { font-size: 24px; }
.visual-note { display: flex; gap: 12px; width: min(520px, 100%); line-height: 1.7; }
.visual-note p { margin: 0; }
.login-panel { align-self: center; margin: 28px; padding: 34px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); box-shadow: var(--shadow); }
.login-copy { margin-bottom: 24px; } .eyebrow { margin: 0 0 8px; color: var(--primary); font-size: 13px; font-weight: 800; } .login-copy h1 { margin: 0; font-size: 30px; } .login-copy p:last-child { margin: 8px 0 0; color: var(--muted); line-height: 1.6; }
.role-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 22px; }
.role-card { display: grid; gap: 6px; min-height: 104px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; color: var(--muted); text-align: left; background: #fff; cursor: pointer; }
.role-card strong { color: var(--text); } .role-card span { font-size: 12px; line-height: 1.45; } .role-card.active { color: var(--primary); border-color: rgba(23,105,224,.42); background: #eef6ff; }
.login-button { width: 100%; margin-top: 4px; } .security-line { display: flex; align-items: center; gap: 8px; margin-top: 18px; color: var(--muted); font-size: 13px; }
@media (max-width: 920px) { .login-page { grid-template-columns: 1fr; } .login-visual { min-height: 430px; } }
@media (max-width: 560px) { .login-visual, .login-panel { margin: 0; padding: 24px; border-radius: 0; } .role-grid { grid-template-columns: 1fr; } }
</style>