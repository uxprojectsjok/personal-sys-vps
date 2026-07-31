import { ref, computed, readonly } from 'vue'

const nodeLocked = ref(null) // null = unbekannt, true = gesperrt, false = frei
// Absichtlich umbenannt von "publicNode"/"public_node" — das Flag steuert
// ausschließlich Marketplace/Monetarisierung (Pay-Zugang), nicht die
// allgemeine Erreichbarkeit der Node (die läuft über discoverable + Gatekeeper-
// Wiring, komplett unabhängig davon). Der alte Name suggerierte fälschlich
// "diese Node ist öffentlich erreichbar" — reine Umbenennung, Logik/Werte
// unverändert.
const monetizationEnabled = ref(true) // Default passend zu node_status.lua (Altinstallationen ohne Datei = enabled)

export function useNodeStatus() {
  async function fetchNodeStatus() {
    try {
      const res = await fetch('/api/node-status')
      if (!res.ok) return
      const data = await res.json()
      nodeLocked.value = !!data.locked
      monetizationEnabled.value = data.monetization_enabled !== false
    } catch {
      nodeLocked.value = false
    }
  }

  // allowCreateSoul: true wenn Node noch frei (nicht gesperrt)
  const allowCreateSoul = computed(() => nodeLocked.value === false)

  return {
    nodeLocked: readonly(nodeLocked),
    monetizationEnabled: readonly(monetizationEnabled),
    allowCreateSoul: readonly(allowCreateSoul),
    fetchNodeStatus,
  }
}
