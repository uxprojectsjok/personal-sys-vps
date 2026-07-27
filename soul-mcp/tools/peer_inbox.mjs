/**
 * peer_inbox — Liest Nachrichten von verbundenen Peers.
 * vault-shared:// Links in Nachrichten werden automatisch in klickbare
 * Browser-URLs umgewandelt (Bilder, Videos, Dateien direkt öffnen).
 * PDFs und Texte werden zusätzlich als Inhalt zurückgegeben.
 * Bilder werden als image-Blöcke an Claude übergeben (Vision).
 *
 * Datenquelle: connected_souls.json (direkte Soul-zu-Soul-Verbindungen,
 * siehe project_sys_v2_vision Memory) statt der alten soul_peer_inbox.lua
 * (System 2) — für jede "accepted"-Verbindung wird deren sys.md per
 * fetchApi() (node_url-bewusst, funktioniert cross-node) gelesen und der
 * SOCIAL-Block geparst, exakt dasselbe Nachrichtenformat wie bisher
 * (<!-- @msg ts from to text -->). Kein neuer Server-Endpoint nötig.
 */

import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { getText, sharedFileUrl } from '../lib/api.mjs';
import { loadConnected } from '../lib/connected_souls.mjs';
import { fetchApi } from './gatekeeper_proxy.mjs';

const execFileAsync = promisify(execFile);

const SOCIAL_START = '<!-- SOCIAL:START -->';
const SOCIAL_END   = '<!-- SOCIAL:END -->';
const MSG_RE_G      = () => /<!--\s*@msg\s+(\S+)\s+(\S+)\s+(\S+)\s+([\s\S]*?)-->/g;
const DAY_MS         = 86400000;

function parseSocialMessages(md) {
  const si = md.indexOf(SOCIAL_START);
  const ei = md.indexOf(SOCIAL_END);
  if (si === -1 || ei === -1 || ei <= si) return [];
  const block = md.slice(si + SOCIAL_START.length, ei);
  const msgs = [];
  const re = MSG_RE_G();
  let m;
  while ((m = re.exec(block)) !== null) {
    msgs.push({ ts: m[1], from: m[2], to: m[3], content: m[4].trim() });
  }
  return msgs;
}

// Sammelt Nachrichten aus der eigenen sys.md (eigene gesendete) UND aus jeder
// "accepted" verbundenen Soul (an mich oder an "alle" adressiert). Eine nicht
// erreichbare/kaputte Verbindung darf die anderen nie blockieren.
async function collectMessages(soulId, token, connectedMap) {
  const results = [];

  try {
    const ownMd = await getText('/api/soul', token);
    for (const m of parseSocialMessages(ownMd)) {
      if (m.from === 'me') {
        results.push({ ...m, outgoing: true, peer: null, from_label: null, soulId });
      }
    }
  } catch { /* eigenes sys.md nicht lesbar — ignorieren */ }

  await Promise.all(Object.entries(connectedMap).map(async ([remoteId, entry]) => {
    if (entry.status !== 'accepted' || !entry.permissions?.soul) return;
    try {
      const res = await fetchApi('/api/soul', entry.outbound_token, entry.node_url);
      const md  = await res.text();
      const label = entry.alias || remoteId.slice(0, 8);
      for (const m of parseSocialMessages(md)) {
        if (m.to === 'peer' || m.to === soulId) {
          results.push({ ...m, outgoing: false, peer: label, from_label: label, soulId: remoteId });
        }
      }
    } catch { /* Soul nicht erreichbar — andere Verbindungen trotzdem auswerten */ }
  }));

  results.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return results;
}

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

// Ersetzt vault-shared:// Links im Nachrichtentext durch klickbare URLs (best
// effort — die Browser-View-Route ist nicht Teil dieser Umstellung, siehe
// project_sys_v2_vision Memory). Gibt zusätzlich die Anhangsliste zurück.
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

