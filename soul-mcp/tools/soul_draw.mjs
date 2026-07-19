/**
 * soul_draw — Rendert eine Zeichnung headless (ohne Maus/Mensch) aus wenigen
 * groben Kontrollpunkten pro Pinselstrich. Grundlage dafür, dass eine Soul
 * (z.B. KRO) über Tage/Wochen/Monate/Jahre an einem Werk weitermalen kann.
 *
 * Persistenz-Modell (zwei Dateien pro canvas_id, an getrennten Orten):
 *   vault_shared/{canvas_id}.png — flaches Raster, unverschlüsselt (wie
 *                      vault_shared_upload.mjs — Peer-Freigabe-Staging-Bereich).
 *                      Wird bei jedem Aufruf geladen, neue Striche oben
 *                      draufgezeichnet, neu gespeichert. Für Vorschau/Teilen.
 *   vault/context/{canvas_id}.svg — echtes Vektor-Dokument (offener W3C-
 *                      Standard), VERSCHLÜSSELT wie mind.md/sys.md (AES-256-CBC,
 *                      SYS\x01-Header). Bewusst NICHT in vault_shared: dort
 *                      könnte grundsätzlich jeder mit Zugriff auf die geteilte
 *                      Datei "mitmalen" (Upload gleichen Dateinamens würde die
 *                      Quelle ersetzen) — vault/context ist der geschützte
 *                      Owner-Bereich, nur über context_get lesbar, nicht über
 *                      die Peer-Sharing-Infrastruktur erreichbar. Neue Striche
 *                      werden als zusätzliche <path>-Elemente vor dem
 *                      schließenden </svg>-Tag eingefügt (append-only) — kein
 *                      Parsen/Rekonstruieren alter Striche nötig.
 *
 * Zugriffsschutz: KEINE Domain-Whitelist mehr (eine frühere Version hatte
 * eine — verworfen, weil sie nichts Echtes beweisen konnte: sobald einmal
 * geschrieben, ist das <metadata>-Element im SVG eine ganz normale Textstelle
 * in einer Datei, die jeder mit Entschlüsselungs-/Schreibzugriff später
 * beliebig ändern kann — kein Signatur-/Tamper-Schutz auf dem Feld selbst.
 * Eine Whitelist hätte also höchstens Fehlkonfiguration beim SCHREIBEN
 * verhindert, aber nie eine echte Manipulationssicherheit hergestellt).
 * Stattdessen zählt, WER überhaupt bis hierher kommt: soul_draw ist nur über
 * zwei Pfade erreichbar, beide verlangen bereits echte soul_cert-Auth —
 *   1. MCP (Claude.ai/Claude Desktop): nur in registerTools() registriert
 *      (siehe tools/index.mjs), dem Owner-Pfad — der service_token dort wird
 *      ausschließlich über den OAuth-Flow ausgestellt, der seinerseits einen
 *      gültigen soul_cert verlangt (siehe oauth.mjs, validateCert()).
 *   2. In-App-Chat (/internal/run-tool): nginx prüft soul_cert bereits per
 *      access_by_lua_file soul_auth.lua, BEVOR die Anfrage überhaupt bis zu
 *      diesem internen Endpunkt durchgereicht wird (siehe Kommentar dort).
 * soul_draw ist bewusst NICHT in registerPaidTools()/registerPeerTools()
 * verdrahtet — zahlende externe Agenten und Peers kommen also gar nicht erst
 * an dieses Tool heran, unabhängig von jeder Domain-Frage.
 *
 * Fortschritt in der Soul verankern: jeder Aufruf schreibt einen Eintrag in
 * sys.md ("## Kunstwerke") inkl. SHA-256-Hash des aktuellen SVG-Inhalts —
 * soul_growth_chain hasht den GESAMTEN sys.md-Inhalt bei jedem Anker-Vorgang
 * (siehe useChainAnchor.js), eine Änderung an sys.md reicht also, damit der
 * nächste (vom Besitzer manuell ausgelöste, Wallet-signierte) Anker
 * automatisch belegt, dass zu diesem Zeitpunkt bereits an diesem Werk
 * gearbeitet wurde — UND welchen exakten Inhalt die SVG zu diesem Zeitpunkt
 * hatte (der SVG-Hash macht spätere, nachträgliche Änderungen an der Datei
 * selbst erkennbar: stimmt der aktuelle Hash nicht mehr mit einem verankerten
 * Eintrag überein, wurde die Datei nach der Verankerung verändert). soul_draw
 * selbst löst KEINE Blockchain-Transaktion aus — das bleibt eine bewusste,
 * kostenpflichtige Owner-Aktion.
 *
 * Nutzt @napi-rs/canvas — sowohl createCanvas (Raster) als auch SVGCanvas
 * (Vektor) teilen sich dieselbe Canvas-2D-API, drawStroke() unten läuft
 * unverändert gegen beide.
 */

