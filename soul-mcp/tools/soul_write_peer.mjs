/**
 * soul_write — Peer-Variante.
 * Liest sys.md vom Dateisystem, aktualisiert eine Sektion, schreibt zurück.
 * Re-verschlüsselt automatisch wenn das Original verschlüsselt war.
 */

import { z } from 'zod';
import { readFile, writeFile } from 'fs/promises';
import { decryptIfNeeded, encryptBuf, loadVaultMeta, SOULS_DIR } from '../lib/vault_fs.mjs';

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function updateSection(md, heading, newContent, mode) {
  const re = new RegExp(
    `(^## ${escapeRe(heading)}[ \\t]*\\n)([\\s\\S]*?)(?=^## |\\s*$)`,
    'm'
  );
  const match = md.match(re);
  const block  = (h, body) => `## ${h}\n${body.trim()}\n`;

  if (match) {
    const existing = match[2].trim();
    let body;
    if (mode === 'replace')        body = newContent;
    else if (mode === 'prepend')   body = newContent + (existing ? '\n\n' + existing : '');
    else                           body = (existing ? existing + '\n\n' : '') + newContent;
    return md.replace(re, block(heading, body) + '\n');
  }

  return md.trimEnd() + '\n\n' + block(heading, newContent) + '\n';
}

export function register(server, targetSoulId) {
  server.tool(
    'soul_write',
    [
      'Schreibt Inhalt dauerhaft in eine sys.md-Sektion der verbundenen Soul.',
      'Nur verfügbar wenn der Soul-Inhaber soul_write für Verbundene Nodes freigegeben hat.',
    ].join('\n'),
    {
      section: z.string().min(1).max(200).regex(/^[^\n\r]+$/).describe('Name der ## Sektion'),
      content: z.string().min(1).max(50000).describe('Markdown-Inhalt'),
      mode:    z.enum(['replace', 'append', 'prepend']).default('replace'),
    },
    async ({ section, content, mode }) => {
      try {
        const { vaultKeyHex } = await loadVaultMeta(targetSoulId);
        const soulPath = `${SOULS_DIR}${targetSoulId}/sys.md`;

        let rawBuf   = await readFile(soulPath);
        const wasEncrypted = rawBuf.slice(0, 4).equals(Buffer.from([0x53, 0x59, 0x53, 0x01]));

        const decBuf = decryptIfNeeded(rawBuf, vaultKeyHex);
        const md     = decBuf.toString('utf8');
        const updated = updateSection(md, section, content, mode);

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
            text: JSON.stringify({ ok: true, section, mode, message: `Sektion "${section}" ${verb}.` }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `soul_write fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}
