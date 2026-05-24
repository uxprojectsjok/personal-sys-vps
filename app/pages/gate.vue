<template>
  <div class="gate-root">
    <main class="gate-col">

      <div class="gate-logo">
        <img src="~/assets/logo.png" alt="SYS" class="gate-logo-img" />
      </div>

      <!-- ── Biometric unlock ── -->
      <template v-if="mode === 'biometric'">
        <div class="gate-head">
          <span class="gate-kicker">SYS · Private Node</span>
          <h1 class="gate-display">Willkommen<em>.</em></h1>
          <p class="gate-lede">{{ isPwa ? 'Entsperre mit deiner Biometrik' : 'Gespeicherte Zugangsdaten vorhanden' }}</p>
        </div>
        <div class="gate-form">
          <p v-if="error" class="gate-error">{{ error }}</p>
          <button
            class="sys-btn-ed sys-btn-ed--primary gate-bio-btn"
            :disabled="loading"
            @click="biometricUnlock"
          >{{ loading ? 'Entsperre…' : 'Entsperren' }}</button>
          <button class="gate-link" @click="switchToForm">Manuell anmelden</button>
        </div>
      </template>

      <!-- ── Save creds prompt ── -->
      <template v-else-if="mode === 'saving'">
        <div class="gate-head">
          <span class="gate-kicker">SYS · Private Node</span>
          <h1 class="gate-display">Angemeldet<em>.</em></h1>
          <p class="gate-lede">Zugangsdaten merken?</p>
        </div>
        <div class="gate-form">
          <p class="gate-hint">Passwort und Soul-Cert werden verschlüsselt auf diesem Gerät gespeichert – entsperrbar nur mit deiner Biometrik (Face ID, Fingerabdruck, Windows Hello).</p>
          <p v-if="error" class="gate-error">{{ error }}</p>
          <button
            class="sys-btn-ed sys-btn-ed--primary"
            style="width:100%;justify-content:center"
            :disabled="loading"
            @click="doSaveCreds"
          >{{ loading ? 'Speichert…' : 'Mit Biometrik speichern' }}</button>
          <button class="gate-link" @click="doRedirect">Überspringen</button>
        </div>
      </template>

      <!-- ── Standard form ── -->
      <template v-else>
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

          <button
            v-if="hasSavedCreds"
            type="button"
            class="gate-link"
            @click="mode = 'biometric'"
          >Mit Biometrik entsperren</button>
        </form>
      </template>

    </main>
  </div>
</template>

<script setup>
definePageMeta({ layout: false })

const password       = ref('')
const cert           = ref('')
const error          = ref('')
const loading        = ref(false)
const soulRegistered = ref(false)
const certAutoFilled = ref(false)
const mode           = ref('form')   // 'form' | 'biometric' | 'saving'
const nextUrl        = ref('/')
const hasSavedCreds  = ref(false)

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
      error.value = passkey.passkeyError.value || 'Biometrik fehlgeschlagen.'
      return
    }

    const saved = await creds.loadCreds(prf)
    if (!saved) {
      error.value = 'Zugangsdaten konnten nicht geladen werden. Bitte manuell anmelden.'
      creds.clearCreds()
      hasSavedCreds.value = false
      mode.value = 'form'
      return
    }

    const body = { password: saved.password }
    if (saved.cert) body.cert = saved.cert
    await $fetch('/api/gate-auth', { method: 'POST', body })
    doRedirect()
  } catch (e) {
    const err = e?.data?.error || ''
    if (err === 'invalid_cert' || err === 'gate_not_configured' || e?.status === 401) {
      error.value = 'Zugangsdaten abgelaufen. Bitte manuell anmelden.'
      creds.clearCreds()
      hasSavedCreds.value = false
      mode.value = 'form'
    } else {
      error.value = 'Verbindungsfehler. Bitte erneut versuchen.'
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
    if (soulRegistered.value && cert.value) payload.cert = cert.value.trim()

    await $fetch('/api/gate-auth', { method: 'POST', body: payload })

    const support = await passkey.checkPasskeySupport()
    if (support.supported && !creds.hasCreds.value) {
      mode.value = 'saving'
    } else {
      doRedirect()
    }
  } catch (e) {
    const msg = e?.data?.message || e?.data?.error || ''
    if (msg === 'cert_required') {
      error.value      = 'Soul-Cert erforderlich. Bitte Cert eingeben.'
      soulRegistered.value = true
    } else if (e?.data?.error === 'invalid_cert') {
      error.value = 'Soul-Cert ungültig. Nach einer Key-Rotation das neue Cert aus der heruntergeladenen sys.md verwenden oder das Cert-Feld leer lassen.'
    } else if (e?.data?.error === 'gate_not_configured') {
      error.value = 'Node nicht konfiguriert. init.sh erneut ausführen.'
    } else if (e?.status === 401) {
      error.value = 'Zugang verweigert. Bitte prüfe Passwort und Cert.'
    } else if (e?.status === 429) {
      error.value = 'Zu viele Versuche. Bitte warte einen Moment.'
    } else {
      error.value = 'Verbindungsfehler. Bitte erneut versuchen.'
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
      error.value = passkey.passkeyError.value || 'Biometrik nicht verfügbar.'
      return
    }
    await creds.saveCreds({ password: password.value, cert: cert.value }, prf)
    doRedirect()
  } catch {
    error.value = 'Speichern fehlgeschlagen.'
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
  font-size: 12px;
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
  font-size: 12px;
  color: var(--sys-err);
  border-left: 2px solid var(--sys-err);
  padding-left: 10px;
  line-height: 1.6;
  margin: 0;
}

.gate-hint {
  font-family: var(--sys-sans, sans-serif);
  font-size: 13px;
  color: var(--sys-fg-muted);
  line-height: 1.6;
  margin: 0;
}

.gate-bio-btn {
  width: 100%;
  justify-content: center;
  padding-top: 16px;
  padding-bottom: 16px;
  font-size: 16px;
}

.gate-link {
  background: none;
  border: none;
  padding: 0;
  font-family: var(--sys-mono);
  font-size: 12px;
  color: var(--sys-fg-muted);
  cursor: pointer;
  text-align: center;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.gate-link:hover {
  color: var(--sys-fg);
}
</style>
