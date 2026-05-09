/**
 * soul_read — Peer-Variante für Verbundene Souls (trusted peers).
 * Liest direkt vom Dateisystem, bypasses OpenResty-Auth.
 * v2 2026-05-09: Liefert nur den <!-- SOCIAL:START --> ... <!-- SOCIAL:END --> Block.
 * v1-Migration: Fehlt der SOCIAL-Block, wird er leer eingefügt + version auf 2 gesetzt.
 */

import { readFile, writeFile } from 'fs/promises';
import { decryptIfNeeded, encryptBuf, loadVaultMeta, SOULS_DIR } from '../lib/vault_fs.mjs';

// v2 2026-05-09 — three-sphere model: peers read SOCIAL block, not AGENT block
const SOCIAL_START = '<!-- SOCIAL:START -->';
const SOCIAL_END   = '<!-- SOCIAL:END -->';
const MAGIC        = Buffer.from([0x53, 0x59, 0x53, 0x01]);

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
    'soul_read',
    [
      'Liest den sozialen Soul-Inhalt (Sozialsphäre-Block von sys.md).',
      'Gibt nur den explizit für Peers freigegebenen Abschnitt zurück — nie die Intimsphäre.',
      '',
      'WICHTIG: soul_read zu Beginn jeder Sitzung aufrufen, bevor geantwortet wird.',
    ].join('\n'),
    {},
    async () => {
      try {
        const { vaultKeyHex } = await loadVaultMeta(targetSoulId);
        const soulPath = `${SOULS_DIR}${targetSoulId}/sys.md`;
        const rawBuf   = await readFile(soulPath);
        const wasEncrypted = rawBuf.slice(0, 4).equals(MAGIC);

        if (wasEncrypted && !vaultKeyHex) {
          return {
            content: [{ type: 'text', text: 'sys.md ist verschlüsselt — Soul muss einmal im SYS-Browser entsperrt werden.' }],
            isError: true,
          };
        }

        const decBuf = decryptIfNeeded(rawBuf, vaultKeyHex);
        let md = decBuf.toString('utf8');

        // v1 → v2 auto-migration: SOCIAL-Block fehlt → einmalig einfügen + zurückschreiben
        if (!md.includes(SOCIAL_START)) {
          md = migratev1(md);
          let writeBuf = Buffer.from(md, 'utf8');
          if (wasEncrypted) writeBuf = encryptBuf(writeBuf, vaultKeyHex);
          await writeFile(soulPath, writeBuf).catch(() => {}); // best-effort
        }

        const s = md.indexOf(SOCIAL_START);
        const e = md.indexOf(SOCIAL_END);

        if (s === -1 || e === -1 || e <= s) {
          return {
            content: [{ type: 'text', text: 'Kein Sozialsphäre-Block definiert (<!-- SOCIAL:START --> fehlt).' }],
            isError: true,
          };
        }

        const socialContent = md.slice(s + SOCIAL_START.length, e).trim();
        if (!socialContent) {
          return {
            content: [{ type: 'text', text: 'Sozialsphäre-Block ist leer — Soul-Inhaber hat noch keine Informationen für Peers freigegeben.' }],
          };
        }

        return { content: [{ type: 'text', text: socialContent }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `soul_read fehlgeschlagen: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
