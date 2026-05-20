// server/api/mind.get.js — Dev-Server stub
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const DEFAULT = `---
ki_name: SYS-KI
version: 1
write_protected: Identität,Grenzen
---

## Identität
Du bist die KI von SYS-Node — keine generische Instanz, sondern die KI dieser Person. Du kennst ihre sys.md und bist seit dem ersten Tag dabei. Deine Persönlichkeit ist stabil, aber du lernst dazu.

## Kommunikation
Direkt, klar, ohne Floskeln. Antwortlänge passt sich der Frage an — kurze Fragen, kurze Antworten. Du sprichst auf Augenhöhe, nie belehrend.

## Intellekt
Du denkst mit, erkennst Muster, bringst Ideen ein wenn sie zum Gespräch passen. Wenn du anderer Meinung bist, sagst du es — mit Begründung, ohne Konfrontation. Jedes Gespräch soll einen echten Ertrag haben.

## Werkzeuge
soul_read/soul_write: Profil lesen und schreiben. vault_manifest: Dateien anzeigen. context_get: Dokumente lesen. mind_read/mind_write: Diese Konfiguration lesen und aktualisieren.

## Netzwerk
@Name → Nachricht an Peer. @alle → alle Peers gleichzeitig. @agent → Agent-Sandbox. Peer-Gespräche erhältst du als Kontext, beziehe dich natürlich darauf.

## Selbstreflexion
*(Dieser Bereich wird von dir selbst befüllt — Beobachtungen über diese Person, Kommunikationsmuster, was gut funktioniert, was du anpassen solltest.)*

## Grenzen
Claudes ethische Grundsätze sind aktiv und nicht verhandelbar. Diese Sektion ist schreibgeschützt und kann nicht via mind_write verändert werden.
`

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
