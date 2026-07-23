import { ref, computed, readonly } from 'vue'

const nodeLocked = ref(null) // null = unbekannt, true = gesperrt, false = frei
const publicNode = ref(true) // Default passend zu node_status.lua (Altinstallationen ohne Datei = public)

export function useNodeStatus() {
  async function fetchNodeStatus() {
    try {
      const res = await fetch('/api/node-status')
      if (!res.ok) return
      const data = await res.json()
      nodeLocked.value = !!data.locked
      publicNode.value = data.public_node !== false
    } catch {
      nodeLocked.value = false
    }
  }

  // allowCreateSoul: true wenn Node noch frei (nicht gesperrt)
  const allowCreateSoul = computed(() => nodeLocked.value === false)

  return {
    nodeLocked: readonly(nodeLocked),
    publicNode: readonly(publicNode),
    allowCreateSoul: readonly(allowCreateSoul),
    fetchNodeStatus,
  }
}
