// useGatekeeper.js
// Verwaltet das Wiring einer Soul mit einer Gatekeeper-Soul (siehe
// soul-mcp/server.mjs /mcp/discover/wire) — Konnektor-Bündelung für /mcp/discover.

import { ref } from 'vue'
import { useSoul } from './useSoul.js'

const wired            = ref([])
const wiredTo          = ref([])
const federated        = ref([])
const loading          = ref(false)
const error            = ref(null)
const gatekeeperEnabled = ref(true) // Server-Default ist ebenfalls true, siehe wired_souls.mjs

export function useGatekeeper() {
  const { soulToken } = useSoul()

  async function fetchGatekeeperEnabled() {
    if (!soulToken.value || soulToken.value === 'anonymous') return
    try {
      const res = await fetch('/mcp/discover/gatekeeper-config', {
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      if (!res.ok) return
      const data = await res.json()
      gatekeeperEnabled.value = data.enabled !== false
    } catch (e) {
      error.value = e.message
    }
  }

  async function setGatekeeperEnabled(enabled) {
    error.value = null
    try {
      const res = await fetch('/mcp/discover/gatekeeper-config', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${soulToken.value}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled })
      })
      const data = await res.json().catch(() => ({}))
      if (data.ok) gatekeeperEnabled.value = enabled
      return data
    } catch (e) {
      error.value = e.message
    }
  }

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

  async function fetchWiredTo() {
    if (!soulToken.value || soulToken.value === 'anonymous') return
    try {
      const res = await fetch('/mcp/discover/wired-to', {
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      if (!res.ok) { error.value = `HTTP ${res.status}`; return }
      const data = await res.json()
      wiredTo.value = data.wired_to || []
    } catch (e) {
      error.value = e.message
    }
  }

  async function disconnectFromGatekeeper(gatekeeperSoulId) {
    error.value = null
    try {
      const res = await fetch(`/mcp/discover/wired-to/${encodeURIComponent(gatekeeperSoulId)}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      const data = await res.json().catch(() => ({}))
      if (data.ok) await fetchWiredTo()
      return data
    } catch (e) {
      error.value = e.message
    }
  }

  // gatekeeperNodeUrl = wo der GATEKEEPER lebt (leer = derselbe Node wie ich).
  // /mcp/discover/wire prüft gatekeeper_soul_id immer LOKAL auf dem Node, der
  // den Request bekommt — der Request muss also beim Cross-Node-Wire an den
  // Gatekeeper-Node gehen, nicht (wie zuvor, ein echter Bug) immer relativ an
  // die eigene Origin. Die eigene Herkunft (body.node_url, für die serverseitige
  // Cert-Fernverifikation) kennt der Browser selbst (window.location.origin) —
  // dafür muss niemand die eigene Adresse manuell eintippen.
  async function wireToGatekeeper(gatekeeperSoulId, serviceToken, name = '', gatekeeperNodeUrl = '') {
    error.value = null
    try {
      const target = gatekeeperNodeUrl.trim().replace(/\/$/, '')
      const body = { gatekeeper_soul_id: gatekeeperSoulId, service_token: serviceToken, name }
      if (target) body.node_url = window.location.origin
      const url = target ? `${target}/mcp/discover/wire` : '/mcp/discover/wire'
      const res = await fetch(url, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${soulToken.value}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { error.value = data.error || `HTTP ${res.status}`; return null }
      return data
    } catch (e) {
      error.value = e.message
      return null
    }
  }

  async function fetchFederated() {
    if (!soulToken.value || soulToken.value === 'anonymous') return
    try {
      const res = await fetch('/mcp/discover/federated', {
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      if (!res.ok) { error.value = `HTTP ${res.status}`; return }
      const data = await res.json()
      federated.value = data.federated || []
    } catch (e) {
      error.value = e.message
    }
  }

  async function requestFederation(remoteSoulId, remoteNodeUrl) {
    error.value = null
    try {
      const res = await fetch('/mcp/discover/federate', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${soulToken.value}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ remote_soul_id: remoteSoulId, remote_node_url: remoteNodeUrl })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { error.value = data.error || `HTTP ${res.status}`; return null }
      if (data.ok) await fetchFederated()
      return data
    } catch (e) {
      error.value = e.message
      return null
    }
  }

  async function acceptFederation(remoteSoulId) {
    error.value = null
    try {
      const res = await fetch(`/mcp/discover/federated/${encodeURIComponent(remoteSoulId)}/accept`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      const data = await res.json().catch(() => ({}))
      if (data.ok) await fetchFederated()
      return data
    } catch (e) {
      error.value = e.message
    }
  }

  async function removeFederation(remoteSoulId) {
    error.value = null
    try {
      const res = await fetch(`/mcp/discover/federated/${encodeURIComponent(remoteSoulId)}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      const data = await res.json().catch(() => ({}))
      if (data.ok) await fetchFederated()
      return data
    } catch (e) {
      error.value = e.message
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

  return {
    wired, wiredTo, federated, loading, error,
    gatekeeperEnabled, fetchGatekeeperEnabled, setGatekeeperEnabled,
    fetchWired, fetchWiredTo, wireToGatekeeper, unwireSoul, disconnectFromGatekeeper,
    fetchFederated, requestFederation, acceptFederation, removeFederation,
    formatDate,
  }
}
