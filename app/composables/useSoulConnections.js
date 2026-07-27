// useSoulConnections.js
// Direkte Soul-zu-Soul-Verbindungen (gegenseitiges Einverständnis, cross-node) —
// siehe soul-mcp/server.mjs /mcp/connect*. Für jede Soul nutzbar, nicht nur
// Gatekeeper-Souls (anders als useGatekeeper.js's Föderations-Teil).

import { ref } from 'vue'
import { useSoul } from './useSoul.js'

const connections = ref([])
const error        = ref(null)

export function useSoulConnections() {
  const { soulToken } = useSoul()

  async function fetchConnections() {
    if (!soulToken.value || soulToken.value === 'anonymous') return
    try {
      const res = await fetch('/mcp/connections', {
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      if (!res.ok) { error.value = `HTTP ${res.status}`; return }
      const data = await res.json()
      connections.value = data.connections || []
    } catch (e) {
      error.value = e.message
    }
  }

  async function requestConnection(remoteSoulId, remoteNodeUrl, permissions, alias) {
    error.value = null
    try {
      const res = await fetch('/mcp/connect', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${soulToken.value}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ remote_soul_id: remoteSoulId, remote_node_url: remoteNodeUrl, permissions, alias })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { error.value = data.error || `HTTP ${res.status}`; return null }
      if (data.ok) await fetchConnections()
      return data
    } catch (e) {
      error.value = e.message
      return null
    }
  }

  async function acceptConnection(remoteSoulId, alias) {
    error.value = null
    try {
      const res = await fetch(`/mcp/connections/${encodeURIComponent(remoteSoulId)}/accept`, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${soulToken.value}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ alias })
      })
      const data = await res.json().catch(() => ({}))
      if (data.ok) await fetchConnections()
      return data
    } catch (e) {
      error.value = e.message
    }
  }

  async function removeConnection(remoteSoulId) {
    error.value = null
    try {
      const res = await fetch(`/mcp/connections/${encodeURIComponent(remoteSoulId)}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      const data = await res.json().catch(() => ({}))
      if (data.ok) await fetchConnections()
      return data
    } catch (e) {
      error.value = e.message
    }
  }

  function formatDate(ts) {
    if (!ts) return '—'
    return new Date(ts * 1000).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return {
    connections, error,
    fetchConnections, requestConnection, acceptConnection, removeConnection,
    formatDate,
  }
}
