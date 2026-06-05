import { z } from 'zod';
import { putJson } from '../lib/api.mjs';

const WRITE_PROTECTED = new Set(['Identität', 'Grenzen']);

export function register(server, token) {
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
