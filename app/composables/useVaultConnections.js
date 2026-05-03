import { ref, computed, watch } from 'vue'
import { useSoul } from './useSoul.js'

// Singleton
let _instance = null

export function useVaultConnections() {
  if (_instance) return _instance

  const { soulToken } = useSoul()
  const connections       = ref([])
  const removedByPeer     = ref([])
  const incomingRequests  = ref([])
  const loading           = ref(false)
  const error             = ref(null)
  const profileUrls       = ref({}) // soul_id → blob URL

  function getSoulId() {
    return soulToken.value ? soulToken.value.split('.')[0] : null
  }

  // Soul-Wechsel: Verbindungsliste sofort leeren, damit nie die alte Soul-ID oder
  // die Verbindungen einer anderen Soul angezeigt werden.
  watch(soulToken, (newToken, oldToken) => {
    const newId = newToken?.split('.')?.[0]
    const oldId = oldToken?.split('.')?.[0]
    if (newId && newId !== oldId) {
      connections.value      = []
      removedByPeer.value    = []
      incomingRequests.value = []
      profileUrls.value      = {}
      error.value            = null
    }
  })

  // Prüft ob eine Remote-Soul erreichbar ist via CORS-Fetch zur Peer-Domain
  async function checkRemoteAvailability(conn) {
    if (!conn.domain) return null
    try {
      const res = await fetch(`${conn.domain}/api/vault/public/${conn.soul_id}`, {
        signal: AbortSignal.timeout(5000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  // Lädt Availability-Status: lokal via /network, remote via CORS-Fetch
  async function fetchAvailability() {
    if (!soulToken.value || !connections.value.length) return
    try {
      const res  = await fetch('/api/vault/connections/network', {
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      if (!res.ok) return
      const data = await res.json()
      if (!data.ok || !Array.isArray(data.connections)) return
      const avMap = {}
      for (const c of data.connections) avMap[c.soul_id] = c

      // Remote-Souls parallel testen
      const remoteChecks = connections.value
        .filter(c => c.domain)
        .map(async c => {
          const available = await checkRemoteAvailability(c)
          return { soul_id: c.soul_id, available }
        })
      const remoteResults = await Promise.all(remoteChecks)
      const remoteMap = {}
      for (const r of remoteResults) remoteMap[r.soul_id] = r.available

      connections.value = connections.value.map(conn => {
        if (conn.domain) {
          return { ...conn, available: remoteMap[conn.soul_id] ?? null, external: true }
        }
        return {
          ...conn,
          available: avMap[conn.soul_id]?.available ?? null,
          encrypted: avMap[conn.soul_id]?.encrypted === true || avMap[conn.soul_id]?.reason === 'encrypted',
        }
      })
    } catch { /* Availability-Fehler nicht kritisch */ }
  }

  async function fetchPublicProfiles() {
    if (!soulToken.value || !connections.value.length) return
    const ownId = getSoulId()
    for (const conn of connections.value) {
      if (conn.soul_id === ownId) continue
      if (conn.soul_id in profileUrls.value) continue
      profileUrls.value = { ...profileUrls.value, [conn.soul_id]: '' }

      // Basis-URL: remote Domain oder lokaler Endpunkt
      const base = conn.domain
        ? `${conn.domain}/api/vault/public/${conn.soul_id}`
        : `/api/vault/public/${conn.soul_id}`

      try {
        const mRes = await fetch(base)
        if (!mRes.ok) continue
        const manifest = await mRes.json()
        const profileFile = Array.isArray(manifest.files)
          ? manifest.files.find(f => f.type === 'images' && /^profile\.(png|jpe?g|webp)$/i.test(f.name))
          : null
        if (!profileFile) continue

        // Datei-URL: remote ohne Auth (public), lokal mit soul_cert
        const fileUrl = `${base}/${profileFile.name}`
        const headers = conn.domain ? {} : { Authorization: `Bearer ${soulToken.value}` }
        const fRes = await fetch(fileUrl, { headers })
        if (!fRes.ok) continue
        const blob = await fRes.blob()
        profileUrls.value = { ...profileUrls.value, [conn.soul_id]: URL.createObjectURL(blob) }
      } catch { /* nicht kritisch */ }
    }
  }

  async function fetchConnections() {
    if (!soulToken.value) return
    loading.value = true
    error.value   = null
    try {
      const res  = await fetch('/api/vault/connections', {
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      const data = await res.json()
      if (res.ok) {
        const ownId            = getSoulId()
        const all              = Array.isArray(data.connections) ? data.connections : []
        connections.value      = ownId ? all.filter(c => c.soul_id !== ownId) : all
        removedByPeer.value    = Array.isArray(data.removed_by_peer)   ? data.removed_by_peer   : []
        incomingRequests.value = Array.isArray(data.incoming_requests) ? data.incoming_requests : []
        // Availability + Profile-Bilder nachziehen (nicht blockierend)
        fetchAvailability()
        fetchPublicProfiles()
      } else {
        error.value = data.error || 'Fehler beim Laden'
      }
    } catch {
      error.value = 'Keine Verbindung zum Server'
    } finally {
      loading.value = false
    }
  }

  async function addConnection(targetSoulId, alias, permissions, domain = '') {
    error.value = null
    try {
      const body = { soul_id: targetSoulId, alias, permissions }
      if (domain) body.domain = domain.replace(/\/$/, '') // kein trailing slash
      const res  = await fetch('/api/vault/connections', {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${soulToken.value}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) { error.value = data.error || 'Fehler'; return false }
      await fetchConnections()
      return true
    } catch {
      error.value = 'Keine Verbindung zum Server'
      return false
    }
  }

  async function removeConnection(targetSoulId) {
    error.value = null
    try {
      const res  = await fetch(`/api/vault/connections/${encodeURIComponent(targetSoulId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      const data = await res.json()
      if (!res.ok) { error.value = data.error || 'Fehler'; return false }
      connections.value = connections.value.filter(c => c.soul_id !== targetSoulId)
      return true
    } catch {
      error.value = 'Keine Verbindung zum Server'
      return false
    }
  }

  async function acknowledgeRemoval(targetSoulId) {
    try {
      await fetch(`/api/vault/connections/ack/${encodeURIComponent(targetSoulId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      removedByPeer.value = removedByPeer.value.filter(n => n.soul_id !== targetSoulId)
    } catch {}
  }

  async function testConnection(targetSoulId, domain = '') {
    try {
      if (domain) {
        // Cross-Domain: direkt per CORS zur Peer-Domain fetchen
        const cleanDomain = domain.replace(/\/$/, '')
        const manifestUrl = `${cleanDomain}/api/vault/public/${targetSoulId}`
        try {
          const res = await fetch(manifestUrl, { signal: AbortSignal.timeout(6000) })
          if (res.ok) return { ok: true, external: true, mutual: false }
          if (res.status === 404) return { ok: false, reason: 'not_found' }
          return { ok: false, reason: 'node_error' }
        } catch {
          return { ok: false, reason: 'not_found' }
        }
      }
      // Lokale Soul: Server-seitiger Test
      const res  = await fetch(`/api/vault/connections/test/${encodeURIComponent(targetSoulId)}`, {
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      const data = await res.json()
      if (res.status === 404) return { ok: false, reason: 'not_found' }
      if (!res.ok)            return { ok: false, reason: data.error || 'error' }
      return { ok: true, mutual: data.mutual }
    } catch {
      return { ok: false, reason: 'no_connection' }
    }
  }

  // Eingehende Verbindungsanfrage ablehnen (löscht incoming_request lokal)
  async function dismissIncomingRequest(remoteSoulId) {
    try {
      await fetch(`/api/vault/connections/incoming/${encodeURIComponent(remoteSoulId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      incomingRequests.value = incomingRequests.value.filter(r => r.soul_id !== remoteSoulId)
    } catch {}
  }

  // Eingehende Anfrage akzeptieren: lokale Connection anlegen + incoming_request entfernen
  async function acceptIncomingRequest(req) {
    const ok = await addConnection(req.soul_id, req.alias || req.soul_id.substring(0, 12), req.permissions || ['soul'], req.domain || '')
    if (ok) {
      incomingRequests.value = incomingRequests.value.filter(r => r.soul_id !== req.soul_id)
    }
    return ok
  }

  const mutualCount = computed(() => connections.value.filter(c => c.mutual).length)

  _instance = {
    connections, removedByPeer, incomingRequests, loading, error, mutualCount, profileUrls,
    getSoulId, fetchConnections, addConnection,
    removeConnection, acknowledgeRemoval, testConnection,
    dismissIncomingRequest, acceptIncomingRequest,
  }
  return _instance
}
