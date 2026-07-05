/**
 * vault_shared_list (Peer-Variante) — Listet Dateien in vault_shared eines
 * getrusteten Ziel-Souls auf, direkt vom Dateisystem (kein REST-Umweg, da
 * Peer-Certs auf dem Ziel-Server nicht gültig sind).
 */

import { readdir, stat } from 'fs/promises';
import { SOULS_DIR } from '../lib/vault_fs.mjs';

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

function timeAgo(mtimeMs) {
  const secs = Math.floor((Date.now() - mtimeMs) / 1000);
  if (secs < 60)    return `vor ${secs} Sek.`;
  if (secs < 3600)  return `vor ${Math.floor(secs / 60)} Min.`;
  if (secs < 86400) return `vor ${Math.floor(secs / 3600)} Std.`;
  return `vor ${Math.floor(secs / 86400)} Tag(en)`;
}

export function register(server, targetSoulId) {
  server.tool(
    'vault_shared_list',
    'Listet Dateien in vault_shared des Ziel-Souls auf (neueste zuerst).',
    {},
    async () => {
      try {
        const dir = `${SOULS_DIR}${targetSoulId}/vault_shared/`;
        let names;
        try {
          names = await readdir(dir);
        } catch {
          return { content: [{ type: 'text', text: 'vault_shared ist leer.' }] };
        }

        const files = [];
        for (const name of names) {
          try {
            const st = await stat(dir + name);
            if (st.isFile()) files.push({ name, size: st.size, mtimeMs: st.mtimeMs });
          } catch { /* Datei zwischenzeitlich entfernt */ }
        }
        files.sort((a, b) => b.mtimeMs - a.mtimeMs);

        if (files.length === 0) {
          return { content: [{ type: 'text', text: 'vault_shared ist leer.' }] };
        }

        const lines = files.map((f, i) => {
          const displayName = f.name.replace(/^\d{10,}_/, '');
          const sizeKb = Math.ceil((f.size || 0) / 1024);
          const type = fileType(f.name);
          const ago = timeAgo(f.mtimeMs);
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
        return { content: [{ type: 'text', text: `vault_shared_list fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}
