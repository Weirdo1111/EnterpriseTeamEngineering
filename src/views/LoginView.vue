<script setup lang="ts">
import { computed, reactive, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { CheckCircle2, LockKeyhole, ScanFace, ShieldCheck, Smartphone, Stethoscope } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types/clinical'

type LoginMethod = 'password' | 'sms' | 'face'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const method = shallowRef<LoginMethod>('password')
const selectedRole = shallowRef<Role>('doctor')
const loading = shallowRef(false)
const faceChecking = shallowRef(false)
const faceVerified = shallowRef(false)
const smsSent = shallowRef(false)
const form = reactive({
  account: 'doctor.demo',
  password: '123456',
  captcha: '0926',
  mobile: '138****6026',
  smsCode: '',
})

const methods = [
  { value: 'password' as const, label: 'Password', icon: LockKeyhole },
  { value: 'sms' as const, label: 'SMS Verification', icon: Smartphone },
  { value: 'face' as const, label: 'Facial Verification', icon: ScanFace },
]

const roleOptions = [
  { value: 'doctor', label: 'Physician · Dr. Riley Lin' },
  { value: 'seniorDoctor', label: 'Senior Physician · Dr. Michael Zhou' },
  { value: 'admin', label: 'System Administrator · Platform Admin' },
]

const canSubmit = computed(() => {
  if (method.value === 'password') return Boolean(form.account && form.password && form.captcha.length === 4)
  if (method.value === 'sms') return Boolean(form.mobile && form.smsCode.length === 4)
  return Boolean(form.account && faceVerified.value)
})

function switchMethod(value: LoginMethod) {
  method.value = value
  faceVerified.value = false
}

function sendSmsCode() {
  smsSent.value = true
  form.smsCode = '0926'
  ElMessage.success('Demo verification code entered: 0926')
}

function verifyFace() {
  faceChecking.value = true
  window.setTimeout(() => {
    faceChecking.value = false
    faceVerified.value = true
    ElMessage.success('Identity verified (local demo)')
  }, 650)
}

function submitLogin() {
  if (!canSubmit.value) return
  loading.value = true
  window.setTimeout(() => {
    authStore.login(selectedRole.value)
    loading.value = false
    ElMessage.success('Signed in successfully')
    router.replace(typeof route.query.redirect === 'string' ? route.query.redirect : '/')
  }, 420)
}
</script>

<template>
  <main class="login-page">
    <section class="system-intro">
      <div class="intro-brand">
        <span><Stethoscope :size="25" /></span>
        <div><strong>Smart Healthcare Public Service Platform</strong><small>Doctor Service System</small></div>
      </div>

      <div class="intro-copy">
        <p class="intro-kicker">Clinical Workspace</p>
        <h1>Connect Consultations, Records, and Continuous Care</h1>
        <p>A focused workspace for clinicians to manage patient information, online consultations, specialist collaboration, and ongoing follow-up.</p>
      </div>

      <ul class="intro-points">
        <li><CheckCircle2 :size="17" /><span>Patient information is authorized by role and data scope</span></li>
        <li><CheckCircle2 :size="17" /><span>Record submission, review, and archiving are fully audited</span></li>
        <li><CheckCircle2 :size="17" /><span>AI-generated content requires physician confirmation before use</span></li>
      </ul>

      <p class="intro-foot">Training environment · All patient information shown is simulated</p>
    </section>

    <section class="login-area">
      <div class="login-panel">
        <div class="login-heading">
          <div class="login-mark"><ShieldCheck :size="22" /></div>
          <div><h2>Doctor Workspace</h2><p>Choose a verification method to enter the system</p></div>
        </div>

        <div class="method-tabs" role="tablist" aria-label="Sign-in methods">
          <button
            v-for="item in methods"
            :key="item.value"
            type="button"
            :class="{ active: method === item.value }"
            @click="switchMethod(item.value)"
          >
            <component :is="item.icon" :size="16" />{{ item.label }}
          </button>
        </div>

        <el-form label-position="top" class="login-form" @submit.prevent="submitLogin">
          <template v-if="method === 'password'">
            <el-form-item label="Account"><el-input v-model="form.account" size="large" /></el-form-item>
            <el-form-item label="Password"><el-input v-model="form.password" size="large" type="password" show-password /></el-form-item>
            <el-form-item label="Verification Code"><el-input v-model="form.captcha" size="large" maxlength="4" /></el-form-item>
          </template>

          <template v-else-if="method === 'sms'">
            <el-form-item label="Mobile Number"><el-input v-model="form.mobile" size="large" /></el-form-item>
            <el-form-item label="SMS Code">
              <div class="code-row">
                <el-input v-model="form.smsCode" size="large" maxlength="4" placeholder="Enter the 4-digit code" />
                <el-button size="large" @click="sendSmsCode">{{ smsSent ? 'Resend' : 'Send Code' }}</el-button>
              </div>
            </el-form-item>
          </template>

          <template v-else>
            <el-form-item label="Account"><el-input v-model="form.account" size="large" /></el-form-item>
            <button class="face-check" :class="{ verified: faceVerified }" type="button" @click="verifyFace">
              <ScanFace :size="34" />
              <strong>{{ faceVerified ? 'Identity verified' : 'Start facial identity verification' }}</strong>
              <span>{{ faceChecking ? 'Verifying demo identity...' : 'This demo simulates verification and does not access the camera' }}</span>
            </button>
          </template>

          <el-form-item label="Demo Role" class="role-select">
            <el-select v-model="selectedRole" size="large">
              <el-option v-for="role in roleOptions" :key="role.value" :label="role.label" :value="role.value" />
            </el-select>
          </el-form-item>

          <el-button class="login-button" type="primary" size="large" :loading="loading" :disabled="!canSubmit" @click="submitLogin">Enter Workspace</el-button>
        </el-form>

        <p class="security-note"><ShieldCheck :size="15" />Sign-in activity is recorded in your personal audit log</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  grid-template-columns: minmax(420px, 1.1fr) minmax(430px, .9fr);
  min-height: 100vh;
  background: #f4f6f7;
}

