import { z } from 'zod';

const BASE = () => process.env.SYS_API_URL || '';

export function register(server, token) {
  server.tool(
    'soul_discover',
    [
      'Durchsucht das öffentliche SYS-Soul-Verzeichnis (IPFS/Pinata) nach registrierten Souls.',
      'Gibt Marktplatz-Einträge zurück: MCP-Endpoint, Zahlungskonditionen, soul_id.',
      '',
      'Parameter:',
      '- q:         Freitext-Suche (soul_id Substring oder Name) — optional',
      '- amortized: true = nur Souls die POL-Zahlungen akzeptieren — optional',
      '- limit:     Max. Ergebnisse (1–100, Standard 20) — optional',
      '',
      'Typischer Workflow für einen zahlenden Agenten:',
      '1. soul_discover(amortized=true) → Liste verfügbarer Souls',
      '2. POL-Transaktion an soul.amortization.wallet senden (pol_per_request Betrag)',
      '3. POST soul.pay_endpoint mit tx_hash → access_token',
      '4. MCP-Verbindung zu soul.mcp_endpoint mit access_token',
    ].join('\n'),
    {
      q:         z.string().optional().describe('Freitext-Suche (soul_id oder Name)'),
      amortized: z.boolean().optional().describe('Nur zahlungspflichtige Souls'),
      limit:     z.number().min(1).max(100).optional().describe('Max. Ergebnisse'),
    },
    async ({ q, amortized, limit }) => {
      try {
        const params = new URLSearchParams();
        if (q)         params.set('q', q);
        if (amortized) params.set('amortized', 'true');
        if (limit)     params.set('limit', String(limit));

        const url = `${BASE()}/internal/discover-souls?${params.toString()}`;

        // Direkt internen Endpoint aufrufen (läuft auf demselben Server)
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal:  AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          if (err.error === 'pinata_not_configured') {
            return {
              content: [{ type: 'text', text: 'Soul-Verzeichnis nicht konfiguriert — PINATA_JWT fehlt.' }],
              isError: true,
            };
          }
          throw new Error(err.error || res.statusText);
        }

        const data = await res.json();
        const souls = data.souls || [];

        if (souls.length === 0) {
          return {
            content: [{ type: 'text', text: 'Keine Souls im Verzeichnis gefunden.' + (q ? ` (Suche: "${q}")` : '') }],
          };
        }

        const lines = [];
        lines.push(`## Soul-Marktplatz — ${souls.length} Einträge${data.total > souls.length ? ` (von ${data.total})` : ''}`);
        if (q) lines.push(`_Suche: "${q}"_`);
        lines.push('');

        for (const s of souls) {
          lines.push(`### ${s.name || s.soul_id}`);
          lines.push(`- **soul_id:** \`${s.soul_id}\``);
          lines.push(`- **MCP:** ${s.mcp_endpoint}`);

          if (s.amortization?.enabled) {
            lines.push(`- **Preis:** ${s.amortization.pol_per_request} POL pro Anfrage`);
            lines.push(`- **Wallet:** \`${s.amortization.wallet}\``);
            if (Array.isArray(s.amortization.free_tools) && s.amortization.free_tools.length) {
              lines.push(`- **Kostenlos:** ${s.amortization.free_tools.join(', ')}`);
            }
            lines.push(`- **Zahlung:** POST ${s.pay_endpoint}`);
          } else {
            lines.push(`- **Zugang:** kostenlos (keine Amortisation)`);
          }

          lines.push(`- **Verifikation:** ${s.verify_endpoint}`);
          lines.push(`- **IPFS:** \`${s.cid}\``);
          lines.push(`- **Registriert:** ${s.pinned_at?.slice(0, 10) ?? '?'}`);
          lines.push('');
        }

        lines.push('---');
        lines.push('_Zahlungs-Workflow: POL an Wallet senden → tx_hash an pay_endpoint → access_token für MCP-Zugriff_');

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Discovery fehlgeschlagen: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
