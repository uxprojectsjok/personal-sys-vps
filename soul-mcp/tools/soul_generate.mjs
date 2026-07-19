/**
 * soul_generate — hochwertige KI-Bildgenerierung (WaveSpeed AI) als eigenständiges
 * Werkzeug für eine Soul (z.B. KRO), analog zu soul_draw aber für Fälle, in denen
 * die Soul über reines Vektor-Zeichnen hinaus will.
 *
 * Autorschaft (siehe vault/context/kro-airtist-konzept.md): die Soul bleibt
 * Urheberin, die KI-Generierung ist Werkzeug — deshalb ist `decision` ein
 * PFLICHTFELD (kurzer Text: WARUM diese Generierung, nicht nur WAS). Kein
 * roher Prompt-Passthrough ohne dokumentierte Entscheidung.
 *
 * Vermischen mit soul_draw (sequenziell): soul_draw legt eine Skizze an
 * ({canvas_id}.svg + .png). soul_generate mit mode="edit-multi" nimmt das
 * bestehende {canvas_id}.png als Vorlage und lässt WaveSpeed daraus eine
 * KI-Veredelung erzeugen — das Ergebnis wird die nächste Stufe DESSELBEN
 * Werks (gleiche canvas_id, PNG wird überschrieben). Die SVG-Quelle bleibt
 * unverändert als Ursprungs-Beleg erhalten. Vor jedem Überschreiben wird das
 * bisherige PNG nach {canvas_id}_stage{n}.png archiviert — Zwischenstufen
 * bleiben sichtbar.
 *
 * Modelle (identische Pfade wie lua/wavespeed_submit.lua, das bisher owner-only
 * und rein manuell genutzt wurde — kein Client hatte das bisher automatisiert):
 *   text-to-image  → google/nano-banana/text-to-image
 *   edit-multi     → google/nano-banana-pro/edit-multi
 *   image-to-video → kwaivgi/kling-v3.0-pro/image-to-video
 *
 * image-to-video ist asynchron über zwei (oder mehr) Aufrufe verteilt, statt
 * innerhalb eines einzigen synchron auf Fertigstellung zu warten: Kling
 * braucht typischerweise 1–5 Minuten — zu lang für einen einzelnen Poll-Loop.
 * Die Soul (z.B. KRO) arbeitet ohnehin über Tage/Wochen an einem Werk
 * (siehe soul_draw) — Geschwindigkeit ist kein Kriterium. Erster Aufruf mit
 * mode="image-to-video" ohne offenen Task: startet die Generierung, merkt
 * sich die taskId in api_context.json (soul_generate_video_pending) und kehrt
 * sofort zurück. Jeder weitere Aufruf mit derselben canvas_id + mode prüft
 * EINMALIG (kein Loop) ob das Ergebnis da ist — fertig: Video wird
 * heruntergeladen/gespeichert/protokolliert, Pending-Zustand gelöscht; noch
 * nicht fertig: kurze Rückmeldung, später erneut versuchen.
 *
 * Kosten-/Sicherheitslimit: soul_generate löst echte, kostenpflichtige
 * API-Aufrufe aus, autonom, ohne Freigabe-Schritt — ein Tageslimit
 * (api_context.json: soul_generate_usage) verhindert Kostenexplosion durch
 * Bug/Prompt-Injection/Endlosschleife. Bei text-to-image/edit-multi zählt der
 * Zähler erst NACH erfolgreichem Abschluss (fehlgeschlagene Versuche zählen
 * nicht mit). Bei image-to-video zählt er schon bei der Einreichung — das ist
 * der Moment, in dem WaveSpeed die Kosten committet, unabhängig davon ob
 * später überhaupt nochmal nach dem Ergebnis gefragt wird.
 *
 * Zugriffsschutz: identisches Muster wie soul_draw — nur in registerTools()
 * (Owner-Pfad) registriert, nicht in registerPaidTools()/registerPeerTools().
 */

import { readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { createHash } from 'crypto';
import { z } from 'zod';
import { SOULS_DIR } from '../lib/vault_fs.mjs';
import { sharedFileUrl } from '../lib/api.mjs';
import { recordArtworkProgress, countArtworkStages } from '../lib/artwork_log.mjs';

const DAILY_LIMIT = 10;

const MODELS = {
  'text-to-image':  'google/nano-banana/text-to-image',
  'edit-multi':     'google/nano-banana-pro/edit-multi',
  'image-to-video': 'kwaivgi/kling-v3.0-pro/image-to-video',
};

const POLL_INTERVAL_MS = 3000;
// Live gemessen: text-to-image liefert regelmäßig binnen weniger Sekunden.
// edit-multi (num_images:2, Pflicht der API) schwankt deutlich stärker —
// ein Lauf schaffte es zwischen 30–45s, ein anderer nicht mal in 48s. Eigene
// Poll-Budgets pro Modus, beide unter /api/soul-tool's proxy_read_timeout
// (120s) mit Marge für Submit+Download.
const POLL_MAX_ATTEMPTS = { 'text-to-image': 15, 'edit-multi': 30 }; // 45s / 90s

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function fileExists(p) {
  try { await readFile(p); return true; } catch { return false; }
}

// ── Tageslimit ────────────────────────────────────────────────────────────────

async function checkDailyLimit(soulId) {
  const ctxPath = `${SOULS_DIR}${soulId}/api_context.json`;
  const raw = await readFile(ctxPath, 'utf8').catch(() => '{}');
  const ctx = JSON.parse(raw || '{}');
  const usage = ctx.soul_generate_usage || {};
  const today = todayIso();
  const count = usage.date === today ? (usage.count || 0) : 0;
  return { ctx, ctxPath, count, today, atLimit: count >= DAILY_LIMIT };
}

async function incrementDailyUsage(ctx, ctxPath, today, previousCount) {
  ctx.soul_generate_usage = { date: today, count: previousCount + 1 };
  await writeFile(ctxPath, JSON.stringify(ctx), 'utf8');
}

// ── Pending Video-Tasks (image-to-video über mehrere Aufrufe hinweg) ──────────

async function loadCtxRaw(soulId) {
  const ctxPath = `${SOULS_DIR}${soulId}/api_context.json`;
  const raw = await readFile(ctxPath, 'utf8').catch(() => '{}');
  return { ctx: JSON.parse(raw || '{}'), ctxPath };
}

async function getPendingVideo(soulId, canvasId) {
  const { ctx, ctxPath } = await loadCtxRaw(soulId);
  const pending = (ctx.soul_generate_video_pending || {})[canvasId] || null;
  return { ctx, ctxPath, pending };
}

async function setPendingVideo(ctx, ctxPath, canvasId, { taskId, decision, prompt }) {
  ctx.soul_generate_video_pending = ctx.soul_generate_video_pending || {};
  ctx.soul_generate_video_pending[canvasId] = { taskId, decision, prompt, submittedAt: new Date().toISOString() };
  await writeFile(ctxPath, JSON.stringify(ctx), 'utf8');
}

async function clearPendingVideo(ctx, ctxPath, canvasId) {
  if (ctx.soul_generate_video_pending) delete ctx.soul_generate_video_pending[canvasId];
  await writeFile(ctxPath, JSON.stringify(ctx), 'utf8');
}

// ── WaveSpeed-Key lesen (gleiches Feld wie lua/wavespeed_submit.lua) ──────────

async function getWavespeedKey(soulId) {
  try {
    const raw = await readFile(`${SOULS_DIR}${soulId}/config.json`, 'utf8');
    const cfg = JSON.parse(raw);
    return typeof cfg.wavespeed_key === 'string' ? cfg.wavespeed_key : '';
  } catch {
    return '';
  }
}

// ── WaveSpeed submit + poll ────────────────────────────────────────────────────

async function submitWavespeed(apiKey, mode, prompt, imageBase64) {
  const modelPath = MODELS[mode];
  const endpoint = `https://api.wavespeed.ai/api/v3/${modelPath}`;

  // edit-multi: nur bestimmte Seitenverhältnisse erlaubt (kein "1:1") und
  // num_images muss exakt 2 sein — beides live gegen die WaveSpeed-API
  // bestätigt, identisch zum bestehenden lua/wavespeed_submit.lua. Von den
  // 2 zurückgegebenen Bildern wird unten nur outputs[0] verwendet.
  const payload = mode === 'edit-multi'
    ? { prompt, images: [`data:image/png;base64,${imageBase64}`], num_images: 2, output_format: 'jpeg', aspect_ratio: '4:3' }
    : { prompt, output_format: 'jpeg', aspect_ratio: '1:1' };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`WaveSpeed submit fehlgeschlagen (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const taskId = data?.data?.id || data?.id;
  if (!taskId) throw new Error('WaveSpeed hat keine taskId zurückgegeben.');
  return taskId;
}

// image-to-video: eigene Payload-Form (lua/wavespeed_submit.lua als Vorbild —
// "image" singular + jpeg-Prefix, nicht "images"-Array wie bei edit-multi).
async function submitVideoWavespeed(apiKey, prompt, imageBase64) {
  const endpoint = `https://api.wavespeed.ai/api/v3/${MODELS['image-to-video']}`;
  const payload = {
    prompt,
    image: `data:image/jpeg;base64,${imageBase64}`,
    duration: 5,
    cfg_scale: 0.5,
    negative_prompt: 'blurry, shaky, low quality, distorted',
  };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`WaveSpeed submit fehlgeschlagen (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const taskId = data?.data?.id || data?.id;
  if (!taskId) throw new Error('WaveSpeed hat keine taskId zurückgegeben.');
  return taskId;
}

// Einmaliger Status-Check (kein Loop) — für image-to-video, das über mehrere
// Tool-Aufrufe hinweg abgeholt wird statt innerhalb eines einzigen zu warten.
async function checkWavespeedOnce(apiKey, taskId) {
  const res = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${taskId}/result`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return { status: 'unknown' };
  const data = await res.json();
  const task = data?.data || data;
  return { status: task?.status, outputs: task?.outputs, error: task?.error };
}

async function pollWavespeed(apiKey, taskId, mode) {
  const maxAttempts = POLL_MAX_ATTEMPTS[mode];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${taskId}/result`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) continue;
    const data = await res.json();
    const task = data?.data || data;
    const status = task?.status;
    if (status === 'completed' && Array.isArray(task.outputs) && task.outputs[0]) {
      return task.outputs[0];
    }
    if (status === 'failed') {
      throw new Error(`WaveSpeed-Generierung fehlgeschlagen: ${task.error || 'unbekannter Fehler'}`);
    }
  }
  throw new Error(`Zeitüberschreitung — WaveSpeed hat innerhalb von ${(maxAttempts * POLL_INTERVAL_MS) / 1000}s nicht fertiggestellt. Kein Datei-/sys.md-Eintrag geschrieben, sicher wiederholbar.`);
}

// image-to-video: eigener, asynchroner Ablauf über mehrere Aufrufe (siehe
// Datei-Kopfkommentar). Getrennt von der synchronen text-to-image/edit-multi-
// Logik unten, damit deren einfacher "ein Aufruf = ein Ergebnis"-Fluss nicht
// mit Pending-State-Verzweigungen vermischt wird.
async function runVideoStep(soulId, token, { canvas_id, decision, prompt }) {
  const { ctx, ctxPath, pending } = await getPendingVideo(soulId, canvas_id);
  const apiKey = await getWavespeedKey(soulId);
  if (!apiKey) throw new Error('WaveSpeed API-Key nicht konfiguriert — Settings → Dienste.');

  if (pending) {
    const check = await checkWavespeedOnce(apiKey, pending.taskId);

    if (check.status === 'completed' && Array.isArray(check.outputs) && check.outputs[0]) {
      const dlRes = await fetch(check.outputs[0]);
      if (!dlRes.ok) throw new Error(`Ergebnis-Download fehlgeschlagen (${dlRes.status}).`);
      const videoBuf = Buffer.from(await dlRes.arrayBuffer());

      const vidDir  = `${SOULS_DIR}${soulId}/vault_shared`;
      const vidPath = `${vidDir}/${canvas_id}.mp4`;
      await mkdir(vidDir, { recursive: true });

      const hadExisting = await fileExists(vidPath);
      if (hadExisting) {
        const stageN = await countArtworkStages(soulId, canvas_id);
        await copyFile(vidPath, `${vidDir}/${canvas_id}_stage${stageN}.mp4`).catch(() => {});
      }
      await writeFile(vidPath, videoBuf);
      await clearPendingVideo(ctx, ctxPath, canvas_id);

      const contentHash = sha256Hex(videoBuf);
      const stageLabel = `Video fertiggestellt (image-to-video) · Entscheidung: "${pending.decision}"`;
      await recordArtworkProgress(soulId, canvas_id, { stageLabel, contentHash });

      return {
        kind: 'video_completed',
        sizeKb: Math.ceil(videoBuf.length / 1024),
        decision: pending.decision,
        contentHash,
        vaultUrlVideo: `vault-shared://${soulId}/${canvas_id}.mp4`,
        viewUrlVideo: token ? sharedFileUrl(soulId, `${canvas_id}.mp4`, token) : null,
      };
    }

    if (check.status === 'failed') {
      await clearPendingVideo(ctx, ctxPath, canvas_id);
      throw new Error(`Video-Generierung fehlgeschlagen: ${check.error || 'unbekannter Fehler'}`);
    }

    // Weder fertig noch fehlgeschlagen — Pending-Zustand bleibt unverändert,
    // kein Datei-/sys.md-Eintrag, nächster Aufruf prüft erneut.
    return { kind: 'video_pending', decision: pending.decision, submittedAt: pending.submittedAt };
  }

  // Kein offener Task — neue Video-Generierung einreichen.
  const { count, today, atLimit } = await checkDailyLimit(soulId);
  if (atLimit) {
    throw new Error(`Tageslimit erreicht (${DAILY_LIMIT} Generierungen/Tag). Morgen wieder verfügbar.`);
  }

  const pngPath = `${SOULS_DIR}${soulId}/vault_shared/${canvas_id}.png`;
  const existingPng = await readFile(pngPath).catch(() => null);
  if (!existingPng) {
    throw new Error(`"${canvas_id}.png" existiert noch nicht in vault_shared — erst soul_draw oder soul_generate (text-to-image/edit-multi) für dieses Werk nutzen.`);
  }

  const taskId = await submitVideoWavespeed(apiKey, prompt, existingPng.toString('base64'));
  await setPendingVideo(ctx, ctxPath, canvas_id, { taskId, decision, prompt });
  await incrementDailyUsage(ctx, ctxPath, today, count);

  const stageLabel = `Video-Generierung gestartet (image-to-video) · Entscheidung: "${decision}"`;
  await recordArtworkProgress(soulId, canvas_id, { stageLabel });

  return { kind: 'video_submitted', decision };
}

