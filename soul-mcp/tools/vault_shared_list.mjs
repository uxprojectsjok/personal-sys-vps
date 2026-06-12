/**
 * vault_shared_list — Listet Dateien in vault_shared auf (neueste zuerst).
 * Brücke für den KI-Messenger-Workflow:
 *   1. Claude AI → gibt SYS Chat Link
 *   2. User schickt Datei im SYS Chat → vault_shared (Timestamp im Dateinamen)
 *   3. User: "ok erledigt"
 *   4. Claude → vault_shared_list → findet neuestes File → bestätigt mit User
 *   5. Claude → peer_send mit vault_filename
 */

import { z } from 'zod';
import { getJson } from '../lib/api.mjs';

const IMAGE_EXT = new Set(['jpg','jpeg','png','webp','gif','avif']);
const VIDEO_EXT = new Set(['mp4','webm','mov']);
const AUDIO_EXT = new Set(['mp3','wav','ogg','m4a']);

function fileType(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (IMAGE_EXT.has(ext)) return 'Bild';
  if (VIDEO_EXT.has(ext)) return 'Video';
  if (AUDIO_EXT.has(ext)) return 'Audio';
  if (ext === 'pdf')      return 'PDF';
  return 'Datei';
}

function timeAgo(mtime) {
  const secs = Math.floor(Date.now() / 1000) - mtime;
  if (secs < 60)   return `vor ${secs} Sek.`;
  if (secs < 3600) return `vor ${Math.floor(secs / 60)} Min.`;
  if (secs < 86400) return `vor ${Math.floor(secs / 3600)} Std.`;
  return `vor ${Math.floor(secs / 86400)} Tag(en)`;
}

export function register(server, token) {
  server.tool(
    'vault_shared_list',
    [
      'Listet Dateien in vault_shared auf (neueste zuerst).',
      '',
      'Workflow KI-Messenger (Datei über SYS Chat senden):',
      '1. Claude gibt dem User den SYS Chat Link zum Hochladen',
      '2. User schickt Datei im SYS Chat → wird automatisch mit Timestamp in vault_shared gespeichert',
      '3. User sagt "ok erledigt" oder "fertig"',
      '4. Claude ruft vault_shared_list auf → findet neuestes File',
      '5. Claude fragt: "Ist das die richtige Datei: foto.jpg (2.1 MB, vor 30 Sek.)?"',
      '6. User bestätigt → Claude ruft peer_send mit vault_filename auf',
    ].join('\n'),
    {
      limit: z.number().int().min(1).max(50).default(10).optional()
              .describe('Maximale Anzahl Dateien (default 10, neueste zuerst)'),
    },
    async ({ limit = 10 }) => {
      try {
        const data = await getJson('/api/vault/shared-list', token);
        if (!data.ok) {
          return { content: [{ type: 'text', text: `Fehler: ${JSON.stringify(data)}` }], isError: true };
        }

        const files = (data.files || []).slice(0, limit);

        if (files.length === 0) {
          return {
            content: [{ type: 'text', text: 'vault_shared ist leer.\n\nSende zuerst eine Datei über den SYS Chat, dann erneut aufrufen.' }],
          };
        }

        const lines = files.map((f, i) => {
          const displayName = f.name.replace(/^\d{10,}_/, '');
          const sizeKb = Math.ceil((f.size || 0) / 1024);
          const type = fileType(f.name);
          const ago = timeAgo(f.mtime);
          const marker = i === 0 ? ' ← neueste' : '';
          return `${i + 1}. ${displayName} (${type}, ${sizeKb} KB, ${ago})${marker}\n   vault_filename: "${f.name}"`;
        });

        return {
          content: [{
            type: 'text',
            text: `${files.length} Datei(en) in vault_shared:\n\n${lines.join('\n\n')}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
