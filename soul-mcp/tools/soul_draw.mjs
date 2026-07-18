/**
 * soul_draw — Rendert eine Zeichnung headless (ohne Maus/Mensch) aus wenigen
 * groben Kontrollpunkten pro Pinselstrich und speichert sie als PNG in
 * vault_shared. Grundlage dafür, dass eine Soul (z.B. KRO) eigenständig
 * "malt" — ein LLM muss dafür keine hunderte Pixel-Koordinaten generieren,
 * Catmull-Rom-Interpolation macht aus 3–6 Punkten eine weiche Kurve, eine
 * Taper-Hüllkurve (dünn–dick–dünn) simuliert echtes Pinselgefühl.
 *
 * Nutzt @napi-rs/canvas statt node-canvas — liefert fertige Binaries mit,
 * kein Cairo/Pango als Systembibliothek nötig (kein Build-Toolchain-Ärger
 * auf dem VPS bei jedem Node-Update).
 */

import { createCanvas } from '@napi-rs/canvas';
import { writeFile, mkdir } from 'fs/promises';
import { z } from 'zod';
import { SOULS_DIR } from '../lib/vault_fs.mjs';
import { sharedFileUrl } from '../lib/api.mjs';

const PAPER = '#EDE6D6';

// ── Kern-Renderer (reine Canvas-Logik, keine Vault-/MCP-Kenntnis nötig) ──────

function paintPaper(ctx, w, h) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Catmull-Rom Interpolation, damit wenige Kontrollpunkte (die ein LLM
// realistisch liefern kann) zu einer weichen Kurve werden.
function catmullRomPoints(points, segmentsPerSpan = 12) {
  if (points.length < 3) return points;
  const pts = [points[0], ...points, points[points.length - 1]];
  const out = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];
    for (let t = 0; t < segmentsPerSpan; t++) {
      const s = t / segmentsPerSpan;
      const s2 = s * s, s3 = s2 * s;
      const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * s +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * s2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * s3);
      const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * s +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * s2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * s3);
      const pr0 = p1.pressure ?? 0.7, pr1 = p2.pressure ?? 0.7;
      out.push({ x, y, pressure: pr0 + (pr1 - pr0) * s });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// Natürliche Taper-Hüllkurve: Strich beginnt/endet dünn, ist in der Mitte
// am kräftigsten — wie beim Aufsetzen/Abheben eines echten Pinsels.
function taperEnvelope(t) {
  return Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
}