// ── Kernfunktion — genutzt vom MCP-Tool unten (Claude.ai/Desktop) UND von
// server.mjs's /internal/run-tool (In-App-Chat, siehe dortiger 'soul_generate'-
// Case) — gleiches Muster wie soul_draw.mjs. ─────────────────────────────────
export async function runSoulGenerate(soulId, token, { canvas_id, decision, mode, prompt }) {
  if (mode === 'image-to-video') {
    return runVideoStep(soulId, token, { canvas_id, decision, prompt });
  }

  const { ctx, ctxPath, count, today, atLimit } = await checkDailyLimit(soulId);
  if (atLimit) {
    throw new Error(`Tageslimit erreicht (${DAILY_LIMIT} Generierungen/Tag). Morgen wieder verfügbar.`);
  }

  const apiKey = await getWavespeedKey(soulId);
  if (!apiKey) {
    throw new Error('WaveSpeed API-Key nicht konfiguriert — Settings → Dienste.');
  }

  const pngDir  = `${SOULS_DIR}${soulId}/vault_shared`;
  const pngPath = `${pngDir}/${canvas_id}.png`;
  await mkdir(pngDir, { recursive: true });

  let imageBase64 = null;
  if (mode === 'edit-multi') {
    const existing = await readFile(pngPath).catch(() => null);
    if (!existing) {
      throw new Error(`"${canvas_id}.png" existiert noch nicht in vault_shared — erst soul_draw oder soul_generate (mode: text-to-image) für dieses Werk nutzen.`);
    }
    imageBase64 = existing.toString('base64');
  }

  const taskId = await submitWavespeed(apiKey, mode, prompt, imageBase64);
  const resultUrl = await pollWavespeed(apiKey, taskId, mode);

  const dlRes = await fetch(resultUrl);
  if (!dlRes.ok) throw new Error(`Ergebnis-Download fehlgeschlagen (${dlRes.status}).`);
  const pngBuf = Buffer.from(await dlRes.arrayBuffer());

  // Archivierung vor Überschreiben — Zwischenstufen bleiben sichtbar.
  // countArtworkStages zählt bisherige sys.md-Log-Einträge für diese canvas_id;
  // das entspricht direkt der Versionsnummer der aktuell existierenden Datei
  // (1 nach der ersten Anlage, 2 nach der ersten Weiterentwicklung, ...) — kein
  // +1 nötig, sonst würde das erste Archiv "_stage2" statt "_stage1" heißen.
  const hadExisting = await fileExists(pngPath);
  if (hadExisting) {
    const stageN = await countArtworkStages(soulId, canvas_id);
    await copyFile(pngPath, `${pngDir}/${canvas_id}_stage${stageN}.png`).catch(() => {});
  }

  await writeFile(pngPath, pngBuf);
  await incrementDailyUsage(ctx, ctxPath, today, count);

  const contentHash = sha256Hex(pngBuf);
  const stageLabel = mode === 'edit-multi'
    ? `KI-veredelt (edit-multi) · Entscheidung: "${decision}"`
    : `generiert (text-to-image) · Entscheidung: "${decision}"`;
  await recordArtworkProgress(soulId, canvas_id, { stageLabel, contentHash });

  const vaultUrlPng = `vault-shared://${soulId}/${canvas_id}.png`;
  const viewUrlPng  = token ? sharedFileUrl(soulId, `${canvas_id}.png`, token) : null;
  const sizeKb      = Math.ceil(pngBuf.length / 1024);

  return { kind: 'image', pngBuf, sizeKb, mode, decision, contentHash, vaultUrlPng, viewUrlPng, hadExisting, usageCount: count + 1 };
}

