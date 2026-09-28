<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { CheckCircle2, LockKeyhole, Mail, ScanFace, ShieldCheck, Stethoscope } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/services/auth'
import { ApiError } from '@/services/http'

type LoginMethod = 'password' | 'email' | 'face'
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const method = shallowRef<LoginMethod>('password')
const loading = shallowRef(false)
const sending = shallowRef(false)
const secondsRemaining = shallowRef(0)
const requestNotice = shallowRef('')
const faceVideo = shallowRef<HTMLVideoElement | null>(null)
const cameraOpening = shallowRef(false)
const cameraReady = shallowRef(false)
let cameraStream: MediaStream | undefined
let cameraGeneration = 0
const form = reactive({ account: '', password: '', emailCode: '' })
let countdown: ReturnType<typeof setInterval> | undefined
const methods = [
  { value: 'password' as const, label: 'Password', icon: LockKeyhole },
  { value: 'email' as const, label: 'Email Verification', icon: Mail },
  { value: 'face' as const, label: 'Facial Verification', icon: ScanFace },
]
const canSubmit = computed(() => Boolean(form.account.trim()) && !loading.value && !sending.value && (
  method.value === 'password' ? Boolean(form.password) : method.value === 'email' ? /^\d{6}$/.test(form.emailCode) : cameraReady.value
))

function startCooldown() {
  clearInterval(countdown)
  const until = Date.now() + 60_000
  secondsRemaining.value = 60
  countdown = setInterval(() => {
    secondsRemaining.value = Math.max(0, Math.ceil((until - Date.now()) / 1000))
    if (!secondsRemaining.value) clearInterval(countdown)
  }, 1000)
}
function stopCamera() {
  cameraGeneration++
  cameraStream?.getTracks().forEach(track => track.stop())
  cameraStream = undefined
  if (faceVideo.value) faceVideo.value.srcObject = null
  cameraReady.value = false
  cameraOpening.value = false
}
onUnmounted(() => { clearInterval(countdown); stopCamera() })

async function openCamera() {
  if (cameraOpening.value || loading.value) return
  stopCamera()
  if (!navigator.mediaDevices?.getUserMedia) {
    ElMessage.error('Camera access requires HTTPS or localhost and a supported browser.')
    return
  }
  const generation = cameraGeneration
  cameraOpening.value = true
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })
    if (generation !== cameraGeneration) { stream.getTracks().forEach(track => track.stop()); return }
    cameraStream = stream
    await nextTick()
    if (generation !== cameraGeneration || !faceVideo.value) { stream.getTracks().forEach(track => track.stop()); return }
    faceVideo.value.srcObject = stream
    await faceVideo.value.play()
    if (generation === cameraGeneration) cameraReady.value = true
  } catch {
    if (generation === cameraGeneration) {
      stopCamera()
      ElMessage.error('Unable to access the camera. Allow camera access or use password/email sign-in.')
    }
  } finally { if (generation === cameraGeneration) cameraOpening.value = false }
}

function capturePhoto() {
  const video = faceVideo.value
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) throw new Error('Camera not ready')
  const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Camera not ready')
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  const image = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
  canvas.width = canvas.height = 0
  if (!image || image.length > 2_800_000) throw new Error('Photo too large')
  return image
}

function messageFor(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 400) return 'Please check the account and verification code format.'
    if (error.status === 401) return method.value === 'face' ? 'Face verification failed. Please retry or use another sign-in method.' : 'Invalid credentials or expired verification code.'
    if (error.status === 413) return 'The photo is too large. Please take another photo.'
    if (error.status === 429) return 'Too many requests. Please wait; hourly limits may take longer to reset.'
    if (error.status === 503) return 'The authentication service is unavailable. Check the service configuration or use password sign-in.'
  }
  return 'Unable to contact the authentication service. Please try again.'
}

