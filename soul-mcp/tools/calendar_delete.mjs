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

function removeEntries(calSection, date, title) {
  const lines = calSection.split('\n');
  const before = lines.length;
  const filtered = lines.filter(line => {
    const m = line.match(/[-*]\s*\*{0,2}(\d{4}-\d{2}-\d{2})\*{0,2}[:\s]+(.+)/);
    if (!m) return true;
    if (m[1] !== date) return true;
    // Wenn title angegeben: nur exakte Übereinstimmung löschen
    if (title && m[2].trim() !== title.trim()) return true;
    return false;
  });
  return { section: filtered.join('\n'), deleted: before - filtered.length };
}

function deleteFromKalender(md, date, title) {
  const re = /(## Kalender[ \t]*\n)([\s\S]*?)(?=\n## |$)/;
  const normalized = md.replace(/\r\n/g, '\n').trimEnd();
  const match = normalized.match(re);
  if (!match) return { md: normalized, deleted: 0 };

  const { section, deleted } = removeEntries(match[2].trim(), date, title);
  const replacement = section.trim()
    ? `## Kalender\n${section.trim()}\n`
    : '';  // leere Sektion komplett entfernen
  return { md: normalized.replace(re, () => replacement), deleted };
}

export function register(server, token) {
  server.tool(
    'calendar_delete',
    'Löscht einen oder alle Termine für ein bestimmtes Datum aus dem Kalender. ' +
    'Ohne title werden alle Einträge dieses Datums gelöscht. ' +
    'Mit title wird nur der exakt passende Eintrag gelöscht.',
    {
      date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Datum des zu löschenden Termins (YYYY-MM-DD)'),
      title: z.string().optional().describe('Titel des Termins (optional — ohne Angabe alle Einträge dieses Datums löschen)'),
    },
    async ({ date, title }) => {
      try {
        return await withLock(token, async () => {
          const current = await getText('/api/soul', token);
          const { md: updated, deleted } = deleteFromKalender(current, date, title);

          if (deleted === 0) {
            return {
              content: [{ type: 'text', text: JSON.stringify({
                ok: false,
                message: title
                  ? `Kein Eintrag "${date}: ${title}" gefunden.`
                  : `Keine Einträge für ${date} gefunden.`,
              }, null, 2) }],
            };
          }

          const result = await putJson('/api/context', token, { soul_content: updated });
          if (!result?.ok) {
            return { content: [{ type: 'text', text: `Fehler: ${JSON.stringify(result)}` }], isError: true };
          }
          return {
            content: [{ type: 'text', text: JSON.stringify({
              ok: true, date, deleted,
              message: `${deleted} Eintrag/Einträge für ${date} gelöscht.`,
            }, null, 2) }],
          };
        });
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );
}
