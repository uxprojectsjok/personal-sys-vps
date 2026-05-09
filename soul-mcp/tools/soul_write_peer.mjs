/**
 * soul_write — Peer-Variante.
 * v2 2026-05-09: Schreibt ausschließlich in den <!-- SOCIAL:START --> ... <!-- SOCIAL:END --> Block.
 * Schreibzugriff auf Intimsphäre und Agent-Sandbox ist strukturell unmöglich.
 */

import { z } from 'zod';
import { readFile, writeFile } from 'fs/promises';
import { decryptIfNeeded, encryptBuf, loadVaultMeta, SOULS_DIR } from '../lib/vault_fs.mjs';

// v2 2026-05-09 — three-sphere: peer writes restricted to SOCIAL block only
const SOCIAL_START = '<!-- SOCIAL:START -->';
const SOCIAL_END   = '<!-- SOCIAL:END -->';

// Replaces content between SOCIAL markers; returns null if block not found
function updateSocialBlock(md, newContent, mode) {
  const s = md.indexOf(SOCIAL_START);
  const e = md.indexOf(SOCIAL_END);
  if (s === -1 || e === -1 || e <= s) return null;

  const before  = md.slice(0, s + SOCIAL_START.length);
  const current = md.slice(s + SOCIAL_START.length, e).trim();
  const after   = md.slice(e);

  let body;
  if (mode === 'replace') body = newContent;
  else if (mode === 'prepend') body = newContent + (current ? '\n\n' + current : '');
  else body = (current ? current + '\n\n' : '') + newContent; // append (default)

  return before + '\n' + body.trim() + '\n' + after;
}

// Inserts empty SOCIAL block before <!-- AGENT:START --> (or at end), bumps version 1 → 2
function migratev1(md) {
  const block    = '\n## Sozialsphäre\n<!-- SOCIAL:START -->\n<!-- SOCIAL:END -->\n';
  const agentIdx = md.indexOf('<!-- AGENT:START -->');
  const migrated = agentIdx !== -1
    ? md.slice(0, agentIdx) + block + '\n' + md.slice(agentIdx)
    : md.trimEnd() + '\n' + block;
  return migrated.replace(/^version:\s*1\s*$/m, 'version: 2');
}

export function register(server, targetSoulId) {
  server.tool(
    'soul_write',
    [
      'Schreibt Inhalt in die Sozialsphäre (<!-- SOCIAL:START/END -->) der verbundenen Soul.',
      'Nur verfügbar wenn der Soul-Inhaber soul_write für Verbundene Nodes freigegeben hat.',
      'Kein Zugriff auf Intimsphäre (persönliche Sektionen) oder Agent-Sandbox.',
    ].join('\n'),
    {
      content: z.string().min(1).max(10000).describe('Markdown-Inhalt für die Sozialsphäre'),
      mode:    z.enum(['replace', 'append', 'prepend']).default('append'),
    },
    async ({ content, mode }) => {
      try {
        const { vaultKeyHex } = await loadVaultMeta(targetSoulId);
        const soulPath = `${SOULS_DIR}${targetSoulId}/sys.md`;

        const rawBuf       = await readFile(soulPath);
        const wasEncrypted = rawBuf.slice(0, 4).equals(Buffer.from([0x53, 0x59, 0x53, 0x01]));
        const decBuf       = decryptIfNeeded(rawBuf, vaultKeyHex);
        let md             = decBuf.toString('utf8');

        // v1 → v2 auto-migration
        if (!md.includes(SOCIAL_START)) md = migratev1(md);

        const updated = updateSocialBlock(md, content, mode);
        if (!updated) throw new Error('Sozialsphäre-Block nicht gefunden — Migration fehlgeschlagen.');

        let writeBuf = Buffer.from(updated, 'utf8');
        if (wasEncrypted) {
          if (!vaultKeyHex) throw new Error('Soul verschlüsselt — vault_key nicht verfügbar.');
          writeBuf = encryptBuf(writeBuf, vaultKeyHex);
        }

        await writeFile(soulPath, writeBuf);

        const verb = mode === 'replace' ? 'ersetzt' : mode === 'append' ? 'erweitert (Ende)' : 'erweitert (Anfang)';
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ ok: true, mode, message: `Sozialsphäre ${verb}.` }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `soul_write fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}
