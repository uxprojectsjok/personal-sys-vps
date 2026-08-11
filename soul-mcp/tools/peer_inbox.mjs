/**
 * peer_inbox — Liest Textnachrichten von verbundenen Peers. Bewusst text-only
 * (siehe peer_send.mjs) — keine Anhang-Auflösung/Bild-Rendering mehr.
 *
 * Zwei Quellen: die eigene sys.md (eigene gesendete Nachrichten) UND jeder
 * Gatekeeper, bei dem diese Soul gewired ist — dessen Geschwister-Spokes
 * werden über den Gatekeeper-Relay abgefragt (server.mjs POST /mcp/discover/
 * gatekeeper/peer-inbox-relay, das intern auch föderierte Partner mit
 * einschließt), da eine Spoke die Tokens ihrer Geschwister nie direkt
 * bekommt — siehe lib/gatekeeper_peers.mjs. Die alte connected_souls.json-
 * 1:1-Connections-Quelle ist entfernt (Erstellungs-Pfad war ohnehin tot).
 */

import { z } from 'zod';
import { getText } from '../lib/api.mjs';
import { parseSocialMessages } from '../lib/peer_messages.mjs';
import { fetchGatekeeperInboxMessages } from '../lib/gatekeeper_peers.mjs';

const DAY_MS = 86400000;

// Sammelt Nachrichten aus der eigenen sys.md (eigene gesendete) UND aus
// jedem Gatekeeper-Netzwerk, in dem diese Soul gewired ist. Eine nicht
// erreichbare/kaputte Quelle darf die andere nie blockieren.
async function collectMessages(soulId, token) {
  const results = [];

  try {
    const ownMd = await getText('/api/soul', token);
    for (const m of parseSocialMessages(ownMd)) {
      if (m.from === 'me') {
        results.push({ ...m, outgoing: true, peer: null, from_label: null, soulId });
      }
    }
  } catch { /* eigenes sys.md nicht lesbar — ignorieren */ }

  try {
    const gkMsgs = await fetchGatekeeperInboxMessages(soulId, token);
    for (const m of gkMsgs) {
      results.push({
        ts: m.ts, from: m.from, to: m.to, content: m.content,
        outgoing: false, peer: m.from_label, from_label: m.from_label, soulId: m.from_soul_id,
      });
    }
  } catch { /* kein Gatekeeper-Netzwerk erreichbar */ }

  results.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return results;
}

export function register(server, token, soulId = null) {
  server.tool(
    'peer_inbox',
    [
      'Liest Textnachrichten von verbundenen Peers.',
      '',
      'Beispiele:',
      '- "Nachrichten der letzten 3 Tage" → days=3',
      '- "Was hat Till geschrieben?" → from="Till"',
      '- "Suche Nachrichten über das Projekt" → search="Projekt"',
    ].join('\n'),
    {
      days:   z.number().int().min(1).max(30).default(1).optional()
               .describe('Nachrichten der letzten N Tage (default 1, max 30)'),
      from:   z.string().max(100).optional()
               .describe('Nur Nachrichten von diesem Peer'),
      search: z.string().max(200).optional()
               .describe('Volltextsuche im Nachrichteninhalt'),
      limit:  z.number().int().min(1).max(100).default(50).optional()
               .describe('Maximale Anzahl Nachrichten (default 50)'),
    },
    async ({ days = 1, from, search, limit = 50 }) => {
      if (!soulId) {
        return { content: [{ type: 'text', text: 'peer_inbox nicht verfügbar (kein soulId).' }], isError: true };
      }
      try {
        const allMsgs = await collectMessages(soulId, token);

        const cutoff = Date.now() - days * DAY_MS;
        let msgs = allMsgs.filter(m => new Date(m.ts).getTime() >= cutoff);

        const peerList = [...new Set(allMsgs.map(m => m.peer).filter(Boolean))].join(', ') || '(keine)';

        if (!msgs.length) {
          return { content: [{ type: 'text', text: `Keine Nachrichten der letzten ${days} Tag(e).\nPeers: ${peerList}` }] };
        }

        if (from) {
          const q = from.toLowerCase();
          msgs = msgs.filter(m => m.peer?.toLowerCase().includes(q) || m.from_label?.toLowerCase().includes(q));
        }
        if (search) {
          const q = search.toLowerCase();
          msgs = msgs.filter(m => m.content?.toLowerCase().includes(q));
        }
        if (msgs.length > limit) msgs = msgs.slice(-limit);

        if (msgs.length === 0) {
          const desc = [from && `von "${from}"`, search && `mit "${search}"`].filter(Boolean).join(' ');
          return { content: [{ type: 'text', text: `Keine Nachrichten ${desc} (letzte ${days} Tage).\nPeers: ${peerList}` }] };
        }

        const filterParts = [
          `letzte ${days} Tag(e)`,
          from   && `von "${from}"`,
          search && `Suche: "${search}"`,
        ].filter(Boolean).join(' · ');

        const lines = [`${msgs.length} Nachricht(en) · ${filterParts}`, `Peers: ${peerList}`, ''];
        for (const m of msgs) {
          const rawTs = m.ts ?? ''
          const date = rawTs ? rawTs.replace('T', ' ').slice(0, 16) + ' UTC' : '???'
          const direction = m.outgoing
            ? `Du → ${ m.to === 'peer' ? 'alle' : m.to === 'community' ? 'Community' : m.to === 'agent' ? 'Agent' : (m.to ?? '').slice(0, 8) }`
            : (m.from_label || m.peer || '?')
          lines.push(`[${date}] ${direction}`, m.content ?? '', '')
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };

      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
