import { ref, computed, watch } from 'vue'
import { useSoul } from './useSoul.js'

// Singleton
let _instance = null

export function useVaultConnections() {
  if (_instance) return _instance

  const { soulToken } = useSoul()
  const connections    = ref([])
  const removedByPeer  = ref([])
  const loading        = ref(false)
  const error          = ref(null)
  const profileUrls    = ref({}) // soul_id → blob URL

  function getSoulId() {
    return soulToken.value ? soulToken.value.split('.')[0] : null
  }

  // Soul-Wechsel: Verbindungsliste sofort leeren, damit nie die alte Soul-ID oder
  // die Verbindungen einer anderen Soul angezeigt werden.
  watch(soulToken, (newToken, oldToken) => {
    const newId = newToken?.split('.')?.[0]
    const oldId = oldToken?.split('.')?.[0]
    if (newId && newId !== oldId) {
      connections.value   = []
      removedByPeer.value = []
      profileUrls.value   = {}
      error.value         = null
    }
  })

  // Lädt Availability-Status aus /network und mergt in connections:
  // conn.available (bool), conn.encrypted (bool)
  async function fetchAvailability() {
    if (!soulToken.value || !connections.value.length) return
    try {
      const res  = await fetch('/api/vault/connections/network', {
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      if (!res.ok) return
      const data = await res.json()
      if (!data.ok || !Array.isArray(data.connections)) return
      // Availability-Map aufbauen: soul_id → { available, reason }
      const avMap = {}
      for (const c of data.connections) avMap[c.soul_id] = c
      // In connections mergen
      connections.value = connections.value.map(conn => ({
        ...conn,
        available: avMap[conn.soul_id]?.available ?? null,
        // encrypted kommt jetzt als explizites Feld (Lua v2) oder als reason-Fallback
        encrypted: avMap[conn.soul_id]?.encrypted === true || avMap[conn.soul_id]?.reason === 'encrypted',
      }))
    } catch { /* Availability-Fehler nicht kritisch */ }
  }

  async function fetchPublicProfiles() {
    if (!soulToken.value || !connections.value.length) return
    const ownId = getSoulId()
    for (const conn of connections.value) {
      if (conn.soul_id === ownId) continue           // eigene Soul nie fetchen
      if (conn.soul_id in profileUrls.value) continue // bereits versucht (Erfolg oder Fehler cachen)
      // Failure sofort markieren, damit kein Re-Fetch passiert
      profileUrls.value = { ...profileUrls.value, [conn.soul_id]: '' }
      try {
        const mRes = await fetch(`/api/vault/public/${conn.soul_id}`)
        if (!mRes.ok) continue
        const manifest = await mRes.json()
        const profileFile = Array.isArray(manifest.files)
          ? manifest.files.find(f => f.type === 'images' && /^profile\.(png|jpe?g|webp)$/i.test(f.name))
          : null
        if (!profileFile) continue
        const fRes = await fetch(`/api/vault/public/${conn.soul_id}/${profileFile.name}`, {
          headers: { Authorization: `Bearer ${soulToken.value}` }
        })
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
        const ownId         = getSoulId()
        const all           = Array.isArray(data.connections) ? data.connections : []
        connections.value   = ownId ? all.filter(c => c.soul_id !== ownId) : all
        removedByPeer.value = Array.isArray(data.removed_by_peer) ? data.removed_by_peer : []
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

  async function addConnection(targetSoulId, alias, permissions) {
    error.value = null
    try {
      const res  = await fetch('/api/vault/connections', {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${soulToken.value}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ soul_id: targetSoulId, alias, permissions })
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

  async function testConnection(targetSoulId) {
    try {
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

  const mutualCount = computed(() => connections.value.filter(c => c.mutual).length)

  _instance = {
    connections, removedByPeer, loading, error, mutualCount, profileUrls,
    getSoulId, fetchConnections, addConnection,
    removeConnection, acknowledgeRemoval, testConnection
  }
  return _instance
}
