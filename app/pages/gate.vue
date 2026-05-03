<template>
  <div class="gate-root">
    <div class="gate-card">
      <div class="gate-logo">
        <img src="~/assets/logo.png" alt="SYS" class="gate-logo-img" />
      </div>

      <h1 class="gate-title">Zugang</h1>
      <p class="gate-subtitle">Persönlicher SYS-Node</p>

      <form class="gate-form" @submit.prevent="submit">
        <div v-if="error" class="gate-error" role="alert">
          {{ error }}
        </div>

        <div class="gate-field">
          <label for="gate-password" class="gate-label">Passwort</label>
          <input
            id="gate-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="gate-input"
            placeholder="Node-Zugangspasswort"
            :disabled="loading"
            required
          />
        </div>

        <div v-if="soulRegistered" class="gate-field">
          <label for="gate-cert" class="gate-label">
            Soul-Cert
            <span class="gate-label-hint">32-stelliger Hex-Code aus deiner Session</span>
          </label>
          <input
            id="gate-cert"
            v-model="cert"
            type="text"
            autocomplete="off"
            spellcheck="false"
            class="gate-input gate-input--mono"
            placeholder="a1b2c3d4…"
            :disabled="loading"
          />
          <p v-if="certAutoFilled" class="gate-autofill-hint">
            <i class="ri-checkbox-circle-line"></i> Automatisch aus aktiver Session geladen
          </p>
        </div>

        <button type="submit" class="sys-btn-filled gate-submit" :disabled="loading">
          <span v-if="loading"><i class="ri-loader-4-line gate-spin"></i></span>
          <span v-else>Eintreten</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: false })

const password        = ref('')
const cert            = ref('')
const error           = ref('')
const loading         = ref(false)
const soulRegistered  = ref(false)
const certAutoFilled  = ref(false)

const route = useRoute()

onMounted(async () => {
  // In Nuxt-Dev (kein OpenResty) direkt weiterleiten
  if (import.meta.dev) {
    window.location.href = route.query.next?.startsWith('/') ? route.query.next : '/'
    return
  }

  // Gate-Status abrufen: Soul registriert → Cert-Feld anzeigen
  try {
    const status = await $fetch('/api/gate-status')
    soulRegistered.value = status.soul_registered ?? false
  } catch {
    soulRegistered.value = false
  }

  // Cert aus aktiver Browser-Session auto-befüllen
  if (soulRegistered.value && import.meta.client) {
    const stored = sessionStorage.getItem('sys.soul_cert')
    if (stored && stored.length >= 20) {
      cert.value      = stored
      certAutoFilled.value = true
    }
  }
})

async function submit() {
  if (loading.value) return
  if (import.meta.dev) return
  error.value   = ''
  loading.value = true

  try {
    const payload = { password: password.value }
    if (soulRegistered.value && cert.value) {
      payload.cert = cert.value.trim()
    }

    await $fetch('/api/gate-auth', {
      method: 'POST',
      body:   payload,
    })

    // Weiterleitung zur Zielseite
    const next = (route.query.next && route.query.next.startsWith('/'))
      ? route.query.next
      : '/'
    window.location.href = next

  } catch (e) {
    const msg = e?.data?.message || e?.data?.error || ''
    if (msg.includes('cert_required') || e?.data?.error === 'cert_required') {
      error.value = 'Soul-Cert erforderlich. Bitte Cert eingeben.'
      soulRegistered.value = true
    } else if (e?.data?.error === 'invalid_cert') {
      error.value = 'Soul-Cert ungültig. Bitte prüfen.'
    } else if (e?.data?.error === 'gate_not_configured') {
      error.value = 'Node nicht konfiguriert. init.sh erneut ausführen.'
    } else if (e?.status === 401) {
      error.value = 'Zugang verweigert. Bitte prüfe Passwort und Cert.'
    } else if (e?.status === 429) {
      error.value = 'Zu viele Versuche. Bitte warte einen Moment.'
    } else {
      error.value = 'Verbindungsfehler. Bitte erneut versuchen.'
    }
    loading.value = false
  }
}
</script>

<style scoped>
.gate-root {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sys-bg);
  padding: 1.5rem;
}

.gate-card {
  width: 100%;
  max-width: 400px;
  background: var(--sys-bg-elevated);
  border: 1px solid var(--sys-border);
  border-radius: 1.25rem;
  padding: 2.5rem 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.gate-logo {
  margin-bottom: 1.5rem;
}

.gate-logo-img {
  width: 88px;
  height: 88px;
  object-fit: contain;
}

.gate-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--sys-fg);
  margin: 0 0 0.25rem;
  text-align: center;
}

.gate-subtitle {
  font-size: 0.8125rem;
  color: var(--sys-fg-muted);
  margin: 0 0 2rem;
  text-align: center;
}

.gate-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.gate-error {
  background: rgba(220, 38, 38, 0.1);
  border: 1px solid rgba(220, 38, 38, 0.4);
  color: #f87171;
  border-radius: 0.625rem;
  padding: 0.75rem 1rem;
  font-size: 0.8125rem;
  line-height: 1.4;
}

.gate-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.gate-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--sys-fg-muted);
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.gate-label-hint {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--sys-fg-dim);
}

.gate-input {
  background: var(--sys-bg-surface);
  border: 1px solid var(--sys-border);
  border-radius: 0.625rem;
  padding: 0.75rem 1rem;
  color: var(--sys-fg);
  font-size: 0.9375rem;
  font-family: inherit;
  width: 100%;
  outline: none;
  transition: border-color 0.15s;
  min-height: 44px;
  box-sizing: border-box;
}

.gate-input:focus {
  border-color: var(--sys-orange);
}

.gate-input--mono {
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.8125rem;
  letter-spacing: 0.03em;
}

.gate-autofill-hint {
  font-size: 0.75rem;
  color: #4ade80;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.gate-submit {
  width: 100%;
  justify-content: center;
  height: 48px;
  font-size: 1rem;
  margin-top: 0.5rem;
}

.gate-spin {
  display: inline-block;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
