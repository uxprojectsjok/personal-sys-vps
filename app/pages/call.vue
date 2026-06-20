<template>
  <ClientOnly>
    <div class="call-page">
      <!-- Kein Soul geladen -->
      <div v-if="!hasSoul" class="call-card call-card--err">
        <p class="call-label">{{ $t('call.no_soul') }}</p>
        <a href="/" class="call-btn">{{ $t('call.go_home') }}</a>
      </div>

      <!-- Laden -->
      <div v-else-if="phase === 'loading'" class="call-card">
        <div class="call-pulse" />
        <p class="call-label">{{ $t('call.connecting') }}</p>
      </div>

      <!-- Fehler: kein Agent -->
      <div v-else-if="phase === 'no-agent'" class="call-card call-card--err">
        <p class="call-name">{{ name }}</p>
        <p class="call-label">{{ $t('call.no_agent') }}</p>
        <p class="call-hint">{{ $t('call.no_agent_hint_pre') }}<strong>{{ $t('call.no_agent_hint_cmd') }}</strong>{{ $t('call.no_agent_hint_post') }}</p>
        <a href="/setup" class="call-btn">{{ $t('call.setup') }}</a>
      </div>

      <!-- Fehler allgemein -->
      <div v-else-if="phase === 'error'" class="call-card call-card--err">
        <p class="call-name">{{ name }}</p>
        <p class="call-label">{{ $t('call.conn_failed') }}</p>
        <p class="call-hint">{{ errorMsg }}</p>
        <button class="call-btn" @click="startCall">{{ $t('call.retry') }}</button>
      </div>

      <!-- Bereit / aktiv — Widget -->
      <div v-else class="call-card call-card--active">
        <p class="call-name">{{ name }}</p>
        <p class="call-label">{{ phase === 'ready' ? $t('call.status_ready') : $t('call.status_active') }}</p>
        <!-- ElevenLabs Widget wird per ref gesteuert -->
        <div ref="widgetWrap" class="call-widget-wrap" />
        <button v-if="phase === 'active'" class="call-end-btn" @click="endCall">{{ $t('call.hang_up') }}</button>
      </div>
    </div>
  </ClientOnly>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSoul } from '~/composables/useSoul.js'

const { t } = useI18n()
const { soulToken, hasSoul, soulMeta, load } = useSoul()

const name      = ref('…')
const phase     = ref('loading')   // loading | no-agent | error | ready | active
const errorMsg  = ref('')
const widgetWrap = ref(null)

let widgetEl = null

async function startCall() {
  phase.value = 'loading'
  errorMsg.value = ''

  try {
    // Öffentliche Agent-URL bevorzugen (kein signed URL nötig)
    const cfgRes = await fetch('/api/get-config', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    if (cfgRes.ok) {
      const cfg = await cfgRes.json()
      if (cfg.elevenlabs_agent_url) {
        window.location.href = cfg.elevenlabs_agent_url
        return
      }
    }

    // Fallback: signed URL via /api/elevenlabs-token
    const res = await fetch('/api/elevenlabs-token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${soulToken.value}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      if (err.error === 'elevenlabs_agent_missing') {
        phase.value = 'no-agent'; return
      }
      throw new Error(err.message || `HTTP ${res.status}`)
    }
    const { signed_url } = await res.json()
    if (!signed_url) throw new Error('Keine signed_url erhalten')

    mountWidget(signed_url)

  } catch (e) {
    errorMsg.value = e.message
    phase.value = 'error'
  }
}

function mountWidget(signedUrl) {
  if (!widgetWrap.value) return

  // ElevenLabs ConvAI Web Component
  widgetEl = document.createElement('elevenlabs-convai')
  widgetEl.setAttribute('signed-url', signedUrl)

  widgetEl.addEventListener('elevenlabs-convai:call_started',  () => { phase.value = 'active' })
  widgetEl.addEventListener('elevenlabs-convai:call_ended',    () => { phase.value = 'ready'  })

  widgetWrap.value.innerHTML = ''
  widgetWrap.value.appendChild(widgetEl)
  phase.value = 'ready'
}

function endCall() {
  widgetEl?.endSession?.()
  phase.value = 'ready'
}

onMounted(async () => {
  // ElevenLabs Widget-Script laden
  if (!document.getElementById('el-convai-script')) {
    const s = document.createElement('script')
    s.id  = 'el-convai-script'
    s.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed'
    s.type = 'text/javascript'
    document.head.appendChild(s)
  }

  // Soul laden falls noch nicht geladen
  if (!hasSoul.value) { await load(); }

  name.value = soulMeta.value?.name || 'Mein Agent'
  await startCall()
})

onUnmounted(() => {
  widgetEl?.endSession?.()
})
</script>

<style scoped>
.call-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sys-bg, #0a0a0a);
  font-family: var(--sys-font, system-ui, sans-serif);
  padding: 24px;
}

.call-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 48px 32px;
  background: var(--sys-surface, #141414);
  border: 1px solid var(--sys-border, #222);
  border-radius: 24px;
  max-width: 420px;
  width: 100%;
  text-align: center;
}

.call-card--err  { border-color: var(--sys-err, #c0392b40); }
.call-card--active { border-color: var(--sys-ok, #2ecc7140); }

.call-name {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--sys-text, #fff);
  margin: 0;
}

.call-label {
  font-size: 0.95rem;
  color: var(--sys-text-2, #888);
  margin: 0;
}

.call-hint {
  font-size: 0.85rem;
  color: var(--sys-text-2, #666);
  margin: 0;
  line-height: 1.5;
}

.call-pulse {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--sys-accent, #4f8ef7);
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.9); }
  50%       { opacity: 1;   transform: scale(1);   }
}

.call-widget-wrap {
  width: 100%;
  min-height: 80px;
  display: flex;
  justify-content: center;
}

.call-btn {
  display: inline-block;
  padding: 10px 28px;
  background: var(--sys-accent, #4f8ef7);
  color: #fff;
  border: none;
  border-radius: 99px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
}
.call-btn:hover { opacity: 0.85; }

.call-end-btn {
  padding: 10px 28px;
  background: transparent;
  color: var(--sys-err, #e74c3c);
  border: 1px solid var(--sys-err, #e74c3c);
  border-radius: 99px;
  font-size: 0.9rem;
  cursor: pointer;
}
.call-end-btn:hover { background: var(--sys-err, #e74c3c); color: #fff; }
</style>
