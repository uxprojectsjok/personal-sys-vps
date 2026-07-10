// server/api/set-config.post.js
// POST /api/set-config — Dev-Pendant zu set_config.lua
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const SOULS_DIR = process.env.SOULS_DIR || '/var/lib/sys/souls'

const ALLOWED_MODELS = new Set([
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5',
])

export default defineEventHandler(async (event) => {
  const auth    = getHeader(event, 'authorization') || ''
  const token   = auth.replace(/^Bearer\s+/i, '')
  const soul_id = token.split('.')[0] || ''
  if (!soul_id) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const body = await readBody(event)
  const { anthropic_key, elevenlabs_key, mcp_url, model } = body || {}

  if (anthropic_key !== undefined) {
    if (typeof anthropic_key !== 'string')
      throw createError({ statusCode: 400, message: 'invalid_anthropic_key' })
    if (anthropic_key !== '' && !anthropic_key.startsWith('sk-ant-'))
      throw createError({ statusCode: 400, message: 'Key must start with sk-ant- or be empty to remove' })
  }
  if (elevenlabs_key !== undefined && typeof elevenlabs_key !== 'string')
    throw createError({ statusCode: 400, message: 'invalid_elevenlabs_key' })
  if (mcp_url !== undefined && typeof mcp_url !== 'string')
    throw createError({ statusCode: 400, message: 'invalid_mcp_url' })

  const soulDir    = join(SOULS_DIR, soul_id)
  const configPath = join(soulDir, 'config.json')

  let existing = {}
  if (existsSync(configPath)) {
    try { existing = JSON.parse(readFileSync(configPath, 'utf8')) } catch {}
  }

  if (anthropic_key !== undefined) {
    if (anthropic_key === '') delete existing.anthropic_key
    else existing.anthropic_key = anthropic_key
  }
  if (elevenlabs_key !== undefined) {
    if (elevenlabs_key === '') delete existing.elevenlabs_key
    else existing.elevenlabs_key = elevenlabs_key
  }
  if (mcp_url !== undefined) {
    if (mcp_url === '') delete existing.mcp_url
    else existing.mcp_url = mcp_url
  }
  if (model !== undefined && typeof model === 'string' && ALLOWED_MODELS.has(model)) {
    existing.model = model
  }

  mkdirSync(soulDir, { recursive: true })
  writeFileSync(configPath, JSON.stringify(existing, null, 2))

  return {
    ok:                  true,
    has_own_key:         typeof existing.anthropic_key === 'string' && existing.anthropic_key.startsWith('sk-ant-'),
    elevenlabs_key_set:  typeof existing.elevenlabs_key === 'string' && existing.elevenlabs_key !== '',
    model:               existing.model || null,
  }
})
