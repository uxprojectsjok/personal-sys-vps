import { getJson } from '../lib/api.mjs';

const FALLBACK_CALL_URL = 'https://me.uxprojects-jok.com/call';

export function register(server, token) {
  server.tool(
    'call_me',
    [
      'Startet ein Gespräch mit deinem digitalen Agenten (ElevenLabs Conversational AI).',
      'Gibt einen direkten Link zurück — im Browser öffnen, Mikrofon erlauben, sofort sprechen.',
      '',
      'Voraussetzung: ElevenLabs Agent muss eingerichtet sein (@create-agent oder elevenlabs_agent_update).',
    ].join('\n'),
    {},
    async () => {
      try {
        const cfg = await getJson('/api/get-config', token).catch(() => null);

        if (!cfg?.elevenlabs_key_set) {
          return {
            content: [{ type: 'text', text: 'Kein ElevenLabs-Key konfiguriert. Bitte in den Einstellungen hinterlegen und dann @create-agent ausführen.' }],
            isError: true,
          };
        }

        // Bevorzuge gespeicherte öffentliche Agent-URL, Fallback: /call-Seite (signed URL)
        const agentUrl = cfg.elevenlabs_agent_url || FALLBACK_CALL_URL;
        const isPublic = !!cfg.elevenlabs_agent_url;

        return {
          content: [{
            type: 'text',
            text: [
              `**Gespräch mit deinem digitalen Agenten starten:**`,
              '',
              `[Jetzt sprechen →](${agentUrl})`,
              agentUrl,
              '',
              isPublic
                ? 'Link öffnet ElevenLabs direkt — Mikrofon erlauben, sofort sprechen.'
                : 'Link öffnet die SYS-App — Mikrofon erlauben, Agent verbindet sich automatisch.',
            ].join('\n'),
          }],
        };

      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