export function formatSoulGenerateSummary(canvasId, result) {
  if (result.kind === 'video_submitted') {
    return [
      `Video-Generierung für "${canvasId}" gestartet (image-to-video).`,
      `Entscheidung: "${result.decision}"`,
      `Dauert typischerweise 1–5 Minuten — kein Zeitdruck. Ruf mich später mit derselben canvas_id (mode: "image-to-video") erneut auf, um das Ergebnis abzuholen.`,
      `In sys.md ("## Kunstwerke") als gestartet vermerkt.`,
    ].join('\n');
  }
  if (result.kind === 'video_pending') {
    return [
      `"${canvasId}" ist noch nicht fertig (image-to-video, gestartet ${result.submittedAt}).`,
      `Entscheidung: "${result.decision}"`,
      `Später erneut versuchen — dieselbe canvas_id, mode: "image-to-video".`,
    ].join('\n');
  }
  if (result.kind === 'video_completed') {
    const { sizeKb, decision, contentHash, vaultUrlVideo, viewUrlVideo } = result;
    return [
      `"${canvasId}" fertiggestellt (image-to-video).`,
      `Entscheidung: "${decision}"`,
      `Video: ${sizeKb} KB${viewUrlVideo ? ` — ${viewUrlVideo}` : ''}`,
      `Fortschritt in sys.md ("## Kunstwerke") vermerkt (sha256 ${contentHash.slice(0, 12)}…) — fließt in den nächsten Blockchain-Anker ein.`,
      '',
      `Mit peer_send teilen (Video):`,
      `  to: "Till" (oder "alle")`,
      `  message: "[${canvasId}.mp4](${vaultUrlVideo})"`,
    ].join('\n');
  }

  const { sizeKb, mode, decision, contentHash, vaultUrlPng, viewUrlPng, hadExisting, usageCount } = result;
  return [
    hadExisting
      ? `"${canvasId}" per WaveSpeed (${mode}) veredelt — vorherige Stufe archiviert.`
      : `"${canvasId}" per WaveSpeed (${mode}) generiert.`,
    `Entscheidung: "${decision}"`,
    `PNG: ${sizeKb} KB${viewUrlPng ? ` — ${viewUrlPng}` : ''}`,
    `Fortschritt in sys.md ("## Kunstwerke") vermerkt (sha256 ${contentHash.slice(0, 12)}…) — fließt in den nächsten Blockchain-Anker ein.`,
    `Tageslimit: ${usageCount}/${DAILY_LIMIT} genutzt.`,
    '',
    `Mit peer_send teilen (PNG):`,
    `  to: "Till" (oder "alle")`,
    `  message: "[${canvasId}.png](${vaultUrlPng})"`,
  ].filter(Boolean).join('\n');
}

