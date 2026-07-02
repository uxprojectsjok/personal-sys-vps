/**
 * verify_human — Peer-Variante.
 * Ruft die Blockchain-Verifikation direkt mit der bekannten soul_id auf —
 * kein API-Call zu OpenResty nötig.
 */

import { verifyHuman as blockchainVerify } from '../lib/blockchain.mjs';

export function register(server, targetSoulId) {
  server.tool(
    'verify_human',
    'Prüft ob die Soul einer echten menschlichen Person gehört, indem der Polygon-Blockchain-Anker verifiziert wird. Gibt Verifikationsstatus, Wallet-Adresse, Anker-Datum und Session-Anzahl zurück.',
    {},
    async () => {
      try {
        const result  = await blockchainVerify(targetSoulId);
        const summary = result.verified
          ? `✓ Verified – ${result.anchor_count} blockchain anchors, ${result.total_sessions} sessions, first anchor: ${result.first_anchor}`
          : `✗ Not verified – no blockchain entries found`;

        return {
          content: [
            { type: 'text', text: summary },
            { type: 'text', text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );
}
