/**
 * vault_shared_get — Holt eine Datei aus vault_shared (eigene oder Peer).
 * Gibt Bild/PDF/Text als nativen Claude-AI-Content-Block zurück —
 * Claude AI kann Bilder sehen, PDFs lesen, Texte verarbeiten.
 */

import { z } from 'zod';
import { getJson } from '../lib/api.mjs';

// vault-shared://soul_id/filename → { soulId, filename }
function parseVaultUrl(url) {
  const m = url.match(/^vault-shared:\/\/([a-f0-9\-]{36})\/([A-Za-z0-9_\-\.]+)$/i);
  if (!m) return null;
  return { soulId: m[1], filename: m[2] };
}

const IMAGE_MIME  = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const DOC_MIME    = new Set(['application/pdf']);
const TEXT_MIME   = new Set(['text/plain', 'text/plain; charset=utf-8', 'text/markdown', 'text/csv', 'application/json']);
const AUDIO_MIME  = new Set(['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/flac']);

export function register(server, token) {
  server.tool(
    'vault_shared_get',
    [
      'Holt eine Datei aus vault_shared — eigene oder von einem verbundenen Peer.',
      'Bilder werden visuell angezeigt, PDFs und Texte direkt gelesen.',
      '',
      'Anwendungsfälle:',
      '- Peer-Nachricht enthält "[bild.jpg](vault-shared://...)" → hier abrufen und ansehen',
      '- PDF von Peer lesen und zusammenfassen',
      '- Eigene hochgeladene Datei überprüfen',
      '',
      'url-Format: vault-shared://soul_id/filename',
      'Alternativ soul_id + filename separat angeben.',
    ].join('\n'),
    {
      url: z.string().optional()
            .describe('vault-shared:// URL aus einer Peer-Nachricht, z.B. "vault-shared://abc.../bild.jpg"'),
      soul_id: z.string().optional()
                .describe('Soul-ID des Besitzers (alternativ zu url)'),
      filename: z.string().optional()
                 .describe('Dateiname (alternativ zu url)'),
    },
    async ({ url, soul_id, filename }) => {
      try {
        // URL oder soul_id+filename auflösen
        let resolved;
        if (url) {
          resolved = parseVaultUrl(url.trim());
          if (!resolved) {
            return { content: [{ type: 'text', text: `Ungültige vault-shared:// URL: "${url}"` }], isError: true };
          }
        } else if (soul_id && filename) {
          resolved = { soulId: soul_id.trim(), filename: filename.trim() };
        } else {
          return { content: [{ type: 'text', text: 'Bitte url oder (soul_id + filename) angeben.' }], isError: true };
        }

        const params = new URLSearchParams({ soul_id: resolved.soulId, filename: resolved.filename });
        const data = await getJson(`/api/vault/shared-mcp?${params}`, token);

        if (!data.ok) {
          return { content: [{ type: 'text', text: `Fehler: ${data.error || JSON.stringify(data)}` }], isError: true };
        }

        const mime     = (data.mime || 'application/octet-stream').split(';')[0].trim();
        const b64      = data.data_b64;
        const sizeInfo = `${data.filename} (${data.size_kb} KB)`;

        // ── Bild → visueller Content-Block ───────────────────────────────────
        if (IMAGE_MIME.has(mime)) {
          return {
            content: [
              { type: 'text', text: `Bild: ${sizeInfo}` },
              { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
            ],
          };
        }

        // ── PDF → Document-Block (Claude AI liest Inhalt) ─────────────────────
        if (DOC_MIME.has(mime)) {
          return {
            content: [
              { type: 'text', text: `PDF: ${sizeInfo}` },
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
            ],
          };
        }

        // ── Text/Markdown/JSON/CSV → direkt als Text ──────────────────────────
        if (TEXT_MIME.has(mime) || mime.startsWith('text/')) {
          const text = Buffer.from(b64, 'base64').toString('utf-8');
          return {
            content: [{
              type: 'text',
              text: `Datei: ${sizeInfo}\n\n${text}`,
            }],
          };
        }

        // ── Audio → Hinweis (Claude AI kann Audio nicht direkt wiedergeben) ───
        if (AUDIO_MIME.has(mime)) {
          return {
            content: [{
              type: 'text',
              text: `Audio-Datei: ${sizeInfo} (${mime})\nAudio kann in Claude AI nicht direkt abgespielt werden.\nDatei ist verfügbar unter: ${url || `vault-shared://${resolved.soulId}/${resolved.filename}`}`,
            }],
          };
        }

        // ── Sonstige Binärdateien ─────────────────────────────────────────────
        return {
          content: [{
            type: 'text',
            text: [
              `Datei: ${sizeInfo} (${mime})`,
              `Base64-Daten verfügbar (${b64.length} Zeichen).`,
              `Format wird von Claude AI nicht nativ angezeigt.`,
            ].join('\n'),
          }],
        };

      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
