// app/composables/useSoulPasskey.js
// Passkey (WebAuthn + PRF-Extension) als Soul-Schlüsselquelle.
//
// Prinzip:
//   WebAuthn Passkeys sind der Browser-Standard für hardware-gesicherte Authentifizierung
//   ohne Passwort — exakt das was G-Pay / Apple Pay / Face ID unter der Haube nutzen.
//   Die PRF-Extension (Pseudo-Random Function) liefert deterministisches Schlüsselmaterial
//   direkt aus dem Secure Enclave des Geräts — ohne dass der private Key jemals das Gerät verlässt.
//
//   iOS:     Face ID / Touch ID → iCloud Keychain (geräteübergreifend sync)
//   Android: Fingerprint / Face → Google Password Manager (geräteübergreifend sync)
//   Desktop: Windows Hello, Touch ID, YubiKey, Trezor (als FIDO2-Gerät)
//
// Kompatibilität:
//   Das erzeugte .soul-Bundle ist 100% kompatibel mit useSoulEncrypt.js —
//   nur die Schlüsselquelle ändert sich.
//
//   WebAuthn PRF-Support:
//   Chrome 116+, Safari 16.4+, Edge 116+, Firefox (ab 119 experimentell)
//   Auf iOS: Safari 16.4+, Chrome iOS (via iCloud Keychain)

import { ref } from 'vue'

// ── Konstanten ─────────────────────────────────────────────────────────────────

// Salt für PRF-Evaluation — nie ändern, sonst ändert sich der Key
const PRF_SALT_STRING = 'SaveYourSoul-v1-key-derivation'

// PBKDF2-Parameter — identisch mit useSoulEncrypt.js
const PBKDF2_SALT       = 'SaveYourSoul-v1'
const PBKDF2_ITERATIONS = 100_000

// Relying Party (muss zur Domain passen)
const RP_ID   = typeof window !== 'undefined' ? window.location.hostname : 'YOUR_DOMAIN'
const RP_NAME = 'SaveYourSoul'

// localStorage-Key für gespeicherte Credential-IDs
const STORAGE_KEY = 'sys_passkey_credential_ids'

// ── Hilfsfunktionen ────────────────────────────────────────────────────────────

function strToBuffer(str) {
  return new TextEncoder().encode(str)
}

function base64ToBuffer(b64) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