// Holt eine vault_shared-Datei einer Anhang-Referenz — eigene Datei via lokalem
// token, fremde Datei über den in connectedMap hinterlegten node_url/Token
// (dieselbe Route, die wired_shared_get nutzt: GET /api/vault/shared/{id}/{file}).
// vault_shared_serve.lua akzeptiert seit dem Stage-A-Fix zwei Bearer-Formen:
// Self-Cert ({soul_id}.{cert}, wird cross-node beim Peer verifiziert) ODER
// ein Service-Token, der in der authorized_services.json der Ziel-Soul steht
// — bei einer Self-Cert-Session schicken wir weiterhin den eigenen Cert,
// sonst den beim Connect ausgetauschten outbound_token (den die Ziel-Soul
// selbst für uns hinterlegt hat).
async function fetchAttachmentBytes(soulId, filename, ownSoulId, token, connectedMap) {
  const path = `/api/vault/shared/${soulId}/${encodeURIComponent(filename)}`;
  if (soulId === ownSoulId) {
    const res = await fetchApi(path, token, null);
    return Buffer.from(await res.arrayBuffer());
  }
  const entry = connectedMap[soulId];
  if (!entry || entry.status !== 'accepted') throw new Error('nicht verbunden');
  const bearer = token.includes('.') ? token : entry.outbound_token;
  const res = await fetchApi(path, bearer, entry.node_url);
  return Buffer.from(await res.arrayBuffer());
}

