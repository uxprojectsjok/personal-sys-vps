<template>
  <div class="gate">
    <div class="gate-card">
      <div class="gate-mark">SYS<span class="dot">.</span></div>
      <div class="gate-sub">Save Your Soul · Private Node</div>

      <!-- ── Biometric unlock ── -->
      <template v-if="mode === 'biometric'">
        <h1>Willkommen zurück<em>.</em></h1>
        <p class="welcome">{{ isPwa ? 'Entsperre mit Face ID oder Fingerabdruck.' : 'Gespeicherte Zugangsdaten vorhanden.' }}</p>
        <p v-if="error" class="gate-error">{{ error }}</p>
        <button class="btn btn-primary btn-lg" :disabled="loading" @click="biometricUnlock">
          <span v-if="loading" class="gate-spinner" />
          {{ loading ? 'Lade Soul…' : 'Entsperren' }}
          <SysIcon v-if="!loading" name="arrow" style="width:18px;height:18px" />
        </button>
        <button class="gate-link" @click="switchToForm">Manuell anmelden</button>
      </template>

      <!-- ── Save creds prompt ── -->
      <template v-else-if="mode === 'saving'">
        <h1>Angemeldet<em>.</em></h1>
        <p class="welcome">Zugangsdaten merken?</p>
        <p class="gate-hint">Passwort und Soul-Cert werden verschlüsselt auf diesem Gerät gespeichert – entsperrbar nur mit deiner Biometrik.</p>
        <p v-if="error" class="gate-error">{{ error }}</p>
        <button class="btn btn-primary btn-lg" :disabled="loading" @click="doSaveCreds">
          <span v-if="loading" class="gate-spinner" />
          {{ loading ? 'Speichert…' : 'Mit Biometrik speichern' }}
        </button>
        <button class="gate-link" @click="doRedirect">Überspringen</button>
      </template>

      <!-- ── Standard form ── -->
      <template v-else>
        <h1>Willkommen zurück<em>.</em></h1>
        <p class="welcome">Entsperre deinen Knoten, um mit deiner Seele zu sprechen.</p>
        <p v-if="error" class="gate-error">{{ error }}</p>
        <form @submit.prevent="submit" style="width:100%">
          <div class="gate-field">
            <input
              v-model="password"
              :type="showPw ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="Node-Passwort"
              aria-label="Node-Passwort"
              :disabled="loading"
              required
            />
            <button type="button" class="reveal" @click="showPw = !showPw" aria-label="Passwort anzeigen">
              <SysIcon :name="showPw ? 'eyeoff' : 'eye'" style="width:18px;height:18px" />
            </button>
          </div>
          <div v-if="soulRegistered" class="gate-field" style="margin-bottom:14px">
            <input
              v-model="cert"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="Soul-Cert (a1b2c3d4…)"
              aria-label="Soul-Cert"
              :disabled="loading"
              style="font-family:var(--mono);font-size:13px"
            />
          </div>
          <p v-if="certAutoFilled" class="gate-autofill">✓ Cert aus aktiver Session geladen</p>
          <button type="submit" class="btn btn-primary btn-lg" :disabled="loading">
            <span v-if="loading" class="gate-spinner" />
            {{ loading ? 'Lädt…' : 'Knoten entsperren' }}
            <SysIcon v-if="!loading" name="arrow" style="width:18px;height:18px" />
          </button>
        </form>
        <button v-if="hasSavedCreds" class="gate-link" @click="mode = 'biometric'">Mit Biometrik entsperren</button>
      </template>

      <div class="gate-foot">
        <span class="live-dot" />
        Lokaler Knoten · alles bleibt auf diesem Gerät
      </div>
    </div>
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
    const gateRes = await $fetch('/api/gate-auth', { method: 'POST', body })

    // Soul_id aus Antwort oder localStorage — dann Soul direkt vom Server laden
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
      } catch { /* silent — Fallback auf normalen Redirect */ }
    }

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

    const gateRes = await $fetch('/api/gate-auth', { method: 'POST', body: payload })

    // soul_id für späteren PWA-Auto-Login merken
    if (gateRes?.soul_id) localStorage.setItem(PWA_SOUL_KEY, gateRes.soul_id)

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
      error.value = 'Soul-Cert ungültig. Das Cert wurde geleert — einfach nur mit Passwort einloggen, danach im Admin-Tab ein neues ausstellen.'
      cert.value = ''
      certAutoFilled.value = false
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

const showPw = ref(false)
</script>

<style scoped>
.gate h1 em { font-style: italic; color: var(--accent-bright); }
.gate-error { font-size: 12px; color: var(--c-err, #e06c75); border-left: 2px solid currentColor; padding-left: 10px; line-height: 1.6; margin: 0 0 14px; text-align: left; }
.gate-hint { font-size: 13px; color: var(--fg-2); line-height: 1.6; margin: 0 0 14px; }
.gate-autofill { font-size: 12px; color: var(--accent); margin: -8px 0 12px; text-align: left; }
.gate-link { background: none; border: none; padding: 0; font-size: 12px; color: var(--fg-3); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; margin-top: 12px; }
.gate-link:hover { color: var(--fg); }
.gate-spinner { width: 14px; height: 14px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: gate-spin .7s linear infinite; display: inline-block; flex-shrink: 0; }
@keyframes gate-spin { to { transform: rotate(360deg); } }
</style>
