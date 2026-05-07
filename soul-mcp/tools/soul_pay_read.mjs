import { z } from 'zod';

/**
 * soul_pay_read — Bezahlt mit einem Polygon-TX und liest eine fremde Soul.
 *
 * Kapselt den kompletten Flow:
 *   tx_hash → POST pay_endpoint → access_token → GET paid-read → Soul-Inhalt
 *
 * Damit entfällt der manuelle curl-Schritt für Nutzer:innen.
 */
export function register(server, _token) {
  server.tool(
    'soul_pay_read',
    [
      'Bezahlt mit einem Polygon-TX-Hash und liest den Soul-Inhalt einer fremden Soul.',
      '',
      'Kapselt den kompletten Zahlungsflow:',
      '  1. POST pay_endpoint mit soul_id + tx_hash → access_token',
      '  2. GET paid-read mit access_token → Soul-Inhalt (AGENT-Block)',
      '',
      'Vorbedingungen:',
      '- Nutzer:in hat POL an soul.amortization.wallet überwiesen',
      '- TX ist auf Polygon bestätigt',
      '- pay_endpoint und soul_id kommen aus soul_discover',
      '',
      'Parameter:',
      '- pay_endpoint: vollständige URL, z.B. https://example.com/api/soul/pay',
      '- soul_id:      UUID der Ziel-Soul',
      '- tx_hash:      Polygon TX-Hash der POL-Zahlung (0x…)',
    ].join('\n'),
    {
      pay_endpoint: z.string().url().describe('Vollständige URL des pay-Endpoints der Ziel-Soul'),
      soul_id:      z.string().uuid().describe('UUID der Ziel-Soul'),
      tx_hash:      z.string().regex(/^0x[a-fA-F0-9]{64}$/).describe('Polygon TX-Hash der POL-Zahlung'),
    },
    async ({ pay_endpoint, soul_id, tx_hash }) => {
      try {
        // ── 1. Zahlung verifizieren → access_token holen ─────────────────────
        const payRes = await fetch(pay_endpoint, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ soul_id, tx_hash }),
          signal:  AbortSignal.timeout(20000),
        });

        if (!payRes.ok) {
          const err = await payRes.json().catch(() => ({}));
          const msg = err.error || err.message || `HTTP ${payRes.status}`;
          if (payRes.status === 409) {
            return {
              content: [{ type: 'text', text: `TX bereits verwendet — access_token für diese Transaktion wurde schon ausgestellt.` }],
              isError: true,
            };
          }
          return {
            content: [{ type: 'text', text: `Zahlung fehlgeschlagen: ${msg}` }],
            isError: true,
          };
        }

        const payData     = await payRes.json();
        const accessToken = payData.access_token;
        const expiresAt   = payData.expires_at;

        if (!accessToken) {
          return {
            content: [{ type: 'text', text: 'Kein access_token in der Antwort des pay-Endpoints.' }],
            isError: true,
          };
        }

        // ── 2. paid-read URL ableiten (pay → paid-read) ───────────────────────
        const paidReadUrl = pay_endpoint.replace(/\/pay(\?.*)?$/, '/paid-read');

        // ── 3. Soul-Inhalt lesen ─────────────────────────────────────────────
        const readRes = await fetch(paidReadUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept':        'text/plain',
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!readRes.ok) {
          const err = await readRes.json().catch(() => ({}));
          if (readRes.status === 401) {
            return {
              content: [{ type: 'text', text: `Lesezugriff verweigert — access_token abgelaufen oder ungültig.` }],
              isError: true,
            };
          }
          return {
            content: [{ type: 'text', text: `Soul-Lesezugriff fehlgeschlagen: ${err.error || readRes.status}` }],
            isError: true,
          };
        }

        const soulContent = await readRes.text();
        const lines = [
          `[Soul-Inhalt · ${soul_id.slice(0, 8)}… · Zugang bis ${expiresAt ? new Date(expiresAt).toLocaleString('de-DE') : '?'}]`,
          '',
          soulContent,
        ];

        return { content: [{ type: 'text', text: lines.join('\n') }] };

      } catch (err) {
        return {
          content: [{ type: 'text', text: `soul_pay_read fehlgeschlagen: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
