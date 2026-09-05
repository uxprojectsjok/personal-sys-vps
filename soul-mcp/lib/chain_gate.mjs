/**
 * chain_gate.mjs — geteilte Sensitivitäts-Stufen-Logik (low/medium/high),
 * extrahiert aus tools/soul_chain_status.mjs, damit lib-Code (trader_mcp.mjs)
 * dieselbe geprüfte Logik nutzen kann, statt sie ein zweites Mal
 * abzuschreiben. tools/soul_chain_status.mjs importiert jetzt von hier statt
 * eine eigene Kopie zu pflegen — Verhalten unverändert, nur die Quelle
 * konsolidiert.
 *
 * (Die JS/Lua-Duplizierung gegen chain_lib.lua bleibt bestehen und ist
 * bewusst, siehe dortiger Kommentar — hier geht es nur um die zwei
 * JS-Stellen innerhalb von soul-mcp.)
 */

import { readFile } from 'fs/promises';
import { SOULS_DIR } from './vault_fs.mjs';

const ANCHOR_TYPES = new Set(['idv_document', 'sim_verification', 'sepa_transfer', 'eudi_wallet', 'eid_chip', 'paypal_transfer']);
const CONTINUITY_TYPES = new Set(['face_hq', 'voice_hq', 'face', 'voice', 'fingerprint', 'longmem_interview', 'peer_vouch', 'passkey_wallet']);

function daysAgo(isoTs) {
  const t = new Date(isoTs).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 86_400_000;
}

function isRevoked(chain, linkId) {
  return chain.some(l => l.category === 'revocation' && typeof l.evidence_ref === 'string' && l.evidence_ref.startsWith(linkId));
}

export function summarize(chain) {
  let freshestContinuity = Infinity, freshestAnchor = Infinity, anyAnchor = false;
  const anchorTypes = new Set();
  for (const l of chain) {
    if (isRevoked(chain, l.link_id)) continue;
    const age = daysAgo(l.timestamp);
    if (CONTINUITY_TYPES.has(l.attestation_type) && age < freshestContinuity) freshestContinuity = age;
    if (ANCHOR_TYPES.has(l.attestation_type) && l.confidence !== 'low') {
      anyAnchor = true;
      if (age < freshestAnchor) freshestAnchor = age;
      anchorTypes.add(l.attestation_type);
    }
  }
  return {
    chain_length: chain.length,
    freshest_continuity_days: freshestContinuity,
    any_anchor: anyAnchor,
    freshest_anchor_days: freshestAnchor,
    independent_anchor_types: anchorTypes.size,
  };
}

export function gate(s, tier) {
  if (tier === 'low')    return s.freshest_continuity_days < 30;
  if (tier === 'medium') return s.freshest_continuity_days < 7 && s.any_anchor;
  if (tier === 'high')   return s.freshest_continuity_days < 1 && s.freshest_anchor_days < 365 && s.independent_anchor_types >= 2;
  return false;
}

export async function readChain(soulId) {
  try {
    const raw = JSON.parse(await readFile(`${SOULS_DIR}${soulId}/chain.json`, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/** Bequemlichkeitsfunktion: liest die Kette, fasst zusammen, prüft eine Stufe. */
export async function qualifiesForTier(soulId, tier) {
  const chain = await readChain(soulId);
  const s = summarize(chain);
  return gate(s, tier);
}
