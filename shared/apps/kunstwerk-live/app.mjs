// kunstwerk-live — Strich-für-Strich-Wiedergabe eines soul_draw-Werks statt
// nur des fertigen PNGs. Kein echter Server-Push (MCP Apps können das aktuell
// nicht, siehe docs/spec/mcp-apps.md) — stattdessen: beim Öffnen sofort den
// kompletten bisherigen Stand ohne Animation zeichnen (schneller Einstieg),
// danach alle paar Sekunden soul_draw_replay erneut abfragen und NUR neu
// hinzugekommene Striche animiert nachzeichnen — sieht dadurch aus wie
// "live mitverfolgen", ist technisch Polling.
//
// Vereinfachte Wiedergabe, kein Pixel-Duplikat des echten PNGs: brush/dry/
// watercolor/spray/glow-Texturen und reflect-Spiegelungen entstehen erst
// serverseitig innerhalb von dispatchStrokeStyle() beim eigentlichen Rendern
// (soul_draw.mjs) und stecken nicht in der geloggten Punkt-Geometrie — hier
// wird jeder Strich als einfache Linie in seiner Farbe/Breite/Deckkraft
// nachgezogen. mode:"handwriting"-Striche sind davon NICHT betroffen (die
// werden schon serverseitig zu echten Linienzügen expandiert, bevor sie
// geloggt werden) — nur mode:"text" (Font-Rendering) fällt hier auf eine
// generische Cursive-Schrift zurück, da der gebündelte Handschrift-Font nicht
// im Browser verfügbar ist.
//
// Gleiches v3-Muster wie interactive-test: alle lokalen Listener sofort
// synchron anhängen, SDK dynamisch importieren mit sichtbarem Status.

const canvasIdInput = document.querySelector('#canvasId');
const watchBtn = document.querySelector('#btnWatch');
const statusEl = document.querySelector('#status');
const sdkLine = document.querySelector('#sdk-status');
const bridgeLine = document.querySelector('#bridge-status');
const stage = document.querySelector('#stage');
const emptyEl = document.querySelector('#empty');
const ctx = stage.getContext('2d');

function setStatus(text) { statusEl.textContent = text; }
function setSdkLine(text, ok) {
  sdkLine.textContent = text;
  sdkLine.style.color = ok === true ? '#8ab4f8' : ok === false ? '#e88' : '#999';
}

const bridges = ['openai', 'claude', 'mcp'].filter((k) => typeof window[k] !== 'undefined');
bridgeLine.textContent = bridges.length
  ? `Host-Bridge gefunden: window.${bridges.join(', window.')}`
  : 'Keine bekannte Host-Bridge im globalen Scope.';

// ── Wiedergabe-Zustand ────────────────────────────────────────────────────
let app = null;
let currentCanvasId = null;
let animatedCount = 0;      // wie viele Batches schon (instant oder animiert) gezeichnet sind
let pollTimer = null;
let watching = false;

function resizeStage(width, height, background) {
  stage.width = width;
  stage.height = height;
  ctx.fillStyle = (!background || background === 'paper') ? '#EDE6D6' : background;
  ctx.fillRect(0, 0, width, height);
}

function pointAtLength(pts, segLens, total, targetLen) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const segLen = segLens[i - 1];
    if (acc + segLen >= targetLen || i === pts.length - 1) {
      const remain = targetLen - acc;
      const frac = segLen ? Math.min(1, remain / segLen) : 1;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * frac,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * frac,
      };
    }
    acc += segLen;
  }
  return pts[pts.length - 1];
}

function drawStrokeInstant(stroke) {
  const pts = stroke.points;
  if (!pts || pts.length < 2) return;
  ctx.globalAlpha = stroke.opacity ?? 0.9;
  ctx.fillStyle = stroke.color || '#1c1b18';
  ctx.strokeStyle = stroke.color || '#1c1b18';
  ctx.lineWidth = stroke.width || 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (stroke.mode === 'fill') {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
  } else if (stroke.mode === 'text') {
    ctx.font = `${stroke.fontSize || 32}px cursive`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(stroke.text || '', pts[0].x, pts[0].y);
  } else {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Zeichnet nur stroke/dry/watercolor/spray/glow-artige Striche progressiv
// nach (Flächen/Text ergeben als "Linie ziehen" keinen Sinn, siehe unten) —
// pro Frame nur das NEUE Wegstück seit dem letzten Frame, nicht den ganzen
// bisherigen Pfad erneut, sonst würde teiltransparente Deckkraft sich mit
// jedem Frame weiter aufbauen statt konstant zu bleiben.
function animateStroke(stroke) {
  return new Promise((resolve) => {
    const pts = stroke.points;
    if (!pts || pts.length < 2 || stroke.mode === 'fill' || stroke.mode === 'text') {
      drawStrokeInstant(stroke);
      resolve();
      return;
    }
    const segLens = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      segLens.push(d);
      total += d;
    }
    const duration = Math.min(600, Math.max(80, total * 3));
    ctx.globalAlpha = stroke.opacity ?? 0.9;
    ctx.strokeStyle = stroke.color || '#1c1b18';
    ctx.lineWidth = stroke.width || 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let last = pts[0];
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const cur = t >= 1 ? pts[pts.length - 1] : pointAtLength(pts, segLens, total, t * total);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(cur.x, cur.y);
      ctx.stroke();
      last = cur;
      if (t < 1) requestAnimationFrame(frame);
      else { ctx.globalAlpha = 1; resolve(); }
    }
    requestAnimationFrame(frame);
  });
}

