import { ref, readonly } from 'vue'

const nodeLocked = ref(null) // null = unbekannt, true = gesperrt, false = frei

export function useNodeStatus() {
  async function fetchNodeStatus() {
    try {
      const res = await fetch('/api/node-status')
      if (!res.ok) return
      const data = await res.json()
      nodeLocked.value = !!data.locked
    } catch {
      nodeLocked.value = false
    }
  }

  // allowCreateSoul: true wenn Node noch frei (nicht gesperrt)
  const allowCreateSoul = computed(() => nodeLocked.value === false)

  return {
    nodeLocked: readonly(nodeLocked),
    allowCreateSoul: readonly(allowCreateSoul),
    fetchNodeStatus,
  }
}
