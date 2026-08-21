import { z } from 'zod';

/**
 * soul_read_by_token — Liest eine fremde Soul mit einem bestehenden access_token.
 * Kein neues Payment nötig — Token aus einer x402-Zahlung direkt wiederverwenden.
 */
export function register(server, _token) {
  server.tool(
    'soul_read_by_token',
    [
      'Liest den Soul-Inhalt einer fremden Soul mit einem bereits ausgestellten access_token.',
      'Kein neues Payment nötig — Token ist bis zu 24h (oder konfigurierter Dauer) gültig.',
      '',
      'Wann benutzen:',
      '- Du hast bereits über x402 an pay_endpoint gezahlt und den access_token gespeichert',
      '- Du möchtest die Soul erneut lesen ohne eine neue x402-Zahlung',
      '',
      'Parameter:',
      '- read_endpoint: vollständige URL des paid-read Endpoints',
      '  (Ableitung: pay_endpoint → /pay durch /paid-read ersetzen)',
      '- access_token:  bereits ausgestellter access_token aus einer x402-Zahlung',
      '  (48-stelliger Hex-String)',
    ].join('\n'),
    {
      read_endpoint: z.string().url().describe('URL des paid-read Endpoints der Ziel-Soul (…/api/soul/paid-read)'),
      access_token:  z.string().regex(/^[0-9a-fA-F]{48}$/i).describe('bereits ausgestellter access_token aus einer x402-Zahlung'),
    },
    async ({ read_endpoint, access_token }) => {
      try {
        const res = await fetch(read_endpoint, {
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Accept':        'text/plain',
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          if (res.status === 401) {
            return {
              content: [{ type: 'text', text: 'Zugriff verweigert — access_token abgelaufen oder ungültig. Bitte erneut über den x402-Zahlungsweg der Ziel-Soul zahlen (pay_endpoint direkt mit dem x402-Protokoll).' }],
              isError: true,
            };
          }
          const err = await res.json().catch(() => ({}));
          return {
            content: [{ type: 'text', text: `Lesezugriff fehlgeschlagen: ${err.error || res.status}` }],
            isError: true,
          };
        }

        const soulContent    = await res.text();
        const commentEndpoint = read_endpoint.replace(/\/paid-read(\?.*)?$/, '/paid-comment');

        return {
          content: [{
            type: 'text',
            text: [
              '[Soul-Inhalt — bestehender Token]',
              `access_token: ${access_token}`,
              `comment_endpoint: ${commentEndpoint}`,
              '---',
              '',
              soulContent,
            ].join('\n'),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `soul_read_by_token fehlgeschlagen: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
