<template>
  <div class="gate-root">
    <main class="gate-col">

      <div class="gate-logo">
        <img src="~/assets/logo.png" alt="SYS" class="gate-logo-img" />
      </div>

      <div class="gate-head">
        <span class="gate-kicker">SYS · Private Node</span>
        <h1 class="gate-display">Zugang<em>.</em></h1>
        <p class="gate-lede">Persönlicher SYS-Node</p>
      </div>

      <form class="gate-form" @submit.prevent="submit">

        <p v-if="error" class="gate-error">{{ error }}</p>

        <div class="sys-field">
          <span class="sys-field-label">Passwort</span>
          <input
            id="gate-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="sys-input"
            placeholder="Node-Zugangspasswort"
            :disabled="loading"
            required
          />
        </div>

        <div v-if="soulRegistered" class="sys-field">
          <span class="sys-field-label">
            Soul-Cert
            <span class="sys-field-hint">32-stelliger Hex-Code aus deiner Session</span>
          </span>
          <input
            id="gate-cert"
            v-model="cert"
            type="text"
            autocomplete="off"
            spellcheck="false"
            class="sys-input sys-input--mono"
            placeholder="a1b2c3d4…"
            :disabled="loading"
          />
          <p v-if="certAutoFilled" class="sys-field-ok">✓ Automatisch aus aktiver Session geladen</p>
        </div>

        <button
          type="submit"
          class="sys-btn-ed sys-btn-ed--primary"
          style="width:100%;justify-content:center"
          :disabled="loading"
        >{{ loading ? 'Lädt…' : 'Eintreten' }}</button>

      </form>
    </main>
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
  background: var(--sys-paper-3, #0d0b14);
  padding: clamp(24px, 5vw, 48px) 24px;
}

.gate-col {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.gate-logo {
  display: flex;
  justify-content: center;
}

.gate-logo-img {
  width: 64px;
  height: 64px;
  object-fit: contain;
}

.gate-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid var(--sys-rule);
  padding-bottom: 24px;
}

.gate-kicker {
  font-family: var(--sys-mono);
  font-size: 10px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--sys-fg-muted);
}

.gate-display {
  font-family: var(--sys-serif);
  font-size: clamp(36px, 7vw, 52px);
  font-weight: 400;
  letter-spacing: -0.03em;
  color: var(--sys-fg);
  margin: 0;
  line-height: 0.95;
}

.gate-display em {
  font-style: italic;
  color: var(--sys-accent-bright);
}

.gate-lede {
  font-family: var(--sys-serif);
  font-size: 15px;
  color: var(--sys-fg-muted);
  margin: 0;
  line-height: 1.5;
}

.gate-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.gate-error {
  font-family: var(--sys-mono);
  font-size: 11px;
  color: var(--sys-err);
  border-left: 2px solid var(--sys-err);
  padding-left: 10px;
  line-height: 1.6;
  margin: 0;
}
</style>
