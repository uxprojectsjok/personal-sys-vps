import { z } from 'zod';

/**
 * soul_paid_comment — Hinterlässt einen Kommentar im AGENT-Block einer fremden Soul.
 *
 * Nutzt einen bereits ausgestellten pol_access_token (aus soul_pay_read).
 * Keine neue Zahlung nötig solange der Token gültig ist.
 */
export function register(server, _token) {
  server.tool(
    'soul_paid_comment',
    [
      'Hinterlässt einen Kommentar im öffentlichen Agent-Bereich einer fremden Soul.',
      '',
      'Voraussetzung: Ein gültiger pol_access_token aus soul_pay_read.',
      'Keine neue Zahlung nötig — der Token gilt für Read UND Comment.',
      '',
      'Der Kommentar landet im <!-- AGENT:START --> / <!-- AGENT:END --> Block',
      'der Ziel-Soul und ist für den Inhaber sofort sichtbar.',
      '',
      'Parameter:',
      '- comment_endpoint: URL des paid-comment Endpoints, z.B. https://example.com/api/soul/paid-comment',
      '  (Ableitung: pay_endpoint ersetze /pay durch /paid-comment)',
      '- access_token:     pol_access_token aus soul_pay_read (48-stelliger Hex-String)',
      '- comment:          Text des Kommentars (max. 2000 Zeichen)',
      '- author:           Anzeigename oder soul_id des Verfassers (optional)',
    ].join('\n'),
    {
      comment_endpoint: z.string().url().describe('URL des paid-comment Endpoints der Ziel-Soul'),
      access_token:     z.string().regex(/^[0-9a-fA-F]{48}$/i).describe('pol_access_token aus soul_pay_read'),
      comment:          z.string().min(1).max(2000).describe('Kommentartext (max. 2000 Zeichen)'),
      author:           z.string().max(80).optional().describe('Anzeigename des Verfassers'),
    },
    async ({ comment_endpoint, access_token, comment, author }) => {
      try {
        const body = { comment };
        if (author) body.author = author;

        const res = await fetch(comment_endpoint, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${access_token}`,
          },
          body:   JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const msg = data.message || data.error || `HTTP ${res.status}`;
          if (res.status === 401) {
            return {
              content: [{ type: 'text', text: `Zugriff verweigert — access_token abgelaufen. Bitte soul_pay_read erneut aufrufen.` }],
              isError: true,
            };
          }
          if (res.status === 404) {
            return {
              content: [{ type: 'text', text: `Kein Agent-Block in der Ziel-Soul definiert (${msg}).` }],
              isError: true,
            };
          }
          return {
            content: [{ type: 'text', text: `Kommentar fehlgeschlagen: ${msg}` }],
            isError: true,
          };
        }

        return {
          content: [{
            type: 'text',
            text: [
              `Kommentar hinterlassen.`,
              `Autor: ${data.author || author || 'anonymous'}`,
              `Zeitpunkt: ${data.written_at || new Date().toISOString()}`,
              ``,
              `Der Inhaber der Soul sieht deinen Kommentar jetzt in seinem Agent-Sandbox-Block.`,
            ].join('\n'),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `soul_paid_comment fehlgeschlagen: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
