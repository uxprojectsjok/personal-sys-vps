/**
 * session_end — Schließt eine Session ab.
 * 1. Speichert detaillierte Zusammenfassung in session_YYYY-MM-DD.md (vault/context)
 * 2. Schreibt komprimierten Eintrag in sys.md ## Session-Log (gleicher Workflow wie @session-end)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { z } from 'zod';
import { SOULS_DIR } from '../lib/vault_fs.mjs';
import { getText, putJson } from '../lib/api.mjs';

// Identisch zur Logik in soul_write.mjs
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function updateSection(md, heading, newContent, mode) {
  md = md.replace(/\r\n/g, '\n').trimEnd();
  const re = new RegExp(`(## ${escapeRe(heading)}[ \\t]*\\n)([\\s\\S]*?)(?=\\n## |$)`);
  const match = md.match(re);
  const block = (h, body) => `## ${h}\n${body.trim()}\n`;
  if (match) {
    const existing = match[2].trim();
    const body = mode === 'prepend'
      ? newContent + (existing ? '\n\n' + existing : '')
      : (existing ? existing + '\n\n' : '') + newContent;
    return md.replace(re, () => block(heading, body) + '\n');
  }
  return md + '\n\n' + block(heading, newContent) + '\n';
}

async function ensureContextRegistered(soulId, filename) {
  const ctxPath = `${SOULS_DIR}${soulId}/api_context.json`;
  try {
    const raw = await readFile(ctxPath, 'utf8');
    const ctx = JSON.parse(raw);
    const sf  = ctx.synced_files = ctx.synced_files || {};
    const arr = Array.isArray(sf.context) ? sf.context : [];
    if (!arr.includes(filename)) {
      arr.push(filename);
      sf.context = arr;
      await writeFile(ctxPath, JSON.stringify(ctx), 'utf8');
    }
  } catch { /* nicht kritisch */ }
}

export function register(server, soulId, token) {
  server.tool(
    'session_end',
    [
      'Schließt die aktuelle Session ab und speichert eine Zusammenfassung.',
      'Aufrufen wenn der Nutzer "session end" schreibt.',
      'Schreibt NUR was in dieser Session neu war — kein bekannter Soul-Kontext.',
      'Führt denselben Workflow wie @session-end aus: Eintrag in sys.md + Detaildatei.',
    ].join(' '),
    {
      summary:  z.string().describe('Zusammenfassung dieser Session. Nur neue Erkenntnisse — kein bekannter Soul-Kontext.'),
      insights: z.array(z.string()).optional().describe('Optionale Liste konkreter neuer Fakten oder Entscheidungen'),
      channel:  z.enum(['claude_ai', 'elevenlabs', 'other']).optional().describe('Kanal der Session (Standard: claude_ai)'),
    },
    async ({ summary, insights = [], channel = 'claude_ai' }) => {
      if (!soulId) return { content: [{ type: 'text', text: 'Fehler: soulId nicht verfügbar' }], isError: true };

      const errors = [];

      // ── 1. Detaildatei session_YYYY-MM-DD.md ──────────────────────────────
      try {
        const now      = new Date();
        const dateStr  = now.toISOString().slice(0, 10);
        const timeStr  = now.toISOString().slice(11, 16) + ' UTC';
        const filename = `session_${dateStr}.md`;
        const dir      = `${SOULS_DIR}${soulId}/vault/context`;
        const filePath = `${dir}/${filename}`;

        await mkdir(dir, { recursive: true });

        const channelLabel = { claude_ai: 'Claude.ai', elevenlabs: 'ElevenLabs Voice', other: 'Sonstig' }[channel] || channel;

        const block = [
          `## ${timeStr} — ${channelLabel}`,
          '',
          summary.trim(),
          ...(insights.length ? ['', '**Neue Erkenntnisse:**', ...insights.map(i => `- ${i}`)] : []),
          '',
          '---',
          '',
        ].join('\n');

        let existing = '';
        try { existing = await readFile(filePath, 'utf8'); } catch { /* neue Datei */ }

        const content = existing
          ? existing + block
          : `# Sessions ${dateStr}\n\n` + block;

        await writeFile(filePath, content, 'utf8');
        await ensureContextRegistered(soulId, filename);
      } catch (err) {
        errors.push(`Detaildatei: ${err.message}`);
      }

      // ── 2. sys.md → ## Session-Log (komprimiert) ──────────────────────────
      if (token) {
        try {
          const now     = new Date();
          const dateStr = now.toISOString().slice(0, 10);
          const channelSuffix = channel === 'elevenlabs' ? ' (ElevenLabs)' : channel === 'other' ? ' (extern)' : '';
          // Erste Zeile der Zusammenfassung als komprimierter Log-Eintrag
          const firstLine = summary.trim().split('\n')[0].replace(/^[-*#\s]+/, '').trim();
          const logEntry  = `- **${dateStr}${channelSuffix}:** ${firstLine}`;

          const section   = 'Session-Log (komprimiert)';
          const current   = await getText('/api/soul', token);
          // Sektion anlegen/erweitern — neue Einträge oben (prepend)
          const updated   = updateSection(current, section, logEntry, 'prepend');
          await putJson('/api/context', token, { soul_content: updated });
        } catch (err) {
          errors.push(`sys.md: ${err.message}`);
        }
      }

      if (errors.length) {
        return { content: [{ type: 'text', text: `Teilweise gespeichert. Fehler: ${errors.join('; ')}` }] };
      }
      return { content: [{ type: 'text', text: 'Session gespeichert.' }] };
    }
  );
}