export function register(server, soulId, token) {
  server.tool(
    'soul_generate',
    [
      'Erzeugt oder veredelt ein Bild per hochwertiger KI-Generierung (WaveSpeed AI) —',
      'für Werke, die über reines Vektor-Zeichnen (soul_draw) hinausgehen sollen.',
      '',
      'PFLICHT: "decision" — ein kurzer Satz WARUM diese Generierung entsteht, nicht',
      'nur WAS generiert wird. Kein roher Prompt-Passthrough ohne dokumentierte',
      'Entscheidung (siehe vault/context/kro-airtist-konzept.md — die Soul bleibt',
      'Urheberin, die KI ist Werkzeug).',
      '',
      'mode "text-to-image": neues Bild aus reinem Prompt.',
      'mode "edit-multi": veredelt das bestehende {canvas_id}.png (z.B. eine',
      'soul_draw-Skizze) per KI-Reinterpretation — Ergebnis wird die nächste Stufe',
      'DESSELBEN Werks (gleiche canvas_id). Die vorherige Stufe wird automatisch als',
      '{canvas_id}_stage{n}.png archiviert, nicht überschrieben verloren.',
      '',
      'mode "image-to-video": startet eine Videogenerierung aus dem bestehenden',
      '{canvas_id}.png (dauert 1–5 Minuten — kein Zeitdruck, Geschwindigkeit ist kein',
      'Kriterium). Erster Aufruf startet und kehrt sofort zurück. JEDER WEITERE Aufruf',
      'mit derselben canvas_id + mode "image-to-video" prüft einmalig ob das Video',
      'fertig ist — noch nicht: kurz warten und später erneut versuchen; fertig:',
      '{canvas_id}.mp4 wird gespeichert. Kein Bedarf, synchron zu warten.',
      '',
      `Tageslimit: ${DAILY_LIMIT} Generierungen/Tag (echte, kostenpflichtige API-Aufrufe —`,
      'bei image-to-video zählt schon die Einreichung, nicht erst das Abholen).',
    ].join('\n'),
    {
      canvas_id: z.string().min(1).max(80).regex(/^[A-Za-z0-9_\-]+$/, 'Nur alphanumerisch + - _')
        .describe('Name des Werks — dieselbe canvas_id wie bei soul_draw verbindet Skizze und Veredelung zu einem Werk.'),
      decision: z.string().min(1).max(300)
        .describe('Pflicht: kurze Begründung WARUM diese Generierung entsteht — nicht nur was.'),
      mode: z.enum(['text-to-image', 'edit-multi', 'image-to-video'])
        .describe('"text-to-image": neu aus Prompt. "edit-multi": veredelt bestehendes {canvas_id}.png. "image-to-video": startet/holt eine Videogenerierung ab (siehe Beschreibung).'),
      prompt: z.string().min(1).max(2000).describe('Der eigentliche Generierungs-Prompt für WaveSpeed.'),
    },
    async ({ canvas_id, decision, mode, prompt }) => {
      try {
        const result = await runSoulGenerate(soulId, token, { canvas_id, decision, mode, prompt });
        const text = formatSoulGenerateSummary(canvas_id, result);
        // Nur der synchrone Bild-Pfad (text-to-image/edit-multi) liefert ein
        // fertiges PNG in derselben Antwort — image-to-video-Zwischenstände
        // (gestartet/noch nicht fertig) und der fertiggestellte Video-Pfad
        // haben kein inline darstellbares MCP-Bild, nur Text.
        if (result.pngBuf) {
          return {
            content: [
              { type: 'image', data: result.pngBuf.toString('base64'), mimeType: 'image/png' },
              { type: 'text', text },
            ],
          };
        }
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
