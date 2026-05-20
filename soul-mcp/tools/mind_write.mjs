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
      'Empfehlung: Selbstreflexion mit mode="prepend" ergänzen wenn du etwas Wichtiges lernst.',
      'Nur schreiben bei echten Erkenntnissen — nicht bei jeder Antwort.',
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
