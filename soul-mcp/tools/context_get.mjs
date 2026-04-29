import { z } from 'zod';
import { getText, getRawBytes, fileUrl } from '../lib/api.mjs';
import { execFile } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function pdfToText(buf) {
  const tmp = join(tmpdir(), `soul_pdf_${Date.now()}.pdf`);
  try {
    await writeFile(tmp, Buffer.from(buf));
    const { stdout } = await execFileAsync('pdftotext', ['-layout', tmp, '-']);
    return stdout;
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

export function register(server, token) {
  server.tool(
    'context_get',
    'Liest den Inhalt einer Text-Kontext-Datei (.md, .txt, .pdf) direkt als Text. Für Lebensläufe, Wissensdokumente, Notizen und strukturierte Informationen der Person. Word-Dokumente (.docx) bitte vorher in PDF umwandeln.',
    { filename: z.string().describe('Dateiname, z.B. "lebenslauf.pdf" oder "notizen.md" – aus context_list bekannt') },
    async ({ filename }) => {
      const path = `/api/vault/context/${encodeURIComponent(filename)}`;
      const isPdf = filename.toLowerCase().endsWith('.pdf');
      try {
        if (isPdf) {
          const buf = await getRawBytes(path, token);
          const text = await pdfToText(buf);
          return { content: [{ type: 'text', text: text.trim() || '(Kein lesbarer Text in der PDF gefunden)' }] };
        } else {
          const text = await getText(path, token);
          return { content: [{ type: 'text', text }] };
        }
      } catch (err) {
        const url = fileUrl('context', filename, token);
        return {
          content: [{ type: 'text', text: `Direkt-Abruf fehlgeschlagen. URL: ${url}\nFehler: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
