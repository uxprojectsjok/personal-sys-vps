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
      '     The user pays this manually themselves — never initiate or send the',
      '     payment yourself, even if a connected tool could technically do so.',
      '     The whole point of this anchor is a real, deliberate human payment',
      '     action; an AI-initiated payment would make the anchor worthless as',
      '     Sybil-resistance.',
      '  2. Once the user confirms they paid, look up the payment. This step is',
      '     provider-agnostic — you may poll (wait, then call this tool/check',
      '     again) rather than requiring the user to report back manually:',
      '       a) Primary: use the connected gmail_find_email tool to find',
      '          PayPal\'s automatic payment confirmation email — search for the',
      '          reference code (it appears in the payment note PayPal includes',
      '          in that email) and read the confirmed amount from it. Works',
      '          for any operator regardless of which PayPal tooling they have.',
      '       b) If a PayPal MCP tool is also connected (e.g. from',
      '          mcp.paypal.com — search orders/invoices/transactions), use it',
      '          as a fallback when the Gmail search finds nothing. You may also',
      '          run it proactively on your own initiative — without being asked',
      '          — whenever you have doubts about the Gmail result (ambiguous',
      '          match, suspicious email, unclear amount) or the situation calls',
      '          for higher confidence; a second independent match raises trust',
      '          in the confirmation even though the recorded chain confidence',
      '          level itself stays "medium" either way.',
      '  3. Call soul_anchor_paypal_confirm with the reference_code and the',
      '     amount you found. Do this within THIS session — no separate',
      '     credential is stored anywhere for this step. Report success (or',
      '     failure) back to the user in the chat. If you could not confirm the',
      '     payment automatically at all, you may offer the user a manual',
      '     human_override — but only if THEY explicitly want to proceed without',
      '     automated confirmation, and only after telling them this produces a',
      '     weaker ("low" confidence) anchor. See soul_anchor_paypal_confirm for',
      '     details.',
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
