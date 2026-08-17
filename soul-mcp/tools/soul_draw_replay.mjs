/**
 * soul_draw_replay — liest die Strich-für-Strich-Historie eines soul_draw-
 * Werks (vault_shared/{canvas_id}/{canvas_id}.strokes.jsonl, geschrieben von
 * appendStrokeReplayLog() in lib/artwork_log.mjs) für die "Kunstwerk Live"
 * MCP-App (shared/apps/kunstwerk-live/), die daraus eine Wiedergabe-
 * Animation baut, statt nur das fertige PNG zu zeigen.
 *
 * canvas_id optional: ohne Angabe wird automatisch das zuletzt geänderte
 * Werk dieser Soul gewählt (per mtime des jeweiligen strokes.jsonl unter
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
    const logPath = `${sharedDir}/${canvasId}/${canvasId}.strokes.jsonl`;
    try {
      const st = await stat(logPath);
      if (!latest || st.mtimeMs > latest.mtimeMs) latest = { canvasId, mtimeMs: st.mtimeMs };
    } catch { /* kein Replay-Log für dieses Werk — überspringen */ }
  }
  return latest?.canvasId ?? null;
}

export async function loadStrokeReplay(soulId, canvasId) {
  const resolvedId = canvasId || await resolveLatestCanvasId(soulId);
  if (!resolvedId) return { canvas_id: null, batches: [] };
  const logPath = `${artworkDir(soulId, resolvedId)}/${resolvedId}.strokes.jsonl`;
  let raw;
  try {
    raw = await readFile(logPath, 'utf8');
  } catch {
    return { canvas_id: resolvedId, batches: [] };
  }
  const batches = raw.split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
  return { canvas_id: resolvedId, batches };
}

export function register(server, soulId) {
  server.tool(
    'soul_draw_replay',
    [
      'Liest die vollständige Strich-für-Strich-Geometrie eines mit soul_draw',
      'gezeichneten Werks — für die "Kunstwerk Live"-App (shared/apps/',
      'kunstwerk-live/), die daraus eine Wiedergabe-Animation baut statt nur',
      'das fertige PNG zu zeigen. Ohne canvas_id wird automatisch das zuletzt',
      'geänderte Werk dieser Soul gewählt. Nicht für den normalen Chat gedacht',
      '(liefert rohe Punkt-Geometrie als JSON, keine Zusammenfassung) — für',
      'eine menschenlesbare Beschreibung stattdessen vault_shared_get auf das',
      'PNG oder context_get auf die SVG-Quelle nutzen.',
    ].join('\n'),
    {
      canvas_id: z.string().min(1).max(80).regex(/^[A-Za-z0-9_\-]+$/).optional()
        .describe('Werk-ID. Ohne Angabe: das zuletzt geänderte Werk dieser Soul.'),
    },
    async ({ canvas_id }) => {
      try {
        const result = await loadStrokeReplay(soulId, canvas_id);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    },
  );
}
