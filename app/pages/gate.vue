<template>
  <div class="gate">
    <div class="gate-card">
      <div class="gate-mark">SYS<span class="dot">.</span></div>
      <div class="gate-sub">{{ $t('gate.subtitle') }}</div>

      <!-- ── Biometric unlock ── -->
      <template v-if="mode === 'biometric'">
        <h1>{{ $t('gate.welcome_back') }}<em>.</em></h1>
        <p class="welcome">{{ isPwa ? $t('gate.biometric_prompt_pwa') : $t('gate.biometric_prompt') }}</p>
        <p v-if="error" class="gate-error">{{ error }}</p>
        <button class="btn btn-primary btn-lg" :disabled="loading" @click="biometricUnlock">
          <span v-if="loading" class="gate-spinner" />
          {{ loading ? $t('gate.loading_soul') : $t('gate.unlock') }}
          <SysIcon v-if="!loading" name="arrow" style="width:18px;height:18px" />
        </button>
        <button class="gate-link" @click="switchToForm">{{ $t('gate.manual_login') }}</button>
      </template>

      <!-- ── Save creds prompt ── -->
      <template v-else-if="mode === 'saving'">
        <h1>{{ $t('gate.signed_in') }}<em>.</em></h1>
        <p class="welcome">{{ $t('gate.save_creds_prompt') }}</p>
        <p class="gate-hint">{{ $t('gate.save_creds_hint') }}</p>
        <p v-if="error" class="gate-error">{{ error }}</p>
        <button class="btn btn-primary btn-lg" :disabled="loading" @click="doSaveCreds">
          <span v-if="loading" class="gate-spinner" />
          {{ loading ? $t('gate.saving') : $t('gate.save_with_biometric') }}
        </button>
        <button class="gate-link" @click="doRedirect">{{ $t('gate.skip') }}</button>
      </template>

      <!-- ── Standard form ── -->
      <template v-else>
        <h1>{{ $t('gate.welcome_back') }}<em>.</em></h1>
        <p v-if="error" class="gate-error">{{ error }}</p>
        <form @submit.prevent="submit" style="width:100%">
          <div class="gate-field">
            <input
              v-model="password"
              :type="showPw ? 'text' : 'password'"
              autocomplete="current-password"
              :placeholder="$t('gate.password_placeholder')"
              :aria-label="$t('gate.password_aria')"
              :disabled="loading"
              required
            />
            <button type="button" class="reveal" @click="showPw = !showPw" :aria-label="$t('gate.show_password')">
              <SysIcon :name="showPw ? 'eyeoff' : 'eye'" style="width:18px;height:18px" />
            </button>
          </div>
          <div v-if="soulRegistered || multiHoster" class="gate-field" style="margin-bottom:14px">
            <input
              v-model="cert"
              type="text"
              autocomplete="off"
              spellcheck="false"
              :placeholder="multiHoster ? $t('gate.cert_or_invite_placeholder') : $t('gate.cert_placeholder')"
              :aria-label="$t('gate.cert_aria')"
              :disabled="loading"
              style="font-family:var(--mono);font-size:13px"
            />
          </div>
          <p v-if="certAutoFilled" class="gate-autofill">{{ $t('gate.cert_auto_filled') }}</p>
          <button type="submit" class="btn btn-primary btn-lg" :disabled="loading">
            <span v-if="loading" class="gate-spinner" />
            {{ loading ? $t('gate.loading') : $t('gate.sign_in') }}
          </button>
        </form>
        <button v-if="hasSavedCreds" class="gate-link" @click="mode = 'biometric'">{{ $t('gate.unlock_with_biometric') }}</button>
      </template>

      <div class="gate-foot">
        <span class="live-dot" />
        {{ $t('gate.footer') }}
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: false })

import { useI18n } from 'vue-i18n'
const { t } = useI18n()

const password       = ref('')
const cert           = ref('')
const error          = ref('')
const loading        = ref(false)
const soulRegistered = ref(false)
const multiHoster    = ref(false)
const certAutoFilled = ref(false)
const mode           = ref('form')   // 'form' | 'biometric' | 'saving'
const nextUrl        = ref('/')
const hasSavedCreds  = ref(false)

const PWA_SOUL_KEY = 'sys_pwa_soul_id'

const route   = useRoute()
const passkey = useSoulPasskey()
const creds   = useSavedCreds()

const isPwa = import.meta.client && (
  navigator.standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches
)

onMounted(async () => {
  if (import.meta.dev) {
    window.location.href = route.query.next?.startsWith('/') ? route.query.next : '/'
    return
  }

  nextUrl.value = route.query.next?.startsWith('/') ? route.query.next : '/'

  try {
    const status = await $fetch('/api/gate-status')
    soulRegistered.value = status.soul_registered ?? false
    multiHoster.value    = status.multi_hoster    ?? false
  } catch {
    soulRegistered.value = false
  }

  if (soulRegistered.value) {
    const stored = sessionStorage.getItem('sys.soul_cert')
    if (stored && stored.length >= 20) {
      cert.value       = stored
      certAutoFilled.value = true
    }
  }

  hasSavedCreds.value = creds.hasCreds.value
  if (hasSavedCreds.value) mode.value = 'biometric'
})

