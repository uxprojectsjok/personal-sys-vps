// useVaultSession.js – Singleton
// Vault entsperren/sperren, Session-Status verwalten
// Unterstützt optionalen Verschlüsselungs-Schlüssel (12 BIP39-Wörter → PBKDF2 → vault_key)

import { ref, computed, watch } from 'vue'
import { useSoul } from './useSoul.js'

const isUnlocked  = ref(false)
const expiresAt   = ref(null)   // Unix-Timestamp oder null
const isUnlimited = ref(false)
const loading     = ref(false)  // lock/unlock Operationen
const fetchingStatus = ref(false)  // fetchStatus-Operationen (getrennt um Kollision zu vermeiden)
const error       = ref(null)
const vaultKey    = ref('')     // 64-Hex-String (32 Byte), leer = kein Schlüssel

// Soul-Isolation: Singleton-Watch wird einmalig beim ersten Aufruf eingerichtet
let _watchSetup = false

// ── sessionStorage-Key für Vault-Key ────────────────────────────────────────
// Tab-scoped (wird beim Tab-Schließen gelöscht), nicht in localStorage.
function _ssKey(soulToken) {
  const soulId = soulToken?.split('.')[0] || 'unknown'
  return `sys_vk_${soulId}`
}

function _saveKeyToSession(soulToken, key) {
  try { sessionStorage.setItem(_ssKey(soulToken), key) } catch {}
}

function _loadKeyFromSession(soulToken) {
  try { return sessionStorage.getItem(_ssKey(soulToken)) || '' } catch { return '' }
}

function _clearKeyFromSession(soulToken) {
  try { sessionStorage.removeItem(_ssKey(soulToken)) } catch {}
}

function resetState(soulToken) {
  isUnlocked.value  = false
  expiresAt.value   = null
  isUnlimited.value = false
  error.value       = null
  vaultKey.value    = ''
  if (soulToken) _clearKeyFromSession(soulToken)
}

export function useVaultSession() {
  const { soulToken } = useSoul()

  // Einmalig Watch aufsetzen: bei Soul-Wechsel sofort zurücksetzen
  if (!_watchSetup) {
    _watchSetup = true
    watch(soulToken, (newToken, oldToken) => {
      if (newToken !== oldToken) {
        resetState(oldToken)
        // Frischen Status direkt laden wenn neue Soul aktiv
        if (newToken) {
          setTimeout(() => fetchStatus(), 100)
        }
      }
    })
  }

  // PBKDF2: 12 Wörter + soul_id → 32-Byte AES-256-Schlüssel (64-Hex-String)
  async function deriveVaultKey(mnemonic, soulId) {
    const enc = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(mnemonic.trim()), 'PBKDF2', false, ['deriveBits']
    )
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(soulId), iterations: 100000, hash: 'SHA-256' },
      keyMaterial, 256
    )
    return Array.from(new Uint8Array(bits))
      .map(b => b.toString(16).padStart(2, '0')).join('')
  }

  async function fetchStatus() {
    if (!soulToken.value) return
    if (fetchingStatus.value) return  // Doppel-Call verhindern
    fetchingStatus.value = true
    try {
      const res = await fetch('/api/vault/session', {
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      if (!res.ok) return
      const data = await res.json()
      isUnlocked.value  = data.unlocked  ?? false
      expiresAt.value   = data.expires_at ?? null
      isUnlimited.value = data.unlimited  ?? false
      // has_key: Server meldet ob Vault-Session verschlüsselt ist.
      // Schlüssel aus sessionStorage wiederherstellen wenn er noch nicht im Memory ist.
      if (data.has_key) {
        if (!vaultKey.value || vaultKey.value === '__encrypted__') {
          const stored = _loadKeyFromSession(soulToken.value)
          vaultKey.value = stored || '__encrypted__'
        }
      } else {
        vaultKey.value = ''
      }
    } catch {
    } finally {
      fetchingStatus.value = false
    }
  }

  // mnemonic: optionaler String mit 12 Leerzeichen-getrennten BIP39-Wörtern
  // precomputedKey: optionaler 64-char Hex-String (z.B. von Passkey abgeleitet)
  async function unlock(duration, mnemonic = '', precomputedKey = '') {
    loading.value = true
    error.value   = null
    try {
      let vault_key = ''
      if (precomputedKey) {
        vault_key      = precomputedKey
        vaultKey.value = vault_key
      } else if (mnemonic.trim()) {
        const soulId = soulToken.value.split('.')[0]
        vault_key = await deriveVaultKey(mnemonic, soulId)
        vaultKey.value = vault_key
      }

      const res = await fetch('/api/vault/unlock', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${soulToken.value}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ duration, vault_key })
      })
      const data = await res.json()
      if (data.ok) {
        isUnlocked.value  = true
        expiresAt.value   = data.expires_at ?? null
        isUnlimited.value = data.unlimited  ?? false
        // Key in sessionStorage sichern – überlebt Seiten-Reload innerhalb desselben Tabs
        if (vault_key) _saveKeyToSession(soulToken.value, vault_key)
      } else {
        error.value = data.error || 'Unbekannter Fehler'
        vaultKey.value = ''
      }
      return data
    } catch (e) {
      error.value = e.message
      vaultKey.value = ''
    } finally {
      loading.value = false
    }
  }

  async function lock() {
    loading.value = true
    error.value   = null
    try {
      const res = await fetch('/api/vault/lock', {
        method:  'POST',
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      const data = await res.json()
      if (data.ok) {
        isUnlocked.value  = false
        expiresAt.value   = null
        isUnlimited.value = false
        vaultKey.value    = ''
        _clearKeyFromSession(soulToken.value)
      }
      return data
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  const timeRemaining = computed(() => {
    if (!isUnlocked.value) return null
    if (isUnlimited.value) return 'Unbegrenzt'
    if (!expiresAt.value)  return null
    const diff = expiresAt.value - Math.floor(Date.now() / 1000)
    if (diff <= 0)      return null
    if (diff < 3600)    return `${Math.floor(diff / 60)} Min`
    if (diff < 86400)   return `${Math.floor(diff / 3600)} Std`
    if (diff < 2592000) return `${Math.floor(diff / 86400)} Tage`
    return `${Math.floor(diff / 2592000)} Monate`
  })

  return {
    isUnlocked,
    expiresAt,
    isUnlimited,
    loading,
    error,
    vaultKey,
    timeRemaining,
    fetchStatus,
    unlock,
    lock,
    deriveVaultKey
  }
}
