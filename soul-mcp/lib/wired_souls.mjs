// soul-mcp/lib/wired_souls.mjs
// Speichert/liest, welche Souls sich bei einer anderen Soul (dem faktischen
// "Gatekeeper") per /mcp/discover/wire eingeklinkt haben. Ob eine Soul
// GRUNDSÄTZLICH als Gatekeeper fungieren darf (neue Wire-Anfragen annehmen,
// bereits verdrahtete Souls weiter bündeln), entscheidet AUSSCHLIESSLICH das
// explizite An/Aus (gatekeeper_config.json) — konsolidiert: es gibt keinen
// impliziten Default mehr ("jede Soul mit nicht-leerer wired_souls.json ist
// automatisch Gatekeeper", der historische Ursprungszustand vor dem Toggle).
// Fehlt die Konfigurationsdatei oder ist enabled nicht exakt true, gilt die
// Soul als AUS — Gatekeeper-Funktion muss immer ein bewusstes Einschalten
// sein, nie ein stiller Default.
//
// Konsequenz beim Ausschalten: siehe notifyWiredToRemoval() in server.mjs —
// bestehende Verbindungen werden dabei nicht nur pausiert, sondern echt
// beendet (wired_souls.json geleert, jede betroffene Soul benachrichtigt,
// auch cross-node), damit eine Verbindung nie fortbesteht, während der
// Gatekeeper aus ist.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { SOULS_DIR } from './vault_fs.mjs';

function gatekeeperConfigPath(soulId) {
  return `${SOULS_DIR}${soulId}/gatekeeper_config.json`;
}

async function loadGatekeeperConfig(soulId) {
  try {
    const raw = await readFile(gatekeeperConfigPath(soulId), 'utf8');
    const data = JSON.parse(raw);
    return (data && typeof data === 'object') ? data : {};
  } catch {
    return {};
  }
}

async function saveGatekeeperConfig(soulId, cfg) {
  await mkdir(`${SOULS_DIR}${soulId}`, { recursive: true });
  await writeFile(gatekeeperConfigPath(soulId), JSON.stringify(cfg), 'utf8');
}

export async function isGatekeeperEnabled(soulId) {
  const cfg = await loadGatekeeperConfig(soulId);
  return cfg.enabled === true;
}

export async function setGatekeeperEnabled(soulId, enabled) {
  const cfg = await loadGatekeeperConfig(soulId);
  cfg.enabled = !!enabled;
  await saveGatekeeperConfig(soulId, cfg);
}

// self_token: ein vault-service-token (soul-Scope), den die Gatekeeper-Soul
// für sich SELBST hält, damit ihre eigenen @peer-Broadcasts (peer_send auf
// "alle"/individuelle soul_id, geschrieben in die eigene sys.md) über den
// peer-inbox-relay (lokal UND föderiert) genauso lesbar sind wie die ihrer
// verdrahteten Souls — sonst gäbe es für "die Gatekeeper-Soul liest ihr
// eigenes /api/soul" nirgends einen gültigen Bearer, nicht mal same-node
// (soul-mcp hält keinen SOUL_MASTER_KEY, siehe x402_agent_wallet.mjs).
// Wird einmalig beim ersten Einschalten des Gatekeeper-Schalters gemintet
// (server.mjs POST /mcp/discover/gatekeeper-config) — kein zusätzlicher
// Consent-Schritt für die Soul, dieselbe Zustimmung wie der Schalter selbst.
export async function getSelfToken(soulId) {
  const cfg = await loadGatekeeperConfig(soulId);
  return cfg.self_token || null;
}

export async function setSelfToken(soulId, token) {
  const cfg = await loadGatekeeperConfig(soulId);
  cfg.self_token = token;
  await saveGatekeeperConfig(soulId, cfg);
}

function wiredPath(soulId) {
  return `${SOULS_DIR}${soulId}/wired_souls.json`;
}

// Speicherschlüssel für einen Eintrag in wired_souls.json. Same-node bleibt
// die reine soul_id (Rückwärtskompatibilität mit bestehenden Einträgen).
// Cross-node hängt den node_url an — sonst würde dieselbe soul_id, die sich
// von zwei unterschiedlichen physischen Instanzen aus einwirt (z.B. dieselbe
// Identität testweise auf zwei Nodes, mit unterschiedlichen Certs), den
// jeweils anderen Eintrag stillschweigend überschreiben, samt einer nie
// benachrichtigten, verwaisten wired_to.json auf der überschriebenen Seite —
// live so aufgetreten. Jede physische Instanz bekommt jetzt ihren eigenen
// Eintrag; welche für KI-Tool-Aufrufe (soul_id-parametrisiert, kennen kein
// "von welchem Node") tatsächlich verwendet wird, entscheidet
// registerConnectionProxyTools() in server.mjs (zuletzt verdrahtete zuerst).
export function wireKey(soulId, nodeUrl) {
  return nodeUrl ? `${soulId}@${nodeUrl}` : soulId;
}