function drawStroke(ctx, stroke) {
  const { points, color = '#1c1b18', width = 14, opacity = 0.9, style = 'ink' } = stroke;
  if (!points || points.length < 2) return;

  const smoothed = catmullRomPoints(points);
  ctx.globalCompositeOperation = style === 'eraser' ? 'destination-out' : 'source-over';
  ctx.globalAlpha = style === 'eraser' ? 1 : opacity;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < smoothed.length - 1; i++) {
    const t = i / (smoothed.length - 1);
    const pressure = smoothed[i].pressure ?? (style === 'solid' ? 1 : taperEnvelope(t) * 0.7 + 0.3);
    ctx.lineWidth = Math.max(0.6, width * pressure);
    ctx.beginPath();
    ctx.moveTo(smoothed[i].x, smoothed[i].y);
    ctx.lineTo(smoothed[i + 1].x, smoothed[i + 1].y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function renderSoulDrawing({ width = 1600, height = 1200, background = 'paper', strokes = [] }) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  if (!background || background === 'paper') {
    paintPaper(ctx, width, height);
  } else {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }

  for (const stroke of strokes) drawStroke(ctx, stroke);

  return canvas.toBuffer('image/png');
}

// ── MCP-Tool-Registrierung ────────────────────────────────────────────────────
// Owner-only, gleiche Kategorie wie context_write/vault_shared_upload — nur
// dort registriert wo soulId bekannt ist (siehe tools/index.mjs registerTools()).
// Kein cipherMode/encryptBuf wie bei context_write: vault_shared ist bewusst
// unverschlüsselt (Peer-Freigabe-Staging-Bereich, gleiches Verhalten wie das
// bereits bestehende vault_shared_upload.mjs, an das sich dieses Tool anlehnt).

const strokePointSchema = z.object({
  x: z.number(),
  y: z.number(),
  pressure: z.number().min(0).max(1).optional()
    .describe('0–1, optional. Ohne Angabe: automatischer Taper (dünn–dick–dünn).'),
});

const strokeSchema = z.object({
  points: z.array(strokePointSchema).min(2).max(200)
    .describe('Wenige Kontrollpunkte reichen (3–6 pro Strich) — werden automatisch zu einer weichen Kurve interpoliert.'),
  color: z.string().max(20).optional().describe('Hex-Farbe, z.B. "#A8402F"'),
  width: z.number().min(0.5).max(200).optional().describe('Grundstärke des Strichs in px'),
  opacity: z.number().min(0).max(1).optional(),
  style: z.enum(['ink', 'solid', 'eraser']).optional(),
});

export function register(server, soulId, token) {
  server.tool(
    'soul_draw',
    [
      'Zeichnet ein Bild headless (ohne Maus/Mensch) aus einer Liste von Pinselstrichen',
      'und speichert es in vault_shared. Für eigenständige visuelle Werke.',
      '',
      'Wenige grobe Kontrollpunkte pro Strich reichen (3–6) — Catmull-Rom-Interpolation',
      'macht daraus eine weiche Kurve, eine Taper-Hüllkurve simuliert Pinselgefühl.',
      'Kein Bedarf, hunderte Pixel-Koordinaten einzeln zu generieren.',
    ].join('\n'),
    {
      width: z.number().int().min(64).max(4096).optional().describe('Breite in px (Standard 1600)'),
      height: z.number().int().min(64).max(4096).optional().describe('Höhe in px (Standard 1200)'),
      background: z.string().max(20).optional()
        .describe('"paper" für strukturiertes Papier (Standard), oder Hex-Farbe wie "#1c1b18"'),
      strokes: z.array(strokeSchema).min(1).max(500)
        .describe('Liste von Pinselstrichen, die nacheinander gezeichnet werden'),
      filename: z.string().max(80).regex(/^[A-Za-z0-9_\-]*$/, 'Nur alphanumerisch + - _').optional()
        .describe('Dateiname ohne Endung, Standard: Zeitstempel'),
      description: z.string().max(200).optional().describe('Optionale Beschreibung für peer_send'),
    },
    async ({ width, height, background, strokes, filename, description }) => {
      try {
        const buf = renderSoulDrawing({ width, height, background, strokes });

        const ts        = Date.now();
        const safe      = (filename || `soul-draw-${ts}`).replace(/[^A-Za-z0-9_\-]/g, '_');
        const storedName = `${ts}_${safe}.png`;
        const dir        = `${SOULS_DIR}${soulId}/vault_shared`;
        await mkdir(dir, { recursive: true });
        await writeFile(`${dir}/${storedName}`, buf);

        const vaultUrl = `vault-shared://${soulId}/${storedName}`;
        const viewUrl  = token ? sharedFileUrl(soulId, storedName, token) : null;
        const sizeKb   = Math.ceil(buf.length / 1024);
        const descPart = description ? ` — ${description}` : '';

        return {
          content: [
            { type: 'image', data: buf.toString('base64'), mimeType: 'image/png' },
            {
              type: 'text',
              text: [
                `Gezeichnet und gespeichert: ${storedName} (${sizeKb} KB, ${strokes.length} Striche)`,
                viewUrl ? `Direkt öffnen: ${viewUrl}` : '',
                '',
                `Mit peer_send teilen:`,
                `  to: "Till" (oder "alle")`,
                `  message: "[${safe}.png](${vaultUrl})${descPart}"`,
              ].filter(Boolean).join('\n'),
            },
          ],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