import { createCanvas, loadImage, SVGCanvas, SvgExportFlag } from '@napi-rs/canvas';
import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { createHash } from 'crypto';
import { z } from 'zod';
import { SOULS_DIR, encryptBuf, decryptIfNeeded, loadVaultMeta } from '../lib/vault_fs.mjs';
import { sharedFileUrl } from '../lib/api.mjs';
import { recordArtworkProgress } from '../lib/artwork_log.mjs';

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const PAPER = '#EDE6D6';

// ── Kern-Renderer (reine Canvas-2D-Logik, läuft gegen Raster- UND SVG-Context) ─

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

// Natürliche Taper-Hüllkurve: Strich beginnt/endet dünn, ist in der Mitte am
// kräftigsten. Als viele kurze Segmente mit je eigener lineWidth gerendert —
// funktioniert im SVGCanvas identisch zum Raster-Canvas (jedes Segment wird
// zu einem eigenen <path> mit eigenem stroke-width, echte Vektor-Taper-Optik).
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

// ── SVG-Hilfsfunktionen ───────────────────────────────────────────────────────

// Rendert nur die übergebenen Striche (kein Hintergrund) und liefert das
// innere Markup (ohne äußeres <svg>-Tag) — das wird bei Fortsetzung vor
// </svg> in die bestehende Datei gespliced. Ein eigenes SVGCanvas PRO Strich,
// nicht eins für alle: getContent() ist destruktiv (flusht/resettet den
// internen Aufzeichnungs-State bei jedem Aufruf, live getestet — ein zweiter
// Strich auf demselben SVGCanvas nach bereits einmal aufgerufenem getContent()
// hätte den ersten Strich stillschweigend verworfen). Jeder Strich bekommt
// einen <!-- stroke --> Kommentar davor, rein zum verlässlichen Zählen (ein
// Strich kann durch den Taper-Loop in viele <path>-Segmente zerfallen — ohne
// Marker wäre "Anzahl Striche insgesamt" aus dem SVG nicht rekonstruierbar).
function renderStrokesToSvgFragment(strokes, width, height) {
  let fragment = '';
  for (const stroke of strokes) {
    const canvas = new SVGCanvas(width, height, SvgExportFlag.RelativePathEncoding);
    const ctx = canvas.getContext('2d');
    drawStroke(ctx, stroke);
    const full = canvas.getContent().toString('utf8');
    const inner = (full.match(/<svg[^>]*>([\s\S]*)<\/svg>/) || [, ''])[1];
    fragment += `\t<!-- stroke -->\n${inner}`;
  }
  return fragment;
}

// Flache Hintergrundfarbe statt paintPaper()s gesprenkelter Papier-Textur:
// jeder der 1400 Speckle-Kreise wird von SVGCanvas als eigener, ziemlich
// verboser Bezier-Pfad exportiert — live gemessen: ~2.7 MB allein für den
// Hintergrund, noch bevor ein einziger Strich dazukommt. Für ein Dokument,
// das über Jahre wachsen soll, unpraktikabel. Die Textur bleibt im PNG
// (dort sind es einfach günstige Pixel), das SVG bekommt nur die Grundfarbe.
function buildNewSvgDocument(width, height, background, strokesFragment) {
  const canvas = new SVGCanvas(width, height, SvgExportFlag.RelativePathEncoding);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = (!background || background === 'paper') ? PAPER : background;
  ctx.fillRect(0, 0, width, height);
  const withBg = canvas.getContent().toString('utf8');
  return withBg.replace(/<\/svg>\s*$/, `${strokesFragment}</svg>\n`);
}

function spliceSvgFragment(existingSvgText, strokesFragment) {
  return existingSvgText.replace(/<\/svg>\s*$/, `${strokesFragment}</svg>\n`);
}

function countStrokes(svgText) {
  return (svgText.match(/<!--\s*stroke\s*-->/g) || []).length;
}

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function fileExists(p) {
  try { await stat(p); return true; } catch { return false; }
}

// vault/context/-Dateien werden in api_context.json's synced_files.context
// registriert, damit sie über context_list auffindbar sind — gleiches Muster
// wie context_write.mjs's ensureContextRegistered().
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

