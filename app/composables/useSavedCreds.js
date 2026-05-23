// app/composables/useSavedCreds.js
// Speichert Node-Passwort + Soul-Cert AES-GCM-verschlüsselt via WebAuthn-PRF.
import { ref } from 'vue'

const STORAGE_KEY = 'sys_saved_creds'
const SALT        = 'sys-gate-creds-v1'

async function deriveKey(prfOutput, usage) {
  const enc = new TextEncoder()
  const km  = await crypto.subtle.importKey('raw', prfOutput, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(SALT), iterations: 100_000, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  )
}

export function useSavedCreds() {
  const hasCreds = ref(
    import.meta.client ? !!localStorage.getItem(STORAGE_KEY) : false
  )

  async function saveCreds({ password, cert }, prfOutput) {
    const iv  = crypto.getRandomValues(new Uint8Array(12))
    const key = await deriveKey(prfOutput, 'encrypt')
    const enc = new TextEncoder()
    const buf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(JSON.stringify({ password, cert }))
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      iv:   Array.from(iv),
      data: Array.from(new Uint8Array(buf)),
    }))
    hasCreds.value = true
  }

  async function loadCreds(prfOutput) {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    try {
      const { iv, data } = JSON.parse(raw)
      const key = await deriveKey(prfOutput, 'decrypt')
      const buf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        key,
        new Uint8Array(data)
      )
      return JSON.parse(new TextDecoder().decode(buf))
    } catch {
      return null
    }
  }

  async function updateCert(newCert, prfOutput) {
    const saved = await loadCreds(prfOutput)
    if (!saved) return false
    await saveCreds({ password: saved.password, cert: newCert }, prfOutput)
    return true
  }

  function clearCreds() {
    localStorage.removeItem(STORAGE_KEY)
    hasCreds.value = false
  }

  return { hasCreds, saveCreds, loadCreds, updateCert, clearCreds }
}
