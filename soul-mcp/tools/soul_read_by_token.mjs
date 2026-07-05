import { z } from 'zod';

/**
 * soul_read_by_token — Liest eine fremde Soul mit einem bestehenden pol_access_token.
 * Kein neues Payment nötig — Token aus soul_pay_read direkt wiederverwenden, ODER
 * ein Token, das ein Mensch nach manueller PayPal-Zahlung vom Betreiber erhalten hat.
 */
export function register(server, _token) {
  server.tool(
    'soul_read_by_token',
    [
      'Liest den Soul-Inhalt einer fremden Soul mit einem bereits ausgestellten pol_access_token.',
      'Kein neues Payment nötig — Token ist bis zu 24h (oder konfigurierter Dauer) gültig.',
      '',
      'Wann benutzen:',
      '- Du hast soul_pay_read bereits aufgerufen und den access_token gespeichert',
      '- Du möchtest die Soul erneut lesen ohne eine neue POL-Zahlung',
      '- Ein Mensch gibt dir direkt in diesem Chat einen 48-stelligen Hex-Token,',
      '  z.B. nach einer manuellen PayPal-Zahlung (Nicht-Krypto-Weg, siehe soul_discover).',
      '  Erkennbar: reine Hex-Zeichenkette ohne "0x"-Präfix (kein TX-Hash!), meist ohne',
      '  weiteren Kontext. In diesem Fall NICHT nach Zahlung/TX-Hash fragen — der Token',
      '  ist bereits gültig, direkt hier verwenden. Fehlt der read_endpoint, zuerst',
      '  soul_discover(q=...) nutzen um die Soul zu finden und pay_endpoint abzuleiten.',
      '',
      'Parameter:',
      '- read_endpoint: vollständige URL des paid-read Endpoints',
      '  (Ableitung: pay_endpoint → /pay durch /paid-read ersetzen)',
      '- access_token:  pol_access_token — aus soul_pay_read ODER manuell/PayPal erhalten',
      '  (48-stelliger Hex-String, in beiden Fällen identisch validiert)',
    ].join('\n'),
    {
      read_endpoint: z.string().url().describe('URL des paid-read Endpoints der Ziel-Soul (…/api/soul/paid-read)'),
      access_token:  z.string().regex(/^[0-9a-fA-F]{48}$/i).describe('pol_access_token — aus soul_pay_read oder manuell/PayPal vom Betreiber erhalten'),
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
              content: [{ type: 'text', text: 'Zugriff verweigert — access_token abgelaufen oder ungültig. Bitte soul_pay_read erneut aufrufen.' }],
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
