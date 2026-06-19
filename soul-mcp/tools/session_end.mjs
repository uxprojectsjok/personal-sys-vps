/**
 * session_end — Schließt eine Claude.ai-Session ab und speichert die Zusammenfassung.
 * Claude schreibt die Zusammenfassung selbst (kennt den Gesprächsverlauf),
 * filtert bekannten Kontext heraus und hält nur neue Erkenntnisse fest.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { z } from 'zod';
import { SOULS_DIR } from '../lib/vault_fs.mjs';

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

export function register(server, soulId) {
  server.tool(
    'session_end',
    [
      'Schließt die aktuelle Session ab und speichert eine Zusammenfassung.',
      'Aufrufen wenn der Nutzer die Session beendet ("tschüss", "bis später", "session speichern" o.ä.).',
      'Claude schreibt die Zusammenfassung selbst — NUR was in dieser Session neu war,',
      'kein Kontext der bereits in der Soul bekannt war.',
    ].join(' '),
    {
      summary:  z.string().describe('Zusammenfassung dieser Session: was wurde besprochen, entschieden, gelernt. Nur neue Erkenntnisse — kein bekannter Soul-Kontext.'),
      insights: z.array(z.string()).optional().describe('Optionale Liste konkreter neuer Fakten oder Entscheidungen (je ein kurzer Satz)'),
      channel:  z.enum(['claude_ai', 'elevenlabs', 'other']).optional().describe('Kanal der Session (Standard: claude_ai)'),
    },
    async ({ summary, insights = [], channel = 'claude_ai' }) => {
      if (!soulId) return { content: [{ type: 'text', text: 'Fehler: soulId nicht verfügbar' }], isError: true };

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

        // An bestehende Tagesdatei anhängen oder neu anlegen
        let existing = '';
        try { existing = await readFile(filePath, 'utf8'); } catch { /* neue Datei */ }

        const content = existing
          ? existing + block
          : `# Sessions ${dateStr}\n\n` + block;

        await writeFile(filePath, content, 'utf8');
        await ensureContextRegistered(soulId, filename);

        return { content: [{ type: 'text', text: `Session gespeichert: ${filename}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
