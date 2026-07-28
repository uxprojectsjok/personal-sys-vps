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
