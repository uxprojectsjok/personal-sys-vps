// connected_souls.mjs
// Speichert/liest direkte Soul-zu-Soul-Verbindungen (gegenseitiges Einverständnis,
// cross-node) — siehe project_sys_v2_vision Memory. Strukturell identisch zu
// federated_gatekeepers.mjs, nur für beliebige Souls statt Gatekeeper-Souls, und
// mit echten Vault-Permissions statt leerem Such-Scope.
//
// Format: { [remote_soul_id]: { node_url, status, requested_at, accepted_at?,
//   inbound_token, outbound_token, permissions } } — status:
//   "pending_out" (wir haben angefragt) | "pending_in" (Gegenseite hat
//   angefragt) | "accepted" (beidseitig live).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { SOULS_DIR } from './vault_fs.mjs';

// Erzeugt server-seitig einen Service-Token für soulId, im selben Schema wie
// lua/vault_services.lua (nutzt dieselbe authorized_services.json). verified:true
// ist hier korrekt (anders als bei owner-erstellten Tokens, die erst per
// verify_identity/light-verify bestätigt werden müssen) — der Token entsteht im
// Rahmen eines bereits cert-geprüften Connect-Vorgangs (verifyPeerCert), keine
// unbestätigte Drittanbieter-Situation.
export async function createConnectionToken(soulId, label, permissions) {
  const token = randomBytes(32).toString('hex');
  const path  = `${SOULS_DIR}${soulId}/authorized_services.json`;
  let svcs = {};
  try {
    svcs = JSON.parse(await readFile(path, 'utf8'));
    if (!svcs || typeof svcs !== 'object') svcs = {};
  } catch { /* Datei fehlt noch — leer starten */ }

  svcs[token] = {
    name: label,
    permissions,
    created_at: Math.floor(Date.now() / 1000),
    verified: true,
  };

  await mkdir(`${SOULS_DIR}${soulId}`, { recursive: true });
  await writeFile(path, JSON.stringify(svcs), 'utf8');
  return token;
}

export async function revokeConnectionToken(soulId, token) {
  const path = `${SOULS_DIR}${soulId}/authorized_services.json`;
  try {
    const svcs = JSON.parse(await readFile(path, 'utf8'));
    if (svcs && typeof svcs === 'object' && svcs[token]) {
      delete svcs[token];
      await writeFile(path, JSON.stringify(svcs), 'utf8');
    }
  } catch { /* nichts zu tun */ }
}

function connPath(soulId) {
  return `${SOULS_DIR}${soulId}/connected_souls.json`;
}

export async function loadConnected(soulId) {
  try {
    const raw = await readFile(connPath(soulId), 'utf8');
    const data = JSON.parse(raw);
    return (data && typeof data === 'object') ? data : {};
  } catch {
    return {};
  }
}

export async function saveConnected(soulId, data) {
  await mkdir(`${SOULS_DIR}${soulId}`, { recursive: true });
  await writeFile(connPath(soulId), JSON.stringify(data), 'utf8');
}
