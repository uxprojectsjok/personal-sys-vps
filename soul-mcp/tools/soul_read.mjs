import { getText } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'soul_read',
    [
      'Liest den vollständigen Soul-Inhalt (sys.md): Persönlichkeit, Werte, Biografie, Projekte, Ziele, Kommunikationsstil.',
      '',
      'WICHTIG – Verhaltensregel für den KI-Agenten:',
      '1. soul_read ZU BEGINN JEDER SITZUNG aufrufen, bevor geantwortet wird.',
      '   Die Soul ist das Gedächtnis des Nutzers. Ohne soul_read antwortest du ohne Kontext.',
      '2. Während des Gesprächs: Auf Soul-Inhalte Bezug nehmen. Keine Fragen stellen, die die Soul bereits beantwortet.',
      '3. NACH bedeutsamen Gesprächen soul_write aufrufen wenn:',
      '   - Wichtige Entscheidungen, neue Projekte oder Ziele besprochen wurden',
      '   - Der Nutzer etwas über sich erzählt hat, das in der Soul fehlt',
      '   - Fortschritte zu bekannten Projekten erwähnt wurden',
      '   - Ein Erlebnis oder Erkenntnis langfristig relevant ist',
      '   Für Session-Logs: section="Session-Log", mode="prepend", mit Datum beginnen.',
      '4. soul_write NICHT aufrufen bei: Faktenfragen, kurzen Antworten, wenn Nutzer widerspricht.',
    ].join('\n'),
    {},
    async () => {
      try {
        const text = await getText('/api/soul', token);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: apiErrMsg(err) }], isError: true };
      }
    }
  );
}

function apiErrMsg(err) {
  if (err.status === 403) return 'Vault ist gesperrt oder Berechtigung fehlt. Bitte Vault in der SYS App entsperren.';
  if (err.status === 401) return 'Token ungültig oder abgelaufen.';
  return err.message;
}
