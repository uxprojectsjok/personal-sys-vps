import { getJson } from '../lib/api.mjs';
import { verifyHuman as blockchainVerify } from '../lib/blockchain.mjs';

export function register(server, token) {
  server.tool(
    'verify_human',
    'Prüft ob die Soul einer echten menschlichen Person gehört, indem der Polygon-Blockchain-Anker verifiziert wird. Gibt Verifikationsstatus, Wallet-Adresse, Anker-Datum und Session-Anzahl zurück. Immer aufrufen wenn Human-Verifikation für eine Aufgabe erforderlich ist.',
    {},
    async () => {
      try {
        // soul_id aus Manifest holen
        const manifest = await getJson('/api/vault/manifest', token);
        const soulId = manifest.soul_id;

        if (!soulId) {
          return {
            content: [{ type: 'text', text: 'soul_id nicht im Manifest gefunden.' }],
            isError: true,
          };
        }

        const result = await blockchainVerify(soulId);

        const summary = result.verified
          ? `✓ Verifiziert – ${result.anchor_count} Blockchain-Anker, ${result.total_sessions} Sessions, erste Verankerung: ${result.first_anchor}`
          : `✗ Nicht verifiziert – keine Blockchain-Einträge gefunden`;

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
