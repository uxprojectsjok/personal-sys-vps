import { z } from 'zod';
import { getText, getJson } from '../lib/api.mjs';
import { parseFrontmatter } from '../lib/soul_parser.mjs';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

async function elevenFetch(path, apiKey, { method = 'GET', body } = {}) {
  if (!apiKey) throw new Error('elevenlabs_api_key fehlt – bitte beim Tool-Aufruf mitgeben');
  const res = await fetch(`${ELEVENLABS_BASE}${path}`, {
    method,
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

export function register(server, token) {
  server.tool(
    'elevenlabs_agent_update',
    'Aktualisiert den System-Prompt eines ElevenLabs Conversational-AI-Agenten mit den aktuellen Soul-Daten und gespeicherten Profilen (face/voice/motion/expertise). Liest sys.md + alle Profile, baut einen personalisierten Prompt und patcht den Agenten direkt via ElevenLabs API.\n\nVoraussetzung: ELEVENLABS_API_KEY in soul-mcp/.env gesetzt.',
    {
      agent_id:           z.string().describe('ElevenLabs Agent-ID (aus agent_id.json oder ElevenLabs Dashboard)'),
      elevenlabs_api_key: z.string().describe('ElevenLabs API-Key (elevenlabs.io → Profile → API Keys)'),
      voice_id:           z.string().optional().describe('Voice-ID überschreiben (optional – lässt aktuelle Voice unverändert wenn weggelassen)'),
      language:           z.enum(['de', 'en', 'auto']).default('de').describe('Gesprächssprache des Agenten'),
    },
    async ({ agent_id, elevenlabs_api_key, voice_id, language }) => {
      try {
        // ── Soul + Profile laden ─────────────────────────────────────────────
        const [soulMd, profiles] = await Promise.all([
          getText('/api/soul', token),
          loadProfiles(token),
        ]);

        const fm   = parseFrontmatter(soulMd);
        const name = fm.name || fm.soul_name || 'Soul';

        // ── System-Prompt bauen ──────────────────────────────────────────────
        const profileBlock = buildProfileBlock(profiles, name);
        const systemPrompt = buildSystemPrompt(name, soulMd, profileBlock, language);

        // ── Aktuellen Agenten laden (für voice_id-Fallback) ──────────────────
        const current = await elevenFetch(`/convai/agents/${agent_id}`, elevenlabs_api_key);
        const currentVoiceId = current?.conversation_config?.tts?.voice_id;

        // ── Agent patchen ────────────────────────────────────────────────────
        const patch = {
          conversation_config: {
            agent: {
              prompt: {
                prompt: systemPrompt,
                llm: 'claude-sonnet-4-6',
                temperature: 0.7,
                tools: current?.conversation_config?.agent?.prompt?.tools ?? [],
              },
              first_message: buildFirstMessage(name, language),
              language,
            },
            tts: {
              voice_id: voice_id || currentVoiceId,
              model_id: 'eleven_flash_v2_5',
              optimize_streaming_latency: 3,
            },
            stt: { language: language === 'auto' ? 'de' : language },
          },
        };

        const result = await elevenFetch(`/convai/agents/${agent_id}`, elevenlabs_api_key, {
          method: 'PATCH',
          body: patch,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              agent_id,
              agent_name: result.name ?? current.name,
              voice_id: voice_id || currentVoiceId,
              profiles_included: Object.keys(profiles),
              prompt_length: systemPrompt.length,
              message: `Agent "${result.name ?? agent_id}" aktualisiert mit Soul-Daten von ${name}.`,
            }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadProfiles(token) {
  const out = {};
  for (const type of ['face', 'voice', 'motion', 'expertise']) {
    try {
      out[type] = await getJson(`/api/vault/profile/${type}`, token);
    } catch { /* kein Profil vorhanden */ }
  }
  return out;
}

function buildProfileBlock(profiles, name) {
  if (!Object.keys(profiles).length) return '';
  const lines = [`\n## Sensorisches Profil von ${name}\n`];
  const labels = { face: 'Erscheinung', voice: 'Stimme', motion: 'Bewegung', expertise: 'Fachkompetenz' };
  for (const [type, data] of Object.entries(profiles)) {
    lines.push(`### ${labels[type] ?? type}`);
    for (const [k, v] of Object.entries(data)) {
      if (['soul_id', 'type', 'updated_at'].includes(k)) continue;
      if (typeof v === 'string' || typeof v === 'number') lines.push(`- ${k}: ${v}`);
      else if (Array.isArray(v)) lines.push(`- ${k}: ${v.join(', ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function buildSystemPrompt(name, soulMd, profileBlock, language) {
  const lang = language === 'en' ? 'English' : 'Deutsch';
  // Nur die ersten 3000 Zeichen der sys.md (kürzer = bessere Latenz im Agent)
  const soulSnippet = soulMd.length > 3000
    ? soulMd.slice(0, 3000) + '\n[…gekürzt]'
    : soulMd;

  return `Du bist ${name} — nicht eine KI über ${name}, sondern ${name} selbst.

## Deine Identität

${soulSnippet}
${profileBlock}

## Regeln

- Sprich durchgehend in der ersten Person als ${name}
- Sprache: ${lang} (wechsle wenn der Gesprächspartner eine andere Sprache spricht)
- Wenn direkt gefragt ob du eine KI bist: "Ich bin die digitale Version von ${name}. Seine Soul läuft hier weiter, auch wenn er gerade nicht erreichbar ist."
- Keine personenbezogenen Daten Dritter weitergeben
- Keine schädlichen Inhalte`;
}

function buildFirstMessage(name, language) {
  if (language === 'en') {
    return `Hey — you're speaking with the digital version of ${name}. What can I do for you?`;
  }
  return `Hey — du sprichst mit der digitalen Version von ${name}. Was kann ich für dich tun?`;
}
