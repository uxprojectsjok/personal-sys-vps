// useVaultServices.js – Singleton
// Autorisierte Dienste verwalten (add / list / revoke)

import { ref, watch } from 'vue'
import { useSoul } from './useSoul.js'

const services = ref([])
const loading  = ref(false)
const error    = ref(null)

let _watchSetup = false

export function useVaultServices() {
  const { soulToken } = useSoul()

  // Dienste der alten Soul leeren wenn Soul wechselt
  if (!_watchSetup) {
    _watchSetup = true
    watch(soulToken, (newToken, oldToken) => {
      if (oldToken && newToken !== oldToken) services.value = []
    })
  }

  async function fetchServices() {
    if (!soulToken.value) return
    loading.value = true
    error.value   = null
    try {
      const res = await fetch('/api/vault/services', {
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      if (!res.ok) { error.value = `HTTP ${res.status}`; return }
      const data = await res.json()
      services.value = data.services || []
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function addService(name, permissions, expiresDays = null) {
    error.value = null
    try {
      const res = await fetch('/api/vault/services', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${soulToken.value}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          permissions,
          expires_days: expiresDays
        })
      })
      if (!res.ok) { error.value = `HTTP ${res.status}`; return null }
      const data = await res.json()
      if (data.ok) await fetchServices()
      return data
    } catch (e) {
      error.value = e.message
    }
  }

  async function deleteVault() {
    error.value = null
    try {
      const res = await fetch('/api/vault', {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      return await res.json()
    } catch (e) {
      error.value = e.message
    }
  }

  async function revokeService(token) {
    error.value = null
    try {
      const res = await fetch(`/api/vault/services/${token}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      const data = await res.json()
      if (data.ok) await fetchServices()
      return data
    } catch (e) {
      error.value = e.message
    }
  }

  function formatExpiry(ts) {
    if (!ts) return 'Unbegrenzt'
    const d = new Date(ts * 1000)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  function formatDate(ts) {
    if (!ts) return '—'
    const d = new Date(ts * 1000)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return {
    services,
    loading,
    error,
    fetchServices,
    addService,
    revokeService,
    deleteVault,
    formatExpiry,
    formatDate
  }
}
