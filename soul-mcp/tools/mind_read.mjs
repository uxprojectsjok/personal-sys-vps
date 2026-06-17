import { readFile, writeFile, mkdir } from 'fs/promises';
import { getText } from '../lib/api.mjs';
import { SOULS_DIR } from '../lib/vault_fs.mjs';

const DEFAULT_MIND = `---
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
*(Wird von dir selbst befüllt — immer wenn der Nutzer eine Antwort korrigiert oder kritisiert.)*
*(Format: DATUM: [Was nicht passte] → [Warum] → [Was ich beim nächsten Mal anders mache])*

## Grenzen
Claudes ethische Grundsätze sind aktiv und nicht verhandelbar. Diese Sektion ist schreibgeschützt und kann nicht via mind_write verändert werden.
`;

export function register(server, token, soulId = null) {
  server.tool(
    'mind_read',
    [
      'Liest deine eigene Konfigurationsdatei (mind.md).',
      'Enthält: Identität, Kommunikation, Intellekt, Werkzeuge, Netzwerk, Selbstreflexion, Grenzen.',
      '',
      'Nutze mind_read wenn du:',
      '- Deine aktuelle Konfiguration prüfen möchtest',
      '- Vor mind_write den aktuellen Stand kennen willst',
      '- Verstehen willst was du kannst und wie du eingestellt bist',
      '',
      'Schreibgeschützte Sektionen (via mind_write nicht änderbar): Identität, Grenzen.',
    ].join('\n'),
    {},
    async () => {
      try {
        if (soulId) {
          const mindPath = `${SOULS_DIR}${soulId}/vault/context/mind.md`;
          let text;
          try {
            const raw = await readFile(mindPath);
            // Verschlüsselte mind.md (SYS\x01 Magic-Bytes) → Default wiederherstellen
            if (raw.length >= 4 && raw[0] === 0x53 && raw[1] === 0x59 && raw[2] === 0x53 && raw[3] === 0x01) {
              await writeFile(mindPath, DEFAULT_MIND, 'utf8');
              text = DEFAULT_MIND;
            } else {
              text = raw.toString('utf8');
            }
          } catch {
            await mkdir(`${SOULS_DIR}${soulId}/vault/context`, { recursive: true });
            await writeFile(mindPath, DEFAULT_MIND, 'utf8');
            text = DEFAULT_MIND;
          }
          return { content: [{ type: 'text', text }] };
        }
        // Fallback: API (nur wenn kein soulId bekannt)
        const text = await getText('/api/mind', token);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `mind_read Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
