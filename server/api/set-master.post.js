// server/api/set-master.post.js
// POST /api/set-master — Dev-Pendant zu set_master.lua
// Auth: X-Admin-Token: adm_<64hex>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const CONFIG_DIR  = '/var/lib/sys/config'
const MASTER_FILE = join(CONFIG_DIR, 'master.json')
const GRACE_15MIN = 15 * 60 * 1000  // ms — kurz genug um Angreifer auszusperren

export default defineEventHandler(async (event) => {
  const adminToken = getHeader(event, 'x-admin-token') || ''

  // Admin-Token gegen master.json validieren
  let master = {}
  if (existsSync(MASTER_FILE)) {
    try { master = JSON.parse(readFileSync(MASTER_FILE, 'utf8')) } catch {}
  }
  if (!adminToken || adminToken !== master.admin_token) {
    throw createError({ statusCode: 403, message: 'Forbidden — ungültiger Admin-Token' })
  }

  const body = await readBody(event)
  const { soul_master_key, anthropic_key, new_admin_token } = body || {}

  let prevValidUntil = ''

  if (soul_master_key !== undefined && soul_master_key !== '') {
    if (!/^sys_[0-9a-f]{64}$/.test(soul_master_key))
      throw createError({ statusCode: 400, message: 'soul_master_key muss sys_ + 64 Hex (lowercase) sein' })

    if (master.soul_master_key) {
      master.soul_master_key_prev = master.soul_master_key
      const until = new Date(Date.now() + GRACE_15MIN)
      master.prev_valid_until    = until.toISOString()
      master.prev_valid_until_ts = Math.floor(until.getTime() / 1000)
      prevValidUntil             = master.prev_valid_until
    }
    master.soul_master_key = soul_master_key
  }

  if (new_admin_token !== undefined && new_admin_token !== '') {
    if (!/^adm_[0-9a-f]{64}$/.test(new_admin_token))
      throw createError({ statusCode: 400, message: 'admin_token muss adm_ + 64 Hex (lowercase) sein' })
    master.admin_token = new_admin_token
  }

  if (anthropic_key !== undefined) {
    if (anthropic_key !== '' && !anthropic_key.startsWith('sk-ant-'))
      throw createError({ statusCode: 400, message: 'invalid_anthropic_key' })
    master.anthropic_key = anthropic_key
  }

  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(MASTER_FILE, JSON.stringify(master, null, 2))

  return { ok: true, prev_valid_until: prevValidUntil }
})
