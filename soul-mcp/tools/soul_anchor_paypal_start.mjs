import { z } from 'zod';
import { postJson, verificationRequiredMsg } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'soul_anchor_paypal_start',
    [
      'Starts a PayPal self-payment anchor (proof-of-concept anchor type for the',
      'identity continuity chain — see soul_chain_status). The idea: the soul',
      'owner pays THEMSELVES a small, uniquely-referenced amount via PayPal.',
      'The value is not "discovering an unknown identity" — the owner already',
      'knows their own name — it comes from a real, PayPal-KYC-checked',
      'transaction that makes Sybil abuse costly.',
      '',
      'Returns a reference code + a specific amount (varies slightly each time',
      'so concurrent requests stay distinguishable) + the PayPal target. Valid',
      'for 2 hours.',
      '',
      'FLOW:',
      '  1. Call this tool. Tell the user to pay the exact amount via PayPal to',
      '     the given target, with the reference code in the payment note.',
      '  2. Once the user confirms they paid, look up the payment. This step is',
      '     provider-agnostic — use whichever of these is available, in order:',
      '       a) If a PayPal MCP tool is connected (e.g. from mcp.paypal.com —',
      '          search orders/invoices/transactions), use it directly: search',
      '          for an order/payment matching the reference code or amount.',
      '       b) Otherwise, use the connected gmail_find_email tool to find',
      '          PayPal\'s automatic payment confirmation email — search for the',
      '          reference code (it appears in the payment note PayPal includes',
      '          in that email) and read the confirmed amount from it.',
      '  3. Call soul_anchor_paypal_confirm with the reference_code and the',
      '     amount you found. Do this within THIS session — no separate',
      '     credential is stored anywhere for this step.',
    ].join('\n'),
    {},
    async () => {
      try {
        const data = await postJson('/api/soul/anchor/start', token, { kind: 'paypal_transfer' });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        const vr = verificationRequiredMsg(err);
        return { content: [{ type: 'text', text: vr || err.message }], isError: true };
      }
    }
  );
}
