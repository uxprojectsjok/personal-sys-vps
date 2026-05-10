import { z } from 'zod';

const MCP_BASE = () => `http://127.0.0.1:${process.env.PORT || '3098'}`;

export function register(server, token) {
  server.tool(
    'soul_discover',
    [
      'Durchsucht das SYS-Soul-Verzeichnis nach on-chain verankerten Souls.',
      '',
      'QUELLE: Polygon-Blockchain (einzige Quelle der Wahrheit).',
      'Pinata/IPFS wird nur zum Pinnen genutzt — nicht zur Suche.',
      'Metadaten (Name, Tags, Beschreibung) stammen aus dem Calldata des neuesten Anker-TX.',
      'Falls eine CID hinterlegt ist, wird das IPFS-Metadata-JSON zur Anreicherung geladen.',
      '',
      'QUALITÄTSSIGNALE (verifizierbarer Anti-Fraud, kein subjektives Rating):',
      '- sessions:         Growth Chain Länge — echte Sessions, kryptografisch signiert.',
      '                    Nicht fälschbar ohne reale Nutzung.',
      '- anchor_count:     Wie oft die Soul verankert wurde — zeigt anhaltende Aktivität.',
      '- anchor_span_days: Tage zwischen erstem und letztem Anker — nachhaltiger Aufbau.',
      'Sortierung: sessions DESC, dann anchor_span_days DESC.',
      'Souls ohne echte Session werden nicht angezeigt (Anti-Fraud-Mindestfilter).',
      '',
      'Suche (q) durchsucht: Name, soul_id, Tags, Beschreibung.',
      '',
      'Parameter:',
      '- q:         Freitext-Suche — Name, soul_id, Tags, Beschreibung — optional',
      '- amortized: true = nur Souls die POL-Zahlungen akzeptieren — optional',
      '- limit:     Max. Ergebnisse (1–100, Standard 20) — optional',
      '',
      'ZUGANGS-MODELLE — wichtig, nicht verwechseln:',
      '- amortization.enabled = true  → Zugang per POL-Zahlung möglich.',
      '  Workflow: POL an wallet → tx_hash → soul_pay_read(pay_endpoint, soul_id, tx_hash)',
      '- amortization.enabled = false / fehlt → KEIN öffentlicher Zugang.',
      '  Diese Soul hat keinen Bezahl-Endpunkt konfiguriert.',
      '  Zugang nur für den Eigentümer selbst oder vertrauenswürdige Peers (soul_cert).',
      '  soul_pay_read funktioniert hier NICHT — keinen TX-Hash anfordern!',
      '',
      'Typischer Workflow für einen zahlenden Agenten (nur amortized=true Souls):',
      '1. soul_discover(amortized=true) → nur zahlungspflichtige Souls anzeigen',
      '2. gateway_url öffnen (falls vorhanden) → vollständige IPFS-Metadaten',
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
          signal:  AbortSignal.timeout(30000),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || res.statusText);
        }

        const data = await res.json();
        const souls = data.souls || [];

        if (souls.length === 0) {
          const scanning = data.indexing === true;
          const indexed  = data.indexed ?? 0;
          let msg = scanning
            ? `Index wird aufgebaut — bitte in 2-3 Minuten erneut versuchen. (${indexed} Souls bisher indexiert, Blockchain-Scan läuft.)`
            : 'Keine verankerten Souls gefunden.' + (q ? ` (Suche: "${q}")` : '');
          return { content: [{ type: 'text', text: msg }] };
        }

        const lines = [];
        lines.push(`## Soul-Verzeichnis — ${souls.length} Einträge${data.total > souls.length ? ` (von ${data.total})` : ''}`);
        lines.push(`_Quelle: Polygon-Blockchain · sortiert nach Aktivität_`);
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
            lines.push(`- **Zugang:** kein öffentlicher Zugang (kein Bezahl-Endpunkt konfiguriert)`);
          }

          if (s.gateway_url) lines.push(`- **Alle Details:** [Pinata Gateway](${s.gateway_url})`);
          if (s.verify_endpoint) lines.push(`- **Verifikation:** ${s.verify_endpoint}`);
          if (s.pinned_at) lines.push(`- **Registriert:** ${s.pinned_at.slice(0, 10)}`);

          // Trust-Signale — verifizierbarer Anti-Fraud ohne Rating
          const sessions        = s.sessions ?? 0;
          const anchorCount     = s.anchor_count ?? 1;
          const anchorSpanDays  = s.anchor_span_days ?? 0;
          const firstAnchorDate = s.first_anchor_date ?? s.anchor_date ?? null;
          if (s.anchor_date) {
            const spanNote = anchorSpanDays > 0 ? ` · ${anchorSpanDays}d aktiv` : '';
            const countNote = anchorCount > 1 ? ` · ${anchorCount} Anker` : '';
            lines.push(`- **Anker:** ${firstAnchorDate}→${s.anchor_date}${spanNote}${countNote}`);
          }
          lines.push(`- **Sessions:** ${sessions} (Growth Chain — kryptografisch gesichert)`);
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