.system-intro {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 42px clamp(38px, 6vw, 88px);
  color: #ecf4f7;
  background: #183043;
}

.intro-brand { display: flex; align-items: center; gap: 13px; }
.intro-brand > span { display: grid; width: 44px; height: 44px; place-items: center; border: 1px solid rgba(255,255,255,.2); border-radius: 5px; background: #254a60; }
.intro-brand div { display: grid; gap: 4px; }
.intro-brand strong { font-size: 15px; }
.intro-brand small { color: #aabdc8; }

.intro-copy { max-width: 590px; margin: auto 0 42px; }
.intro-kicker { margin: 0 0 13px; color: #7fc8bd; font-size: 13px; font-weight: 700; }
.intro-copy h1 { max-width: 560px; margin: 0; font-size: clamp(31px, 4vw, 48px); line-height: 1.28; letter-spacing: -.035em; }
.intro-copy > p:last-child { max-width: 540px; margin: 22px 0 0; color: #bfd0d9; font-size: 15px; line-height: 1.9; }

.intro-points { display: grid; gap: 14px; margin: 0 0 auto; padding: 0; list-style: none; }
.intro-points li { display: flex; align-items: center; gap: 10px; color: #d4e2e8; font-size: 14px; }
.intro-points svg { color: #7fc8bd; }
.intro-foot { margin: 48px 0 0; color: #8fa7b4; font-size: 11px; }

.login-area { display: grid; place-items: center; padding: 34px; }
.login-panel { width: min(430px, 100%); padding: 34px; border: 1px solid var(--border); border-radius: 6px; background: #fff; }
.login-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
.login-mark { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 5px; color: var(--primary); background: #eaf2f5; }
.login-heading h2 { margin: 0; color: var(--text-strong); font-size: 24px; }
.login-heading p { margin: 5px 0 0; color: var(--muted); font-size: 13px; }

.method-tabs { display: grid; grid-template-columns: repeat(3, 1fr); margin-bottom: 24px; border-bottom: 1px solid var(--border); }
.method-tabs button { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 42px; margin-bottom: -1px; border: 0; border-bottom: 2px solid transparent; color: var(--muted); background: transparent; cursor: pointer; }
.method-tabs button.active { border-bottom-color: var(--primary); color: var(--primary); font-weight: 700; }

.code-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; width: 100%; }
.face-check { display: grid; width: 100%; min-height: 150px; place-items: center; align-content: center; gap: 7px; margin-bottom: 19px; border: 1px dashed var(--border-strong); border-radius: 5px; color: var(--primary); background: var(--panel-soft); cursor: pointer; }
.face-check span { color: var(--muted); font-size: 11px; }
.face-check.verified { color: var(--green); border-color: #8fc4a8; background: #f0f8f3; }
.role-select { margin-top: 4px; }
.role-select :deep(.el-select) { width: 100%; }
.login-button { width: 100%; margin-top: 2px; }
.security-note { display: flex; align-items: center; justify-content: center; gap: 7px; margin: 18px 0 0; color: var(--muted); font-size: 11px; }

@media (max-width: 900px) {
  .login-page { grid-template-columns: 1fr; }
  .system-intro { min-height: auto; padding: 28px; }
  .intro-copy { margin: 55px 0 30px; }
  .intro-copy h1 { font-size: 32px; }
  .intro-points { display: none; }
  .intro-foot { margin-top: 0; }
}

@media (max-width: 520px) {
  .login-area { padding: 0; }
  .login-panel { padding: 26px 20px; border: 0; border-radius: 0; }
  .method-tabs button { font-size: 12px; }
}
</style>
