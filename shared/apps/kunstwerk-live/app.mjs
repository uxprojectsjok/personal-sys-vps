// kunstwerk-live — zeigt einen Spinner, bis ein mit soul_draw begonnenes
// Werk ein fertiges PNG hat, dann nur noch das Bild. Kein Live-Strich-für-
// Strich-Nachzeichnen mehr (frühere Fassung dieser App) — Feedback: wirkte
// unruhig, gewünscht ist der Standard-Ablauf für eine Bildgenerierung:
// öffnen → Spinner → fertiges Ergebnis, keine Statuszeilen drumherum.
//
// Kein echter Server-Push (siehe docs/spec/mcp-apps.md) — Polling auf
// soul_draw_snapshot, das direkt das echte, fertige PNG als Base64
// zurückgibt (pixelgenau, keine clientseitige Nachbildung nötig).
//
// Gleiches v3-Muster wie interactive-test für die SDK-Ladephase (dynamischer
// Import, Handshake-Hänger-Workaround) — nur ohne sichtbare Debug-Zeilen,
// Fehler landen nur im Fehlerfall überhaupt im UI.

const spinnerEl = document.querySelector('#spinner');
const resultEl = document.querySelector('#result');
const errorEl = document.querySelector('#error');

function showError(text) {
  spinnerEl.hidden = true;
  resultEl.hidden = true;
  errorEl.hidden = false;
  errorEl.textContent = text;
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
  try {
    const result = await app.callServerTool({ name: 'soul_draw_snapshot', arguments: {} });
    const text = (result.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    const data = JSON.parse(text);

    if (data.ready && data.updated_at !== lastUpdatedAt) {
      lastUpdatedAt = data.updated_at;
      resultEl.src = `data:image/png;base64,${data.png_base64}`;
      resultEl.hidden = false;
      spinnerEl.hidden = true;
      errorEl.hidden = true;
    }
    scheduleNextPoll(data.ready ? 4000 : 1500);
  } catch (err) {
    // Ein einzelner fehlgeschlagener Poll ist kein Grund, die Fehlermeldung
    // zu zeigen, solange schon ein Bild da ist — nur beim allerersten Laden
    // sichtbar machen, sonst still weiter versuchen.
    if (!resultEl.hidden) { scheduleNextPoll(4000); return; }
    showError(`Fehler beim Laden: ${err?.message || err}`);
    scheduleNextPoll(4000);
  }
}

// ── SDK-Ladephase ──────────────────────────────────────────────────────────
try {
  const { App } = await import('/apps/_sdk/app.js');
  app = new App({ name: 'kunstwerk-live', version: '2.0.0' }, {});

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