function switchMethod(value: LoginMethod) {
  if (loading.value || sending.value) return
  stopCamera()
  method.value = value
  form.password = ''
  form.emailCode = ''
  requestNotice.value = ''
}

async function sendEmailCode() {
  if (!form.account.trim() || sending.value || loading.value || secondsRemaining.value) return
  sending.value = true
  requestNotice.value = ''
  try {
    await authApi.requestEmailCode(form.account.trim())
    form.emailCode = ''
    requestNotice.value = 'Request accepted, not confirmation of delivery. If eligible, a code will be sent to the account’s preset email.'
    startCooldown()
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) startCooldown()
    ElMessage.error(messageFor(error))
  } finally { sending.value = false }
}

async function submitLogin() {
  if (!canSubmit.value) return
  loading.value = true
  try {
    if (method.value === 'password') await authStore.loginWithPassword(form.account.trim(), form.password)
    else if (method.value === 'email') await authStore.loginWithEmail(form.account.trim(), form.emailCode)
    else if (method.value === 'face') {
      const image = capturePhoto()
      stopCamera()
      await authStore.loginWithFace(form.account.trim(), image)
    } else return
    form.password = ''
    form.emailCode = ''
    ElMessage.success('Signed in successfully')
    const redirect = route.query.redirect
    await router.replace(typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.startsWith('/login') ? redirect : '/')
  } catch (error) {
    ElMessage.error(messageFor(error))
  } finally { loading.value = false }
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
            :disabled="loading || sending"
            :class="{ active: method === item.value }"
            @click="switchMethod(item.value)"
          >
            <component :is="item.icon" :size="16" />{{ item.label }}
          </button>
        </div>

        <el-form label-position="top" class="login-form" @submit.prevent="submitLogin">
          <el-form-item label="Account">
            <el-input v-model="form.account" size="large" maxlength="50" autocomplete="username" :disabled="loading || sending" @input="requestNotice = ''; form.emailCode = ''" />
          </el-form-item>
          <template v-if="method === 'password'">
            <el-form-item label="Password"><el-input v-model="form.password" size="large" type="password" autocomplete="current-password" show-password :disabled="loading" /></el-form-item>
          </template>
          <template v-else-if="method === 'email'">
            <el-form-item label="Email Code">
              <div class="code-row">
                <el-input v-model="form.emailCode" size="large" maxlength="6" inputmode="numeric" autocomplete="one-time-code" placeholder="Enter the 6-digit code" :disabled="loading" />
                <el-button size="large" :loading="sending" :disabled="!form.account.trim() || loading || secondsRemaining > 0" @click="sendEmailCode">{{ secondsRemaining ? `${secondsRemaining}s` : 'Request Code' }}</el-button>
              </div>
            </el-form-item>
            <p class="email-note" role="status">{{ requestNotice || 'Use your username. Codes are sent only to the email preset by your administrator.' }}</p>
          </template>
          <div v-else class="face-check">
            <video ref="faceVideo" class="face-video" autoplay muted playsinline aria-label="Camera preview" />
            <el-button :loading="cameraOpening" :disabled="loading" @click="openCamera">{{ cameraReady ? 'Restart Camera' : 'Enable Camera' }}</el-button>
            <el-button v-if="cameraReady" :disabled="loading" @click="stopCamera">Turn Off Camera</el-button>
          </div>
          <el-button class="login-button" type="primary" native-type="submit" size="large" :loading="loading" :disabled="!canSubmit">{{ method === 'face' ? 'VerifyFace' : 'Enter Workspace' }}</el-button>
        </el-form>

        <p class="security-note"><ShieldCheck :size="15" />Accounts and contact details are managed by your administrator</p>
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
.face-video { width: 100%; max-height: 260px; background: #13222c; border-radius: 4px; transform: scaleX(-1); }
.face-check span { color: var(--muted); font-size: 11px; }
.email-note { margin: 0 0 18px; color: var(--muted); font-size: 12px; line-height: 1.6; }
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
