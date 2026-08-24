/**
 * soul_draw_snapshot — liefert das aktuelle, fertige PNG EINES (per
 * canvas_id) mit soul_draw gezeichneten Werks als Base64 zurück, für die
 * "Kunstwerk Galerie" MCP-App (shared/apps/kunstwerk-galerie/, vormals
 * "Kunstwerk Live"): Spinner beim Öffnen, dann das Bild.
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
 *
 * Bild-only in diesem Repo: die /opt/sys-Fassung deckt zusätzlich
 * soul_generate mode:"image-to-video" ab (checkPendingVideoGeneration()) —
 * dieses Repo hat soul_generate.mjs (WaveSpeed AI, kostenpflichtig) nie
 * bekommen, daher hier bewusst nur der PNG-Pfad. Response-Form
 * ({state, kind, ...}) bleibt trotzdem identisch zur /opt/sys-Fassung, damit
 * dieselbe kunstwerk-galerie-App (app.mjs) unverändert funktioniert — sie
 * zeigt hier einfach nie kind:"video".
 *
 * soul_gallery_list (unten) liefert zusätzlich ALLE Werke (nicht nur das
 * neueste) für die Vor-/Zurück-Navigation der Galerie-App, mit fest
 * referenzierter canvas_id pro Position — behebt einen live gemeldeten Bug
 * der alten "automatisch das Neueste"-Logik (zwei Werke konnten sich beim
 * Umspringen kurz überlagern). Kein `pending`-Feld hier (kein Video-Feature
 * in diesem Repo, siehe oben) — die /opt/sys-Fassung hat es zusätzlich.
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

// Alle Werke (nicht nur das neueste) für die Galerie-Navigation — gleicher
// Verzeichnis-Scan wie resolveLatestCanvasId(), sammelt aber statt nur zu
// vergleichen.
export async function listGalleryEntries(soulId) {
  const sharedDir = `${SOULS_DIR}${soulId}/vault_shared`;
  const entries = [];
  let dirEntries = [];
  try {
    dirEntries = await readdir(sharedDir, { withFileTypes: true });
  } catch { /* kein vault_shared — noch keine Werke */ }
  for (const entry of dirEntries) {
    if (!entry.isDirectory() || entry.name === 'apps') continue;
    const canvasId = entry.name;
    try {
      const st = await stat(`${sharedDir}/${canvasId}/${canvasId}.png`);
      entries.push({ canvas_id: canvasId, kind: 'image', updated_at: st.mtimeMs });
    } catch { /* kein PNG für diesen Ordner — überspringen */ }
  }
  entries.sort((a, b) => b.updated_at - a.updated_at);
  return { entries, pending: null };
}

export async function loadDrawSnapshot(soulId, canvasId) {
  const resolvedId = canvasId || await resolveLatestCanvasId(soulId);
  if (!resolvedId) return { canvas_id: null, state: 'empty' };
  const pngPath = `${artworkDir(soulId, resolvedId)}/${resolvedId}.png`;
  let buf, st;
  try {
    [buf, st] = await Promise.all([readFile(pngPath), stat(pngPath)]);
  } catch {
    return { canvas_id: resolvedId, state: 'empty' };
  }
  return {
    canvas_id: resolvedId,
    state: 'ready',
    kind: 'image',
    updated_at: st.mtimeMs,
    png_base64: buf.toString('base64'),
  };
}

export function register(server, soulId) {
  server.tool(
    'soul_draw_snapshot',
    [
      'Liefert das aktuelle, fertige PNG EINES (per canvas_id) mit soul_draw',
      'gezeichneten Werks als Base64 — für die "Kunstwerk Galerie"-App',
      '(shared/apps/kunstwerk-galerie/): Spinner beim Öffnen, dann das Bild.',
      'Ohne canvas_id wird automatisch das zuletzt geänderte Werk gewählt —',
      'für Navigation zwischen mehreren Werken stattdessen soul_gallery_list',
      'nutzen und die canvas_id explizit übergeben. Nicht für den normalen',
      'Chat gedacht (liefert rohe Bilddaten als JSON) — für eine',
      'menschenlesbare Beschreibung stattdessen vault_shared_get nutzen.',
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

  server.tool(
    'soul_gallery_list',
    [
      'Liefert ALLE Werke dieser Soul (canvas_id/kind/updated_at, neueste',
      'zuerst) — für die Vor-/Zurück-Navigation der "Kunstwerk Galerie"-App.',
      'Nicht für den normalen Chat gedacht — liefert rohe Daten als JSON.',
    ].join('\n'),
    {},
    async () => {
      try {
        const result = await listGalleryEntries(soulId);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    },
  );
}
