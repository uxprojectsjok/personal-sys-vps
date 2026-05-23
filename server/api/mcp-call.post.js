// server/api/mcp-call.post.js
// POST /api/mcp-call — ruft ein Tool auf dem externen MCP-Server auf (z.B. Zapier).
// Body: { name: string, input: object }
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
    body: JSON.stringify({ jsonrpc: '2.0', id: String(Date.now()), method, params }),
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`MCP ${res.status}: ${txt.slice(0, 300)}`)
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

export default defineEventHandler(async (event) => {
  const auth   = getHeader(event, 'authorization') || ''
  const token  = auth.replace(/^Bearer\s+/i, '')
  const soulId = token.split('.')[0] || ''
  if (!soulId) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const body = await readBody(event) || {}
  const { name, input = {} } = body

  if (!name) throw createError({ statusCode: 400, message: 'name_missing' })

  const cfg = (() => {
    try { return JSON.parse(readFileSync(join(SOULS_DIR, soulId, 'config.json'), 'utf8')) }
    catch { return {} }
  })()

  const mcpUrl = cfg.mcp_url || ''
  if (!mcpUrl) throw createError({ statusCode: 400, message: 'mcp_url_not_configured' })

  const resp = await callMcp(mcpUrl, 'tools/call', { name, arguments: input })
  const result = resp?.result || {}

  // MCP result.content → Text extrahieren für Claude tool_result
  const parts = Array.isArray(result.content) ? result.content : []
  const text = parts
    .filter(p => p.type === 'text')
    .map(p => p.text)
    .join('\n') || JSON.stringify(result)

  return {
    content: [{ type: 'text', text }],
    isError: result.isError === true,
  }
})