async function biometricUnlock() {
  if (loading.value) return
  loading.value = true
  error.value   = ''
  try {
    const prf = await passkey.authenticatePasskey()
    if (!prf) {
      error.value = passkey.passkeyError.value || t('gate.error.biometric_failed')
      return
    }

    const saved = await creds.loadCreds(prf)
    if (!saved) {
      error.value = t('gate.error.creds_load_failed')
      creds.clearCreds()
      hasSavedCreds.value = false
      mode.value = 'form'
      return
    }

    const body = { password: saved.password }
    if (saved.cert) body.cert = saved.cert
    const gateRes = await $fetch('/api/gate-auth', { method: 'POST', body })

    const soulId = gateRes?.soul_id || localStorage.getItem(PWA_SOUL_KEY) || ''
    if (soulId && saved.cert) {
      try {
        const bearer = `${soulId}.${saved.cert}`
        const soulRes = await fetch('/api/soul', {
          headers: { Authorization: `Bearer ${bearer}` }
        })
        if (soulRes.ok) {
          const soulText = await soulRes.text()
          if (soulText && soulText.includes('soul_cert:')) {
            sessionStorage.setItem('sys.soul', soulText)
            sessionStorage.setItem('sys.soul_cert', saved.cert)
            return window.location.href = '/session'
          }
        }
      } catch { /* silent — fallback to normal redirect */ }
    }

    doRedirect()
  } catch (e) {
    const err = e?.data?.error || ''
    if (err === 'invalid_cert' || err === 'gate_not_configured' || e?.status === 401) {
      error.value = t('gate.error.cert_expired')
      creds.clearCreds()
      hasSavedCreds.value = false
      mode.value = 'form'
    } else {
      error.value = t('gate.error.connection_error')
    }
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (loading.value) return
  if (import.meta.dev) return
  error.value   = ''
  loading.value = true
  try {
    const payload = { password: password.value }
    if ((soulRegistered.value || multiHoster.value) && cert.value) payload.cert = cert.value.trim()

    const gateRes = await $fetch('/api/gate-auth', { method: 'POST', body: payload })

    if (gateRes?.soul_id) localStorage.setItem(PWA_SOUL_KEY, gateRes.soul_id)
    if (gateRes?.invite_login) sessionStorage.setItem('sys.invite_login', '1')

    const support = await passkey.checkPasskeySupport()
    if (support.supported && !creds.hasCreds.value) {
      mode.value = 'saving'
    } else {
      doRedirect()
    }
  } catch (e) {
    const msg = e?.data?.message || e?.data?.error || ''
    if (msg === 'cert_required') {
      error.value      = t('gate.error.cert_required')
      soulRegistered.value = true
    } else if (e?.data?.error === 'invalid_cert') {
      error.value = cert.value.startsWith('inv_')
        ? t('gate.error.invalid_invite')
        : t('gate.error.invalid_cert')
      cert.value = ''
      certAutoFilled.value = false
    } else if (e?.data?.error === 'gate_not_configured') {
      error.value = t('gate.error.gate_not_configured')
    } else if (e?.status === 401) {
      error.value = t('gate.error.access_denied')
    } else if (e?.status === 429) {
      error.value = t('gate.error.too_many_attempts')
    } else {
      error.value = t('gate.error.connection_error')
    }
  } finally {
    loading.value = false
  }
}

async function doSaveCreds() {
  if (loading.value) return
  loading.value = true
  error.value   = ''
  try {
    const prf = passkey.hasPasskey.value
      ? await passkey.authenticatePasskey()
      : await passkey.registerPasskey('Soul')
    if (!prf) {
      error.value = passkey.passkeyError.value || t('gate.error.biometric_unavailable')
      return
    }
    await creds.saveCreds({ password: password.value, cert: cert.value }, prf)
    doRedirect()
  } catch {
    error.value = t('gate.error.save_failed')
  } finally {
    loading.value = false
  }
}

function switchToForm() {
  error.value = ''
  mode.value  = 'form'
}

function doRedirect() {
  window.location.href = nextUrl.value
}

const showPw = ref(false)
</script>

<style scoped>
.gate .btn-primary { background: var(--accent); color: #fff; }
.gate .btn-primary:hover { background: var(--accent-bright); }
.gate h1 em { font-style: italic; color: var(--accent-bright); }
.gate-error { font-size: 12px; color: var(--c-err, #e06c75); border-left: 2px solid currentColor; padding-left: 10px; line-height: 1.6; margin: 0 0 14px; text-align: left; }
.gate-hint { font-size: 13px; color: var(--fg-2); line-height: 1.6; margin: 0 0 14px; }
.gate-autofill { font-size: 12px; color: var(--accent); margin: -8px 0 12px; text-align: left; }
.gate-link { background: none; border: none; padding: 0; font-size: 15px; color: var(--fg); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; margin-top: 12px; }
.gate-link:hover { color: var(--accent-bright); }
.gate-spinner { width: 14px; height: 14px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: gate-spin .7s linear infinite; display: inline-block; flex-shrink: 0; }
@keyframes gate-spin { to { transform: rotate(360deg); } }
</style>
