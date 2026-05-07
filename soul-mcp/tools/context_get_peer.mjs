/**
 * context_get — Peer-Variante.
 * Liest Kontext-Dateien (.md, .txt, .pdf) vom Dateisystem.
 */

import { z } from 'zod';
import { execFile } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { loadVaultMeta, readVaultFile } from '../lib/vault_fs.mjs';

const execFileAsync = promisify(execFile);

async function pdfToText(buf) {
  const tmp = join(tmpdir(), `soul_pdf_${Date.now()}.pdf`);
  try {
    await writeFile(tmp, buf);
    const { stdout } = await execFileAsync('pdftotext', ['-layout', tmp, '-']);
    return stdout;
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

export function register(server, targetSoulId) {
  server.tool(
    'context_get',
    'Liest den Inhalt einer Kontext-Datei (.md, .txt, .pdf) aus dem Peer-Vault.',
    { filename: z.string().describe('Dateiname, z.B. "lebenslauf.pdf" – aus context_list bekannt') },
    async ({ filename }) => {
      if (!/^[\w\-. ]+$/.test(filename)) {
        return { content: [{ type: 'text', text: 'Ungültiger Dateiname.' }], isError: true };
      }
      try {
        const { vaultKeyHex } = await loadVaultMeta(targetSoulId);
        const buf = await readVaultFile(targetSoulId, 'context', filename, vaultKeyHex);

        if (filename.toLowerCase().endsWith('.pdf')) {
          const text = await pdfToText(buf);
          return { content: [{ type: 'text', text: text.trim() || '(Kein lesbarer Text)' }] };
        }

        return { content: [{ type: 'text', text: buf.toString('utf8') }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `context_get fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}
