/**
 * peer_inbox — Liest Nachrichten von verbundenen Peers.
 * vault-shared:// Links in Nachrichten werden automatisch in klickbare
 * Browser-URLs umgewandelt (Bilder, Videos, Dateien direkt öffnen).
 * PDFs und Texte werden zusätzlich als Inhalt zurückgegeben.
 */

import { z } from 'zod';
import { getJson, sharedFileUrl } from '../lib/api.mjs';

const VAULT_LINK_RE = /\[([^\]]*)\]\(vault-shared:\/\/([a-f0-9-]{36})\/([A-Za-z0-9_\-.]+)\)/gi;

const VIDEO_EXT = new Set(['mp4','webm','mov','avi','mkv','m4v']);
const AUDIO_EXT = new Set(['mp3','wav','ogg','m4a','flac','aac']);
const IMAGE_EXT = new Set(['jpg','jpeg','png','webp','gif','avif']);
const TEXT_EXT  = new Set(['md','txt','json','csv']);

function extLabel(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (VIDEO_EXT.has(ext)) return 'Video';
  if (AUDIO_EXT.has(ext)) return 'Audio';
  if (IMAGE_EXT.has(ext)) return 'Bild';
  if (ext === 'pdf')      return 'PDF';
  if (TEXT_EXT.has(ext))  return 'Text';
  return 'Datei';
}

// Ersetzt vault-shared:// Links im Nachrichtentext durch klickbare URLs.
// Gibt außerdem eine Liste der enthaltenen Dateien zurück.
function resolveLinks(content, token) {
  const attachments = [];
  const resolved = content.replace(VAULT_LINK_RE, (match, label, soulId, filename) => {
    const viewUrl = sharedFileUrl(soulId, filename, token);
    const type    = extLabel(filename);
    attachments.push({ label: label || filename, soulId, filename, viewUrl, type });
    return `[${label || filename} (${type})](${viewUrl})`;
  });
  return { resolved, attachments };
}

// Für PDFs + Texte: Inhalt direkt laden und als extra Block anhängen (max. 3)
async function fetchReadableContent(attachments, token) {
  const readable = attachments.filter(a => {
    const ext = a.filename.split('.').pop().toLowerCase();
    return ext === 'pdf' || TEXT_EXT.has(ext);
  }).slice(0, 3);

  if (readable.length === 0) return [];

  const results = await Promise.allSettled(readable.map(async a => {
    const params = new URLSearchParams({ soul_id: a.soulId, filename: a.filename });
    const data   = await getJson(`/api/vault/shared-mcp?${params}`, token);
    return { ...a, data };
  }));

  const blocks = [];
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value.data?.ok) continue;
    const { filename, data } = r.value;
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') {
      blocks.push({ type: 'text', text: `--- ${filename} ---` });
      blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data.data_b64 } });
    } else {
      const text = Buffer.from(data.data_b64, 'base64').toString('utf-8');
      blocks.push({ type: 'text', text: `--- ${filename} ---\n${text}` });
    }
  }
  return blocks;
}

export function register(server, token) {
  server.tool(
    'peer_inbox',
    [
      'Liest Nachrichten von verbundenen Peers.',
      'Dateien und Videos in Nachrichten → direkt klickbare URLs (Browser öffnet/spielt ab).',
      'PDFs und Texte werden zusätzlich als Inhalt zurückgegeben.',
      '',
      'Beispiele:',
      '- "Nachrichten der letzten 3 Tage" → days=3',
      '- "Was hat Till geschrieben?" → from="Till"',
      '- "Suche Nachrichten über das Projekt" → search="Projekt"',
      '',
      'Hinweis: Externe Peers maximal 48h verfügbar.',
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
      try {
        const data = await getJson(`/api/soul/peer-inbox?days=${days}`, token);
        if (!data.ok) {
          return { content: [{ type: 'text', text: `Fehler: ${JSON.stringify(data)}` }], isError: true };
        }

        const peerList = (data.peers || []).join(', ') || '(keine)';

        if (!data.messages?.length) {
          return { content: [{ type: 'text', text: `Keine Nachrichten der letzten ${days} Tag(e).\nPeers: ${peerList}` }] };
        }

        let msgs = data.messages;

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

        // ── vault-shared:// → klickbare URLs + Readable-Content sammeln ────────
        const allAttachments = [];
        const resolvedMsgs = msgs.map(m => {
          const { resolved, attachments } = resolveLinks(m.content || '', token);
          allAttachments.push(...attachments);
          return { ...m, content: resolved };
        });

        // PDFs und Texte direkt laden
        const readableBlocks = await fetchReadableContent(allAttachments, token).catch(() => []);

        // ── Output aufbauen ───────────────────────────────────────────────────
        const filterParts = [
          `letzte ${days} Tag(e)`,
          from   && `von "${from}"`,
          search && `Suche: "${search}"`,
        ].filter(Boolean).join(' · ');

        const contentBlocks = [
          { type: 'text', text: `${msgs.length} Nachricht(en) · ${filterParts}\nPeers: ${peerList}\n` },
        ];

        for (const m of resolvedMsgs) {
          const date = m.ts.replace('T', ' ').slice(0, 16) + ' UTC';
          const direction = m.outgoing
            ? `Du → ${ m.to === 'peer' ? 'alle' : m.to === 'community' ? 'Community' : m.to === 'agent' ? 'Agent' : m.to.slice(0, 8) }`
            : (m.from_label || m.peer);
          contentBlocks.push({ type: 'text', text: `[${date}] ${direction}\n${m.content}` });
        }

        // Lesbarer Inhalt (PDFs, Texte) ans Ende
        contentBlocks.push(...readableBlocks);

        return { content: contentBlocks };

      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
