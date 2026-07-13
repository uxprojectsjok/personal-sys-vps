import { z } from 'zod';
import { postJson, verificationRequiredMsg } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'soul_anchor_paypal_confirm',
    [
      'Confirms a pending PayPal self-payment anchor (see soul_anchor_paypal_start)',
      'and appends an "anchor" link to the identity continuity chain on success.',
      '',
      'Normal path: call this after finding the matching PayPal transaction',
      '(via gmail_find_email and/or a connected PayPal MCP tool) — pass the',
      'amount you found. Confidence recorded: "medium".',
      '',
      'human_override path: ONLY use this if the user explicitly insists in the',
      'chat that they paid, despite you being unable to confirm it automatically',
      '(e.g. the confirmation email cannot be found, or no PayPal tool is',
      'connected). Before using it, tell the user plainly that this records a',
      'WEAKER anchor ("low" confidence instead of "medium") because it relies',
      'on their word instead of an independently verified transaction — let',
      'them decide if that tradeoff is acceptable. Never set human_override',
      'silently or because a lookup was merely inconvenient — only when the',
      'user has explicitly asked to proceed without automated confirmation.',
    ].join('\n'),
    {
      reference_code: z.string().describe('The reference code from soul_anchor_paypal_start'),
      amount: z.number().optional().describe('The amount found in the matching PayPal transaction (EUR) — omit only with human_override'),
      human_override: z.boolean().optional().describe('True only if the user explicitly asked to confirm without automated verification. Lowers the resulting anchor confidence to "low". Never set this on your own initiative.'),
    },
    async ({ reference_code, amount, human_override }) => {
      try {
        const data = await postJson('/api/soul/anchor/confirm', token, { reference_code, amount, human_override });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        const vr = verificationRequiredMsg(err);
        return { content: [{ type: 'text', text: vr || err.message }], isError: true };
      }
    }
  );
}
