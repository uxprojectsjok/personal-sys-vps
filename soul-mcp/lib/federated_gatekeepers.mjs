// federated_gatekeepers.mjs
// Speichert/liest Gatekeeper-zu-Gatekeeper-Föderationen (gegenseitiges
// Einverständnis, siehe project_sys_v2_vision Memory Phase 3). Getrennt von
// wired_souls.json: Wiring ist Soul→Gatekeeper (asymmetrisch, scope-begrenzt),
// Föderation ist Gatekeeper↔Gatekeeper (symmetrisch, nach Bestätigung beide
// Seiten gleichberechtigt für Suche, siehe Phase 4).
//
// Format: { [remote_gatekeeper_soul_id]: { node_url, status, requested_at,
//   accepted_at? } } — status: "pending_out" (wir haben angefragt, warten auf
//   Bestätigung) | "pending_in" (die andere Seite hat angefragt, wir müssen
//   bestätigen) | "accepted" (beidseitig live).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { SOULS_DIR } from './vault_fs.mjs';

function fedPath(soulId) {
  return `${SOULS_DIR}${soulId}/federated_gatekeepers.json`;
}

export async function loadFederated(soulId) {
  try {
    const raw = await readFile(fedPath(soulId), 'utf8');
    const data = JSON.parse(raw);
    return (data && typeof data === 'object') ? data : {};
  } catch {
    return {};
  }
}

export async function saveFederated(soulId, data) {
  await mkdir(`${SOULS_DIR}${soulId}`, { recursive: true });
  await writeFile(fedPath(soulId), JSON.stringify(data), 'utf8');
}

// Prüft einen eingehenden Cross-Node-Aufruf eines föderierten Gatekeepers
// gegen gatekeeperSoulId's eigene federated_gatekeepers.json — exakt dieselbe
// Prüfung, die GET /mcp/discover/search schon einzeln inline gemacht hat,
// jetzt auch für /mcp/discover/federated/relay/* wiederverwendet. Gibt bei
// Erfolg die soul_id des anfragenden (föderierten) Gatekeepers zurück.
export async function authenticateFederatedCaller(gatekeeperSoulId, token) {
  if (!token) return null;
  const fed = await loadFederated(gatekeeperSoulId);
  const match = Object.entries(fed).find(([, e]) => e.status === 'accepted' && e.inbound_token === token);
  return match ? { callerSoulId: match[0], entry: match[1] } : null;
}
