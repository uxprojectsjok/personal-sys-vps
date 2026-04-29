import { getJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'soul_earnings',
    [
      'Gibt die Verdienst-Übersicht dieser Soul zurück — alle eingegangenen POL-Zahlungen von KI-Agenten.',
      '',
      'Felder:',
      '- total_pol:      Gesamtbetrag in POL (Polygon-Native-Token)',
      '- total_requests: Anzahl der bezahlten MCP-Zugriffe',
      '- entries:        Einzelne Zahlungen mit tx_hash, from, pol_amount, confirmed_at, redeemed_at',
      '',
      'Nur per soul_cert abrufbar — nicht öffentlich.',
    ].join('\n'),
    {},
    async () => {
      try {
        const data = await getJson('/api/soul/earnings', token);

        const lines = [];
        lines.push(`## Soul Earnings`);
        lines.push(`Gesamt: **${data.total_pol} POL** — ${data.total_requests} bezahlte Zugriffe`);

        if (Array.isArray(data.entries) && data.entries.length > 0) {
          lines.push('\n### Letzte Zahlungen');
          // Neueste zuerst, max. 20 anzeigen
          const recent = [...data.entries].reverse().slice(0, 20);
          for (const e of recent) {
            lines.push(
              `- **${e.pol_amount} POL** von \`${e.from?.slice(0, 10)}…\`` +
              ` | ${e.confirmed_at?.slice(0, 10) ?? '?'}` +
              ` | TX: \`${e.tx_hash?.slice(0, 12)}…\``
            );
          }
          if (data.entries.length > 20) {
            lines.push(`_… und ${data.entries.length - 20} weitere Einträge_`);
          }
        } else {
          lines.push('\n_Noch keine Zahlungen eingegangen._');
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
