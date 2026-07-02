import { getJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'soul_earnings',
    [
      'Returns the earnings overview for this soul — all received POL payments from AI agents.',
      '',
      'Fields:',
      '- total_pol:      Total amount in POL (Polygon native token)',
      '- total_requests: number of paid MCP access requests',
      '- entries:        Individual payments with tx_hash, from, pol_amount, confirmed_at, redeemed_at',
      '',
      'Only accessible via soul_cert — not public.',
    ].join('\n'),
    {},
    async () => {
      try {
        const data = await getJson('/api/soul/earnings', token);

        const lines = [];
        lines.push(`## Soul Earnings`);
        lines.push(`Total: **${data.total_pol} POL** — ${data.total_requests} paid requests`);

        if (Array.isArray(data.entries) && data.entries.length > 0) {
          lines.push('\n### Recent Payments');
          const recent = [...data.entries].reverse().slice(0, 20);
          for (const e of recent) {
            lines.push(
              `- **${e.pol_amount} POL** from \`${e.from?.slice(0, 10)}…\`` +
              ` | ${e.confirmed_at?.slice(0, 10) ?? '?'}` +
              ` | TX: \`${e.tx_hash?.slice(0, 12)}…\``
            );
          }
          if (data.entries.length > 20) {
            lines.push(`_… and ${data.entries.length - 20} more entries_`);
          }
        } else {
          lines.push('\n_No payments received yet._');
        }

        return {
          content: [
            { type: 'text', text: lines.join('\n') },
            { type: 'text', text: JSON.stringify(data, null, 2) },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: err.status === 401 ? 'Token ungültig.' : err.message }],
          isError: true,
        };
      }
    }
  );
}
