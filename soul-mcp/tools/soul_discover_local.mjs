import { z } from 'zod';

const MCP_BASE = () => `http://127.0.0.1:${process.env.PORT || '3098'}`;

// EU withdrawal-rights consent flow — off by default, opt-in via init.sh
// ("Set up EU consumer rights?") / EU_CONSUMER_RIGHTS in soul-mcp/.env.
const EU_CONSUMER_RIGHTS = process.env.EU_CONSUMER_RIGHTS === 'true';

// Node-local counterpart to soul_discover.mjs — same query/render pattern, but
// scoped to souls hosted on THIS node only (local=true → /internal/discover-souls
// applies the same mcp_endpoint-prefix filter /llms.txt already uses). Kept as a
// separate tool/file rather than adding a flag to soul_discover so the existing
// tool (global, cross-node search, used inside authenticated sessions) stays
// completely untouched. This tool is the only one registered on the public,
// unauthenticated /mcp/discover endpoint — an agent with no credentials yet can
// browse what's hosted here before deciding whether to pay or use a soul_cert.
export function register(server) {
  server.tool(
    'soul_discover_local',
    [
      'Searches the souls hosted on THIS node (agency.uxprojects-jok.com) by topic,',
      'name, or tag — call this whenever an agent asks what souls/agents/identities',
      'are available here, or wants to find one by subject (e.g. "find a soul about',
      'cooking").',
      '',
      'SOURCE: this node only — not a cross-node/blockchain-wide search. Use the',
      'authenticated soul_discover tool (requires a token) for that.',
      '',
      'Search (q) searches: name, soul_id, tags, description.',
      '',
      'Parameters:',
      '- q:         Free-text search — name, soul_id, tags, description — optional',
      '- amortized: true = only souls accepting payment (x402/PayPal) — optional',
      '- limit:     Max. results (1–100, default 20) — optional',
      '',
      'ACCESS MODELS:',
      '- amortization.enabled = true  → x402/USDC payment possible (Polygon).',
      '  Workflow: pay pay_endpoint directly with the x402 protocol (402 challenge',
      '  -> signed EIP-3009 authorization as retry) — no SYS-specific payment tool',
      '  needed, x402 is a standard protocol any conformant client already knows.',
      '- amortization.enabled = false / missing → no public access. Owner or',
      '  trusted peers only (soul_cert).',
      '- Already holding a soul_cert for one of these souls? Connect directly to',
      '  its mcp_endpoint (?soul_id=<id>) with that cert as your Bearer token —',
      '  no payment step needed.',
      '',
      'Typical workflow for a paying agent (amortized=true souls only):',
      '1. soul_discover_local(amortized=true) → only payable souls',
      '2. soul_preview(pay_endpoint, soul_id) → free teaser + live price (dynamic_pricing)',
      '   ALWAYS call before paying — especially for dynamic_pricing=true souls.',
      '3. pay pay_endpoint with x402 (own x402 client needed — no wrapper tool here)',
      '',
      'NON-CRYPTO PATH (PayPal) — for human users without a crypto wallet:',
      'Souls with amortization.paypal_enabled also accept PayPal — target/price also',
      'via soul_preview on the target soul itself.',
      '',
      ...(EU_CONSUMER_RIGHTS ? [
        'IMPORTANT — BEFORE moving to payment: ask the user (if unclear) whether',
        'they are in the EU. For EU users ALWAYS call show_withdrawal_terms first,',
        'show its link, then on consent accept_digital_content_terms — statutory',
        '14-day withdrawal right for digital content, forfeited by immediate access.',
        'Without these steps do NOT prompt for PayPal payment directly. Non-EU users',
        'can skip this step.',
        '',
      ] : []),
      'After that: the human pays outside the system via PayPal, the operator',
      'reviews manually (usually within 48h) and then sends back a finished',
      'access_token — typically pasted directly into this chat, without any payment',
      'having been triggered here. Recognizable by: 48 hex characters, no "0x" prefix.',
      'In that case do NOT ask for a payment — the token is already valid.',
      'Use directly: soul_read_by_token(read_endpoint, access_token=<the token>).',
      'read_endpoint = the soul\'s pay_endpoint with /pay replaced by /paid-read.',
    ].join('\n'),
    {
      q:         z.string().optional().describe('Free-text search (soul_id or name)'),
      amortized: z.boolean().optional().describe('Only payable souls'),
      limit:     z.number().min(1).max(100).optional().describe('Max results'),
    },
    async ({ q, amortized, limit }) => {
      try {
        const params = new URLSearchParams();
        params.set('local', 'true');
        if (q)         params.set('q', q);
        if (amortized) params.set('amortized', 'true');
        if (limit)     params.set('limit', String(limit));

        const url = `${MCP_BASE()}/internal/discover-souls?${params.toString()}`;

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
          let msg = 'No souls hosted on this node yet.' + (q ? ` (search: "${q}")` : '');
          return { content: [{ type: 'text', text: msg }] };
        }

        const lines = [];
        lines.push(`## Souls on this node — ${souls.length} entries${data.total > souls.length ? ` (of ${data.total})` : ''}`);
        if (q) lines.push(`_Search: "${q}"_`);
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
              lines.push(`- **Price:** from ${s.amortization.price_usdc} USDC (dynamic — call soul_preview for the live price!)`);
            } else {
              lines.push(`- **Price:** ${s.amortization.price_usdc} USDC per request`);
            }
            const aTools = s.amortization.agent_tools || s.amortization.free_tools;
            if (Array.isArray(aTools) && aTools.length) {
              lines.push(`- **Agent tools:** ${aTools.join(', ')}`);
            }
            if (s.pay_endpoint) lines.push(`- **Preview/payment:** call soul_preview(pay_endpoint="${s.pay_endpoint}", soul_id="${s.soul_id}") — reports price and payment target`);
            if (s.amortization.paypal_enabled) {
              lines.push(`- **Non-crypto access:** PayPal available — target/price via soul_preview. Include an email address in the payment note for token delivery. Manually reviewed by the operator, usually within 48h. Use a received token directly with soul_read_by_token(read_endpoint, access_token), don't request another payment.`);
            }
          } else {
            lines.push(`- **Access:** no public access (no payment endpoint configured) — owner or trusted-peer soul_cert only`);
          }

          if (s.verify_endpoint) lines.push(`- **Verification:** ${s.verify_endpoint}`);

          const sessions = s.sessions ?? 0;
          lines.push(`- **Sessions:** ${sessions} (growth chain — cryptographically signed)`);
          if (s.chain_verified) lines.push(`- **Chain:** verified ✓`);
          lines.push('');
        }

        lines.push('---');
        lines.push('_Already have a soul_cert for one of these? Connect directly to its mcp_endpoint with that cert as your Bearer token — no payment needed._');
        lines.push('_Otherwise: pay pay_endpoint with the x402 protocol → access_token for MCP access._');

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Discovery failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
