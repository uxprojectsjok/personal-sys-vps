<template>
  <div class="gate">
    <!-- Blanke Landing per Default (siehe gate-reveal-trigger-Kommentar unten) —
         der Login selbst bekommt keine Aufmerksamkeit, bis er gezielt aufgerufen
         wird. Nötig, weil diese Seite von außen verlinkt sein kann und dabei
         nicht wie ein Zugangspunkt aussehen soll. -->
    <button
      v-if="!revealed"
      class="gate-reveal-trigger"
      @click="revealed = true"
      :aria-label="$t('gate.owner_login_aria')"
      :title="$t('gate.owner_login_aria')"
    >
      <SysIcon name="arrow" style="width:14px;height:14px" />
    </button>

    <!-- Abbrechen: bei ?login=1 (direkt über den Landing-Header erreicht) zurück
         zur Landingpage — es gibt hier keine "blanke Gate-Landing" zu der man
         sonst zurückkehren würde. Sonst wie bisher zurück zur blanken Landing
         dieser Seite selbst (ohne das gäbe es, sobald einmal aufgeklappt,
         keinen Weg mehr zurück außer Reload). -->
    <button
      v-if="revealed"
      class="gate-close-trigger"
      @click="directLogin ? navigateTo('/') : (revealed = false)"
      :aria-label="$t('gate.close_aria')"
      :title="$t('gate.close_aria')"
    >
      <SysIcon name="close" style="width:16px;height:16px" />
    </button>

    <div class="gate-card">
      <Transition name="gate-reveal">
        <div v-if="revealed && ready" class="gate-panel">

          <!-- ── Biometric unlock ── -->
          <template v-if="mode === 'biometric'">
            <h1>{{ $t('gate.welcome_back') }}<em>.</em></h1>
            <p class="welcome">{{ isPwa ? $t('gate.biometric_prompt_pwa') : $t('gate.biometric_prompt') }}</p>
            <p v-if="error" class="gate-error">{{ error }}</p>

            <!-- Mehr als eine Soul mit gespeicherten Creds auf diesem Gerät: eigene
                 Auswahl statt der nativen OS-Auswahl (auf manchen Plattformen —
                 bestätigt Android Chrome — zeigt der Passkey-Prompt trotz mehrerer
                 allowCredentials keine eigene Auswahl, sondern wählt still eine
                 aus). Die Auswahl schränkt die Passkey-Anfrage direkt auf genau
                 diese eine Soul ein. -->
            <select
              v-if="pickableSoulIds.length > 1"
              v-model="chosenSoulId"
              class="gate-select"
              :disabled="loading"
            >
              <option v-for="id in pickableSoulIds" :key="id" :value="id">{{ id.slice(0, 8) }}…</option>
            </select>
            <button class="btn btn-primary btn-lg" :disabled="loading" @click="biometricUnlock(pickableSoulIds.length > 1 ? chosenSoulId : pickableSoulIds[0])">
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
            <button v-if="hasSavedCreds && !multiHoster" class="gate-link" @click="mode = 'biometric'">{{ $t('gate.unlock_with_biometric') }}</button>
          </template>

        </div>
      </Transition>
    </div>

    <div class="gate-legal-links">
      <NuxtLink to="/impressum">{{ $t('impressum.pageTitle') }}</NuxtLink>
      <span class="gate-legal-sep">·</span>
      <NuxtLink to="/datenschutz">{{ $t('datenschutz.pageTitle') }}</NuxtLink>
      <span class="gate-legal-sep">·</span>
      <NuxtLink to="/lizenz">{{ $t('lizenz.pageTitle') }}</NuxtLink>
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
const ready          = ref(false)   // true after gate-status known (prevents flicker)
const pickableSoulIds = ref([])   // known souls with saved creds on this device — see biometric picker in template
const chosenSoulId   = ref('')   // dropdown selection when pickableSoulIds.length > 1

