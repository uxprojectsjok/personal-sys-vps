import { z } from 'zod';
import { postJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'create_agent',
    'Erstellt einen neuen ElevenLabs Conversational-AI-Agenten für diese Soul (Voice Clone + Agent). ' +
    'Ohne voice_id wird automatisch ein Voice Clone aus dem Vault-Audio erstellt oder eine gespeicherte voice_id wiederverwendet. ' +
    'Mit voice_id wird diese direkt als Stimme gesetzt – kein Cloning-Schritt.',
    {
      voice_id: z.string().optional().describe(
        'ElevenLabs Voice-ID (optional). Wenn angegeben: Override – kein Voice-Clone-Schritt, diese Stimme wird direkt verwendet und in config.json gespeichert.'
      ),
    },
    async ({ voice_id } = {}) => {
      try {
        const body = voice_id ? { voice_id } : {};
        const data = await postJson('/api/create-agent', token, body);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              agent_id:        data.agent_id,
              agent_url:       data.agent_url,
              voice_id:        data.voice_id ?? null,
              soul_name:       data.soul_name,
              has_voice_clone: data.has_voice_clone ?? false,
              published:       data.published ?? false,
            }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );
}
