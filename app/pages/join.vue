<template>
  <div class="gate">
    <div class="gate-card">
      <div class="gate-mark">SYS<span class="dot">.</span></div>
      <div class="gate-sub">{{ $t('join.subtitle') }}</div>

      <h1>{{ $t('join.heading') }}<em>.</em></h1>
      <p class="welcome">{{ $t('join.intro') }}</p>
      <p v-if="error" class="gate-error">{{ error }}</p>

      <form @submit.prevent="submit" style="width:100%">
        <div class="gate-field">
          <input
            v-model="password"
            :type="showPw ? 'text' : 'password'"
            autocomplete="new-password"
            :placeholder="$t('join.password_placeholder')"
            :disabled="loading"
            required
          />
          <button type="button" class="reveal" @click="showPw = !showPw" :aria-label="$t('gate.show_password')">
            <SysIcon :name="showPw ? 'eyeoff' : 'eye'" style="width:18px;height:18px" />
          </button>
        </div>
        <div class="gate-field" style="margin-bottom:14px">
          <input
            v-model="inviteCode"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :placeholder="$t('join.invite_placeholder')"
            :aria-label="$t('join.invite_aria')"
            :disabled="loading"
            style="font-family:var(--mono);font-size:13px"
            required
          />
        </div>
        <button type="submit" class="btn btn-primary btn-lg" :disabled="loading">
          <span v-if="loading" class="gate-spinner" />
          {{ loading ? $t('join.registering') : $t('join.register') }}
          <SysIcon v-if="!loading" name="arrow" style="width:18px;height:18px" />
        </button>
      </form>

      <div class="gate-foot">
        <span class="live-dot" />
        {{ $t('join.footer') }}
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: false })

import { useI18n } from 'vue-i18n'
const { t } = useI18n()

const password   = ref('')
const inviteCode = ref('')
const error      = ref('')
const loading    = ref(false)
const showPw     = ref(false)

const route   = useRoute()
const nextUrl = ref('/')

onMounted(async () => {
  nextUrl.value = route.query.next?.startsWith('/') ? route.query.next : '/'

  // Guard: /join only valid on multi-hoster with no soul registered yet
  try {
    const status = await $fetch('/api/gate-status')
    if (!status.multi_hoster) {
      window.location.href = '/gate'
      return
    }
    if (status.soul_registered) {
      // Soul already registered → go to gate to authenticate
      window.location.href = '/gate'
      return
    }
  } catch {
    // If status check fails, let user proceed
  }
})

async function submit() {
  if (loading.value) return
  error.value   = ''
  loading.value = true
  try {
    const gateRes = await $fetch('/api/gate-auth', {
      method: 'POST',
      body: { password: password.value, cert: inviteCode.value.trim() }
    })
    // Registration success — store soul_id and redirect
    if (gateRes?.soul_id) {
      localStorage.setItem('sys_pwa_soul_id', gateRes.soul_id)
    }
    if (gateRes?.invite_login) sessionStorage.setItem('sys.invite_login', '1')
    window.location.href = nextUrl.value
  } catch (e) {
    const err = e?.data?.error || ''
    const msg = e?.data?.message || ''
    if (err === 'invalid_cert' || msg === 'invalid_cert') {
      error.value = t('join.error.invalid_invite')
    } else if (e?.status === 401) {
      error.value = t('join.error.access_denied')
    } else if (e?.status === 429) {
      error.value = t('join.error.too_many_attempts')
    } else {
      error.value = t('join.error.connection_error')
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.gate .btn-primary { background: var(--accent); color: #fff; }
.gate .btn-primary:hover { background: var(--accent-bright); }
.gate h1 em { font-style: italic; color: var(--accent-bright); }
.gate-error { font-size: 12px; color: var(--c-err, #e06c75); border-left: 2px solid currentColor; padding-left: 10px; line-height: 1.6; margin: 0 0 14px; text-align: left; }
.gate-spinner { width: 14px; height: 14px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: gate-spin .7s linear infinite; display: inline-block; flex-shrink: 0; }
@keyframes gate-spin { to { transform: rotate(360deg); } }
</style>