const route = useRoute()
// ?login=1 (set by the landing header's Login link) skips the discreet reveal
// step — that page already announced "this is the login", no point hiding it
// again here. Anyone reaching /gate any other way still gets the default
// blank-landing-with-reveal-trigger privacy behavior, unchanged.
const directLogin = route.query.login === '1'
// Blanke "revealed erst nach Klick"-Landing bewusst deaktiviert (2026-07-29,
// Betreiber-Entscheidung für dieses Deployment) — das Formular soll direkt
// sichtbar sein, kein versteckter Reveal-Trigger nötig.
const revealed    = ref(true)

const PWA_SOUL_KEY = 'sys_pwa_soul_id'

const lastSoulId    = ref('')   // soul_id of last login (for biometric unlock)
const currentSoulId = ref('')   // soul_id from current submit (for saving creds)

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

  let selfRegistrationOpen = true
  let statusKnown = false
  try {
    const status = await $fetch('/api/gate-status')
    soulRegistered.value    = status.soul_registered ?? false
    multiHoster.value       = status.multi_hoster    ?? false
    selfRegistrationOpen    = status.self_registration !== false
    statusKnown = true
  } catch {
    soulRegistered.value = false
    // multiHoster.value intentionally left untouched here — it defaults to
    // false (ref(false)), which previously made a failed status fetch on a
    // real Multi-Hoster node silently fall into the single-hoster biometric
    // branch below (checking local WebAuthn creds against whatever soul_id
    // happens to be in localStorage) instead of correctly staying unknown.
    // statusKnown gates that branch now so a fetch failure fails safe.
  }

  // Multi-hoster with no soul yet → registration happens on /join, not here.
  // But only if /join can actually do anything — if self-registration is closed
  // (operator-only access-point node), /join immediately redirects back here,
  // which without this check bounced forever between /gate and /join.
  // replace() avoids adding /gate to history so the browser back button skips it.
  if (multiHoster.value && !soulRegistered.value && selfRegistrationOpen) {
    const next = nextUrl.value !== '/' ? `?next=${encodeURIComponent(nextUrl.value)}` : ''
    window.location.replace(`/join${next}`)
    return
  }

  if (soulRegistered.value) {
    const stored = sessionStorage.getItem('sys.soul_cert')
    if (stored && stored.length >= 20) {
      cert.value       = stored
      certAutoFilled.value = true
    }
  }

  // Biometric: verfügbar sobald IRGENDEINE auf diesem Gerät bekannte Soul
  // gespeicherte Creds hat — nicht mehr auf eine einzelne "letzte Soul"
  // beschränkt, und nicht mehr pauschal für Multi-Hoster ausgeschaltet.
  // Mehrere Souls auf demselben Gerät sind bereits pro-Soul sauber getrennt
  // gespeichert (useSoulPasskey/useSavedCreds); biometricUnlock() lässt das
  // Betriebssystem bei mehr als einer bekannten Soul selbst die native
  // Auswahl zeigen, statt hier zu raten, welche gemeint ist.
  // statusKnown guards against treating an unknown status (failed
  // /api/gate-status fetch) as "safe to offer biometric" by accident.
  if (statusKnown) {
    lastSoulId.value = localStorage.getItem(PWA_SOUL_KEY) || ''
    const knownSoulIds = passkey.getKnownSoulIds()
    pickableSoulIds.value = knownSoulIds.filter(id => creds.checkCreds(id))
    hasSavedCreds.value = pickableSoulIds.value.length > 0
    chosenSoulId.value = pickableSoulIds.value[0] || ''
    if (hasSavedCreds.value && soulRegistered.value) mode.value = 'biometric'
  }

  ready.value = true  // all checks done, safe to render
})

