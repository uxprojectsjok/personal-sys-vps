import { z } from 'zod';

// EU withdrawal-rights consent flow — off by default, opt-in via init.sh
// ("Set up EU consumer rights?") / EU_CONSUMER_RIGHTS in soul-mcp/.env.
const EU_CONSUMER_RIGHTS = process.env.EU_CONSUMER_RIGHTS === 'true';

/**
 * soul_preview — Free teaser of a paid Soul before committing to payment.
 *
 * Call this BEFORE soul_pay_read to assess whether the Soul's content is
 * relevant enough to be worth the price. The preview shows the first ~200
 * characters of the AGENT block plus pricing and maturity signals.
 *
 * Typical flow:
 *   1. soul_discover        → find available Souls + pay_endpoint
 *   2. soul_preview         → read teaser, evaluate relevance and price
 *   3. soul_pay_read        → pay and get full content  (if worth it)
 */
export function register(server, _token) {
  server.tool(
    'soul_preview',
    [
      'Free preview of a paid Soul — call before soul_pay_read to evaluate relevance.',
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
      'If the preview looks promising: call soul_pay_read with the same',
      'pay_endpoint and soul_id to get full access.',
      '',
      ...(EU_CONSUMER_RIGHTS ? [
        'Some Souls also accept PayPal for human buyers without crypto — if the',
        'preview shows paypal_accepted, mention that option to the human.',
        '',
        'STOP — before telling the human to send the PayPal payment: ask if they are',
        'in the EU (if unknown). If yes (or unsure), you MUST call',
        'show_withdrawal_terms FIRST (then accept_digital_content_terms once they',
        'agree) — this is the legally required withdrawal-rights waiver for digital',
        'content, not optional.',
        'Do not skip straight from preview to "send PayPal to X" for EU buyers.',
        'Only after that (or immediately, for confirmed non-EU buyers): the human',
        'pays externally, then contacts the Soul owner directly — access is granted',
        'manually, typically within 48h, not instantly like POL.',
      ] : [
        'Some Souls also accept PayPal for human buyers without crypto — if the',
        'preview shows paypal_accepted, mention that option to the human. The',
        'human pays externally, then contacts the Soul owner directly — access is',
        'granted manually, typically within 48h, not instantly like POL.',
      ]),
      '',
      'Parameters:',
      '  pay_endpoint  full URL of the Soul\'s pay endpoint (from soul_discover)',
      '  soul_id       UUID of the target Soul',
    ].join('\n'),
    {
      pay_endpoint: z.string().url().describe('Full URL of the pay endpoint (e.g. https://example.com/api/soul/pay)'),
      soul_id:      z.string().uuid().describe('UUID of the target Soul'),
    },
    async ({ pay_endpoint, soul_id }) => {
      try {
        const previewUrl = pay_endpoint.replace(/\/pay(\?.*)?$/, '/preview') + `?soul_id=${soul_id}`;

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
          ? `${d.pol_required} POL (dynamic: ${d.anchor_count} anchors · ${d.chain_age_days}d · ${d.buyers_30d} buyers/30d · ×${d.multiplier})`
          : `${d.pol_required} POL (fixed)`;

        const truncNote = d.preview_truncated
          ? `\n[Preview truncated at ${d.preview_chars} chars — full content: ${d.full_size_hint}]`
          : `\n[Full AGENT block shown — ${d.full_size_hint}]`;

        const agentContent = d.preview_note
          ? `[${d.preview_note}]`
          : (d.preview || '(no AGENT block content found)');

        const paypalLines = d.paypal_accepted
          ? [
              d.paypal_target
                ? `PayPal: ${d.price_eur || '?'} EUR to ${d.paypal_target} — ${d.paypal_note}`
                : `PayPal: ${d.price_eur || '?'} EUR — ${d.paypal_note}`,
              ...(d.price_note ? [`Price note: ${d.price_note}`] : []),
              ``,
            ]
          : [];

        const walletLine = d.wallet
          ? `Wallet:  ${d.wallet}`
          : `Wallet:  ${d.wallet_note || '(not set)'}`;

        const lines = [
          `Soul preview · ${soul_id.slice(0, 8)}…`,
          `Price:   ${priceLine}`,
          walletLine,
          ...paypalLines,
          ``,
          `--- AGENT block preview ---`,
          agentContent,
          ...(d.preview_note ? [] : [truncNote]),
          `---`,
          ``,
          `To get full access: call soul_pay_read(pay_endpoint="${pay_endpoint}", soul_id="${soul_id}", tx_hash=<your_tx>)`,
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
