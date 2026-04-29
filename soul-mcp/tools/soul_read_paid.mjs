/**
 * soul_read_paid — soul_read für bezahlte externe Agenten.
 * Verwendet pol_access_token (statt soul_cert) gegen /api/soul/paid-read.
 */

const BASE = () => process.env.SYS_API_URL || '';

export function register(server, polToken) {
  server.tool(
    'soul_read',
    [
      'Liest den Soul-Inhalt (sys.md): Persönlichkeit, Werte, Biografie, Projekte, Ziele.',
      '',
      'WICHTIG – Verhaltensregel für den KI-Agenten:',
      '1. soul_read ZU BEGINN JEDER SITZUNG aufrufen, bevor geantwortet wird.',
      '2. Während des Gesprächs: Auf Soul-Inhalte Bezug nehmen.',
      '',
      '(Bezahlter Zugang via pol_access_token — schreibgeschützt)',
    ].join('\n'),
    {},
    async () => {
      try {
        const res = await fetch(`${BASE()}/api/soul/paid-read`, {
          headers: {
            'Authorization': `Bearer ${polToken}`,
            'Accept': 'text/plain',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          if (res.status === 401) {
            return {
              content: [{ type: 'text', text: 'Zahlung abgelaufen (1h TTL). Neue POL-Zahlung erforderlich: POST /api/soul/pay' }],
              isError: true,
            };
          }
          return {
            content: [{ type: 'text', text: err.message || err.error || `Fehler ${res.status}` }],
            isError: true,
          };
        }

        const text = await res.text();
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `soul_read fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}
