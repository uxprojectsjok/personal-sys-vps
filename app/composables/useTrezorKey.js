// app/composables/useTrezorKey.js
// Leitet den Soul-Verschlüsselungsschlüssel aus einer Trezor-Signatur ab.
//
// Prinzip:
//   Trezor signiert deterministisch eine feste Nachricht ("SaveYourSoul-v1-key-derivation").
//   Die Signatur (64 Byte, hex) wird als Passwort für PBKDF2 verwendet —
//   exakt wie die 12 Wörter in useSoulEncrypt.js, nur dass der Schlüssel
//   im Hardware-Gerät gespeichert ist und nie extrahiert werden kann.
//
//   Gleicher Trezor + gleiche Derivation-Message = immer gleiche Signatur = immer gleicher Key.
//   Trezor verloren + Recovery-Seed = Trezor wiederherstellbar = Signatur reproduzierbar = Soul entschlüsselbar.
//
// Kompatibilität:
//   Das erzeugte Bundle ist 100% kompatibel mit dem bestehenden .soul-Format.
//   useSoulEncrypt.js und useSoulDecrypt.js funktionieren unverändert —
//   nur die Schlüsselquelle ändert sich.
//
// Trezor SDK:
//   Verwendet @trezor/connect-web (CDN-fähig, kein npm-Build-Step nötig).
//   Fallback: TrezorConnect über iframe (connect.trezor.io) — funktioniert ohne Installation.

import { ref } from 'vue'

// ── Konstanten ─────────────────────────────────────────────────────────────────

// Diese Nachricht wird immer signiert — nie ändern, sonst ändert sich der Key.
const DERIVATION_MESSAGE = 'SaveYourSoul-v1-key-derivation'

// Ethereum HD-Pfad für Signing (Standard Account 0)
const ETH_PATH = "m/44'/60'/0'/0/0"

// PBKDF2-Parameter — identisch mit useSoulEncrypt.js
const PBKDF2_SALT       = 'SaveYourSoul-v1'
const PBKDF2_ITERATIONS = 100_000

// ── Trezor Connect laden (lazy, einmalig) ──────────────────────────────────────

let _trezorConnectLoaded = false

async function loadTrezorConnect() {
  if (_trezorConnectLoaded) return
  if (typeof window === 'undefined') throw new Error('Nur im Browser verfügbar.')

  // TrezorConnect via offizielles CDN — kein npm nötig
  await new Promise((resolve, reject) => {
    if (window.TrezorConnect) { _trezorConnectLoaded = true; resolve(); return }
    const script = document.createElement('script')
    script.src = 'https://connect.trezor.io/9/trezor-connect.js'
    script.onload  = () => { _trezorConnectLoaded = true; resolve() }
    script.onerror = () => reject(new Error('TrezorConnect konnte nicht geladen werden.'))
    document.head.appendChild(script)
  })

  // Einmalige Initialisierung — WebUSB direkt, kein Bridge-Daemon nötig
  await window.TrezorConnect.init({
    lazyLoad:   true,
    transports: ['WebUsbTransport'],   // kein 127.0.0.1 Bridge → kein Chrome PNA-Block
    manifest: {
      email:     'soul@YOUR_DOMAIN',
      appUrl:    'https://YOUR_DOMAIN',
    },
  })
}

// ── Key-Derivation aus Signatur ────────────────────────────────────────────────

/**
 * Leitet einen AES-256-GCM-Schlüssel aus der Trezor-Signatur ab.
 * PBKDF2-Parameter identisch mit useSoulEncrypt.deriveKey —
 * das .soul-Bundle bleibt vollständig kompatibel.
 *
 * @param {string} signatureHex  – 130-Zeichen-Hex-String (0x + 65 Byte: r + s + v)
 * @param {'encrypt'|'decrypt'} usage
 * @returns {Promise<CryptoKey>}
 */
async function deriveKeyFromSignature(signatureHex, usage) {
  const enc         = new TextEncoder()
  // Hex → Bytes als UTF-8-String (gleiche Methode wie mnemonic join(" "))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(signatureHex),
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

// ── Composable ─────────────────────────────────────────────────────────────────

export function useTrezorKey() {
  const isConnecting   = ref(false)
  const isSigning      = ref(false)
  const trezorError    = ref(null)
  const trezorAddress  = ref(null)   // Ethereum-Adresse des verbundenen Trezors
  const signatureHex   = ref(null)   // Signatur — temporär im Memory, nie persistiert

  /**
   * Fordert den Trezor auf, die Derivation-Message zu signieren.
   * Zeigt auf dem Trezor-Display die Nachricht und wartet auf physische Bestätigung.
   *
   * @returns {Promise<string|null>}  signatureHex oder null bei Fehler
   */
  async function requestSignature() {
    isSigning.value   = true
    trezorError.value = null

    try {
      await loadTrezorConnect()

      const result = await window.TrezorConnect.ethereumSignMessage({
        path:    ETH_PATH,
        message: DERIVATION_MESSAGE,
        hex:     false,
      })

      if (!result.success) {
        trezorError.value = result.payload?.error ?? 'Trezor hat die Anfrage abgelehnt.'
        return null
      }

      trezorAddress.value = result.payload.address
      signatureHex.value  = result.payload.signature   // hex ohne 0x-Prefix
      return signatureHex.value

    } catch (e) {
      trezorError.value = e.message ?? 'Trezor nicht erreichbar.'
      return null
    } finally {
      isSigning.value = false
    }
  }

  /**
   * Gibt den AES-256-GCM-Schlüssel für Verschlüsselung zurück.
   * Fordert Trezor-Signatur an falls noch nicht vorhanden.
   *
   * @returns {Promise<CryptoKey|null>}
   */
  async function getEncryptKey() {
    const sig = signatureHex.value ?? await requestSignature()
    if (!sig) return null
    return deriveKeyFromSignature(sig, 'encrypt')
  }

  /**
   * Gibt den AES-256-GCM-Schlüssel für Entschlüsselung zurück.
   * Fordert Trezor-Signatur an falls noch nicht vorhanden.
   *
   * @returns {Promise<CryptoKey|null>}
   */
  async function getDecryptKey() {
    const sig = signatureHex.value ?? await requestSignature()
    if (!sig) return null
    return deriveKeyFromSignature(sig, 'decrypt')
  }

  /**
   * Signatur aus Memory löschen — z.B. nach Vault-Lock.
   * Der Trezor muss beim nächsten Zugriff erneut physisch bestätigen.
   */
  function clearSignature() {
    signatureHex.value = null
  }

  /**
   * Gibt zurück ob eine aktive Signatur im Memory liegt.
   */
  const hasSignature = () => !!signatureHex.value

  return {
    isConnecting,
    isSigning,
    trezorError,
    trezorAddress,
    // Methoden
    requestSignature,
    getEncryptKey,
    getDecryptKey,
    clearSignature,
    hasSignature,
    // Konstante für UI-Anzeige
    DERIVATION_MESSAGE,
  }
}
