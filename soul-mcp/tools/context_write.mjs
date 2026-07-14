/**
 * context_write — Schreibt oder aktualisiert eine Kontext-Datei im Vault.
 * Ermöglicht das Anlegen und Bearbeiten von .md/.txt-Dateien in vault/context/.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { z } from 'zod';
import { SOULS_DIR, encryptBuf, loadVaultMeta } from '../lib/vault_fs.mjs';

async function ensureContextRegistered(soulId, filename) {
  const ctxPath = `${SOULS_DIR}${soulId}/api_context.json`;
  try {
    const raw = await readFile(ctxPath, 'utf8');
    const ctx = JSON.parse(raw);
    const sf  = ctx.synced_files = ctx.synced_files || {};
    const arr = Array.isArray(sf.context) ? sf.context : [];
    if (!arr.includes(filename)) {
      arr.push(filename);
      sf.context = arr;
      await writeFile(ctxPath, JSON.stringify(ctx), 'utf8');
    }
  } catch { /* nicht kritisch */ }
}

export function register(server, soulId) {
  server.tool(
    'context_write',
    'Schreibt oder aktualisiert eine Kontext-Datei (z.B. notizen.md, projekte.md) im Vault. Nur .md und .txt Dateien. Kann neue Dateien anlegen oder bestehende überschreiben. Nicht für mind.md, health.md, shopping.md (dafür mind_write, food_log, shop_log nutzen).',
    {
      filename: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_\-\.äöüÄÖÜß]+\.(md|txt)$/, 'Nur .md und .txt Dateien erlaubt').describe('Dateiname, z.B. "notizen.md" oder "projekte.md"'),
      content:  z.string().max(100000).describe('Vollständiger Dateiinhalt (überschreibt bestehenden Inhalt)'),
    },
    async ({ filename, content }) => {
      const PROTECTED = new Set(['mind.md', 'health.md', 'shopping.md']);
      if (PROTECTED.has(filename.toLowerCase())) {
        return {
          content: [{ type: 'text', text: `"${filename}" ist geschützt. Bitte mind_write, food_log oder shop_log verwenden.` }],
          isError: true,
        };
      }
      try {
        const dir      = `${SOULS_DIR}${soulId}/vault/context`;
        const filePath = `${dir}/${filename}`;
        await mkdir(dir, { recursive: true });

        const existed = await readFile(filePath).then(() => true).catch(() => false);

        const { vaultKeyHex, cipherMode } = await loadVaultMeta(soulId);
        let outBuf = Buffer.from(content, 'utf8');
        if (cipherMode === 'ciphered' && vaultKeyHex) outBuf = encryptBuf(outBuf, vaultKeyHex);
        await writeFile(filePath, outBuf);
        await ensureContextRegistered(soulId, filename);

        const action = existed ? 'Aktualisiert' : 'Angelegt';
        return { content: [{ type: 'text', text: `${action}: ${filename} (${content.length} Zeichen)` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
