import { z } from 'zod';

const MCP_BASE = () => `http://127.0.0.1:${process.env.PORT || '3098'}`;

export function register(server, token) {
  server.tool(
    'soul_discover',
    [
      'Durchsucht das öffentliche SYS-Soul-Verzeichnis nach registrierten Souls.',
      'Quellen: IPFS/Pinata (primär) und Polygon-Blockchain (Fallback).',
      '',
      'Suche (q) durchsucht: Name, soul_id, Tags, Beschreibung.',
      'Beispiele: q="Marburg" findet Souls mit Tag "marburg".',
      '           q="AI" findet Souls die "ai" im Tag oder in der Beschreibung haben.',
      '',
      'Parameter:',
      '- q:         Freitext-Suche — Name, soul_id, Tags, Beschreibung — optional',
      '- amortized: true = nur Souls die POL-Zahlungen akzeptieren — optional',
      '- limit:     Max. Ergebnisse (1–100, Standard 20) — optional',
      '',
      'Treffer enthalten gateway_url → vollständige Soul-Metadaten (Pinata-Pin).',
      '',
      'Typischer Workflow für einen zahlenden Agenten:',
      '1. soul_discover(q="Marburg") → Treffer mit Tags, Description, gateway_url',
      '2. gateway_url öffnen → alle Details der Soul',
      '3. POL-Transaktion an soul.amortization.wallet senden',
      '4. soul_pay_read(pay_endpoint, soul_id, tx_hash) → Soul-Inhalt',
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

        const url = `${MCP_BASE()}/internal/discover-souls?${params.toString()}`;

        // Direkt internen Endpoint aufrufen (läuft auf demselben Server)
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal:  AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          if (err.error === 'pinata_not_configured') {
            return {
              content: [{ type: 'text', text: 'Discovery nicht verfügbar — weder PINATA_JWT noch Chain-Discovery konfiguriert.' }],
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

        const isChain = data.source === 'chain';
        const lines = [];
        lines.push(`## Soul-Marktplatz — ${souls.length} Einträge${data.total > souls.length ? ` (von ${data.total})` : ''}`);
        if (isChain) lines.push(`_Quelle: Polygon-Blockchain (kein Pinata konfiguriert)_`);
        if (q) lines.push(`_Suche: "${q}"_`);
        lines.push('');

        for (const s of souls) {
          lines.push(`### ${s.name || s.soul_id}`);
          if (s.description) lines.push(`_${s.description}_`);
          if (s.tags?.length) lines.push(`**Tags:** ${s.tags.map(t => `\`${t}\``).join(' · ')}`);
          lines.push('');
          lines.push(`- **soul_id:** \`${s.soul_id}\``);
          lines.push(`- **MCP:** ${s.mcp_endpoint}`);

          if (s.amortization?.enabled) {
            lines.push(`- **Preis:** ${s.amortization.pol_per_request} POL pro Anfrage`);
            lines.push(`- **Wallet:** \`${s.amortization.wallet}\``);
            const aTools = s.amortization.agent_tools || s.amortization.free_tools;
            if (Array.isArray(aTools) && aTools.length) {
              lines.push(`- **Agent-Tools:** ${aTools.join(', ')}`);
            }
            if (s.pay_endpoint) lines.push(`- **Zahlung:** POST ${s.pay_endpoint}`);
          } else {
            lines.push(`- **Zugang:** kostenlos (keine Amortisation)`);
          }

          if (s.gateway_url) lines.push(`- **Alle Details:** [Pinata Gateway](${s.gateway_url})`);
          if (s.verify_endpoint) lines.push(`- **Verifikation:** ${s.verify_endpoint}`);
          if (s.pinned_at) lines.push(`- **Registriert:** ${s.pinned_at.slice(0, 10)}`);
          if (s.anchor_date) lines.push(`- **Anker:** ${s.anchor_date} (${s.sessions ?? 0} Sessions)`);
          if (s.chain_verified) lines.push(`- **Chain:** verifiziert ✓`);
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
