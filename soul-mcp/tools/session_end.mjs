/**
 * session_end — Identischer Workflow wie @session-end.
 * Schreibt einen komprimierten Eintrag in sys.md ## Session-Log.
 * Keine separaten Dateien — alles landet im zentralen Log.
 */

import { z } from 'zod';
import { getText, putJson } from '../lib/api.mjs';

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// "Session Log (compressed)" is the current canonical heading (buildDefaultSoul()).
// Legacy variants are tried too, so an existing soul's real section gets updated
// instead of a duplicate being created next to it.
const SESSION_LOG_HEADINGS = ['Session Log (compressed)', 'Session-Log (komprimiert)', 'Session-Log'];

function updateSessionLog(md, newContent) {
  md = md.replace(/\r\n/g, '\n').trimEnd();
  const block = (h, body) => `## ${h}\n${body.trim()}\n`;
  for (const heading of SESSION_LOG_HEADINGS) {
    const re = new RegExp(`(## ${escapeRe(heading)}[ \\t]*\\n)([\\s\\S]*?)(?=\\n## |$)`);
    const match = md.match(re);
    if (match) {
      const existing = match[2].trim();
      const body = newContent + (existing ? '\n\n' + existing : '');
      return md.replace(re, () => block(heading, body) + '\n');
    }
  }
  return md + '\n\n' + block(SESSION_LOG_HEADINGS[0], newContent) + '\n';
}

export function register(server, _soulId, token) {
  server.tool(
    'session_end',
    'Schließt die Session ab. Aufrufen wenn der Nutzer "session end" sagt oder schreibt. ' +
    'Schreibt NUR neue Erkenntnisse dieser Session in sys.md ## Session-Log — kein bekannter Kontext.',
    {
      summary: z.string().describe('Kompakter Session-Inhalt. Nur was in dieser Session neu war.'),
      channel: z.enum(['claude_ai', 'elevenlabs', 'other']).optional().describe('Kanal (Standard: claude_ai)'),
    },
    async ({ summary, channel = 'claude_ai' }) => {
      if (!token) return { content: [{ type: 'text', text: 'Fehler: kein Token verfügbar' }], isError: true };
      try {
        const now    = new Date();
        const date   = now.toISOString().slice(0, 10);
        const suffix = channel === 'elevenlabs' ? ' (ElevenLabs)' : channel === 'other' ? ' (extern)' : ' (Claude.ai)';
        const first  = summary.trim().split('\n')[0].replace(/^[-*#\s]+/, '').trim();
        const entry  = `- **${date}${suffix}:** ${first}`;

        const current = await getText('/api/soul', token);
        const updated = updateSessionLog(current, entry);
        await putJson('/api/context', token, { soul_content: updated });

        return { content: [{ type: 'text', text: 'Session gespeichert.' }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