// PDF-Text via pdftotext extrahieren (temp-Datei, dann aufräumen)
async function pdfToText(buf) {
  const tmp = join(tmpdir(), `mcp_pdf_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  try {
    writeFileSync(tmp, buf);
    const { stdout } = await execFileAsync('pdftotext', [tmp, '-'], { maxBuffer: 4 * 1024 * 1024, timeout: 15000 });
    return stdout.trim();
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

// Für PDFs + Texte: Inhalt direkt laden und als text-Block anhängen (max. 3)
async function fetchReadableContent(attachments, ownSoulId, token, connectedMap) {
  const MAX_PDF_BYTES = 7_500_000;

  const readable = attachments.filter(a => {
    const ext = a.filename.split('.').pop().toLowerCase();
    return ext === 'pdf' || TEXT_EXT.has(ext);
  }).slice(0, 3);

  if (readable.length === 0) return [];

  const results = await Promise.allSettled(readable.map(async a => {
    const buf = await fetchAttachmentBytes(a.soulId, a.filename, ownSoulId, token, connectedMap);
    return { ...a, buf };
  }));

  const blocks = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { filename, buf } = r.value;
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') {
      if (buf.length > MAX_PDF_BYTES) {
        blocks.push({ type: 'text', text: `--- ${filename} (PDF zu groß für Textextraktion, ${Math.ceil(buf.length / 1024)} KB) ---` });
      } else {
        try {
          const text = await pdfToText(buf);
          blocks.push({ type: 'text', text: `--- ${filename} ---\n${text || '(kein Textinhalt)'}` });
        } catch {
          blocks.push({ type: 'text', text: `--- ${filename} (PDF-Textextraktion fehlgeschlagen) ---` });
        }
      }
    } else {
      blocks.push({ type: 'text', text: `--- ${filename} ---\n${buf.toString('utf-8')}` });
    }
  }
  return blocks;
}

const MIME_MAP = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
// Claude-API unterstützt jpeg/png/gif/webp als image-Blöcke — avif nicht
const CLAUDE_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// Für Bilder: als image-Blöcke laden damit Claude sie sehen kann (max. 3, max. 4 MB/Bild)
async function fetchImageBlocks(attachments, ownSoulId, token, connectedMap) {
  const MAX_IMAGES = 3;
  const MAX_BYTES  = 4_000_000;

  const images = attachments
    .filter(a => IMAGE_EXT.has(a.filename.split('.').pop().toLowerCase()))
    .slice(0, MAX_IMAGES);

  if (images.length === 0) return [];

  const results = await Promise.allSettled(images.map(async a => {
    const buf = await fetchAttachmentBytes(a.soulId, a.filename, ownSoulId, token, connectedMap);
    return { ...a, buf };
  }));

  const blocks = [];
  let skipped = 0;
  for (const r of results) {
    if (r.status !== 'fulfilled') { skipped++; continue; }
    const { label, filename, buf } = r.value;
    const ext  = filename.split('.').pop().toLowerCase();
    const mime = MIME_MAP[ext] || 'image/jpeg';
    if (!CLAUDE_IMAGE_MIME.has(mime)) { skipped++; continue; }
    if (buf.length > MAX_BYTES) { skipped++; continue; }

    blocks.push({ type: 'text', text: `Bild von Peer: ${label || filename}` });
    // MCP-SDK erwartet ein flaches ImageContent-Objekt (data/mimeType), nicht
    // die verschachtelte Anthropic-API-Form ({source:{type,media_type,data}})
    // — die alte Version hier hatte genau diesen Formfehler, nie live getestet.
    blocks.push({ type: 'image', data: buf.toString('base64'), mimeType: mime });
  }
  if (skipped > 0) {
    blocks.push({ type: 'text', text: `(${skipped} Bild(er) übersprungen: Format nicht unterstützt, zu groß, oder nicht abrufbar)` });
  }
  return blocks;
}

export function register(server, token, soulId = null) {
  server.tool(
    'peer_inbox',
    [
      'Liest Nachrichten von verbundenen Peers.',
      'Dateien und Videos in Nachrichten → direkt klickbare URLs (Browser öffnet/spielt ab).',
      'Bilder werden als image-Block übergeben — Claude kann sie direkt sehen und analysieren (max. 3, jpeg/png/gif/webp).',
      'PDFs und Texte werden zusätzlich als Inhalt zurückgegeben.',
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
        const connectedMap = await loadConnected(soulId);
        const allMsgs = await collectMessages(soulId, token, connectedMap);

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

        // ── vault-shared:// → klickbare URLs + Readable-Content sammeln ────────
        const allAttachments = [];
        const resolvedMsgs = msgs.map(m => {
          const { resolved, attachments } = resolveLinks(m.content || '', token);
          allAttachments.push(...attachments);
          return { ...m, content: resolved };
        });

        // PDFs/Texte + Bilder parallel laden
        const [readableBlocks, imageBlocks] = await Promise.all([
          fetchReadableContent(allAttachments, soulId, token, connectedMap).catch(() => []),
          fetchImageBlocks(allAttachments, soulId, token, connectedMap).catch(() => []),
        ]);

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
          const rawTs = m.ts ?? ''
          const date = rawTs ? rawTs.replace('T', ' ').slice(0, 16) + ' UTC' : '???'
          const direction = m.outgoing
            ? `Du → ${ m.to === 'peer' ? 'alle' : m.to === 'community' ? 'Community' : m.to === 'agent' ? 'Agent' : (m.to ?? '').slice(0, 8) }`
            : (m.from_label || m.peer || '?')
          contentBlocks.push({ type: 'text', text: `[${date}] ${direction}\n${m.content ?? ''}` })
        }

        // Bilder zuerst (Vision) — dann PDFs/Texte
        contentBlocks.push(...imageBlocks);
        contentBlocks.push(...readableBlocks);

        // Ungültige Blöcke filtern (undefined/null Felder würden den Response sprengen)
        const validBlocks = contentBlocks.filter(b => {
          if (!b || typeof b.type !== 'string') return false
          if (b.type === 'text') return typeof b.text === 'string'
          if (b.type === 'image') return typeof b.data === 'string' && b.data.length > 0
          return true
        })

        return { content: validBlocks.length > 0 ? validBlocks : [{ type: 'text', text: 'Nachrichten geladen (keine darstellbaren Blöcke).' }] };

      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
