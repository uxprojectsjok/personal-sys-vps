import { z } from 'zod';
import { getRawBytes } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'image_get',
    'Lädt ein Bild aus dem Vault und gibt es als base64-kodiertes Bild zurück, das Claude direkt sehen und analysieren kann. Für Gesichtsanalyse, visuelle Kontext-Erkennung und profile_save face.',
    { filename: z.string().describe('Dateiname, z.B. "profil.jpg" – aus image_list bekannt') },
    async ({ filename }) => {
      const path = `/api/vault/images/${encodeURIComponent(filename)}`;
      let buffer;
      try {
        buffer = await getRawBytes(path, token);
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message, filename }) }],
        };
      }

      const bytes  = Buffer.from(buffer);
      const base64 = bytes.toString('base64');
      const ext    = filename.split('.').pop().toLowerCase();
      const mime   = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';

      return {
        content: [
          { type: 'image', data: base64, mimeType: mime },
          { type: 'text', text: JSON.stringify({ filename, size_kb: Math.round(bytes.length / 1024), hint: 'Bild direkt analysieren, dann profile_save face aufrufen.' }) },
        ],
      };
    }
  );
}
