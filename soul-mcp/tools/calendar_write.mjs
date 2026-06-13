import { z } from 'zod';
import { getText, putJson } from '../lib/api.mjs';

const _queues = new Map();
async function withLock(token, fn) {
  const key = token.slice(0, 16);
  const prev = _queues.get(key) ?? Promise.resolve();
  let resolve;
  const current = new Promise(r => { resolve = r; });
  _queues.set(key, prev.then(() => current));
  await prev;
  try { return await fn(); } finally { resolve(); }
}

function entryLine(date, title) {
  return `- **${date}:** ${title}`;
}

function upsertEntry(calSection, date, title) {
  const lines = calSection.split('\n');
  const dateRe = new RegExp(`^[-*]\\s*\\*{0,2}${date}\\*{0,2}:`);
  const idx = lines.findIndex(l => dateRe.test(l.trim()));
  if (idx !== -1) {
    lines[idx] = entryLine(date, title);
    return lines.join('\n');
  }
  // Neu anhängen — sortiert nach Datum einfügen
  const newLine = entryLine(date, title);
  const insertAt = lines.findIndex(l => {
    const m = l.match(/\d{4}-\d{2}-\d{2}/);
    return m && m[0] > date;
  });
  if (insertAt === -1) {
    return [...lines.filter(l => l.trim()), newLine].join('\n');
  }
  lines.splice(insertAt, 0, newLine);
  return lines.filter(l => l.trim()).join('\n');
}

function updateKalenderSection(md, date, title) {
  // Bestehende Kalender-Sektion suchen
  const re = /(## Kalender[ \t]*\n)([\s\S]*?)(?=\n## |$)/;
  const match = md.replace(/\r\n/g, '\n').trimEnd().match(re);
  if (match) {
    const updated = upsertEntry(match[2].trim(), date, title);
    return md.replace(re, () => `## Kalender\n${updated}\n`);
  }
  // Keine Kalender-Sektion → am Ende anlegen
  return md.trimEnd() + `\n\n## Kalender\n${entryLine(date, title)}\n`;
}

export function register(server, token) {
  server.tool(
    'calendar_write',
    'Fügt einen Termin in den Kalender ein oder aktualisiert einen bestehenden (gleiche Datum). ' +
    'Einträge werden nach Datum sortiert gespeichert. ' +
    'Liest sys.md, ändert die ## Kalender-Sektion und schreibt zurück.',
    {
      date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Datum im Format YYYY-MM-DD'),
      title: z.string().min(1).max(500).describe('Titel oder Beschreibung des Termins'),
    },
    async ({ date, title }) => {
      try {
        return await withLock(token, async () => {
          const current = await getText('/api/soul', token);
          const updated = updateKalenderSection(current, date, title);
          const result  = await putJson('/api/context', token, { soul_content: updated });
          if (!result?.ok) {
            return { content: [{ type: 'text', text: `Fehler: ${JSON.stringify(result)}` }], isError: true };
          }
          return {
            content: [{ type: 'text', text: JSON.stringify({
              ok: true, date, title,
              message: `Termin "${date}: ${title}" gespeichert.`,
            }, null, 2) }],
          };
        });
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );
}
