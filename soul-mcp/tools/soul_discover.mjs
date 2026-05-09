import { z } from 'zod';

const MCP_BASE = () => `http://127.0.0.1:${process.env.PORT || '3098'}`;

export function register(server, token) {
  server.tool(
    'soul_discover',
    [
      'Durchsucht das öffentliche SYS-Soul-Verzeichnis nach registrierten Souls.',
      '',
      'QUELLEN — beide werden parallel abgefragt und zu einem Ergebnis zusammengeführt:',
      '- Pinata/IPFS:  Soul hat sich aktiv registriert. Metadaten sind aktuell und vollständig.',
      '                gateway_url vorhanden → alle Details abrufbar.',
      '- Blockchain:   Soul wurde auf Polygon verankert (soul_chain_anchor in sys.md).',
      '                Daten stammen aus dem On-Chain-Anker — kryptografisch gesichert,',
      '                können aber älter sein als der aktuelle Stand der Soul.',
      '                Kein Pinata nötig — Blockchain ist immer verfügbar.',
      '- Pinata + Blockchain verifiziert: Beide Quellen stimmen überein.',
      '                Höchstes Vertrauen — Metadaten aktuell UND on-chain bestätigt.',
      '',
      'VERTRAUENSREIHENFOLGE: Pinata+Blockchain > Pinata > Blockchain',
      'Bei Duplikaten (gleiche soul_id in beiden Quellen) gewinnt die Blockchain-Seite.',
      '',
      'Suche (q) durchsucht: Name, soul_id, Tags, Beschreibung.',
      '',
      'Parameter:',
      '- q:         Freitext-Suche — Name, soul_id, Tags, Beschreibung — optional',
      '- amortized: true = nur Souls die POL-Zahlungen akzeptieren — optional',
      '- limit:     Max. Ergebnisse (1–100, Standard 20) — optional',
      '',
      'Typischer Workflow für einen zahlenden Agenten:',
      '1. soul_discover(q="Berlin") → Treffer mit Quelle, Tags, gateway_url',
      '2. gateway_url öffnen → vollständige Metadaten der Soul',
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

        const sourceLabel = {
          'ipfs':       'Pinata/IPFS',
          'chain':      'Blockchain (kein Pinata konfiguriert)',
          'ipfs+chain': 'Pinata/IPFS + Blockchain',
          'none':       'keine Quelle',
        }[data.source] ?? data.source ?? 'unbekannt';

        const lines = [];
        lines.push(`## Soul-Marktplatz — ${souls.length} Einträge${data.total > souls.length ? ` (von ${data.total})` : ''}`);
        lines.push(`_Gesamtquelle: ${sourceLabel}_`);
        if (q) lines.push(`_Suche: "${q}"_`);
        lines.push('');

        const soulSourceLabel = {
          'ipfs':       'Pinata/IPFS — aktiv registriert, Metadaten aktuell',
          'chain':      'Blockchain — On-Chain-Anker auf Polygon, kein Pinata-Pin',
          'ipfs+chain': 'Pinata/IPFS + Blockchain — beide Quellen bestätigt, höchstes Vertrauen',
        };

        for (const s of souls) {
          lines.push(`### ${s.name || s.soul_id}`);
          if (s.description) lines.push(`_${s.description}_`);
          if (s.tags?.length) lines.push(`**Tags:** ${s.tags.map(t => `\`${t}\``).join(' · ')}`);
          lines.push('');
          lines.push(`- **Quelle:** ${soulSourceLabel[s.source] ?? s.source ?? 'unbekannt'}`);
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
          if (s.chain_verified) lines.push(`- **Chain:** verifiziert ✓ (soul_id und Metadaten stimmen mit Polygon-Transaktion überein)`);
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
