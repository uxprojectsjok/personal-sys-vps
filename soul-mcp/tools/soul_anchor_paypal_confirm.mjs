import { z } from 'zod';
import { postJson, verificationRequiredMsg } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'soul_anchor_paypal_confirm',
    [
      'Confirms a pending PayPal self-payment anchor (see soul_anchor_paypal_start)',
      'and appends an "anchor" link to the identity continuity chain on success.',
      'Call this after finding the matching PayPal transaction (e.g. via a',
      'connected Zapier PayPal lookup) for the reference code from',
      'soul_anchor_paypal_start.',
    ].join('\n'),
    {
      reference_code: z.string().describe('The reference code from soul_anchor_paypal_start'),
      amount: z.number().describe('The amount found in the matching PayPal transaction (EUR)'),
    },
    async ({ reference_code, amount }) => {
      try {
        const data = await postJson('/api/soul/anchor/confirm', token, { reference_code, amount });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        const vr = verificationRequiredMsg(err);
        return { content: [{ type: 'text', text: vr || err.message }], isError: true };
      }
    }
  );
}