async function renderBatchInstant(batch) {
  for (const stroke of batch.strokes || []) drawStrokeInstant(stroke);
}

async function renderBatchAnimated(batch) {
  for (const stroke of batch.strokes || []) {
    if (stroke.mode === 'fill' || stroke.mode === 'text') drawStrokeInstant(stroke);
    else await animateStroke(stroke);
  }
}

async function fetchReplay(canvasId) {
  const result = await app.callServerTool({
    name: 'soul_draw_replay',
    arguments: canvasId ? { canvas_id: canvasId } : {},
  });
  const text = (result.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  return JSON.parse(text);
}

function stopWatching() {
  watching = false;
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
}

async function startWatching(requestedCanvasId) {
  if (!app) return setStatus('SDK noch nicht bereit (siehe Status oben).');
  stopWatching();
  watching = true;
  animatedCount = 0;
  emptyEl.style.display = 'flex';
  emptyEl.textContent = 'Wird geladen …';
  setStatus('Lade …');

  let data;
  try {
    data = await fetchReplay(requestedCanvasId || undefined);
  } catch (err) {
    setStatus(`Fehler beim Laden: ${err?.message || err}`);
    emptyEl.textContent = 'Fehler beim Laden.';
    return;
  }

  if (!data.canvas_id || !data.batches || data.batches.length === 0) {
    emptyEl.textContent = requestedCanvasId
      ? `Kein Werk "${requestedCanvasId}" gefunden (oder noch keine Striche).`
      : 'Noch kein Werk mit soul_draw begonnen.';
    setStatus('');
    return;
  }

  currentCanvasId = data.canvas_id;
  canvasIdInput.value = currentCanvasId;
  const first = data.batches[0];
  resizeStage(first.width, first.height, first.background);
  emptyEl.style.display = 'none';

  for (const batch of data.batches) await renderBatchInstant(batch);
  animatedCount = data.batches.length;
  setStatus(`"${currentCanvasId}" — ${data.batches.length} Zeichenschritt(e) geladen. Beobachte auf neue Striche …`);

  scheduleNextPoll();
}

function scheduleNextPoll() {
  if (!watching) return;
  pollTimer = setTimeout(pollForUpdates, 4000);
}

async function pollForUpdates() {
  if (!watching || !currentCanvasId) return;
  try {
    const data = await fetchReplay(currentCanvasId);
    if (data.batches && data.batches.length > animatedCount) {
      const newBatches = data.batches.slice(animatedCount);
      setStatus(`"${currentCanvasId}" — neuer Strich wird nachgezeichnet …`);
      for (const batch of newBatches) await renderBatchAnimated(batch);
      animatedCount = data.batches.length;
      setStatus(`"${currentCanvasId}" — ${animatedCount} Zeichenschritt(e). Beobachte auf neue Striche …`);
    }
  } catch (err) {
    setStatus(`Fehler beim Aktualisieren: ${err?.message || err}`);
  }
  scheduleNextPoll();
}

// ── Lokale Listener sofort anhängen (v3-Lektion: unabhängig vom SDK-Ladeerfolg) ──
watchBtn.addEventListener('click', () => startWatching(canvasIdInput.value.trim()));
canvasIdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startWatching(canvasIdInput.value.trim());
});

// ── SDK-Ladephase ──────────────────────────────────────────────────────────
setSdkLine('SDK: lädt …');
try {
  const { App } = await import('/apps/_sdk/app.js');
  setSdkLine('SDK: importiert ✓ — verbinde …');

  app = new App({ name: 'kunstwerk-live', version: '1.0.0' }, {});

  let handshakeDone = false;
  app.connect().then(() => {
    handshakeDone = true;
    setSdkLine('SDK: verbunden ✓', true);
    startWatching(null);
  }).catch((err) => {
    setSdkLine(`SDK: connect() Fehler: ${err?.message || err}`, false);
  });

  app.setupSizeChangedNotifications();

  setTimeout(() => {
    if (!handshakeDone) {
      setSdkLine('SDK: verbunden (Fallback nach 500ms)', true);
      app.notification({ method: 'ui/notifications/initialized' }).catch(() => {});
      startWatching(null);
    }
  }, 500);
} catch (err) {
  setSdkLine(`SDK: Import fehlgeschlagen — ${err?.message || err}`, false);
}
