// app/composables/useSavedCreds.js
// Speichert Node-Passwort + Soul-Cert AES-GCM-verschlüsselt via WebAuthn-PRF.
// Storage key ist pro Soul: sys_saved_creds_<soul_id>
import { ref } from 'vue'

const SALT = 'sys-gate-creds-v1'

function storageKey(soulId = '') {
  return soulId ? `sys_saved_creds_${soulId}` : 'sys_saved_creds'
}

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
  const hasCreds = ref(false)

  function checkCreds(soulId = '') {
    if (!import.meta.client || !soulId) return false
    return !!localStorage.getItem(storageKey(soulId))
  }

  function initForSoul(soulId = '') {
    hasCreds.value = checkCreds(soulId)
  }

  async function saveCreds({ password, cert }, prfOutput, soulId = '') {
    const iv  = crypto.getRandomValues(new Uint8Array(12))
    const key = await deriveKey(prfOutput, 'encrypt')
    const enc = new TextEncoder()
    const buf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(JSON.stringify({ password, cert }))
    )
    localStorage.setItem(storageKey(soulId), JSON.stringify({
      iv:   Array.from(iv),
      data: Array.from(new Uint8Array(buf)),
    }))
    hasCreds.value = true
  }

  async function loadCreds(prfOutput, soulId = '') {
    const raw = localStorage.getItem(storageKey(soulId))
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

  async function updateCert(newCert, prfOutput, soulId = '') {
    const saved = await loadCreds(prfOutput, soulId)
    if (!saved) return false
    await saveCreds({ password: saved.password, cert: newCert }, prfOutput, soulId)
    return true
  }

  function clearCreds(soulId = '') {
    localStorage.removeItem(storageKey(soulId))
    hasCreds.value = false
  }

  return { hasCreds, initForSoul, saveCreds, loadCreds, updateCert, clearCreds }
}
