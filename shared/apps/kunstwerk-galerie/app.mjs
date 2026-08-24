// kunstwerk-live — zeigt einen Spinner, bis ein Werk fertig ist, dann nur
// noch das Ergebnis. Kein Live-Strich-für-Strich-Nachzeichnen mehr (frühere
// Fassung dieser App) — Feedback: wirkte unruhig, gewünscht ist der
// Standard-Ablauf einer Bildgenerierung: öffnen → Spinner → fertiges
// Ergebnis, keine Statuszeilen drumherum.
//
// Deckt zwei Quellen ab (siehe soul_draw_snapshot.mjs): soul_draw liefert
// sein PNG ohnehin schon synchron im selben Tool-Response — der Spinner hier
// greift praktisch nur zwischen Arbeitssitzungen. soul_generate
// mode:"image-to-video" ist dagegen ECHT asynchron (Kling braucht 1–5
// Minuten über mehrere Aufrufe verteilt) — dafür lohnt sich der Spinner
// wirklich, ohne dass jemand manuell nachfragen muss.
//
// Kein echter Server-Push (siehe docs/spec/mcp-apps.md) — Polling, mit
// Intervall je nach Zustand: schnell (1.5s) solange noch gar nichts da ist,
// langsam (10s) während eine Video-Generierung läuft (kein Grund, WaveSpeeds
// Status-Endpunkt im Sekundentakt zu befragen, wenn das Ergebnis ohnehin
// typischerweise Minuten braucht), normal (4s) im Hintergrund sobald schon
// ein Ergebnis angezeigt wird, um weiteren Fortschritt am selben Werk
// aufzufangen.
//
// Gleiches v3-Muster wie interactive-test für die SDK-Ladephase (dynamischer
// Import, Handshake-Hänger-Workaround) — nur ohne sichtbare Debug-Zeilen,
// Fehler landen nur im Fehlerfall überhaupt im UI.

const spinnerEl = document.querySelector('#spinner');
const imageEl = document.querySelector('#resultImage');
const videoEl = document.querySelector('#resultVideo');
const errorEl = document.querySelector('#error');

function showError(text) {
  spinnerEl.hidden = true;
  imageEl.hidden = true;
  videoEl.hidden = true;
  errorEl.hidden = false;
  errorEl.textContent = text;
}

function showSpinner() {
  spinnerEl.hidden = false;
  errorEl.hidden = true;
}

let app = null;
let lastUpdatedAt = null;
let pollTimer = null;

function scheduleNextPoll(delayMs) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(poll, delayMs);
}

async function poll() {
  if (!app) return;
  let data;
  try {
    const result = await app.callServerTool({ name: 'soul_draw_snapshot', arguments: {} });
    const text = (result.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    data = JSON.parse(text);
  } catch (err) {
    // Ein einzelner fehlgeschlagener Poll ist kein Grund, eine Fehlermeldung
    // zu zeigen, solange schon ein Ergebnis da ist — nur beim allerersten
    // Laden sichtbar machen, sonst still weiter versuchen.
    if (imageEl.hidden && videoEl.hidden) showError(`Fehler beim Laden: ${err?.message || err}`);
    scheduleNextPoll(4000);
    return;
  }

  if (data.state === 'ready' && data.updated_at !== lastUpdatedAt) {
    lastUpdatedAt = data.updated_at;
    if (data.kind === 'video' && data.video_url) {
      videoEl.src = data.video_url;
      videoEl.hidden = false;
      imageEl.hidden = true;
    } else if (data.kind === 'image' && data.png_base64) {
      imageEl.src = `data:image/png;base64,${data.png_base64}`;
      imageEl.hidden = false;
      videoEl.hidden = true;
    }
    spinnerEl.hidden = true;
    errorEl.hidden = true;
  } else if (data.state === 'failed') {
    showError(`Generierung fehlgeschlagen: ${data.error || 'unbekannter Fehler'}`);
  } else if (data.state === 'empty' || data.state === 'pending') {
    if (imageEl.hidden && videoEl.hidden) showSpinner();
  }

  scheduleNextPoll(data.state === 'pending' ? 10000 : data.state === 'empty' ? 1500 : 4000);
}

// ── SDK-Ladephase ──────────────────────────────────────────────────────────
try {
  const { App } = await import('/apps/_sdk/app.js');
  app = new App({ name: 'kunstwerk-live', version: '3.0.0' }, {});

  let handshakeDone = false;
  app.connect().then(() => {
    handshakeDone = true;
    poll();
  }).catch((err) => {
    showError(`Verbindung fehlgeschlagen: ${err?.message || err}`);
  });

  app.setupSizeChangedNotifications();

  setTimeout(() => {
    if (!handshakeDone) {
      app.notification({ method: 'ui/notifications/initialized' }).catch(() => {});
      poll();
    }
  }, 500);
} catch (err) {
  showError(`SDK-Import fehlgeschlagen: ${err?.message || err}`);
}
