// server/api/mind.put.js — Dev-Server stub
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const WRITE_PROTECTED = new Set(['Identität', 'Grenzen'])

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function updateSection(md, heading, newContent, mode) {
  const re = new RegExp(
    `(^## ${escapeRe(heading)}[ \t]*\n)([\\s\\S]*?)(?=^## |\\s*$)`,
    'm'
  )
  const match = md.match(re)
  const block = (h, body) => `## ${h}\n${body.trim()}\n`

  if (match) {
    const existing = match[2].trim()
    let body
    if (mode === 'replace') body = newContent
    else if (mode === 'prepend') body = newContent + (existing ? '\n\n' + existing : '')
    else body = (existing ? existing + '\n\n' : '') + newContent
    return md.replace(re, block(heading, body) + '\n')
  }
  return md.trimEnd() + '\n\n' + block(heading, newContent) + '\n'
}

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  const soulId = auth?.match(/^Bearer\s+([0-9a-f-]+)\./i)?.[1] || 'dev'

  const body = await readBody(event)
  const { section, content, mode = 'replace' } = body || {}

  if (!section || typeof section !== 'string') {
    throw createError({ statusCode: 400, message: 'section fehlt' })
  }
  if (!content || typeof content !== 'string') {
    throw createError({ statusCode: 400, message: 'content fehlt' })
  }
  if (WRITE_PROTECTED.has(section)) {
    throw createError({ statusCode: 403, message: `Sektion "${section}" ist schreibgeschützt.` })
  }

  const dir = join('/var/lib/sys/souls', soulId, 'vault/context')
  const path = join(dir, 'mind.md')

  let current = ''
  try { current = readFileSync(path, 'utf-8') } catch { /* kein mind.md → leer */ }

  const updated = updateSection(current || '', section, content, mode)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path, updated, 'utf-8')

  return { ok: true, section, mode }
})
