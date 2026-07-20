import { z } from 'zod';

const MCP_BASE = () => `http://127.0.0.1:${process.env.PORT || '3098'}`;

// EU withdrawal-rights consent flow — off by default, opt-in via init.sh
// ("Set up EU consumer rights?") / EU_CONSUMER_RIGHTS in soul-mcp/.env.
const EU_CONSUMER_RIGHTS = process.env.EU_CONSUMER_RIGHTS === 'true';

export function register(server, token) {
  server.tool(
    'soul_discover',
    [
      'Searches the SYS soul directory for on-chain anchored souls — call this whenever',
      'the user asks to find/search/look for a soul, an agent, or a person by topic, name,',
      'or tag (e.g. "find a soul about AI", "is there a soul for cooking").',
      '',
      'SOURCE: Polygon blockchain (single source of truth).',
      'Pinata/IPFS is only used for pinning — not for search.',
      'Metadata (name, tags, description) comes from the calldata of the latest anchor TX.',
      'If a CID is stored, the IPFS metadata JSON is loaded for enrichment.',
      '',
      'QUALITY SIGNALS (verifiable anti-fraud, no subjective rating):',
      '- sessions:         Growth chain length — real sessions, cryptographically signed.',
      '                    Cannot be faked without real usage.',
      '- anchor_count:     How often the soul was anchored — shows sustained activity.',
      '- anchor_span_days: Days between first and last anchor — sustained development.',
      'Sort: sessions DESC, then anchor_span_days DESC.',
      'Souls without real sessions are not shown (anti-fraud minimum filter).',
      '',
      'Search (q) searches: name, soul_id, tags, description.',
      '',
      'Parameters:',
      '- q:         Free-text search — name, soul_id, tags, description — optional',
      '- amortized: true = only souls accepting payment (x402/PayPal) — optional',
      '- limit:     Max. results (1–100, default 20) — optional',
      '',
      'ZUGANGS-MODELLE — wichtig, nicht verwechseln:',
      '- amortization.enabled = true  → Zugang per x402/USDC-Zahlung möglich (Polygon).',
      '  Workflow: pay_endpoint direkt mit dem x402-Protokoll bezahlen (402-Challenge',
      '  -> signierte EIP-3009-Autorisierung als Retry) — kein SYS-eigenes Zahlungs-Tool',
      '  nötig, x402 ist ein Standardprotokoll, jeder konforme Client kennt es bereits.',
      '- amortization.enabled = false / fehlt → KEIN öffentlicher Zugang.',
      '  Diese Soul hat keinen Bezahl-Endpunkt konfiguriert.',
      '  Zugang nur für den Eigentümer selbst oder vertrauenswürdige Peers (soul_cert).',
      '',
      'Typischer Workflow für einen zahlenden Agenten (nur amortized=true Souls):',
      '1. soul_discover(amortized=true) → nur zahlungspflichtige Souls anzeigen',
      '2. soul_preview(pay_endpoint, soul_id) → kostenloser Teaser + Live-Preis (bei dynamic_pricing)',
      '   Zeigt den ersten ~200 Zeichen des AGENT-Blocks + aktuellem USDC-Preis mit Multiplikator.',
      '   IMMER aufrufen bevor bezahlt wird — besonders bei dynamic_pricing=true Souls.',
      '   Wallet-Adresse erscheint NICHT hier, sondern erst in soul_preview bzw. nach',
      '   erteilter Zustimmung (falls die Ziel-Soul EU-Widerrufsrecht durchsetzt) — dieses Tool',
      '   durchsucht Souls über mehrere fremde Nodes hinweg, ein lokales EU-Flag ist hier nicht',
      '   bekannt, daher wird das Zahlungsziel grundsätzlich nie an dieser Stelle genannt.',
      '3. pay_endpoint mit x402 bezahlen (eigener x402-Client nötig — kein Wrapper-Tool hier)',
      '',
      'NICHT-KRYPTO-WEG (PayPal) — für menschliche Nutzer ohne Krypto-Wallet:',
      'Souls mit amortization.paypal_enabled akzeptieren zusätzlich PayPal — Ziel/Preis auch',
      'hier erst über soul_preview auf der Ziel-Soul selbst abrufen.',
      '',
      ...(EU_CONSUMER_RIGHTS ? [
        'WICHTIG — BEVOR du zur Zahlung überleitest: Frage den Nutzer (falls unklar), ob',
        'er/sie in der EU ist. Bei EU-Nutzern IMMER zuerst show_withdrawal_terms',
        'aufrufen, dessen Link zeigen, dann bei Zustimmung accept_digital_content_terms —',
        'gesetzliches 14-tägiges Widerrufsrecht bei digitalen Leistungen, das durch',
        'sofortigen Zugang erlischt. Ohne diese Schritte NICHT direkt zur PayPal-Zahlung',
        'auffordern. Nicht-EU-Nutzer können diesen Schritt überspringen.',
        '',
      ] : []),
      'Danach: Der Mensch zahlt außerhalb des Systems per PayPal, der Betreiber prüft',
      'manuell (i.d.R. binnen 48h) und schickt dann einen fertigen access_token zurück —',
      'meist direkt in diesem Chat eingefügt, ohne dass hier selbst eine Zahlung ausgelöst wurde.',
      'Erkennbar an: 48 Hex-Zeichen, kein "0x"-Präfix.',
      'In diesem Fall NICHT nach einer Zahlung fragen — der Token ist bereits gültig.',
      'Direkt verwenden: soul_read_by_token(read_endpoint, access_token=<der Token>).',
      'read_endpoint = pay_endpoint der Soul mit /pay ersetzt durch /paid-read.',
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
            : 'No anchored souls found.' + (q ? ` (search: "${q}")` : '');
          return { content: [{ type: 'text', text: msg }] };
        }

        const lines = [];
        lines.push(`## Soul Directory — ${souls.length} entries${data.total > souls.length ? ` (of ${data.total})` : ''}`);
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
            if (s.amortization.dynamic_pricing) {
              lines.push(`- **Preis:** ab ${s.amortization.price_usdc} USDC (dynamisch — soul_preview für Live-Preis aufrufen!)`);
            } else {
              lines.push(`- **Preis:** ${s.amortization.price_usdc} USDC pro Anfrage`);
            }
            // Zahlungsziel (Wallet/PayPal) bewusst NICHT hier — siehe Tool-Beschreibung:
            // soul_discover sucht node-übergreifend, ein lokales EU-Widerrufsrecht-Flag der
            // Ziel-Soul ist hier nicht bekannt. Immer über soul_preview auf der Ziel-Soul selbst
            // abrufen, das läuft lokal auf deren Node und respektiert deren Flag korrekt.
            const aTools = s.amortization.agent_tools || s.amortization.free_tools;
            if (Array.isArray(aTools) && aTools.length) {
              lines.push(`- **Agent-Tools:** ${aTools.join(', ')}`);
            }
            if (s.pay_endpoint) lines.push(`- **Preview/Zahlung:** soul_preview(pay_endpoint="${s.pay_endpoint}", soul_id="${s.soul_id}") aufrufen — nennt Preis und Zahlungsziel`);
            if (s.amortization.paypal_enabled) {
              lines.push(`- **Nicht-Krypto-Zugang:** PayPal verfügbar — Ziel/Preis über soul_preview abrufen. Bitte in der Zahlungsnotiz eine E-Mail-Adresse für den Token-Versand angeben. Manuelle Prüfung durch den Betreiber, i.d.R. binnen 48h. Erhaltenen Token direkt mit soul_read_by_token(read_endpoint, access_token) nutzen, keine erneute Zahlung anfordern.`);
            }
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
        lines.push('_Zahlungs-Workflow: pay_endpoint mit dem x402-Protokoll bezahlen → access_token für MCP-Zugriff_');

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
