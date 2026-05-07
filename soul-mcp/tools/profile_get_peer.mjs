/**
 * profile_get — Peer-Variante.
 * Liest gespeicherte Analyse-Profile (face/voice/motion/expertise) direkt vom Dateisystem.
 */

import { z } from 'zod';
import { readFile } from 'fs/promises';
import { loadVaultMeta, decryptIfNeeded, SOULS_DIR } from '../lib/vault_fs.mjs';

const PROFILE_HINTS = {
  face:      'Noch kein Gesichtsprofil erstellt.',
  voice:     'Noch kein Stimmprofil erstellt.',
  motion:    'Noch kein Bewegungsprofil erstellt.',
  expertise: 'Noch kein Expertiseprofil erstellt.',
};

export function register(server, targetSoulId) {
  server.tool(
    'profile_get',
    'Liest ein gespeichertes Analyse-Profil aus dem Peer-Vault. Typen: face, voice, motion, expertise.',
    { type: z.enum(['face', 'voice', 'motion', 'expertise']).describe('Profiltyp') },
    async ({ type }) => {
      try {
        const { vaultKeyHex } = await loadVaultMeta(targetSoulId);
        const profilePath = `${SOULS_DIR}${targetSoulId}/vault/profile/${type}.json`;

        let buf;
        try {
          buf = await readFile(profilePath);
        } catch {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ exists: false, type, message: PROFILE_HINTS[type] }, null, 2),
            }],
          };
        }

        const decrypted = decryptIfNeeded(buf, vaultKeyHex);
        const data = JSON.parse(decrypted.toString('utf8'));
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `profile_get fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}
