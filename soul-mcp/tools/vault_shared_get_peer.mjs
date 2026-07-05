/**
 * vault_shared_get (Peer-Variante) — Liest eine vault_shared-Datei des Ziel-Souls
 * direkt vom Dateisystem und gibt den Inhalt zurück (kein REST-Umweg, kein
 * token-gated Browser-Link möglich, da Peer-Certs auf dem Ziel-Server nicht
 * gültig sind — Inhalt kommt daher immer direkt in der Tool-Antwort).
 */

import { z } from 'zod';
import { readFile } from 'fs/promises';
import { SOULS_DIR, getMime } from '../lib/vault_fs.mjs';

export function register(server, targetSoulId) {
  server.tool(
    'vault_shared_get',
    [
      'Liest eine Datei aus vault_shared des Ziel-Souls (Bild, Video, Audio, PDF, Text).',
      'Bilder werden als anzeigbares Bild zurückgegeben, PDFs/Text als Klartext,',
      'Audio/Video als base64 in der Antwort (kein Browser-Link möglich für Peers).',
    ].join('\n'),
    {
      filename: z.string().describe('Dateiname aus vault_shared_list, z.B. "1783261980_widerruf_ab12.pdf"'),
    },
    async ({ filename }) => {
      if (!/^[\w\-. ]+$/.test(filename)) {
        return { content: [{ type: 'text', text: 'Ungültiger Dateiname.' }], isError: true };
      }
      try {
        const path = `${SOULS_DIR}${targetSoulId}/vault_shared/${filename}`;
        const buf  = await readFile(path);
        const mime = getMime(filename);
        const ext  = filename.split('.').pop().toLowerCase();
        const sizeKb = Math.round(buf.length / 1024);

        if (ext === 'pdf') {
          return {
            content: [
              { type: 'text', text: `PDF: ${filename} (${sizeKb} KB)` },
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } },
            ],
          };
        }

        if (['md', 'txt', 'json', 'csv'].includes(ext)) {
          return { content: [{ type: 'text', text: `${filename} (${sizeKb} KB)\n\n${buf.toString('utf-8')}` }] };
        }

        if (['jpg','jpeg','png','webp','gif','avif'].includes(ext)) {
          return {
            content: [
              { type: 'image', data: buf.toString('base64'), mimeType: mime },
              { type: 'text', text: JSON.stringify({ filename, size_kb: sizeKb }) },
            ],
          };
        }

        // Audio/Video/sonstiges: base64 in JSON (kein MCP-Contenttyp für beliebige Medien)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              filename, mime, size_kb: sizeKb,
              base64: buf.toString('base64'),
              hint: 'Datei als base64. Zum Öffnen/Abspielen dekodieren.',
            }),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `vault_shared_get fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}
