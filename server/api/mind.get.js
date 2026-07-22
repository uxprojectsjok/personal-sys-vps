// server/api/mind.get.js — Dev-Server stub
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Single source of truth: shared/constants/default_mind.md (same file init.sh
// copies to /var/lib/sys/config/default_mind.md for production) instead of a
// separate hardcoded copy here that had drifted out of sync with it (wrong
// language, missing sections, an extra Websearch section not in the canonical
// template) until this fix.
const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT = readFileSync(join(__dirname, '../../shared/constants/default_mind.md'), 'utf-8')

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const auth = getHeader(event, 'authorization')
  const soulId = auth?.match(/^Bearer\s+([0-9a-f-]+)\./i)?.[1] || 'dev'
  const path = join('/var/lib/sys/souls', soulId, 'vault/context/mind.md')

  try {
    return readFileSync(path, 'utf-8')
  } catch {
    // Datei existiert nicht → Default schreiben damit sie im Vault sichtbar ist
    try {
      mkdirSync(join('/var/lib/sys/souls', soulId, 'vault/context'), { recursive: true })
      writeFileSync(path, DEFAULT, 'utf-8')
    } catch { /* silent */ }
    return DEFAULT
  }
})
