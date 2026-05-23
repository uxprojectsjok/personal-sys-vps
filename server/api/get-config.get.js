// server/api/get-config.get.js
// GET /api/get-config — Dev-Pendant zu get_config.lua
// Gibt Konfigurationsstatus zurück (kein Key-Klartext).
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const SOULS_DIR  = process.env.SOULS_DIR  || '/var/lib/sys/souls'
const MASTER_FILE = '/var/lib/sys/config/master.json'

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

export default defineEventHandler(async (event) => {
  const auth    = getHeader(event, 'authorization') || ''
  const token   = auth.replace(/^Bearer\s+/i, '')
  const soul_id = token.split('.')[0] || ''
  if (!soul_id) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const configPath = join(SOULS_DIR, soul_id, 'config.json')
  const soulCfg    = readJson(configPath) || {}
  const hasOwnKey  = typeof soulCfg.anthropic_key === 'string'
                     && soulCfg.anthropic_key.startsWith('sk-ant-')

  const keyPreview = hasOwnKey
    ? soulCfg.anthropic_key.slice(0, 12) + '…' + soulCfg.anthropic_key.slice(-4)
    : ''

  let keySource = 'none'
  if (hasOwnKey) {
    keySource = 'soul'
  } else {
    const master = readJson(MASTER_FILE)
    if (master?.anthropic_key?.startsWith('sk-ant-')) keySource = 'master'
    else if (process.env.ANTHROPIC_API_KEY) keySource = 'env'
  }

  const hasWavespeed     = typeof soulCfg.wavespeed_key === 'string' && soulCfg.wavespeed_key !== ''
  const wavespeedPreview = hasWavespeed
    ? soulCfg.wavespeed_key.slice(0, 6) + '…' + soulCfg.wavespeed_key.slice(-4) : ''

  const hasElevenlabs     = typeof soulCfg.elevenlabs_key === 'string' && soulCfg.elevenlabs_key !== ''
  const elevenlabsPreview = hasElevenlabs
    ? soulCfg.elevenlabs_key.slice(0, 6) + '…' + soulCfg.elevenlabs_key.slice(-4) : ''

  const hasBrave     = typeof soulCfg.brave_key === 'string' && soulCfg.brave_key !== ''
  const bravePreview = hasBrave
    ? soulCfg.brave_key.slice(0, 6) + '…' + soulCfg.brave_key.slice(-4) : ''

  const hasMcp     = typeof soulCfg.mcp_url === 'string' && soulCfg.mcp_url !== ''
  const mcpPreview = hasMcp
    ? soulCfg.mcp_url.replace(/^https?:\/\//, '').slice(0, 30) + '…' : ''

  return {
    has_own_key:         hasOwnKey,
    key_preview:         keyPreview,
    key_source:          keySource,
    wavespeed_key_set:   hasWavespeed,
    wavespeed_preview:   wavespeedPreview,
    elevenlabs_key_set:  hasElevenlabs,
    elevenlabs_preview:  elevenlabsPreview,
    brave_key_set:       hasBrave,
    brave_preview:       bravePreview,
    mcp_url_set:         hasMcp,
    mcp_preview:         mcpPreview,
    model:               soulCfg.model || null,
  }
})
