/**
 * soul_comment — Peer-Variante.
 * v2 2026-05-09: Hängt einen Kommentar an den SOCIAL-Block der Ziel-Soul.
 * Kein POL/TX nötig — Identifikation über die Peer-soul_id.
 */

import { z } from 'zod';
import { readFile, writeFile } from 'fs/promises';
import { decryptIfNeeded, encryptBuf, loadVaultMeta, SOULS_DIR } from '../lib/vault_fs.mjs';

// v2 2026-05-09 — three-sphere: peer comments go into SOCIAL block, not AGENT block
const SOCIAL_START = '<!-- SOCIAL:START -->';
const SOCIAL_END   = '<!-- SOCIAL:END -->';
const RE_SOCIAL    = /<!--\s*SOCIAL:START\s*-->([\s\S]*?)<!--\s*SOCIAL:END\s*-->/;

// Inserts empty SOCIAL block before <!-- AGENT:START --> (or at end), bumps version 1 → 2
function migratev1(md) {
  const block    = '\n## Social Sphere\n<!-- SOCIAL:START -->\n<!-- SOCIAL:END -->\n';
  const agentIdx = md.indexOf('<!-- AGENT:START -->');
  const migrated = agentIdx !== -1
    ? md.slice(0, agentIdx) + block + '\n' + md.slice(agentIdx)
    : md.trimEnd() + '\n' + block;
  return migrated.replace(/^version:\s*1\s*$/m, 'version: 2');
}

export function register(server, peerToken, targetSoulId) {
  const peerSoulId = peerToken.split('.')[0];

  server.tool(
    'soul_comment',
    [
      'Hinterlässt einen Kommentar in der Sozialsphäre der verbundenen Soul.',
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

        const rawBuf       = await readFile(soulPath);
        const wasEncrypted = rawBuf.slice(0, 4).equals(Buffer.from([0x53, 0x59, 0x53, 0x01]));
        const decBuf       = decryptIfNeeded(rawBuf, vaultKeyHex);
        let md             = decBuf.toString('utf8');

        // v1 → v2 auto-migration: SOCIAL-Block fehlt → einmalig einfügen
        if (!RE_SOCIAL.test(md)) {
          if (!md.includes(SOCIAL_START)) md = migratev1(md);
          if (!RE_SOCIAL.test(md)) {
            return {
              content: [{ type: 'text', text: 'Kein <!-- SOCIAL:START --> Block in der Ziel-Soul definiert.' }],
              isError: true,
            };
          }
        }

        const ts          = new Date().toISOString().slice(0, 10);
        const displayName = author ? `${author} · soul:${peerSoulId}` : `soul:${peerSoulId}`;
        const entry       = `\n\n---\n**${displayName}** · ${ts}\n${comment.trim()}`;

        // Eintrag vor SOCIAL:END einfügen
        const updated = md.replace(RE_SOCIAL, (_, inner) =>
          `${SOCIAL_START}${inner.trimEnd()}${entry}\n${SOCIAL_END}`
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
