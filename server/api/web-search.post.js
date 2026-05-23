// server/api/web-search.post.js
// POST /api/web-search — Brave Search API, Key aus config.json (brave_key)
// Gibt { results: [{ title, url, description }] } zurück.
import { readFileSync } from 'fs'
import { join } from 'path'

const SOULS_DIR = process.env.SOULS_DIR || '/var/lib/sys/souls'

export default defineEventHandler(async (event) => {
  const auth   = getHeader(event, 'authorization') || ''
  const token  = auth.replace(/^Bearer\s+/i, '')
  const soulId = token.split('.')[0] || ''
  if (!soulId) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const { query } = await readBody(event) || {}
  if (!query?.trim()) throw createError({ statusCode: 400, message: 'query_missing' })

  const cfg = (() => {
    try { return JSON.parse(readFileSync(join(SOULS_DIR, soulId, 'config.json'), 'utf8')) }
    catch { return {} }
  })()

  const braveKey = cfg.brave_key || ''
  if (!braveKey) throw createError({ statusCode: 400, message: 'brave_key_missing' })

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query.trim())}&count=8&safesearch=moderate`
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': braveKey,
    }
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw createError({ statusCode: res.status, message: `Brave API ${res.status}: ${err.slice(0, 200)}` })
  }

  const data = await res.json()
  const raw = data?.web?.results || []

  const results = raw.slice(0, 8).map(r => ({
    title:       r.title       || '',
    url:         r.url         || '',
    description: r.description || r.extra_snippets?.[0] || '',
  }))

  return { results }
})
