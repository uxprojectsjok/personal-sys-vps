import { getJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'soul_earnings',
    [
      'Returns the earnings overview for this soul — all received x402 (USDC on Polygon) and',
      'PayPal-derived payments from AI agents, plus historical POL payments if any remain from',
      'before the POL rail was retired.',
      '',
      'Fields:',
      '- total_usdc:          Total amount in USDC from x402 payments',
      '- usdc_total_requests: number of paid MCP access requests via x402',
      '- usdc_entries:        Individual x402 payments with tx_hash, usdc_amount, confirmed_at',
      '- total_pol / entries: historical POL payments (payment rail retired, kept for the record)',
      '',
      'Only accessible via soul_cert — not public.',
    ].join('\n'),
    {},
    async () => {
      try {
        const data = await getJson('/api/soul/earnings', token);

        const lines = [];
        lines.push(`## Soul Earnings`);
        lines.push(`Total: **${data.total_usdc} USDC** — ${data.usdc_total_requests} paid requests`);

        const usdcEntries = Array.isArray(data.usdc_entries) ? data.usdc_entries : [];
        if (usdcEntries.length > 0) {
          lines.push('\n### Recent Payments');
          const recent = [...usdcEntries].reverse().slice(0, 20);
          for (const e of recent) {
            lines.push(
              `- **${e.usdc_amount} USDC** from \`${e.from?.slice(0, 10) ?? '?'}…\`` +
              ` | ${e.confirmed_at?.slice(0, 10) ?? '?'}` +
              ` | TX: \`${e.tx_hash?.slice(0, 12)}…\``
            );
          }
          if (usdcEntries.length > 20) {
            lines.push(`_… and ${usdcEntries.length - 20} more entries_`);
          }
        } else {
          lines.push('\n_No x402 payments received yet._');
        }

        const polEntries = Array.isArray(data.entries) ? data.entries : [];
        if (polEntries.length > 0) {
          lines.push(`\n_Historical: ${data.total_pol} POL from ${polEntries.length} earlier direct transfers (that payment rail has been removed)._`);
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
