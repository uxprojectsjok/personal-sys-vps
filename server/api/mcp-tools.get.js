// server/api/mcp-tools.get.js
// GET /api/mcp-tools — holt Tool-Definitionen vom konfigurierten externen MCP-Server
// (z.B. Zapier MCP). Gibt Anthropic-kompatibles Format zurück.
import { readFileSync } from 'fs'
import { join } from 'path'

const SOULS_DIR = process.env.SOULS_DIR || '/var/lib/sys/souls'

async function callMcp(mcpUrl, method, params = {}) {
  const res = await fetch(mcpUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: '1', method, params }),
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`MCP ${res.status}: ${txt.slice(0, 200)}`)
  }

  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/event-stream')) {
    const text = await res.text()
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const d = line.slice(6).trim()
      if (d === '[DONE]' || !d) continue
      try { return JSON.parse(d) } catch {}
    }
    throw new Error('Kein JSON in SSE-Antwort')
  }

  return res.json()
}

// MCP inputSchema → Anthropic input_schema (gleiche Struktur, nur Feldname)
function toAnthropicTool(t) {
  return {
    name:         t.name,
    description:  t.description || '',
    input_schema: t.inputSchema || { type: 'object', properties: {}, required: [] },
  }
}

export default defineEventHandler(async (event) => {
  const auth   = getHeader(event, 'authorization') || ''
  const token  = auth.replace(/^Bearer\s+/i, '')
  const soulId = token.split('.')[0] || ''
  if (!soulId) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const cfg = (() => {
    try { return JSON.parse(readFileSync(join(SOULS_DIR, soulId, 'config.json'), 'utf8')) }
    catch { return {} }
  })()

  const mcpUrl = cfg.mcp_url || ''
  if (!mcpUrl) return { tools: [] }

  try {
    const resp = await callMcp(mcpUrl, 'tools/list', {})
    const rawTools = resp?.result?.tools || []
    return { tools: rawTools.map(toAnthropicTool) }
  } catch (e) {
    return { tools: [], error: e.message }
  }
})
