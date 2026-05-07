/**
 * Generischer Vault-Get-Tool für Peer-Zugriff (Audio / Bilder).
 * Liest Datei vom Dateisystem, entschlüsselt falls nötig, gibt base64 zurück.
 */

import { z } from 'zod';
import { loadVaultMeta, readVaultFile, getMime } from '../lib/vault_fs.mjs';

const PARAM_LABELS = {
  audio:  '"stimme.mp3" – aus audio_list bekannt',
  images: '"profil.jpg" – aus image_list bekannt',
};

export function registerGet(server, targetSoulId, vaultType) {
  const isAudio = vaultType === 'audio';
  const toolName = isAudio ? 'audio_get' : 'image_get';
  const desc = isAudio
    ? 'Lädt eine Audio-Datei aus dem Peer-Vault und gibt sie als base64 zurück.'
    : 'Lädt ein Bild aus dem Peer-Vault und gibt es als base64-Bild zurück, das Claude analysieren kann.';

  server.tool(
    toolName,
    desc,
    { filename: z.string().describe(`Dateiname, z.B. ${PARAM_LABELS[vaultType] || `"datei.${vaultType}"`}`) },
    async ({ filename }) => {
      // Pfad-Traversal verhindern
      if (!/^[\w\-. ]+$/.test(filename)) {
        return { content: [{ type: 'text', text: 'Ungültiger Dateiname.' }], isError: true };
      }
      try {
        const { vaultKeyHex } = await loadVaultMeta(targetSoulId);
        const buf  = await readVaultFile(targetSoulId, vaultType, filename, vaultKeyHex);
        const mime = getMime(filename);

        if (isAudio) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                filename,
                mime,
                size_kb: Math.round(buf.length / 1024),
                base64:  buf.toString('base64'),
                hint:    'Audio-Datei als base64. Zum Abspielen dekodieren.',
              }),
            }],
          };
        }

        return {
          content: [
            { type: 'image', data: buf.toString('base64'), mimeType: mime },
            { type: 'text', text: JSON.stringify({ filename, size_kb: Math.round(buf.length / 1024) }) },
          ],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `${toolName} fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}