// Umgekehrter Blick: welche Gatekeeper hat DIESE Soul selbst kontaktiert
// (rein informativ für die eigene Settings-UI — "Connected to" —, die
// eigentliche Zugriffskontrolle steht ausschließlich in wired_souls.json
// der jeweiligen Gatekeeper-Soul).
function wiredToPath(soulId) {
  return `${SOULS_DIR}${soulId}/wired_to.json`;
}

export async function loadWiredTo(soulId) {
  try {
    const raw = await readFile(wiredToPath(soulId), 'utf8');
    const data = JSON.parse(raw);
    return (data && typeof data === 'object') ? data : {};
  } catch {
    return {};
  }
}

export async function saveWiredTo(soulId, data) {
  await mkdir(`${SOULS_DIR}${soulId}`, { recursive: true });
  await writeFile(wiredToPath(soulId), JSON.stringify(data), 'utf8');
}

export async function loadWired(soulId) {
  try {
    const raw = await readFile(wiredPath(soulId), 'utf8');
    const data = JSON.parse(raw);
    return (data && typeof data === 'object') ? data : {};
  } catch {
    return {};
  }
}

// Gemeinsame Kanonisierung für alles, was "aktuell gültige wired_souls.json
// dieser Soul" braucht, ohne connected_souls.json/Owner-Kontext (das macht
// registerConnectionProxyTools in server.mjs zusätzlich) — genutzt sowohl von
// GET /mcp/discover/search als auch von den /mcp/discover/federated/relay/*
// Routen, die jeweils NUR die wiredMap des angefragten Gatekeepers brauchen.
// Siehe registerConnectionProxyTools für die exakt gleiche Logik inline.
export async function loadAcceptedWired(soulId) {
  const wiredAll = await loadWired(soulId);
  const wiredRaw = {};
  const wired    = {};
  for (const [key, entry] of Object.entries(wiredAll)) {
    if (entry.status && entry.status !== 'accepted') continue;
    const sid = entry.soul_id || key.split('@')[0];
    const normalized = { ...entry, soul_id: sid };
    wiredRaw[key] = normalized;
    if (!wired[sid] || entry.wired_at > wired[sid].wired_at) wired[sid] = normalized;
  }
  return { wired, wiredRaw };
}

export async function saveWired(soulId, data) {
  await mkdir(`${SOULS_DIR}${soulId}`, { recursive: true });
  await writeFile(wiredPath(soulId), JSON.stringify(data), 'utf8');
}

// Prüft ob `token` einer der eigenen Service-Tokens von soulId ist (vom Owner
// selbst über Settings→Services erzeugt, siehe lua/vault_services.lua) —
// Nachweis, dass der Wire-Aufrufer wirklich diesen Token autorisiert hat.
// nodeUrl gesetzt (Cross-Node-Wiring): Prüfung per HTTP gegen den Home-Node der
// Soul statt lokalem Dateisystem-Read — siehe lua/soul_verify_service_token.lua.
export async function checkOwnServiceToken(soulId, token, nodeUrl = null) {
  if (nodeUrl) {
    try {
      const base = nodeUrl.replace(/\/$/, '');
      const url  = `${base}/api/soul/verify-service-token?soul_id=${encodeURIComponent(soulId)}&token=${encodeURIComponent(token)}`;
      const res  = await fetch(url, { signal: AbortSignal.timeout(6000) });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) return null;
      return { name: data.name, permissions: data.permissions || {} };
    } catch {
      return null;
    }
  }
  try {
    const raw = await readFile(`${SOULS_DIR}${soulId}/authorized_services.json`, 'utf8');
    const svcs = JSON.parse(raw);
    const entry = svcs?.[token];
    if (!entry) return null;
    if (entry.expires_at && Math.floor(Date.now() / 1000) >= entry.expires_at) return null;
    return { name: entry.name, permissions: entry.permissions || {} };
  } catch {
    return null;
  }
}
