import { readFile } from 'fs/promises';
import { SOULS_DIR } from '../lib/vault_fs.mjs';

// Gate-Logik bewusst als eigenständige JS-Kopie der Lua-Version in
// chain_lib.lua, statt einen internen HTTP-Umweg zu bauen — die Logik ist
// klein und stabil (3 Schwellwerte, Datumsdifferenz, Typ-Zählung), ein
// neuer interner Endpoint samt Auth-Verdrahtung wäre für diesen Nutzen
// unverhältnismäßig ("am Ende einfach"-Leitplanke, siehe
// verify-identity-hq-plan.md). Bei Änderung der Stufen-Logik: beide Stellen
// pflegen (hier + chain_lib.lua gateCheck/summarize).

const ANCHOR_TYPES = new Set(['idv_document', 'sim_verification', 'sepa_transfer', 'eudi_wallet', 'eid_chip']);
const CONTINUITY_TYPES = new Set(['face_hq', 'voice_hq', 'face', 'voice', 'fingerprint', 'longmem_interview', 'peer_vouch', 'passkey_wallet']);

function daysAgo(isoTs) {
  const t = new Date(isoTs).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 86_400_000;
}

function isRevoked(chain, linkId) {
  return chain.some(l => l.category === 'revocation' && typeof l.evidence_ref === 'string' && l.evidence_ref.startsWith(linkId));
}

function summarize(chain) {
  let freshestContinuity = Infinity, freshestAnchor = Infinity, anyAnchor = false;
  const anchorTypes = new Set();
  for (const l of chain) {
    if (isRevoked(chain, l.link_id)) continue;
    const age = daysAgo(l.timestamp);
    if (CONTINUITY_TYPES.has(l.attestation_type) && age < freshestContinuity) freshestContinuity = age;
    if (ANCHOR_TYPES.has(l.attestation_type)) {
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

function gate(s, tier) {
  if (tier === 'low')    return s.freshest_continuity_days < 30;
  if (tier === 'medium') return s.freshest_continuity_days < 7 && s.any_anchor;
  if (tier === 'high')   return s.freshest_continuity_days < 1 && s.freshest_anchor_days < 365 && s.independent_anchor_types >= 2;
  return false;
}

export function register(server, token, soulId = null) {
  server.tool(
    'soul_chain_status',
    [
      'Reads the identity continuity chain and reports which sensitivity tier',
      '(low/medium/high) it currently qualifies for.',
      '',
      'Call this BEFORE a sensitive action (large payment, wallet signature,',
      'data deletion) to check whether the existing chain is strong/fresh',
      'enough, or whether you should ask for a fresh face_hq/voice_hq check',
      'first via verify_identity before proceeding.',
      '',
      'Tiers:',
      '  low    — any continuity link younger than 30 days',
      '  medium — continuity link younger than 7 days AND at least 1 anchor ever',
      '  high   — continuity link younger than 1 day AND anchor younger than',
      '           12 months AND at least 2 independent anchor types',
      '',
      'Note: no anchor link type (IDV/SIM/SEPA) is implemented yet in this',
      'deployment — medium/high are therefore currently unreachable. This is',
      'expected, not an error; treat it as "not yet strongly bound to a',
      'verified real-world identity", not as a malfunction.',
    ].join('\n'),
    {},
    async () => {
      try {
        const path = `${SOULS_DIR}${soulId}/chain.json`;
        let chain = [];
        try {
          const raw = JSON.parse(await readFile(path, 'utf8'));
          if (Array.isArray(raw)) chain = raw;
        } catch { /* noch keine Kette — leere Kette ist ein gültiger Zustand */ }

        const s = summarize(chain);
        const round = v => Number.isFinite(v) ? Math.round(v * 10) / 10 : null;

        return { content: [{ type: 'text', text: JSON.stringify({
          chain_length:              s.chain_length,
          freshest_continuity_days:  round(s.freshest_continuity_days),
          any_anchor:                s.any_anchor,
          freshest_anchor_days:      round(s.freshest_anchor_days),
          independent_anchor_types:  s.independent_anchor_types,
          tiers: {
            low:    gate(s, 'low'),
            medium: gate(s, 'medium'),
            high:   gate(s, 'high'),
          },
        }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );
}
