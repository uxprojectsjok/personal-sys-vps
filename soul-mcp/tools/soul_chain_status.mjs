import { readFile } from 'fs/promises';
import { SOULS_DIR } from '../lib/vault_fs.mjs';
import { summarize, gate } from '../lib/chain_gate.mjs';

// Gate-Logik lebt jetzt in lib/chain_gate.mjs (trader_mcp.mjs braucht
// dieselbe Prüfung für den Identitäts-Gate vor Geld-bewegenden Aktionen).
// Bewusst weiterhin eine eigenständige JS-Kopie der Lua-Version in
// chain_lib.lua, statt einen internen HTTP-Umweg zu bauen — die Logik ist
// klein und stabil (3 Schwellwerte, Datumsdifferenz, Typ-Zählung), ein
// neuer interner Endpoint samt Auth-Verdrahtung wäre für diesen Nutzen
// unverhältnismäßig ("am Ende einfach"-Leitplanke, siehe
// verify-identity-hq-plan.md). Bei Änderung der Stufen-Logik: beide Stellen
// pflegen (lib/chain_gate.mjs + chain_lib.lua gateCheck/summarize).

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
      'Anchor types: paypal_transfer implemented (PoC — self-payment via PayPal,',
      'see soul_anchor_paypal_start). IDV/SIM/SEPA not implemented yet. "high"',
      'needs 2 independent anchor types, so it stays unreachable until a second',
      'anchor type exists — expected, not an error.',
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
