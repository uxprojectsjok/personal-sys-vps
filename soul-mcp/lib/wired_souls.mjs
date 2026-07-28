// soul-mcp/lib/wired_souls.mjs
// Speichert/liest, welche Souls sich bei einer anderen Soul (dem faktischen
// "Gatekeeper") per /mcp/discover/wire eingeklinkt haben. Eine Soul ist
// Gatekeeper, sobald ihre eigene wired_souls.json nicht leer ist — kein
// separates Typ-Flag nötig, siehe handleMcpDiscover() in server.mjs.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { SOULS_DIR } from './vault_fs.mjs';

function wiredPath(soulId) {
  return `${SOULS_DIR}${soulId}/wired_souls.json`;
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
