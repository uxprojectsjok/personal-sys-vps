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
export async function checkOwnServiceToken(soulId, token) {
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