// ── MCP-Tool-Registrierung ────────────────────────────────────────────────────
// Owner-only, gleiche Kategorie wie context_write/vault_shared_upload — nur
// dort registriert wo soulId bekannt ist (siehe tools/index.mjs registerTools()).
// PNG bleibt unverschlüsselt in vault_shared (wie vault_shared_upload.mjs) —
// das ist bewusst ein Peer-Freigabe-Staging-Bereich, keine Vault-Verschlüsselung.

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
  style: z.enum(['ink', 'solid', 'eraser']).optional()
    .describe('"eraser" löscht nur im PNG (destination-out) — im append-only SVG wird stattdessen mit der Papierfarbe übermalt, echtes Löschen alter SVG-Striche ist nicht möglich.'),
});

// Geteilter Kern — genutzt sowohl vom MCP-Tool unten (register(), für Claude.ai/
// Claude Desktop) als auch von server.mjs's /internal/run-tool (für den In-App-
// Chat, siehe dortiger 'soul_draw'-Case). Zwei unabhängige, von Hand gepflegte
// Tool-Registries in diesem Projekt (useClaude.js/server.mjs für den In-App-Chat,
// tools/index.mjs für MCP) — ohne diese Trennung von Rendering/Persistenz und
// MCP-Response-Formatierung hätte server.mjs die komplette Canvas-/SVG-Logik
// ein zweites Mal reimplementieren müssen, mit allen bereits hier gefixten
// Bugs (destruktives SVGCanvas.getContent(), Papier-Textur-Dateigröße) erneut
// zum Risiko.
export async function runSoulDraw(soulId, token, { canvas_id, width, height, background, strokes, description }) {
  const pngDir  = `${SOULS_DIR}${soulId}/vault_shared`;
  const ctxDir  = `${SOULS_DIR}${soulId}/vault/context`;
  const pngPath = `${pngDir}/${canvas_id}.png`;
  const svgPath = `${ctxDir}/${canvas_id}.svg`;
  await mkdir(pngDir, { recursive: true });
  await mkdir(ctxDir, { recursive: true });

  const { vaultKeyHex, cipherMode } = await loadVaultMeta(soulId);
  const isNew = !(await fileExists(svgPath));

  let canvas, ctx, w, h, existingSvgText = null;

  if (isNew) {
    w = width || 1600;
    h = height || 1200;
    canvas = createCanvas(w, h);
    ctx = canvas.getContext('2d');
    if (!background || background === 'paper') paintPaper(ctx, w, h);
    else { ctx.fillStyle = background; ctx.fillRect(0, 0, w, h); }
  } else {
    const existingPng = await readFile(pngPath);
    const img = await loadImage(existingPng);
    w = img.width;
    h = img.height;
    canvas = createCanvas(w, h);
    ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const rawSvg = await readFile(svgPath).catch(() => null);
    existingSvgText = rawSvg ? decryptIfNeeded(rawSvg, vaultKeyHex).toString('utf8') : null;
  }

  for (const stroke of strokes) drawStroke(ctx, stroke);
  const pngBuf = canvas.toBuffer('image/png');
  await writeFile(pngPath, pngBuf);

  const svgFragment = renderStrokesToSvgFragment(strokes, w, h);
  const svgText = isNew || !existingSvgText
    ? buildNewSvgDocument(w, h, background, svgFragment)
    : spliceSvgFragment(existingSvgText, svgFragment);

  let svgOutBuf = Buffer.from(svgText, 'utf8');
  if (cipherMode === 'ciphered' && vaultKeyHex) svgOutBuf = encryptBuf(svgOutBuf, vaultKeyHex);
  await writeFile(svgPath, svgOutBuf);
  await ensureContextRegistered(soulId, `${canvas_id}.svg`);

  const totalStrokes = countStrokes(svgText);
  const svgHash = sha256Hex(svgText);

  const stageLabel = `${isNew ? 'begonnen' : 'fortgesetzt'} (+${strokes.length} Striche, insgesamt ${totalStrokes})`;
  await recordArtworkProgress(soulId, canvas_id, { stageLabel, contentHash: svgHash });

  const vaultUrlPng = `vault-shared://${soulId}/${canvas_id}.png`;
  const viewUrlPng  = token ? sharedFileUrl(soulId, `${canvas_id}.png`, token) : null;
  const sizeKb      = Math.ceil(pngBuf.length / 1024);

  return { isNew, w, h, pngBuf, sizeKb, totalStrokes, vaultUrlPng, viewUrlPng, svgHash, description };
}

