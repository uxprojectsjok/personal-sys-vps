/**
 * peer_inbox — Liest Nachrichten von verbundenen Peers.
 * Ruft GET /api/soul/peer-inbox ab, filtert lokal nach Zeit/Absender/Inhalt.
 * vault-shared:// Links in Nachrichten werden automatisch aufgelöst:
 *   Bilder → image-Block (visuell sichtbar)
 *   PDFs   → document-Block (lesbar)
 *   Text   → text-Block
 */

import { z } from 'zod';
import { getJson } from '../lib/api.mjs';

// vault-shared://soul_id/filename aus Markdown-Links extrahieren
const VAULT_LINK_RE = /\[([^\]]*)\]\(vault-shared:\/\/([a-f0-9-]{36})\/([A-Za-z0-9_\-.]+)\)/gi;

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const DOC_MIME   = new Set(['application/pdf']);

function mimeToBlock(data) {
  const mime = (data.mime || '').split(';')[0].trim();
  if (IMAGE_MIME.has(mime)) {
    return { type: 'image', source: { type: 'base64', media_type: mime, data: data.data_b64 } };
  }
  if (DOC_MIME.has(mime)) {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data.data_b64 } };
  }
  if (mime.startsWith('text/') || mime === 'application/json') {
    const text = Buffer.from(data.data_b64, 'base64').toString('utf-8');
    return { type: 'text', text: `📄 ${data.filename}\n${text}` };
  }
  return null; // Binär — kein nativer Block möglich
}

// Löst alle vault-shared:// Links in einem Nachrichtentext auf (max. MAX_FILES gesamt).
async function resolveAttachments(msgs, token, maxFiles) {
  // Erst alle Links sammeln (dedup über URL)
  const seen   = new Set();
  const jobs   = []; // { msgIdx, url, soulId, filename, label }

  for (let i = 0; i < msgs.length && jobs.length < maxFiles; i++) {
    const content = msgs[i].content || '';
    for (const m of content.matchAll(VAULT_LINK_RE)) {
      if (jobs.length >= maxFiles) break;
      const key = `${m[2]}/${m[3]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push({ msgIdx: i, label: m[1], soulId: m[2], filename: m[3] });
    }
  }

  if (jobs.length === 0) return null; // nichts aufzulösen

  // Parallel fetchen
  const results = await Promise.allSettled(jobs.map(async j => {
    const params = new URLSearchParams({ soul_id: j.soulId, filename: j.filename });
    const data   = await getJson(`/api/vault/shared-mcp?${params}`, token);
    return { ...j, data };
  }));

  // Map: url-key → content block
  const blocks = new Map();
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.data?.ok) {
      const block = mimeToBlock(r.value.data);
      if (block) blocks.set(`${r.value.soulId}/${r.value.filename}`, { block, label: r.value.label, filename: r.value.data.filename, sizeKb: r.value.data.size_kb });
    }
  }

  return blocks;
}

export function register(server, token) {
  server.tool(
    'peer_inbox',
    [
      'Liest Nachrichten von verbundenen Peers (wie WhatsApp-Posteingang).',
      'Bilder und Dateien in Nachrichten werden automatisch geladen und angezeigt.',
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
          const filterDesc = [from && `von "${from}"`, search && `mit "${search}"`].filter(Boolean).join(' ');
          return {
            content: [{ type: 'text', text: `Keine Nachrichten ${filterDesc} in den letzten ${days} Tag(en).\nVerbundene Peers: ${peerList}` }],
          };
        }

        // ── vault-shared:// Links parallel auflösen (max. 6 Dateien) ──────────
        const attachmentBlocks = await resolveAttachments(msgs, token, 6).catch(() => null);

        // ── Content-Blocks zusammenstellen ────────────────────────────────────
        const filterParts = [
          `letzte ${days} Tag(e)`,
          from   && `von "${from}"`,
          search && `Suche: "${search}"`,
        ].filter(Boolean).join(' · ');

        const contentBlocks = [
          { type: 'text', text: `${msgs.length} Nachricht(en) · ${filterParts}\nPeers: ${peerList}\n` },
        ];

        const seenAttachments = new Set();

        for (const m of msgs) {
          const date = m.ts.replace('T', ' ').slice(0, 16) + ' UTC';
          let direction;
          if (m.outgoing) {
            const toLabel = m.to === 'peer'      ? 'alle Peers'
                          : m.to === 'community' ? 'Community'
                          : m.to === 'agent'     ? 'Agent'
                          : `→ ${m.to.slice(0, 8)}`;
            direction = `Du → ${toLabel}`;
          } else {
            direction = m.from_label || m.peer;
          }

          contentBlocks.push({ type: 'text', text: `[${date}] ${direction}\n${m.content}` });

          // Inline-Attachments dieser Nachricht hinzufügen
          if (attachmentBlocks) {
            for (const match of (m.content || '').matchAll(VAULT_LINK_RE)) {
              const key = `${match[2]}/${match[3]}`;
              if (seenAttachments.has(key)) continue;
              const entry = attachmentBlocks.get(key);
              if (entry) {
                seenAttachments.add(key);
                contentBlocks.push(entry.block);
              }
            }
          }
        }

        return { content: contentBlocks };

      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
