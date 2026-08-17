/**
 * soul_draw_snapshot — liefert das aktuelle, fertige PNG eines mit soul_draw
 * gezeichneten Werks als Base64 zurück, für die "Kunstwerk Live" MCP-App
 * (shared/apps/kunstwerk-live/): Spinner beim Öffnen, dann das Bild.
 *
 * Bewusst NICHT die Strich-Geometrie (frühere "Live-Wiedergabe"-Fassung
 * dieser App hat sie clientseitig animiert nachgezeichnet — Feedback: wirkt
 * unruhig, das eigentlich Gewünschte ist einfach das fertige Ergebnis, ohne
 * Statuszeilen drumherum). Das echte PNG zurückzugeben ist außerdem
 * pixelgenau — anders als eine clientseitige Nachbildung fehlen hier keine
 * Brush-Textur/reflect-Spiegelung/echten Font-Details.
 *
 * canvas_id optional: ohne Angabe wird automatisch das zuletzt geänderte
 * Werk dieser Soul gewählt (per mtime des jeweiligen PNGs unter
 * vault_shared/) — die App kann so ohne jede Eingabe direkt "das, woran
 * gerade gearbeitet wird" zeigen.
 */

import { readFile, readdir, stat } from 'fs/promises';
import { z } from 'zod';
import { SOULS_DIR } from '../lib/vault_fs.mjs';
import { artworkDir } from '../lib/artwork_log.mjs';

async function resolveLatestCanvasId(soulId) {
  const sharedDir = `${SOULS_DIR}${soulId}/vault_shared`;
  let entries;
  try {
    entries = await readdir(sharedDir, { withFileTypes: true });
  } catch {
    return null;
  }
  let latest = null;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'apps') continue;
    const canvasId = entry.name;
    const pngPath = `${sharedDir}/${canvasId}/${canvasId}.png`;
    try {
      const st = await stat(pngPath);
      if (!latest || st.mtimeMs > latest.mtimeMs) latest = { canvasId, mtimeMs: st.mtimeMs };
    } catch { /* kein PNG für diesen Ordner — überspringen */ }
  }
  return latest?.canvasId ?? null;
}

export async function loadDrawSnapshot(soulId, canvasId) {
  const resolvedId = canvasId || await resolveLatestCanvasId(soulId);
  if (!resolvedId) return { canvas_id: null, ready: false };
  const pngPath = `${artworkDir(soulId, resolvedId)}/${resolvedId}.png`;
  let buf, st;
  try {
    [buf, st] = await Promise.all([readFile(pngPath), stat(pngPath)]);
  } catch {
    return { canvas_id: resolvedId, ready: false };
  }
  return {
    canvas_id: resolvedId,
    ready: true,
    updated_at: st.mtimeMs,
    png_base64: buf.toString('base64'),
  };
}

export function register(server, soulId) {
  server.tool(
    'soul_draw_snapshot',
    [
      'Liefert das aktuelle, fertige PNG eines mit soul_draw gezeichneten',
      'Werks als Base64 — für die "Kunstwerk Live"-App (shared/apps/',
      'kunstwerk-live/): Spinner beim Öffnen, dann das Bild. Ohne canvas_id',
      'wird automatisch das zuletzt geänderte Werk dieser Soul gewählt. Nicht',
      'für den normalen Chat gedacht (liefert rohe Bilddaten als JSON) — für',
      'eine menschenlesbare Beschreibung stattdessen vault_shared_get nutzen.',
    ].join('\n'),
    {
      canvas_id: z.string().min(1).max(80).regex(/^[A-Za-z0-9_\-]+$/).optional()
        .describe('Werk-ID. Ohne Angabe: das zuletzt geänderte Werk dieser Soul.'),
    },
    async ({ canvas_id }) => {
      try {
        const result = await loadDrawSnapshot(soulId, canvas_id);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    },
  );
}