async function biometricUnlock(targetSoulId = null) {
  if (loading.value) return
  loading.value = true
  error.value   = ''
  try {
    // Gezielt auf die gewählte Soul eingeschränkt statt der vollen OS-Auswahl:
    // auf Android Chrome (bestätigt live) zeigt navigator.credentials.get()
    // trotz mehrerer allowCredentials-Einträge KEINE eigene Auswahl an — es
    // wählt still eines aus, ohne den Nutzer zu fragen. Die eigene Auswahl im
    // Template (pickableSoulIds) übernimmt die Entscheidung deshalb selbst
    // und übergibt hier direkt die gewünschte Soul.
    // Parameter bewusst NICHT "soulId" genannt — kollidiert sonst mit dem
    // weiter unten im selben try-Block deklarierten "const soulId" (JS hebt
    // die Deklaration an den Blockanfang, jeder frühere Zugriff wirft "Cannot
    // access before initialization" — live so aufgetreten).
    const prf = await passkey.authenticatePasskey(null, null, targetSoulId)
    if (!prf) {
      // WebAuthn deliberately can't distinguish "user declined" from "no matching
      // credential exists anymore" (e.g. deleted from the OS/Google Password Manager
      // outside this app) — both surface as the same generic failure. Clearing the
      // stale saved-creds blob and dropping to the manual form either way is the
      // safe default: worst case a declined-by-accident login redoes passkey setup
      // once more, but a genuinely deleted passkey no longer leaves the user stuck
      // with no way to ever be re-offered passkey registration (submit() below only
      // offers it when hasCreds is false).
      error.value = passkey.passkeyError.value || t('gate.error.biometric_failed')
      if (targetSoulId || lastSoulId.value) creds.clearCreds(targetSoulId || lastSoulId.value)
      hasSavedCreds.value = false
      mode.value = 'form'
      return
    }

    const resolvedSoulId = targetSoulId || passkey.soulIdForCredential(passkey.lastUsedCredentialId.value) || lastSoulId.value
    lastSoulId.value = resolvedSoulId

    const saved = await creds.loadCreds(prf, resolvedSoulId)
    if (!saved) {
      error.value = t('gate.error.creds_load_failed')
      creds.clearCreds(resolvedSoulId)
      hasSavedCreds.value = false
      mode.value = 'form'
      return
    }

    const body = { password: saved.password }
    if (saved.cert) body.cert = saved.cert
    const gateRes = await $fetch('/api/gate-auth', { method: 'POST', body })

    const soulId = gateRes?.soul_id || localStorage.getItem(PWA_SOUL_KEY) || ''
    if (soulId) localStorage.setItem(PWA_SOUL_KEY, soulId)
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
    // invalid_credentials = stale saved PASSWORD (gate_auth.lua's exact error
    // code on a password mismatch) — previously only invalid_cert was
    // handled here, so a stale password silently fell through to the generic
    // "connection error" message instead of clearing the stale blob.
    const err = e?.data?.error || ''
    if (err === 'invalid_cert' || err === 'invalid_credentials' || err === 'gate_not_configured' || e?.status === 401) {
      error.value = t('gate.error.cert_expired')
      creds.clearCreds(targetSoulId || lastSoulId.value)
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

    if (gateRes?.soul_id) {
      localStorage.setItem(PWA_SOUL_KEY, gateRes.soul_id)
      currentSoulId.value = gateRes.soul_id
      creds.initForSoul(gateRes.soul_id)
    }
    // Set on ANY successful gate-auth, not just invite_login: a matched-cert
    // login (existing soul, gateRes.soul_id set) lands here with the exact
    // same problem — this browser has no local sys.md (hasSoul false), so
    // without this flag index.vue's auto-open never triggers and the user is
    // stuck on the bare marketing landing with no visible way to load their
    // soul. Harmless when unneeded: index.vue only acts on it while
    // !hasSoul.value, i.e. exactly when there's actually nothing loaded yet.
    sessionStorage.setItem('sys.invite_login', '1')

    // Biometrics ist an eine soul_id gebunden (creds.initForSoul/authenticateOrRegister
    // brauchen currentSoulId) — ohne gebundene Soul (Invite-Login auf einem frischen
    // Multi-Hoster-Node, bound_soul_id noch leer) gibt es nichts, woran Credentials
    // hängen könnten. Erst per sys.md (Login with Soul) identifizieren, danach ist
    // Biometrie beim nächsten regulären Login mit Cert sinnvoll.
    const support = await passkey.checkPasskeySupport()
    // creds.hasCreds prüft nur, ob lokal ein verschlüsselter Passwort-Blob
    // liegt — nicht, ob der zugehörige Passkey im OS/Kontenmanager noch
    // existiert. Ohne den zusätzlichen hasCredentialFor-Check bleibt der
    // Save-Prompt nach einem manuell außerhalb der App gelöschten Passkey
    // dauerhaft aus (hasCreds.value bleibt true, obwohl nichts mehr da ist,
    // das den Blob je wieder entschlüsseln könnte).
    const needsPasskeySetup = !creds.hasCreds.value || !passkey.hasCredentialFor(gateRes?.soul_id)
    if (gateRes?.soul_id && support.supported && needsPasskeySetup) {
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
    // authenticateOrRegister self-heals a stale hasPasskey (localStorage still
    // lists a credential ID that was deleted outside the app, e.g. via the OS/
    // Google Password Manager) by falling back to registration instead of
    // failing forever on an authenticate attempt with nothing to authenticate.
    // Auf Multi-Hoster teilen sich alle Souls denselben RP_ID (Hostname) — ohne
    // eine soul-spezifische Kennung im Anzeigenamen sind ihre Passkeys in
    // Windows Hello/dem Passwortmanager alle identisch "Soul · <host>" und
    // nicht unterscheidbar. Kurzes soul_id-Präfix statt des generischen Literals.
    const prf = await passkey.authenticateOrRegister(currentSoulId.value ? currentSoulId.value.slice(0, 8) : 'Soul', () => ({
      Authorization: `Bearer ${currentSoulId.value}.${cert.value}`,
      'Content-Type': 'application/json',
    }), currentSoulId.value)
    if (!prf) {
      error.value = passkey.passkeyError.value || t('gate.error.biometric_unavailable')
      return
    }
    await creds.saveCreds({ password: password.value, cert: cert.value }, prf, currentSoulId.value)
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
.gate-select {
  width: 100%; margin-bottom: 14px; padding: 12px 14px; border-radius: 8px;
  border: 1px solid var(--line-2, rgba(0,0,0,0.15)); background: var(--surface, #fff);
  color: var(--fg, #111); font-size: 15px; font-family: inherit;
}
.gate-hint { font-size: 13px; color: var(--fg-2); line-height: 1.6; margin: 0 0 14px; }
.gate-autofill { font-size: 12px; color: var(--accent); margin: -8px 0 12px; text-align: left; }
.gate-link { background: none; border: none; padding: 0; font-size: 15px; color: var(--fg); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; margin-top: 12px; }
.gate-link:hover { color: var(--accent-bright); }
.gate-spinner { width: 14px; height: 14px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: gate-spin .7s linear infinite; display: inline-block; flex-shrink: 0; }
@keyframes gate-spin { to { transform: rotate(360deg); } }

/* Dezenter Login-Trigger: kein Text, kein Rahmen, keine auffällige Fläche —
   aber in derselben Helligkeit wie der restliche Seiteninhalt (var(--fg),
   volle Deckkraft), damit er für den Betreiber tatsächlich gut auffindbar
   bleibt. "Dezent" kommt hier ausschließlich aus Größe + fehlendem Label,
   nicht aus reduziertem Kontrast — eine zu dunkle Version war live kaum
   noch zu erkennen. */
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

.gate-legal-links {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: nowrap;
  font-family: var(--mono); font-size: 15px; letter-spacing: 0.04em;
  z-index: 15;
  max-width: calc(100vw - 32px); overflow-x: auto; white-space: nowrap;
  -webkit-overflow-scrolling: touch; scrollbar-width: none;
}
.gate-legal-links::-webkit-scrollbar { display: none; }
.gate-legal-links a { color: var(--fg-3); text-decoration: none; flex: none; }
.gate-legal-links a:hover { color: var(--fg); text-decoration: underline; }
.gate-legal-sep { color: var(--line-2); }

@media (max-width: 640px) {
  .gate-legal-links {
    flex-direction: column; gap: 6px; bottom: 16px;
    max-width: calc(100vw - 32px); overflow-x: visible; white-space: normal;
  }
  .gate-legal-sep { display: none; }
}
</style>
