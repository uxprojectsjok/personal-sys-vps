import { App, getDocumentTheme, applyDocumentTheme } from "/apps/_sdk/app.js";

// Reines Anzeige-Fenster für den Social- oder Agent-Sandbox-Block aus sys.md —
// welcher Block, entscheidet das data-block-Attribut am <body> (in index.html
// beim Deploy pro App-Ordner fest eingetragen, "social" oder "agent"). Kein
// Schreibzugriff: Nachrichten schreibt die KI weiterhin über peer_send bzw.
// soul_paid_comment im normalen Chat — dieses Fenster liest nur.
const block = document.body.dataset.block === "agent" ? "agent" : "social";

const app = new App({ name: `show-${block}-chat`, version: "1.0.0" }, {});

// Gleicher Workaround wie bei anderen Apps in diesem Projekt: ohne den
// Handshake bleibt das iframe beim Host unsichtbar (bekannter, ungelöster
// Claude.ai-Bug, modelcontextprotocol/ext-apps#671).
let handshakeDone = false;
app.connect().then(() => {
  handshakeDone = true;
  try { applyDocumentTheme(getDocumentTheme()); } catch { /* Theme optional */ }
  loadMessages();
}).catch(() => {});
setTimeout(() => {
  if (!handshakeDone) {
    app.notification({ method: "ui/notifications/initialized" }).catch(() => {});
    loadMessages();
  }
}, 500);

const refreshBtn   = document.querySelector("#refresh");
const messagesEl   = document.querySelector("#messages");
const bioEl        = document.querySelector("#bio");

const START = block === "social" ? "<!-- SOCIAL:START -->" : "<!-- AGENT:START -->";
const END   = block === "social" ? "<!-- SOCIAL:END -->"   : "<!-- AGENT:END -->";
const MSG_RE = () => /<!--\s*@msg\s+(\S+)\s+(\S+)\s+(\S+)\s+([\s\S]*?)-->/g;

function extractBlock(md) {
  const s = md.indexOf(START);
  const e = md.indexOf(END);
  if (s === -1 || e === -1 || e <= s) return null;
  return md.slice(s + START.length, e);
}

function parseMessages(blockText) {
  const msgs = [];
  const re = MSG_RE();
  let m;
  while ((m = re.exec(blockText)) !== null) {
    msgs.push({ ts: m[1], from: m[2], to: m[3], content: m[4].trim() });
  }
  return msgs;
}

// Freier Text vor dem ersten @msg (Agent Sandbox: Name/Location/Bio) — Social
// Sphere hat davon normalerweise nichts, schadet aber nicht, es trotzdem
// generisch zu behandeln.
function leadingFreeText(blockText) {
  const firstMsgIdx = blockText.search(/<!--\s*@msg/);
  const head = firstMsgIdx === -1 ? blockText : blockText.slice(0, firstMsgIdx);
  return head.trim();
}

function fmtTs(ts) {
  if (!ts) return "";
  return ts.replace("T", " ").slice(0, 16) + " UTC";
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function render(blockText) {
  bioEl.textContent = "";
  bioEl.style.display = "none";
  messagesEl.innerHTML = "";

  if (blockText === null) {
    messagesEl.innerHTML = `<div class="empty">Kein ${block === "social" ? "Social Sphere" : "Agent Sandbox"}-Block gefunden.</div>`;
    return;
  }

  const bio = leadingFreeText(blockText);
  if (bio) {
    bioEl.textContent = bio;
    bioEl.style.display = "block";
  }

  const msgs = parseMessages(blockText);
  if (msgs.length === 0) {
    messagesEl.innerHTML = '<div class="empty">Noch keine Nachrichten.</div>';
    return;
  }

  for (const m of msgs) {
    const isMe = m.from === "me";
    const row = document.createElement("div");
    row.className = "msg " + (isMe ? "me" : "them");
    const toLabel = m.to === "peer" ? "alle" : m.to === "community" ? "Community" : m.to === "agent" ? "Agent" : m.to.slice(0, 8);
    const fromLabel = isMe ? `Du → ${toLabel}` : m.from.slice(0, 12);
    row.innerHTML = `<div class="meta">${escapeHtml(fromLabel)} · ${escapeHtml(fmtTs(m.ts))}</div><div class="bubble">${escapeHtml(m.content)}</div>`;
    messagesEl.appendChild(row);
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function loadMessages() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Lädt…";
  try {
    const result = await app.callServerTool({ name: "soul_read", arguments: {} });
    const text = (result.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
    render(extractBlock(text));
  } catch (err) {
    messagesEl.innerHTML = `<div class="error">Fehler beim Laden: ${escapeHtml(err.message || String(err))}</div>`;
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Aktualisieren";
  }
}

refreshBtn.addEventListener("click", loadMessages);