export function formatSoulDrawSummary(canvasId, strokeCount, result) {
  const { isNew, w, h, sizeKb, totalStrokes, vaultUrlPng, viewUrlPng, svgHash, description } = result;
  const descPart = description ? ` — ${description}` : '';
  return [
    isNew
      ? `Neues Werk "${canvasId}" angelegt (${w}×${h}px, ${strokeCount} Striche).`
      : `"${canvasId}" fortgesetzt — ${strokeCount} neue Striche hinzugefügt (insgesamt ${totalStrokes}).`,
    `PNG: ${sizeKb} KB${viewUrlPng ? ` — ${viewUrlPng}` : ''}`,
    `SVG (Vektor-Quelle, geschützt in vault/context) — über context_get "${canvasId}.svg" lesbar.`,
    `Fortschritt in sys.md ("## Kunstwerke") vermerkt (sha256 ${svgHash.slice(0, 12)}…) — fließt in den nächsten Blockchain-Anker ein.`,
    '',
    `Mit peer_send teilen (PNG):`,
    `  to: "Till" (oder "alle")`,
    `  message: "[${canvasId}.png](${vaultUrlPng})${descPart}"`,
  ].filter(Boolean).join('\n');
}

export function register(server, soulId, token) {
  server.tool(
    'soul_draw',
    [
      'Zeichnet oder erweitert ein Bild headless (ohne Maus/Mensch) aus einer Liste von',
      'Pinselstrichen. Für langfristige Werke gedacht — mit derselben canvas_id über Tage,',
      'Wochen, Monate oder Jahre hinweg weiterzeichnen, jeder Aufruf fügt neue Striche hinzu.',
      '',
      'Speichert {canvas_id}.png (Raster-Vorschau, unverschlüsselt) in vault_shared —',
      'zum Teilen/Betrachten, z.B. per peer_send. Die eigentliche Werk-Quelle ist',
      '{canvas_id}.svg (echtes Vektor-Dokument, offener Standard), geschützt und',
      'verschlüsselt in vault/context — dort über context_get lesbar, aber nicht über',
      'die Peer-Sharing-Infrastruktur erreichbar, damit nur der Besitzer daran',
      'weiterzeichnen kann. Jeder Aufruf trägt außerdem einen Fortschritts-Eintrag in',
      'sys.md ("## Kunstwerke") ein — fließt automatisch in den nächsten (vom Besitzer',
      'ausgelösten) Blockchain-Anker als Beleg ein, dass zu diesem Zeitpunkt bereits',
      'am Werk gearbeitet wurde.',
      '',
      'Wenige grobe Kontrollpunkte pro Strich reichen (3–6) — Catmull-Rom-Interpolation',
      'macht daraus eine weiche Kurve, eine Taper-Hüllkurve simuliert Pinselgefühl.',
      'Kein Bedarf, hunderte Pixel-Koordinaten einzeln zu generieren.',
      '',
      'Beim allerersten Aufruf mit einer neuen canvas_id: width/height/background legen',
      'die Leinwand an. Bei jedem weiteren Aufruf mit derselben canvas_id werden diese',
      'Parameter ignoriert (Leinwandgröße bleibt fix), nur strokes werden hinzugefügt.',
    ].join('\n'),
    {
      canvas_id: z.string().min(1).max(80).regex(/^[A-Za-z0-9_\-]+$/, 'Nur alphanumerisch + - _')
        .describe('Eindeutiger Name des Werks — dieselbe canvas_id in künftigen Aufrufen setzt genau dieses Werk fort.'),
      width: z.number().int().min(64).max(4096).optional().describe('Breite in px (nur bei Neuanlage, Standard 1600)'),
      height: z.number().int().min(64).max(4096).optional().describe('Höhe in px (nur bei Neuanlage, Standard 1200)'),
      background: z.string().max(20).optional()
        .describe('"paper" für strukturiertes Papier (Standard), oder Hex-Farbe wie "#1c1b18" — nur bei Neuanlage'),
      strokes: z.array(strokeSchema).min(1).max(500)
        .describe('Neue Pinselstriche, die zum Werk hinzugefügt werden'),
      description: z.string().max(200).optional().describe('Optionale Beschreibung für peer_send'),
    },
    async ({ canvas_id, width, height, background, strokes, description }) => {
      try {
        const result = await runSoulDraw(soulId, token, { canvas_id, width, height, background, strokes, description });
        return {
          content: [
            { type: 'image', data: result.pngBuf.toString('base64'), mimeType: 'image/png' },
            { type: 'text', text: formatSoulDrawSummary(canvas_id, strokes.length, result) },
          ],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
