<template>
  <div class="gate">
    <!-- Blanke Landing per Default, wie gate.vue — die Registrierungsmaske
         bekommt keine Aufmerksamkeit, bis sie gezielt aufgerufen wird. -->
    <button
      v-if="!revealed"
      class="gate-reveal-trigger"
      @click="revealed = true"
      :aria-label="$t('join.reveal_aria')"
      :title="$t('join.reveal_aria')"
    >
      <SysIcon name="arrow" style="width:14px;height:14px" />
    </button>

    <button
      v-if="revealed"
      class="gate-close-trigger"
      @click="revealed = false"
      :aria-label="$t('gate.close_aria')"
      :title="$t('gate.close_aria')"
    >
      <SysIcon name="close" style="width:16px;height:16px" />
    </button>

    <div class="gate-card">
      <template v-if="!revealed">
        <SysMark size="220px" />
        <div class="gate-sub join-sub">{{ $t('join.subtitle') }}</div>
      </template>

      <Transition name="gate-reveal">
        <div v-if="revealed">
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
      </Transition>
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
const revealed   = ref(false)

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

/* join-sub: eigener Override statt globalem .gate-sub (sys-v2.css) zu ändern
   — betrifft sonst auch index.vue, das nicht größer werden soll. Größer weil
   das Formular jetzt standardmäßig versteckt ist (siehe gate-reveal-trigger
   oben) und der sichtbare Bereich sonst zu leer wirkt. */
.join-sub { font-size: 20px; margin-bottom: 32px; }

.gate-reveal-trigger {
  position: fixed; top: 20px; right: 20px; z-index: 20;
  width: 36px; height: 36px; display: grid; place-items: center;
  background: none; border: none; border-radius: 50%;
  color: var(--fg); cursor: pointer;
  transition: background .2s, color .2s;
}
.gate-reveal-trigger:hover, .gate-reveal-trigger:focus-visible {
  background: var(--surface-2); color: var(--accent-bright);
}

.gate-close-trigger {
  position: fixed; top: 20px; right: 20px; z-index: 20;
  width: 36px; height: 36px; display: grid; place-items: center;
  background: none; border: none; border-radius: 50%;
  color: var(--fg-3); cursor: pointer;
  transition: background .2s, color .2s;
}
.gate-close-trigger:hover, .gate-close-trigger:focus-visible {
  background: var(--surface-2); color: var(--fg);
}

.gate-reveal-enter-active, .gate-reveal-leave-active { transition: opacity .25s ease, transform .25s ease; }
.gate-reveal-enter-from, .gate-reveal-leave-to { opacity: 0; transform: translateY(6px); }
</style>
