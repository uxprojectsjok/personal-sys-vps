import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { getJson } from '../lib/api.mjs';

const SOULS_DIR      = process.env.SOULS_DIR || '/var/lib/sys/souls';
const FALLBACK_CALL_URL = 'https://me.uxprojects-jok.com/call';

function parseAgentMd(text) {
  const url = text.match(/\nagent_url:\s*(.+)/)?.[1]?.trim();
  const id  = text.match(/\nagent_id:\s*(.+)/)?.[1]?.trim();
  return { agent_url: url || null, agent_id: id || null };
}

export function register(server, token, soulId = null) {
  server.tool(
    'call_me',
    [
      'Startet ein Gespräch mit deinem digitalen Agenten (ElevenLabs Conversational AI).',
      'Gibt einen direkten Link zurück — im Browser öffnen, Mikrofon erlauben, sofort sprechen.',
      '',
      'Voraussetzung: ElevenLabs Agent muss eingerichtet sein (@create-agent).',
    ].join('\n'),
    {},
    async () => {
      try {
        // Primär: ownagent_*.md aus vault/context lesen (neueste datierte Datei)
        // Owner-only-Ablage — vault_shared ist für zahlende/Peer-Verbindungen lesbar.
        if (soulId) {
          try {
            const contextDir = join(SOULS_DIR, soulId, 'vault', 'context');
            const files = readdirSync(contextDir)
              .filter(f => f.includes('ownagent') && f.endsWith('.md'))
              .sort();
            const latest = files[files.length - 1];
            if (latest) {
              const text   = readFileSync(join(contextDir, latest), 'utf-8');
              const parsed = parseAgentMd(text);
              if (parsed.agent_url) {
                return {
                  content: [{
                    type: 'text',
                    text: [
                      `**Gespräch mit deinem digitalen Agenten starten:**`,
                      '',
                      `[Jetzt sprechen →](${parsed.agent_url})`,
                      parsed.agent_url,
                      '',
                      'Link öffnet ElevenLabs direkt — Mikrofon erlauben, sofort sprechen.',
                    ].join('\n'),
                  }],
                };
              }
            }
          } catch { /* Fallback auf get-config */ }
        }

        // Fallback: config.json via get-config
        const cfg = await getJson('/api/get-config', token).catch(() => null);
        if (!cfg?.elevenlabs_key_set) {
          return {
            content: [{ type: 'text', text: 'Kein ElevenLabs-Key konfiguriert. Bitte in den Einstellungen hinterlegen und dann @create-agent ausführen.' }],
            isError: true,
          };
        }

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
