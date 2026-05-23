// server/api/elevenlabs-token.post.js
// POST /api/elevenlabs-token — erstellt ElevenLabs Conversation Token für den Soul-Agenten.
// Liest elevenlabs_key aus config.json und elevenlabs_agent_id aus sys.md-Frontmatter.

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const SOULS_DIR = process.env.SOULS_DIR || '/var/lib/sys/souls'
const ELEVEN    = 'https://api.elevenlabs.io/v1'

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

export default defineEventHandler(async (event) => {
  const auth   = getHeader(event, 'authorization') || ''
  const token  = auth.replace(/^Bearer\s+/i, '')
  const soulId = token.split('.')[0] || ''
  if (!soulId) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const baseDir   = join(SOULS_DIR, soulId)
  const cfg       = readJson(join(baseDir, 'config.json')) || {}
  const elevenKey = cfg.elevenlabs_key || ''
  if (!elevenKey) throw createError({ statusCode: 503, message: 'elevenlabs_key_missing' })

  // Agent-ID aus sys.md Frontmatter lesen
  let agentId = null
  try {
    const sysMd = readFileSync(join(baseDir, 'sys.md'), 'utf-8')
    const m = sysMd.match(/elevenlabs_agent_id:\s*(\S+)/)
    if (m) agentId = m[1]
  } catch {}

  if (!agentId) throw createError({ statusCode: 503, message: 'elevenlabs_agent_missing' })

  const res = await fetch(`${ELEVEN}/convai/conversations/create-conversation-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': elevenKey,
    },
    body: JSON.stringify({ agent_id: agentId }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw createError({ statusCode: 502, message: `ElevenLabs: ${err}` })
  }

  const data = await res.json()
  return { conversation_token: data.token, agent_id: agentId }
})