function bufferToBase64url(buf) {
  const bytes = new Uint8Array(buf)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Prüft ob der Browser WebAuthn + PRF-Extension unterstützt.
 */
export async function checkPasskeySupport() {
  if (typeof window === 'undefined') return { supported: false, reason: 'Kein Browser' }
  if (!window.PublicKeyCredential) return { supported: false, reason: 'WebAuthn nicht verfügbar' }

  // PRF-Extension-Check (nur in neueren Browsern)
  const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.()
  if (!available) return { supported: false, reason: 'Kein Plattform-Authenticator (Face ID, Fingerabdruck, Windows Hello)' }

  return { supported: true }
}

/**
 * Leitet AES-256-GCM-Key aus PRF-Output ab.
 * PBKDF2-Parameter identisch mit useSoulEncrypt.deriveKey.
 */
async function deriveKeyFromPRF(prfOutput, usage) {
  const enc         = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    prfOutput,              // 32-Byte ArrayBuffer vom PRF
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name:       'PBKDF2',
      salt:       enc.encode(PBKDF2_SALT),
      iterations: PBKDF2_ITERATIONS,
      hash:       'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  )
}

// ── Gespeicherte Credential-IDs ────────────────────────────────────────────────

function getSavedCredentialIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveCredentialId(id) {
  const ids = getSavedCredentialIds()
  if (!ids.includes(id)) {
    ids.push(id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  }
}

// ── Composable ─────────────────────────────────────────────────────────────────

export function useSoulPasskey() {
  const isRegistering  = ref(false)
  const isAuthenticating = ref(false)
  const passkeyError   = ref(null)
  const hasPasskey     = ref(getSavedCredentialIds().length > 0)
  const prfOutput      = ref(null)  // ArrayBuffer — temporär im Memory, nie persistiert

  /**
   * Passkey erstellen (einmalig, beim ersten Verschlüsseln).
   * Nutzer wird via Face ID / Fingerabdruck / Windows Hello bestätigen.
   *
   * @param {string} username  – Anzeigename (z.B. Soul-Name)
   * @returns {Promise<ArrayBuffer|null>}  PRF-Output oder null bei Fehler
   */
  async function registerPasskey(username = 'Soul') {
    isRegistering.value  = true
    passkeyError.value   = null

    try {
      const userId    = crypto.getRandomValues(new Uint8Array(16))
      const challenge = crypto.getRandomValues(new Uint8Array(32))
      const prfSalt   = strToBuffer(PRF_SALT_STRING)

      const credential = await navigator.credentials.create({
        publicKey: {
          rp:      { id: RP_ID, name: RP_NAME },
          user:    { id: userId, name: username, displayName: username },
          challenge,
          pubKeyCredParams: [
            { type: 'public-key', alg: -7  },   // ES256 (bevorzugt)
            { type: 'public-key', alg: -257 },   // RS256 (Fallback)
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',   // Nur Gerät-eigene Authenticatoren (Face ID, Fingerabdruck, Windows Hello)
            residentKey:             'preferred',  // Passkey bevorzugt, aber nicht erzwungen (Fallback für ältere Browser)
            userVerification:        'required',   // Biometrik oder Gerätesperre erzwingen
          },
          extensions: {
            prf: {
              eval: { first: prfSalt },            // PRF-Evaluation beim Registrieren
            },
          },
          timeout: 60_000,
        },
      })

      if (!credential) { passkeyError.value = 'Passkey-Erstellung abgebrochen.'; return null }

      // Credential-ID für späteres Authenticate speichern
      const credId = bufferToBase64url(credential.rawId)
      saveCredentialId(credId)
      hasPasskey.value = true

      // PRF-Output aus Registration (falls verfügbar — nicht alle Browser liefern ihn)
      const prfResult = credential.getClientExtensionResults?.()?.prf?.results?.first
      if (prfResult) {
        prfOutput.value = prfResult
        return prfResult
      }

      // Browser liefert PRF nicht bei Registration → sofort authenticate
      return await authenticatePasskey()

    } catch (e) {
      if (e.name === 'NotAllowedError') {
        passkeyError.value = 'Biometrik-Bestätigung abgelehnt oder abgebrochen.'
      } else if (e.name === 'NotSupportedError') {
        passkeyError.value = 'Dieser Browser unterstützt keine Passkeys mit PRF-Extension.'
      } else {
        passkeyError.value = e.message ?? 'Passkey-Fehler.'
      }
      return null
    } finally {
      isRegistering.value = false
    }
  }

  /**
   * Vorhandenen Passkey nutzen (für Entschlüsseln / erneutes Verschlüsseln).
   * Nutzer bestätigt via Face ID / Fingerabdruck / Windows Hello.
   *
   * @returns {Promise<ArrayBuffer|null>}  PRF-Output oder null bei Fehler
   */
  async function authenticatePasskey() {
    isAuthenticating.value = true
    passkeyError.value     = null

    try {
      const challenge   = crypto.getRandomValues(new Uint8Array(32))
      const prfSalt     = strToBuffer(PRF_SALT_STRING)
      const savedIds    = getSavedCredentialIds()
      const allowCreds  = savedIds.map(id => ({
        type:       'public-key',
        id:         base64ToBuffer(id),
        transports: ['internal', 'hybrid'],
      }))

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId:            RP_ID,
          allowCredentials: allowCreds.length > 0 ? allowCreds : undefined,
          userVerification: 'required',
          extensions: {
            prf: {
              eval: { first: prfSalt },
            },
          },
          timeout: 60_000,
        },
      })

      if (!assertion) { passkeyError.value = 'Authentifizierung abgebrochen.'; return null }

      const prfResult = assertion.getClientExtensionResults?.()?.prf?.results?.first
      if (!prfResult) {
        passkeyError.value = 'Dieser Browser unterstützt die PRF-Extension nicht. ' +
          'Bitte Chrome 116+ oder Safari 16.4+ verwenden.'
        return null
      }

      prfOutput.value = prfResult
      return prfResult

    } catch (e) {
      if (e.name === 'NotAllowedError') {
        passkeyError.value = 'Biometrik-Bestätigung abgelehnt oder abgebrochen.'
      } else {
        passkeyError.value = e.message ?? 'Authentifizierung fehlgeschlagen.'
      }
      return null
    } finally {
      isAuthenticating.value = false
    }
  }

  /**
   * AES-256-GCM-Key für Verschlüsselung.
   * Erstellt Passkey wenn noch keiner vorhanden, sonst authenticate.
   */
  async function getEncryptKey(username) {
    let prf = prfOutput.value
    if (!prf) {
      prf = hasPasskey.value
        ? await authenticatePasskey()
        : await registerPasskey(username)
    }
    if (!prf) return null
    return deriveKeyFromPRF(prf, 'encrypt')
  }

  /**
   * Leitet vault_key (64-char Hex) aus PRF-Output ab — kompatibel mit VPS vault_auth.lua.
   * Gleicher Output wie useVaultSession.deriveVaultKey(mnemonic, soulId),
   * nur andere Eingabe: PRF statt Mnemonic.
   * @param {ArrayBuffer} prf  PRF-Output aus authenticatePasskey()
   * @returns {Promise<string>}  64-char Hex-String
   */
  async function deriveVaultKeyHex(prf) {
    const enc = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey('raw', prf, 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode('SaveYourSoul-vault-v1'), iterations: 100_000, hash: 'SHA-256' },
      keyMaterial, 256
    )
    return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * AES-256-GCM-Key für Entschlüsselung.
   */
  async function getDecryptKey() {
    let prf = prfOutput.value
    if (!prf) prf = await authenticatePasskey()
    if (!prf) return null
    return deriveKeyFromPRF(prf, 'decrypt')
  }

  /** PRF-Output aus Memory löschen — Nutzer muss erneut biometrisch bestätigen */
  function clearPRF() {
    prfOutput.value = null
  }

  return {
    isRegistering,
    isAuthenticating,
    passkeyError,
    hasPasskey,
    // Methoden
    registerPasskey,
    authenticatePasskey,
    getEncryptKey,
    getDecryptKey,
    deriveVaultKeyHex,
    clearPRF,
    checkPasskeySupport,
  }
}
