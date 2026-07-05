/**
 * vault_shared_get — Gibt eine direkt klickbare URL für eine vault_shared Datei zurück.
 * Für Text/PDFs optional auch Inhalt lesbar.
 * Bilder, Videos, Audio → Browser-URL zum Öffnen/Abspielen.
 * PDFs, Text           → Inhalt direkt lesbar (+ URL).
 */

import { z } from 'zod';
import { getJson, sharedFileUrl } from '../lib/api.mjs';

// vault-shared://soul_id/filename → { soulId, filename }
function parseVaultUrl(url) {
  const m = url.match(/^vault-shared:\/\/([a-f0-9\-]{36})\/([A-Za-z0-9_\-\.]+)$/i);
  if (!m) return null;
  return { soulId: m[1], filename: m[2] };
}

const TEXT_MIME = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];

export function register(server, token) {
  server.tool(
    'vault_shared_get',
    [
      'Gibt eine klickbare URL für eine vault_shared Datei zurück (Bild, Video, PDF, Dokument).',
      'Für Texte/PDFs wird zusätzlich der Inhalt direkt zurückgegeben.',
      '',
      'Anwendungsfälle:',
      '- Peer-Nachricht mit "[bild.jpg](vault-shared://...)" → URL zum Öffnen im Browser',
      '- Video von Peer → URL zum Abspielen',
      '- PDF lesen + Inhalt zusammenfassen',
      '',
      'url-Format: vault-shared://soul_id/filename',
    ].join('\n'),
    {
      url: z.string().optional()
            .describe('vault-shared:// URL aus einer Peer-Nachricht'),
      soul_id:  z.string().optional().describe('Soul-ID des Besitzers (alternativ zu url)'),
      filename: z.string().optional().describe('Dateiname (alternativ zu url)'),
    },
    async ({ url, soul_id, filename }) => {
      try {
        let resolved;
        if (url) {
          resolved = parseVaultUrl(url.trim());
          if (!resolved) return { content: [{ type: 'text', text: `Ungültige vault-shared:// URL: "${url}"` }], isError: true };
        } else if (soul_id && filename) {
          resolved = { soulId: soul_id.trim(), filename: filename.trim() };
        } else {
          return { content: [{ type: 'text', text: 'Bitte url oder soul_id + filename angeben.' }], isError: true };
        }

        const viewUrl  = sharedFileUrl(resolved.soulId, resolved.filename, token);
        const ext      = resolved.filename.split('.').pop().toLowerCase();
        const isVideo  = ['mp4','webm','mov','avi','mkv','m4v'].includes(ext);
        const isAudio  = ['mp3','wav','ogg','m4a','flac','aac'].includes(ext);
        const isImage  = ['jpg','jpeg','png','webp','gif','avif'].includes(ext);
        const isPdf    = ext === 'pdf';
        const isText   = ['md','txt','json','csv'].includes(ext);

        // Für Text + PDF: Inhalt direkt lesen
        if (isPdf || isText) {
          try {
            const params = new URLSearchParams({ soul_id: resolved.soulId, filename: resolved.filename });
            const data   = await getJson(`/api/vault/shared-mcp?${params}`, token);
            if (data.ok) {
              const mime = (data.mime || '').split(';')[0].trim();
              if (isPdf) {
                return {
                  content: [
                    { type: 'text', text: `PDF: ${resolved.filename} (${data.size_kb} KB)\nURL: ${viewUrl}` },
                    { type: 'resource', resource: { uri: viewUrl, mimeType: 'application/pdf', blob: data.data_b64 } },
                  ],
                };
              }
              if (TEXT_MIME.some(m => mime.startsWith(m)) || mime.startsWith('text/')) {
                const text = Buffer.from(data.data_b64, 'base64').toString('utf-8');
                return { content: [{ type: 'text', text: `${resolved.filename} (${data.size_kb} KB)\nURL: ${viewUrl}\n\n${text}` }] };
              }
            }
          } catch { /* Fallback auf URL */ }
        }

        // Für Bilder, Videos, Audio, sonstiges → URL zurückgeben
        const typeLabel = isVideo ? 'Video'
                        : isAudio ? 'Audio'
                        : isImage ? 'Bild'
                        : 'Datei';

        const hint = isVideo ? 'Im Browser abspielen (Range-Seeking unterstützt)'
                   : isAudio ? 'Im Browser abspielen'
                   : isImage ? 'Im Browser öffnen'
                   : 'Herunterladen oder öffnen';

        return {
          content: [{
            type: 'text',
            text: `${typeLabel}: ${resolved.filename}\n${hint}\nURL: ${viewUrl}`,
          }],
        };

      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
