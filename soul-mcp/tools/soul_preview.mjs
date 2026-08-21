import { z } from 'zod';

/**
 * soul_preview — Free teaser of a paid Soul before committing to payment.
 *
 * Call this to assess whether the Soul's content is relevant enough to be
 * worth the price before paying. The preview shows the first ~200 characters
 * of the AGENT block plus pricing and maturity signals.
 *
 * Typical flow:
 *   1. soul_discover        → find available Souls + pay_endpoint
 *   2. soul_preview         → read teaser, evaluate relevance and price
 *   3. pay pay_endpoint directly, following the x402 protocol (401/402
 *      challenge → signed payment retry) — this MCP server does not itself
 *      execute payments, the calling agent needs its own x402-capable
 *      HTTP client. There is no SYS-specific payment tool for this anymore
 *      (the previous soul_pay_read tool wrapped a direct-POL-transfer flow
 *      that has been removed — x402 is a standard protocol, any compliant
 *      client already knows how to use it without a wrapper tool).
 */
export function register(server, _token) {
  server.tool(
    'soul_preview',
    [
      'Free preview of a paid Soul — call before paying to evaluate relevance.',
      '',
      'Returns the first ~200 characters of the Soul\'s AGENT block (the content',
      'external agents receive after paying) plus price, dynamic pricing factors,',
      'and a rough content size estimate.',
      '',
      'Use the preview to decide:',
      '  • Is this Soul\'s topic relevant to the task?',
      '  • Is the price acceptable?',
      '  • How much content is behind the paywall (< 1 KB / 1–5 KB / > 5 KB)?',
      '',
      'If the preview looks promising: pay pay_endpoint directly using the x402',
      'protocol (it responds with a 402 + payment requirements; retry with a',
      'signed EIP-3009 authorization). This server has no dedicated payment tool —',
      'x402 is a standard, any compliant client already knows how to speak it.',
      '',
      'Parameters:',
      '  pay_endpoint  full URL of the Soul\'s pay endpoint (from soul_discover)',
      '  soul_id       UUID of the target Soul',
    ].join('\n'),
    {
      pay_endpoint: z.string().url().describe('Full URL of the pay endpoint (e.g. https://example.com/api/soul/pay/x402)'),
      soul_id:      z.string().uuid().describe('UUID of the target Soul'),
    },
    async ({ pay_endpoint, soul_id }) => {
      try {
        // Regex erwartete pay_endpoint endet exakt auf "/pay" -- der reale, aktuell
        // überall ausgegebene Wert endet aber auf "/pay/x402" (siehe server.mjs:
        // pay_endpoint: `${BASE_URL}/api/soul/pay/x402`), "/pay" steht also nie am
        // Stringende. Traf nie, previewUrl blieb der unveränderte pay_endpoint (+
        // Query) -- ein GET ohne Zahlungsnachweis auf den echten Pay-Endpoint liefert
        // 403, was hier fälschlich als "Soul ist privat" gemeldet wurde, obwohl gar
        // keine Soul je privat war. Live reproduziert und verifiziert (KRO).
        const previewUrl = pay_endpoint.replace(/\/pay(\/.*)?(\?.*)?$/, '/preview') + `?soul_id=${soul_id}`;

        const res = await fetch(previewUrl, {
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (res.status === 403) {
            return {
              content: [{ type: 'text', text: 'This Soul is private — no preview available.' }],
              isError: true,
            };
          }
          return {
            content: [{ type: 'text', text: `Preview failed: ${err.error || err.message || `HTTP ${res.status}`}` }],
            isError: true,
          };
        }

        const d = await res.json();

        if (!d.enabled) {
          return {
            content: [{ type: 'text', text: 'This Soul has no paid access configured — no preview available.' }],
          };
        }

        const priceLine = d.dynamic
          ? `${d.usdc_required} USDC (dynamic: ${d.anchor_count} anchors · ${d.chain_age_days}d · ${d.buyers_30d} buyers/30d · ×${d.multiplier})`
          : `${d.usdc_required} USDC (fixed)`;

        const truncNote = d.preview_truncated
          ? `\n[Preview truncated at ${d.preview_chars} chars — full content: ${d.full_size_hint}]`
          : `\n[Full AGENT block shown — ${d.full_size_hint}]`;

        const agentContent = d.preview_note
          ? `[${d.preview_note}]`
          : (d.preview || '(no AGENT block content found)');

        const walletLine = d.wallet
          ? `Wallet:  ${d.wallet}`
          : `Wallet:  ${d.wallet_note || '(not set)'}`;

        const lines = [
          `Soul preview · ${soul_id.slice(0, 8)}…`,
          `Price:   ${priceLine}`,
          walletLine,
          ``,
          `--- AGENT block preview ---`,
          agentContent,
          ...(d.preview_note ? [] : [truncNote]),
          `---`,
          ``,
          `To get full access: pay ${pay_endpoint} directly using the x402 protocol (402 challenge -> signed retry).`,
        ].join('\n');

        return { content: [{ type: 'text', text: lines }] };

      } catch (err) {
        return {
          content: [{ type: 'text', text: `soul_preview failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
