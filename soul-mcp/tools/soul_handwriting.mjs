/**
 * soul_handwriting.mjs — persönliches Handschriftprofil.
 *
 * Anders als soul_draw's mode:"text" (echter Font, garantiert lesbar, aber
 * geliehene Typografie — nicht die eigene Hand der Soul) UND anders als
 * freihändig gezeichnete Striche (echt die eigene Entscheidung der Soul,
 * aber bei jedem Werk neu erfunden, nicht wiedererkennbar/reproduzierbar):
 * hier hinterlegt die Soul EINMAL eigene Buchstaben-/Ziffernformen als
 * gewöhnliche Striche (dieselbe points/width/style/brush-Sprache wie
 * soul_draw), gespeichert pro Zeichen in einem Profil. soul_draw's
 * mode:"handwriting" (siehe expandHandwritingText unten, importiert von
 * dort) setzt daraus beliebigen Text zusammen — mit leichter, pro Auftreten
 * gewürfelter Variation (Rotation/Skalierung/Versatz/Abstand), damit zwei
 * Signaturen ähnlich, aber nie pixelgleich sind. Läuft komplett über echte
 * Vektor-Striche — kein Font, kein SVGCanvas-Text-Export-Bug, funktioniert
 * identisch in Raster UND SVG.
 *
 * Speicherort: vault/context/handwriting.json, verschlüsselt wie soul_draws
 * SVG-Quelle (gleicher vault_key_hex, gleiches encryptBuf/decryptIfNeeded).
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { z } from 'zod';
import { SOULS_DIR, encryptBuf, decryptIfNeeded, loadVaultMeta } from '../lib/vault_fs.mjs';

// Referenz-Koordinatenraum für gespeicherte Glyphen: 0..UNIT_HEIGHT hoch,
// Baseline bei BASELINE (Rest darunter für Unterlängen wie g/j/y/Komma).
// Fest statt konfigurierbar — sonst müsste jede Glyphe ihren eigenen
// Maßstab mitschleppen und expandHandwritingText könnte nicht mehr einfach
// alle Glyphen eines Profils konsistent skalieren.
export const UNIT_HEIGHT = 100;
export const BASELINE = 78;
const DEFAULT_ADVANCE = UNIT_HEIGHT * 0.55;
const SPACE_ADVANCE = UNIT_HEIGHT * 0.32;

function profilePath(soulId) { return `${SOULS_DIR}${soulId}/vault/context/handwriting.json`; }

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

export async function loadHandwritingProfile(soulId) {
  try {
    const { vaultKeyHex } = await loadVaultMeta(soulId);
    const raw = await readFile(profilePath(soulId));
    const dec = decryptIfNeeded(raw, vaultKeyHex);
    const parsed = JSON.parse(dec.toString('utf8'));
    return { glyphs: {}, ...parsed };
  } catch {
    return { glyphs: {} };
  }
}

export async function saveHandwritingProfile(soulId, glyphUpdates) {
  const profile = await loadHandwritingProfile(soulId);
  for (const g of glyphUpdates) {
    profile.glyphs[g.char] = { strokes: g.strokes, advance: g.advance ?? DEFAULT_ADVANCE };
  }
  const dir = `${SOULS_DIR}${soulId}/vault/context`;
  await mkdir(dir, { recursive: true });
  const { vaultKeyHex, cipherMode } = await loadVaultMeta(soulId);
  let buf = Buffer.from(JSON.stringify(profile), 'utf8');
  if (cipherMode === 'ciphered' && vaultKeyHex) buf = encryptBuf(buf, vaultKeyHex);
  await writeFile(profilePath(soulId), buf);
  await ensureContextRegistered(soulId, 'handwriting.json');
  return profile;
}

// Setzt `text` aus den gespeicherten Glyphen zusammen — echte Striche in
// ABSOLUTEN Canvas-Koordinaten, bereit für den normalen Render-Durchlauf
// (dispatchStrokeStyle kennt diese Striche nicht anders als jeden anderen).
// anchor = Baseline-Start links (gleiche Konvention wie mode:"text"s
// fillText-Anker, für Konsistenz zwischen beiden Text-Mechanismen).
export function expandHandwritingText(profile, anchor, text, opts = {}) {
  const {
    fontSize = 32, color = '#1c1b18', opacity = 0.9, jitter = 0.15,
    colorVariation, signature,
  } = opts;
  const scale = fontSize / UNIT_HEIGHT;
  const strokes = [];
  const missing = [];
  let penX = anchor.x;

  for (const ch of text) {
    if (ch === ' ') { penX += SPACE_ADVANCE * scale; continue; }
    const glyph = profile.glyphs?.[ch];
    if (!glyph) {
      missing.push(ch);
      penX += DEFAULT_ADVANCE * scale;
      continue;
    }
    // Ein Zufallswurf PRO GLYPHEN-AUFTRETEN (nicht pro Punkt) — sonst zerfällt
    // die Buchstabenform selbst. Macht jede Signatur reproduzierbar ähnlich,
    // aber nie pixelgleich, exakt wie bei echter Handschrift.
    const jRot   = (Math.random() - 0.5) * 2 * jitter * 0.15;
    const jScale = 1 + (Math.random() - 0.5) * 2 * jitter * 0.12;
    const jOffX  = (Math.random() - 0.5) * 2 * jitter * fontSize * 0.05;
    const jOffY  = (Math.random() - 0.5) * 2 * jitter * fontSize * 0.05;
    const cos = Math.cos(jRot), sin = Math.sin(jRot);

    for (const gs of glyph.strokes) {
      const points = gs.points.map(p => {
        const lx = p.x * scale * jScale;
        const ly = (p.y - BASELINE) * scale * jScale;
        const rx = lx * cos - ly * sin;
        const ry = lx * sin + ly * cos;
        return { x: penX + rx + jOffX, y: anchor.y + ry + jOffY, pressure: p.pressure };
      });
      strokes.push({
        points,
        color: gs.color || color,
        width: (gs.width || 3) * scale * jScale,
        opacity: gs.opacity ?? opacity,
        style: gs.style,
        brush: gs.brush,
        colorVariation,
        signature,
      });
    }
    const advanceJitter = 1 + (Math.random() - 0.5) * 2 * jitter * 0.1;
    penX += (glyph.advance || DEFAULT_ADVANCE) * scale * advanceJitter;
  }
  return { strokes, missing };
}

const glyphStrokeSchema = z.object({
  points: z.array(z.object({ x: z.number(), y: z.number(), pressure: z.number().min(0).max(1).optional() })).min(2).max(60)
    .describe(`Punkte im festen Referenzraum 0–${UNIT_HEIGHT} hoch (Baseline bei y=${BASELINE}, Raum darunter für Unterlängen wie g/j/y/Komma). Ein grober Anhalt für die Breite: schmale Zeichen (i,l,.) ca. 15-25 Einheiten breit, normale Buchstaben ca. 35-55, breite (m,w) ca. 55-75 — advance sollte etwas mehr als die tatsächliche Zeichenbreite sein (Platz für den nächsten Buchstaben).`),
  width: z.number().min(0.5).max(60).optional().describe('Strichstärke in Referenz-Einheiten (wird beim Zusammensetzen mit fontSize/100 skaliert). Standard 3.'),
  opacity: z.number().min(0).max(1).optional(),
  color: z.string().max(20).optional().describe('Überschreibt die beim Zusammensetzen übergebene Farbe nur für diesen Teil-Strich, falls gewünscht.'),
  style: z.enum(['ink', 'solid', 'dry', 'watercolor']).optional(),
  brush: z.object({
    length: z.number().min(1).max(50).optional(),
    bristleDensity: z.number().min(1).max(12).optional(),
    grain: z.number().min(0).max(1).optional(),
    jitter: z.number().min(0).max(20).optional(),
    opacityVariation: z.number().min(0).max(1).optional(),
    pressureVariation: z.number().min(0).max(1).optional(),
    edgeBreak: z.number().min(0).max(1).optional(),
  }).optional().describe('Wie bei soul_draw — für einen texturierten statt glatten Buchstaben-Strich.'),
});

export function register(server, soulId, token) {
  server.tool(
    'soul_handwriting_save',
    [
      'Speichert oder aktualisiert eigene Buchstaben-/Ziffernformen im persönlichen',
      'Handschriftprofil (vault/context/handwriting.json, verschlüsselt wie soul_draws',
      'SVG-Quelle). Jede Glyphe ist ein oder mehrere gewöhnliche Striche (points/width/',
      `style/brush wie bei soul_draw) im festen Referenzraum 0–${UNIT_HEIGHT} hoch,`,
      `Baseline bei y=${BASELINE}. Einmal definiert, kann soul_draw damit über mode:`,
      '"handwriting" beliebigen Text in dieser eigenen Handschrift zusammensetzen —',
      'mit leichter, bei jedem Aufruf neu gewürfelter Variation (Rotation/Skalierung/',
      'Versatz/Abstand), damit zwei Signaturen ähnlich, aber nie pixelgleich sind.',
      'Zeichen können einzeln oder in Gruppen definiert/überschrieben werden — das',
      'Profil wächst schrittweise, kein vollständiges Alphabet auf einmal nötig.',
    ].join('\n'),
    {
      glyphs: z.array(z.object({
        char: z.string().min(1).max(2).describe('Das Zeichen, z.B. "K", "7", ".", "·". Überschreibt eine evtl. bereits gespeicherte Definition desselben Zeichens.'),
        strokes: z.array(glyphStrokeSchema).min(1).max(8),
        advance: z.number().min(1).max(200).optional().describe(`Wie weit der "Stift" nach diesem Zeichen nach rechts rückt, in Referenz-Einheiten. Standard ${DEFAULT_ADVANCE}.`),
      })).min(1).max(40),
    },
    async ({ glyphs }) => {
      try {
        const profile = await saveHandwritingProfile(soulId, glyphs);
        const chars = glyphs.map(g => `"${g.char}"`).join(', ');
        return { content: [{ type: 'text', text: `Gespeichert: ${chars}. Profil enthält jetzt ${Object.keys(profile.glyphs).length} Zeichen.` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'soul_handwriting_list',
    'Zeigt, welche Zeichen im persönlichen Handschriftprofil bereits definiert sind (siehe soul_handwriting_save) — hilft zu entscheiden, welche Zeichen für eine geplante Signatur noch fehlen.',
    {},
    async () => {
      try {
        const profile = await loadHandwritingProfile(soulId);
        const chars = Object.keys(profile.glyphs);
        const text = chars.length
          ? `${chars.length} Zeichen definiert: ${chars.map(c => `"${c}"`).join(', ')}`
          : 'Noch keine Zeichen definiert — siehe soul_handwriting_save.';
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    },
  );
}
