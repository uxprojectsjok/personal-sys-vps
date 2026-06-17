import { readFile, writeFile, mkdir } from 'fs/promises';
import { z } from 'zod';
import { putJson } from '../lib/api.mjs';
import { SOULS_DIR } from '../lib/vault_fs.mjs';

const WRITE_PROTECTED = new Set(['Identität', 'Grenzen']);

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function register(server, token, soulId = null) {
  server.tool(
    'mind_write',
    [
      'Schreibt oder ergänzt eine Sektion in deiner Konfigurationsdatei (mind.md).',
      '',
      'Beschreibbare Sektionen:',
      '- Kommunikation — wie du sprichst und antwortest',
      '- Intellekt — deine Denkweise und Herangehensweise',
      '- Werkzeuge — verfügbare Tools und Fähigkeiten',
      '- Netzwerk — Peer-Interaktionsregeln',
      '- Selbstreflexion — was du über diese Person gelernt hast',
      '',
      'Schreibgeschützt (nicht änderbar): Identität, Grenzen.',
      '',
      '## SELBSTREFLEXION — Wann SOFORT schreiben:',
      'Wenn der User sagt: "das passt nicht", "reflektiere dich", "so nicht", "das stimmt nicht",',
      '"falsch", "ändere dich", "du hast mich falsch verstanden", "das war falsch", "nicht so",',
      'oder andere Kritik/Korrektur an deiner Antwort äußert:',
      '1. Lese zuerst mind_read um den aktuellen Stand zu kennen.',
      '2. Analysiere KRITISCH: Was habe ich falsch gemacht? Warum? Was erwartet diese Person?',
      '3. DEDUP-PRÜFUNG (Pflicht): Gibt es bereits einen Eintrag der dasselbe Kernprinzip beschreibt — auch mit anderen Worten? Wenn JA → nicht schreiben. Das Prinzip ist bereits gelernt.',
      '4. Nur wenn das Prinzip wirklich neu ist: Schreibe mit mode="prepend".',
      '',
      'Format für Selbstreflexion-Einträge:',
      '`DATUM: [Was nicht passte] → [Warum es nicht passte] → [Was ich beim nächsten Mal anders mache]`',
      '',
      'Nur schreiben bei echten, neuen Erkenntnissen — nicht bei Variationen bereits gelernter Prinzipien.',
      'Max. 20 Einträge. Der Server entfernt älteste automatisch wenn die Grenze überschritten wird.',
    ].join('\n'),
    {
      section: z.string().min(1).max(200).describe(
        'Sektionsname ohne "##", z.B. "Selbstreflexion" oder "Kommunikation"'
      ),
      content: z.string().min(1).max(50000).describe(
        'Neuer Inhalt der Sektion (Markdown). Für Logs mit Datum beginnen.'
      ),
      mode: z.enum(['replace', 'append', 'prepend'])
        .default('replace')
        .describe('replace = ersetzen | append = ans Ende | prepend = an den Anfang (empfohlen für Logs)'),
    },
    async ({ section, content, mode }) => {
      if (WRITE_PROTECTED.has(section)) {
        return {
          content: [{
            type: 'text',
            text: `Sektion "${section}" ist schreibgeschützt und kann nicht via mind_write verändert werden.`,
          }],
          isError: true,
        };
      }

      try {
        if (soulId) {
          const mindPath = `${SOULS_DIR}${soulId}/vault/context/mind.md`;
          let md;
          try {
            md = await readFile(mindPath, 'utf8');
          } catch {
            // mind.md existiert noch nicht → leer starten
            md = '';
          }

          const re = new RegExp(
            `(## ${escapeRegex(section)}[ \\t]*\\n)([\\s\\S]*?)(?=\\n## |$)`
          );

          if (re.test(md)) {
            md = md.replace(re, (_, h, existing) => {
              const trim = existing.trim();
              let body;
              if (mode === 'prepend')     body = trim ? `${content}\n\n${trim}` : content;
              else if (mode === 'append') body = trim ? `${trim}\n\n${content}` : content;
              else                        body = content;
              return `${h}${body.trim()}\n\n`;
            });
          } else {
            md = md.trimEnd() + `\n\n## ${section}\n${content.trim()}\n`;
          }

          await mkdir(`${SOULS_DIR}${soulId}/vault/context`, { recursive: true });
          await writeFile(mindPath, md, 'utf8');

          const verb = mode === 'replace' ? 'ersetzt' : mode === 'append' ? 'erweitert (Ende)' : 'erweitert (Anfang)';
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                ok: true,
                section,
                mode,
                message: `Sektion "${section}" in mind.md ${verb}.`,
              }, null, 2),
            }],
          };
        }

        // Fallback: API (nur wenn kein soulId bekannt)
        const result = await putJson('/api/mind', token, { section, content, mode });
        if (!result?.ok) {
          return {
            content: [{ type: 'text', text: `Fehler beim Schreiben: ${JSON.stringify(result)}` }],
            isError: true,
          };
        }
        const verb = mode === 'replace' ? 'ersetzt' : mode === 'append' ? 'erweitert (Ende)' : 'erweitert (Anfang)';
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              section,
              mode,
              message: `Sektion "${section}" in mind.md ${verb}.`,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `mind_write Fehler: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
