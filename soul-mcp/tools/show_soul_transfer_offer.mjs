import { z } from 'zod';

/**
 * show_soul_transfer_offer — Zeigt, ob eine Soul aktuell zur Übertragung
 * (kostenlos oder Verkauf) freigegeben ist, ohne eine Challenge zu starten.
 *
 * Gleiches Muster wie soul_preview.mjs: session-unabhängig (kein soulId
 * gebunden), node_url explizit erforderlich (aus wire_status/wire_search/
 * llms.txt) statt anzunehmen, das Ziel liege auf demselben Node — ein
 * Käufer-Agent kennt den Ziel-Node in der Regel nicht von selbst.
 *
 * Reiner Lesevorgang — POST {node_url}/api/soul/transfer/challenge (Käufer-
 * seitig, öffentlich, siehe server.mjs) ist der eigentliche erste Schritt
 * des Kaufs/der Übernahme; dieses Tool zeigt nur die Bedingungen davor.
 */
export function register(server, _token) {
  server.tool(
    'show_soul_transfer_offer',
    [
      'Shows whether a Soul is currently listed for transfer (free or sale) —',
      'read-only, does NOT start a purchase/claim challenge.',
      '',
      'Typical flow:',
      '  1. wire_status / wire_search / llms.txt → find the Soul\'s node_url',
      '  2. show_soul_transfer_offer             → check if/how it can be transferred',
      '  3. If interested: POST {node_url}/api/soul/transfer/challenge with',
      '     {"soul_id": "<soul_id>"} in the body — this is the actual first step',
      '     of claiming/buying, done directly over HTTP (no MCP session needed,',
      '     the endpoint is public). Returns a challenge_id, confirmation_message',
      '     to sign with the receiving wallet, and (for sales) the seller wallet',
      '     to pay. Full flow after that: sign the confirmation message, for sales',
      '     also send USDC directly to the seller wallet and submit the tx_hash —',
      '     see the accept-transfer page the challenge response links to for the',
      '     human-facing version of the same flow.',
      '',
      'Parameters:',
      '  soul_id   UUID of the Soul to check',
      '  node_url  Base URL of the Soul\'s SYS node (from wire_status/wire_search)',
    ].join('\n'),
    {
      soul_id:  z.string().uuid().describe('UUID of the target Soul'),
      node_url: z.string().url().describe('Base URL of the target Soul\'s SYS node, e.g. https://example.com'),
    },
    async ({ soul_id, node_url }) => {
      try {
        const base = node_url.replace(/\/$/, '');
        const res = await fetch(`${base}/api/soul/transfer/offer?soul_id=${encodeURIComponent(soul_id)}`, {
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return {
            content: [{ type: 'text', text: `show_soul_transfer_offer failed: ${err.error || err.message || `HTTP ${res.status}`}` }],
            isError: true,
          };
        }

        const d = await res.json();

        if (!d.for_sale) {
          return {
            content: [{ type: 'text', text: `Soul ${soul_id.slice(0, 8)}… is not currently listed for transfer.` }],
          };
        }

        const priceLine = d.mode === 'free'
          ? 'Free transfer (no payment required)'
          : `${d.price_usdc} USDC`;

        const pendingNote = d.has_pending_challenge
          ? '\nNote: another party already has an active claim/purchase challenge running for this Soul — the listing may no longer be available by the time you try.'
          : '';

        const lines = [
          `Soul transfer offer · ${soul_id.slice(0, 8)}…`,
          `Mode:    ${d.mode === 'free' ? 'free' : 'sale'}`,
          `Price:   ${priceLine}`,
          `Seller:  ${d.seller_wallet || '(not registered on-chain yet)'}`,
          `Offer window: ${d.duration_hours}h once a claim/purchase is started`,
          pendingNote,
          '',
          `To proceed: POST ${base}/api/soul/transfer/challenge with {"soul_id": "${soul_id}"} in the body.`,
        ].filter(Boolean).join('\n');

        return { content: [{ type: 'text', text: lines }] };

      } catch (err) {
        return {
          content: [{ type: 'text', text: `show_soul_transfer_offer failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
