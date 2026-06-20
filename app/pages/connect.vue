<template>
  <ClientOnly>
    <div class="cw-root">
      <div class="cw-card">
        <div class="cw-brand">
          <span class="cw-sys">SYS<span class="cw-accent">.</span></span>
          <span class="cw-name">Save Your Soul</span>
        </div>
        <p class="cw-tagline" v-html="$t('connect.tagline').replace('\n', '<br>')"></p>

        <!-- Loading -->
        <template v-if="phase === 'loading'">
          <svg class="spin cw-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
          <div class="cw-hint">{{ $t('connect.checking') }}</div>
        </template>

        <!-- Waiting for owner approval -->
        <template v-else-if="phase === 'waiting'">
          <div class="cw-ring">
            <svg class="spin-slow" viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="1.2">
              <circle cx="22" cy="22" r="19" stroke-dasharray="6 3"/>
            </svg>
          </div>
          <div class="cw-title">{{ $t('connect.waiting_title') }}</div>
          <div class="cw-hint">{{ $t('connect.waiting_hint') }}</div>
        </template>

        <!-- Approved → hello -->
        <template v-else-if="phase === 'done'">
          <div class="cw-check">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
          </div>
          <div class="cw-title">{{ $t('connect.connected') }}</div>
          <div class="cw-hello">{{ helloMsg }}</div>
          <div class="cw-verified">
            <span class="cw-dot" />
            {{ $t('connect.node_verified') }}
          </div>
        </template>

        <!-- Rejected -->
        <template v-else-if="phase === 'rejected'">
          <div class="cw-check cw-check--err">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
          </div>
          <div class="cw-title">{{ $t('connect.rejected_title') }}</div>
          <div class="cw-hint">{{ $t('connect.rejected_hint') }}</div>
        </template>

        <!-- Expired -->
        <template v-else-if="phase === 'expired'">
          <div class="cw-check cw-check--err">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
          </div>
          <div class="cw-title">{{ $t('connect.expired_title') }}</div>
          <div class="cw-hint">{{ $t('connect.expired_hint') }}</div>
        </template>

        <!-- Error -->
        <template v-else-if="phase === 'error'">
          <div class="cw-check cw-check--err">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
          </div>
          <div class="cw-title">{{ $t('connect.error_title') }}</div>
          <div class="cw-hint">{{ errorMsg }}</div>
        </template>

        <div class="cw-footer">SYS · Personal Node</div>
      </div>
    </div>
  </ClientOnly>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

definePageMeta({ layout: false })

const { t } = useI18n()
const route    = useRoute()
const phase    = ref('loading')
const helloMsg = ref('')
const errorMsg = ref('')

let pollTimer = null

onMounted(async () => {
  const token = route.query.s
  if (!token || typeof token !== 'string' || token.length !== 48) {
    errorMsg.value = t('connect.err_no_token')
    phase.value    = 'error'
    return
  }
  await probe(token)
})

onUnmounted(() => clearInterval(pollTimer))

async function probe(token) {
  try {
    const res = await fetch('/api/connect/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const data = await res.json()

    if (res.status === 410) { phase.value = 'expired'; return }
    if (res.status === 409) { phase.value = 'expired'; return }
    if (!res.ok) {
      errorMsg.value = data.error || t('connect.err_probe')
      phase.value    = 'error'
      return
    }

    phase.value = 'waiting'
    startPolling(token)
  } catch (e) {
    errorMsg.value = t('connect.err_network')
    phase.value    = 'error'
  }
}

function startPolling(token) {
  clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    try {
      const res  = await fetch(`/api/connect/probe-status?s=${token}`)
      const data = await res.json()

      if (data.status === 'approved') {
        clearInterval(pollTimer)
        await fetchHello(token)
      } else if (data.status === 'rejected') {
        clearInterval(pollTimer)
        phase.value = 'rejected'
      } else if (data.status === 'expired') {
        clearInterval(pollTimer)
        phase.value = 'expired'
      }
    } catch (_) {}
  }, 2000)
}

async function fetchHello(token) {
  try {
    const res  = await fetch(`/api/connect/hello?s=${token}`)
    const data = await res.json()
    if (!res.ok) {
      errorMsg.value = data.error || t('connect.err_hello')
      phase.value    = 'error'
      return
    }
    helloMsg.value = data.message || 'Hello!'
    phase.value    = 'done'
  } catch (e) {
    errorMsg.value = t('connect.err_network')
    phase.value    = 'error'
  }
}
</script>

<style scoped>
.cw-root {
  min-height: 100dvh;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg);
  padding: 24px;
}

.cw-card {
  width: 100%; max-width: 360px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r);
  padding: 48px 32px 40px;
  display: flex; flex-direction: column; align-items: center; gap: 18px;
  text-align: center;
}

.cw-brand { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.cw-sys {
  font-family: var(--sans); font-size: 11px; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent);
}
.cw-accent { color: var(--accent); }
.cw-name {
  font-family: var(--serif); font-size: 24px; font-weight: 400;
  letter-spacing: -0.02em; color: var(--fg);
}
.cw-tagline {
  font-family: var(--mono); font-size: 11px; line-height: 1.65;
  color: var(--fg-3); text-align: center; margin: 0;
}
.cw-ic { width: 32px; height: 32px; color: var(--fg-3); }
.spin { animation: cw-spin 1s linear infinite; }
@keyframes cw-spin { to { transform: rotate(360deg); } }
.spin-slow { animation: cw-spin 3s linear infinite; }

.cw-ring {
  width: 56px; height: 56px;
  display: flex; align-items: center; justify-content: center;
  color: var(--fg-4);
}
.cw-ring svg { width: 56px; height: 56px; }

.cw-check {
  width: 56px; height: 56px; border-radius: 50%;
  background: var(--accent);
  display: flex; align-items: center; justify-content: center;
  color: var(--on-accent);
}
.cw-check--err { background: rgba(224,108,117,0.15); border: 1px solid rgba(224,108,117,0.35); color: #e06c75; }
.cw-check svg { width: 26px; height: 26px; }

.cw-title { font-family: var(--serif); font-size: 22px; font-weight: 400; color: var(--fg); }
.cw-hint  { font-family: var(--mono); font-size: 12px; color: var(--fg-3); line-height: 1.6; max-width: 260px; margin: 0; }
.cw-hello { font-family: var(--serif); font-style: italic; font-size: 20px; color: var(--accent); }

.cw-verified {
  display: flex; align-items: center; gap: 6px;
  font-family: var(--mono); font-size: 12px; color: var(--fg-3);
}
.cw-dot {
  width: 6px; height: 6px; border-radius: 50%; flex: none;
  background: var(--accent); box-shadow: 0 0 4px var(--accent-glow);
}

.cw-footer {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--fg-4); margin-top: 8px;
}
</style>
