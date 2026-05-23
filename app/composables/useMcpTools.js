// app/composables/useMcpTools.js
// Lädt externe MCP-Tool-Definitionen (z.B. Zapier) einmal pro Session.
import { ref } from 'vue'

let _cached = null

export function useMcpTools() {
  const mcpTools = ref(_cached ?? [])

  async function loadMcpTools(soulCert) {
    if (_cached !== null) {
      mcpTools.value = _cached
      return
    }
    if (!soulCert) return
    try {
      const res = await fetch('/api/mcp-tools', {
        headers: { Authorization: `Bearer ${soulCert}` },
      })
      if (res.ok) {
        const data = await res.json()
        _cached = data.tools || []
        mcpTools.value = _cached
      }
    } catch { /* silent */ }
  }

  function clearMcpCache() {
    _cached = null
    mcpTools.value = []
  }

  return { mcpTools, loadMcpTools, clearMcpCache }
}
