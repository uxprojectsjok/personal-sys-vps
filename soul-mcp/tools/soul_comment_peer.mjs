/**
 * soul_comment — Peer-Variante.
 * Hängt einen Kommentar an den AGENT-Block der Ziel-Soul.
 * Kein POL/TX nötig — Identifikation über die Peer-soul_id.
 */

import { z } from 'zod';
import { readFile, writeFile } from 'fs/promises';
import { decryptIfNeeded, encryptBuf, loadVaultMeta, SOULS_DIR } from '../lib/vault_fs.mjs';

const AGENT_START = '<!-- AGENT:START -->';
const AGENT_END   = '<!-- AGENT:END -->';
const RE_AGENT    = /<!--\s*AGENT:START\s*-->([\s\S]*?)<!--\s*AGENT:END\s*-->/;

export function register(server, peerToken, targetSoulId) {
  const peerSoulId = peerToken.split('.')[0];

  server.tool(
    'soul_comment',
    [
      'Hinterlässt einen Kommentar im öffentlichen Agent-Bereich der verbundenen Soul.',
      'Identifikation erfolgt über deine soul_id — kein POL-Payment erforderlich.',
      '',
      'Parameter:',
      '- comment: Text des Kommentars (max. 2000 Zeichen)',
      '- author:  Anzeigename (optional, ergänzt die soul_id automatisch)',
    ].join('\n'),
    {
      comment: z.string().min(1).max(2000).describe('Kommentartext'),
      author:  z.string().max(60).optional().describe('Anzeigename (optional)'),
    },
    async ({ comment, author }) => {
      try {
        const { vaultKeyHex } = await loadVaultMeta(targetSoulId);
        const soulPath = `${SOULS_DIR}${targetSoulId}/sys.md`;

        const rawBuf      = await readFile(soulPath);
        const wasEncrypted = rawBuf.slice(0, 4).equals(Buffer.from([0x53, 0x59, 0x53, 0x01]));
        const decBuf      = decryptIfNeeded(rawBuf, vaultKeyHex);
        const md          = decBuf.toString('utf8');

        if (!RE_AGENT.test(md)) {
          return {
            content: [{ type: 'text', text: 'Kein <!-- AGENT:START --> Block in der Ziel-Soul definiert.' }],
            isError: true,
          };
        }

        const ts         = new Date().toISOString().slice(0, 10);
        const displayName = author ? `${author} · soul:${peerSoulId}` : `soul:${peerSoulId}`;
        const entry      = `\n\n---\n**${displayName}** · ${ts}\n${comment.trim()}`;

        // Eintrag vor AGENT:END einfügen
        const updated = md.replace(RE_AGENT, (_, inner) =>
          `${AGENT_START}${inner.trimEnd()}${entry}\n${AGENT_END}`
        );

        let writeBuf = Buffer.from(updated, 'utf8');
        if (wasEncrypted) {
          if (!vaultKeyHex) throw new Error('Soul verschlüsselt — vault_key nicht verfügbar.');
          writeBuf = encryptBuf(writeBuf, vaultKeyHex);
        }

        await writeFile(soulPath, writeBuf);

        return {
          content: [{
            type: 'text',
            text: `Kommentar hinterlassen.\nAutor: ${displayName}\nDatum: ${ts}`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `soul_comment fehlgeschlagen: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
