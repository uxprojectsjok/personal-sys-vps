// useGatekeeper.js
// Verwaltet das Wiring einer Soul mit einer Gatekeeper-Soul (siehe
// soul-mcp/server.mjs /mcp/discover/wire) — Konnektor-Bündelung für /mcp/discover.

import { ref } from 'vue'
import { useSoul } from './useSoul.js'

const wired   = ref([])
const loading = ref(false)
const error   = ref(null)

export function useGatekeeper() {
  const { soulToken } = useSoul()

  async function fetchWired() {
    if (!soulToken.value || soulToken.value === 'anonymous') return
    loading.value = true
    error.value   = null
    try {
      const res = await fetch('/mcp/discover/wired', {
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      if (!res.ok) { error.value = `HTTP ${res.status}`; return }
      const data = await res.json()
      wired.value = data.wired || []
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function wireToGatekeeper(gatekeeperSoulId, serviceToken, name = '') {
    error.value = null
    try {
      const res = await fetch('/mcp/discover/wire', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${soulToken.value}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ gatekeeper_soul_id: gatekeeperSoulId, service_token: serviceToken, name })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { error.value = data.error || `HTTP ${res.status}`; return null }
      return data
    } catch (e) {
      error.value = e.message
      return null
    }
  }

  async function unwireSoul(soulId) {
    error.value = null
    try {
      const res = await fetch(`/mcp/discover/wire/${encodeURIComponent(soulId)}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      const data = await res.json().catch(() => ({}))
      if (data.ok) await fetchWired()
      return data
    } catch (e) {
      error.value = e.message
    }
  }

  function formatDate(ts) {
    if (!ts) return '—'
    return new Date(ts * 1000).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return { wired, loading, error, fetchWired, wireToGatekeeper, unwireSoul, formatDate }
}
