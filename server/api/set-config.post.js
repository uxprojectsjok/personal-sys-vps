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
  const { anthropic_key, model } = body || {}

  if (anthropic_key !== undefined) {
    if (typeof anthropic_key !== 'string')
      throw createError({ statusCode: 400, message: 'invalid_anthropic_key' })
    if (anthropic_key !== '' && !anthropic_key.startsWith('sk-ant-'))
      throw createError({ statusCode: 400, message: 'Key muss mit sk-ant- beginnen oder leer sein' })
  }

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
  if (model !== undefined && typeof model === 'string' && ALLOWED_MODELS.has(model)) {
    existing.model = model
  }

  mkdirSync(soulDir, { recursive: true })
  writeFileSync(configPath, JSON.stringify(existing, null, 2))

  const hasOwnKey = typeof existing.anthropic_key === 'string'
                    && existing.anthropic_key.startsWith('sk-ant-')
  return { ok: true, has_own_key: hasOwnKey, model: existing.model || null }
})
