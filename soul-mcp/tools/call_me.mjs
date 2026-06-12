import { z } from 'zod';
import { getJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'call_me',
    [
      'Öffnet ein Gespräch mit deinem digitalen Agenten (ElevenLabs Conversational AI).',
      'Gibt einen direkten Link zurück — im Browser öffnen, Mikrofon erlauben, sofort sprechen.',
      '',
      'Voraussetzung: ElevenLabs Agent muss eingerichtet sein (elevenlabs_agent_update oder @create-agent).',
      'Das Tool prüft ob ein Agent vorhanden ist bevor es den Link zurückgibt.',
    ].join('\n'),
    {},
    async () => {
      try {
        // Agent-Verfügbarkeit via /api/get-config prüfen
        const cfg = await getJson('/api/get-config', token).catch(() => null);

        const callUrl = 'https://me.uxprojects-jok.com/call';

        if (!cfg || !cfg.elevenlabs_key_set) {
          return {
            content: [{
              type: 'text',
              text: [
                'Kein ElevenLabs-Key konfiguriert.',
                'Bitte zuerst den API-Key in den Einstellungen hinterlegen.',
                '',
                'Dann: `elevenlabs_agent_update` aufrufen um den Agenten einzurichten.',
              ].join('\n'),
            }],
            isError: true,
          };
        }

        return {
          content: [{
            type: 'text',
            text: [
              `**Gespräch mit deinem digitalen Agenten starten:**`,
              '',
              `[Jetzt sprechen → ${callUrl}](${callUrl})`,
              '',
              'Klicke den Link, erlaube das Mikrofon — der Agent verbindet sich automatisch.',
            ].join('\n'),
          }],
        };

      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
