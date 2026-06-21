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
      'Pays with a Polygon TX-hash and reads the content of an external Soul.',
      '',
      'Full payment flow (automatic):',
      '  0. GET /price → current price + quote_id (locked for 5 min)',
      '  1. POST pay_endpoint with soul_id + tx_hash + quote_id → access_token',
      '  2. GET paid-read with access_token → Soul content (AGENT block)',
      '',
      'IMPORTANT: The price quote is valid for 5 minutes only.',
      'The user must send the exact POL amount shown in step 0 before the quote expires.',
      'If the quote expires, the payment will be rejected even if the TX is confirmed.',
      '',
      'Prerequisites:',
      '- User has transferred POL to soul.amortization.wallet (exact amount from /price)',
      '- TX is confirmed on Polygon',
      '- pay_endpoint and soul_id come from soul_discover',
      '',
      'Parameters:',
      '- pay_endpoint: full URL, e.g. https://example.com/api/soul/pay',
      '- soul_id:      UUID of the target Soul',
      '- tx_hash:      Polygon TX hash of the POL payment (0x…)',
    ].join('\n'),
    {
      pay_endpoint: z.string().url().describe('Vollständige URL des pay-Endpoints der Ziel-Soul'),
      soul_id:      z.string().uuid().describe('UUID der Ziel-Soul'),
      tx_hash:      z.string().regex(/^0x[a-fA-F0-9]{64}$/).describe('Polygon TX-Hash der POL-Zahlung'),
    },
    async ({ pay_endpoint, soul_id, tx_hash }) => {
      try {
        // ── 0. Preis + Quote abrufen ──────────────────────────────────────────
        const priceUrl = pay_endpoint.replace(/\/pay(\?.*)?$/, '/price') + `?soul_id=${soul_id}`;
        let priceInfo = '';
        let quoteId   = null;
        try {
          const pr = await fetch(priceUrl, { signal: AbortSignal.timeout(5000) });
          if (pr.ok) {
            const pd = await pr.json();
            if (pd.enabled) {
              quoteId = pd.quote_id || null;
              const dynamicNote = pd.dynamic
                ? ` (dynamic: ${pd.anchor_count} anchors · ${pd.chain_age_days}d chain age · ${pd.base_price} × ${pd.multiplier})`
                : ' (fixed)';
              const validUntil = pd.valid_until
                ? new Date(pd.valid_until * 1000).toLocaleTimeString()
                : null;
              const quoteNote = quoteId && validUntil
                ? `\nPrice locked until ${validUntil} (${pd.quote_ttl_sec}s) — quote_id: ${quoteId}`
                : '';
              priceInfo = `Price: ${pd.pol_required} POL${dynamicNote}${quoteNote}\n`;
            }
          }
        } catch { /* price fetch optional, non-blocking */ }

        // ── 1. Zahlung verifizieren → access_token holen ─────────────────────
        const payRes = await fetch(pay_endpoint, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ soul_id, tx_hash, ...(quoteId ? { quote_id: quoteId } : {}) }),
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
        const commentEndpoint = pay_endpoint.replace(/\/pay(\?.*)?$/, '/paid-comment');
        const tokenInfo = [
          `access_token: ${accessToken}`,
          `gültig bis:   ${expiresAt ? new Date(expiresAt).toLocaleString('de-DE') : 'unbekannt'}`,
          `Retry mit:    soul_read_by_token(token="${accessToken}", paid_read_url="${paidReadUrl}")`,
        ].join('\n');

        const readRes = await fetch(paidReadUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept':        'text/plain',
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!readRes.ok) {
          const err = await readRes.json().catch(() => ({}));
          // Token-Fehler (401): kein Token zurückgeben, er ist wertlos
          if (readRes.status === 401) {
            return {
              content: [{ type: 'text', text: `Lesezugriff verweigert — access_token abgelaufen oder ungültig. Neue Zahlung erforderlich.` }],
              isError: true,
            };
          }
          // Inhaltsfehler (404 agent_content_empty, 204, 403 privat):
          // Token ist gültig — zurückgeben damit der Agent später ohne neue Zahlung retried
          const reason = err.error === 'agent_content_empty'
            ? 'Der Agent-Sandbox-Block ist leer — der Soul-Inhaber hat noch nichts für Agenten hinterlegt.'
            : err.error === 'no_agent_content'
            ? 'Kein AGENT:START/END-Block in sys.md definiert.'
            : err.error === 'soul_private'
            ? 'Diese Soul ist als privat markiert — kein Lesezugriff für externe Agenten.'
            : `Lesezugriff fehlgeschlagen: ${err.error || readRes.status}`;
          return {
            content: [{ type: 'text', text: `${reason}\n\nDer access_token ist trotzdem gültig — du kannst es später erneut versuchen:\n\n${tokenInfo}` }],
            isError: true,
          };
        }

        // 204: Token valide, aber keine Nachrichten im gewählten Zeitfenster
        if (readRes.status === 204) {
          return {
            content: [{ type: 'text', text: `Keine Nachrichten im aktuellen Zeitfenster (Stage 1 = letzte 24h).\nMit ?stage=2 kannst du bis zu 48h abrufen.\n\n${tokenInfo}` }],
          };
        }

        const soulContent = await readRes.text();
        if (!soulContent || !soulContent.trim()) {
          return {
            content: [{ type: 'text', text: `Agent-Sandbox leer.\n\n${tokenInfo}` }],
          };
        }

        const lines = [
          `[Soul-Inhalt · ${soul_id.slice(0, 8)}… · Zugang bis ${expiresAt ? new Date(expiresAt).toLocaleString('de-DE') : '?'}]`,
          priceInfo ? priceInfo.trim() : '',
          `access_token: ${accessToken}`,
          `comment_endpoint: ${commentEndpoint}`,
          '---',
          '',
          soulContent,
        ].filter(l => l !== '');

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
