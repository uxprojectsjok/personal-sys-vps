/**
 * vault_shared_upload — Lädt eine Datei in vault_shared hoch.
 * Filesystem-basiert (kein HTTP-Roundtrip nötig).
 * Gibt eine vault-shared:// URL zurück die mit peer_send weitergeleitet werden kann.
 */

import { z } from 'zod';
import { writeFile, mkdir } from 'fs/promises';
import { SOULS_DIR } from '../lib/vault_fs.mjs';
import { sharedFileUrl } from '../lib/api.mjs';

export function register(server, soulId, token) {
  server.tool(
    'vault_shared_upload',
    [
      'Lädt eine Datei (Bild, PDF, Dokument) in vault_shared hoch.',
      'Gibt eine vault-shared:// URL zurück — diese mit peer_send an Peers schicken.',
      '',
      'Anwendungsfälle:',
      '- Bild aus Claude AI Chat an Till weiterschicken → upload → peer_send',
      '- Dokument hochladen und teilen → upload → peer_send',
      '- Datei speichern damit Peers sie abrufen können',
      '',
      'Erlaubte Typen: Bilder (jpg, png, webp, gif), PDF, md, txt, csv, json, docx, xlsx, zip',
    ].join('\n'),
    {
      filename: z.string().min(1).max(120)
                 .regex(/^[A-Za-z0-9_\-\.äöüÄÖÜß]+$/, 'Nur alphanumerisch + . - _')
                 .describe('Dateiname inkl. Endung, z.B. "bild.jpg" oder "bericht.pdf"'),
      data_b64: z.string().min(1)
                 .describe('Dateiinhalt als Base64-String'),
      description: z.string().max(200).optional()
                    .describe('Optionale Beschreibung für die Nachricht an den Peer'),
    },
    async ({ filename, data_b64, description }) => {
      try {
        // Dateiname sanitizen
        const safe = filename.replace(/[^A-Za-z0-9_\-\.]/g, '_').replace(/_{2,}/g, '_');
        if (!safe) return { content: [{ type: 'text', text: 'Ungültiger Dateiname.' }], isError: true };

        const ts        = Date.now();
        const storedName = `${ts}_${safe}`;
        const dir        = `${SOULS_DIR}${soulId}/vault_shared`;
        const filePath   = `${dir}/${storedName}`;

        // Daten dekodieren
        let buf;
        try {
          buf = Buffer.from(data_b64, 'base64');
        } catch {
          return { content: [{ type: 'text', text: 'Ungültiges Base64.' }], isError: true };
        }

        if (buf.length > 50 * 1024 * 1024) {
          return { content: [{ type: 'text', text: 'Datei zu groß (max. 50 MB).' }], isError: true };
        }

        await mkdir(dir, { recursive: true });
        await writeFile(filePath, buf);

        const vaultUrl  = `vault-shared://${soulId}/${storedName}`;
        const viewUrl   = token ? sharedFileUrl(soulId, storedName, token) : null;
        const sizeKb    = Math.ceil(buf.length / 1024);
        const descPart  = description ? ` — ${description}` : '';

        return {
          content: [{
            type: 'text',
            text: [
              `Datei hochgeladen: ${storedName} (${sizeKb} KB)`,
              viewUrl ? `Direkt öffnen: ${viewUrl}` : '',
              '',
              `Mit peer_send teilen:`,
              `  to: "Till" (oder "alle")`,
              `  message: "[${safe}](${vaultUrl})${descPart}"`,
            ].filter(Boolean).join('\n'),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
