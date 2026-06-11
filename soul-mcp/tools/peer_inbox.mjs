/**
 * peer_inbox — Liest Nachrichten von verbundenen Peers.
 * Ruft GET /api/soul/peer-inbox ab und filtert lokal nach Zeit, Absender, Inhalt.
 * Cross-Domain-Peers sind auf 48h begrenzt (API-Limitation der Gegenseite).
 */

import { z } from 'zod';
import { getJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'peer_inbox',
    [
      'Liest Nachrichten von verbundenen Peers (wie WhatsApp-Posteingang).',
      '',
      'Beispiele:',
      '- "Zeige Nachrichten der letzten 3 Tage" → days=3',
      '- "Was hat Till geschrieben?" → from="Till"',
      '- "Suche Nachrichten über SYS" → search="SYS"',
      '- "Nachrichten von Till über das Projekt" → from="Till" + search="Projekt"',
      '',
      'Hinweis: Bei externen Peers (anderer Server) maximal 48h verfügbar.',
    ].join('\n'),
    {
      days:   z.number().int().min(1).max(30).default(1).optional()
               .describe('Nachrichten der letzten N Tage (default 1, max 30)'),
      from:   z.string().max(100).optional()
               .describe('Nur Nachrichten von diesem Peer (Name oder Teil davon)'),
      search: z.string().max(200).optional()
               .describe('Volltextsuche im Nachrichteninhalt (Groß-/Kleinschreibung egal)'),
      limit:  z.number().int().min(1).max(100).default(50).optional()
               .describe('Maximale Anzahl Nachrichten (default 50, neueste zuerst wenn gekürzt)'),
    },
    async ({ days = 1, from, search, limit = 50 }) => {
      try {
        const data = await getJson(`/api/soul/peer-inbox?days=${days}`, token);

        if (!data.ok) {
          return { content: [{ type: 'text', text: `Fehler vom Server: ${JSON.stringify(data)}` }], isError: true };
        }

        const peerList = (data.peers || []).join(', ') || '(keine)';

        if (!data.messages || data.messages.length === 0) {
          return {
            content: [{ type: 'text', text: `Keine Nachrichten der letzten ${days} Tag(e).\nVerbundene Peers: ${peerList}` }],
          };
        }

        let msgs = data.messages;

        // Filter: Absender
        if (from) {
          const q = from.toLowerCase();
          msgs = msgs.filter(m =>
            m.peer?.toLowerCase().includes(q) ||
            m.from_label?.toLowerCase().includes(q) ||
            m.from_id?.toLowerCase().includes(q)
          );
        }

        // Filter: Volltextsuche
        if (search) {
          const q = search.toLowerCase();
          msgs = msgs.filter(m => m.content?.toLowerCase().includes(q));
        }

        // Limit: die neuesten behalten
        if (msgs.length > limit) msgs = msgs.slice(-limit);

        if (msgs.length === 0) {
          const filterDesc = [
            from   && `von "${from}"`,
            search && `mit "${search}"`,
          ].filter(Boolean).join(' ');
          return {
            content: [{ type: 'text', text: `Keine Nachrichten ${filterDesc} in den letzten ${days} Tag(en).\nVerbundene Peers: ${peerList}` }],
          };
        }

        // Ausgabe formatieren
        const lines = msgs.map(m => {
          const date = m.ts.replace('T', ' ').slice(0, 16) + ' UTC';
          let direction;
          if (m.outgoing) {
            const toLabel = m.to === 'peer'       ? 'alle Peers'
                          : m.to === 'community'  ? 'Community'
                          : m.to === 'agent'      ? 'Agent'
                          : `→ ${m.to.slice(0, 8)}`;
            direction = `Du ${toLabel}`;
          } else {
            direction = m.from_label || m.peer;
          }
          return `[${date}] ${direction}\n${m.content}`;
        });

        const filterParts = [
          `letzte ${days} Tag(e)`,
          from   && `von "${from}"`,
          search && `Suche: "${search}"`,
        ].filter(Boolean).join(' · ');

        const header = `${msgs.length} Nachricht(en) · ${filterParts}\nPeers: ${peerList}\n\n`;

        return { content: [{ type: 'text', text: header + lines.join('\n\n') }] };

      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
