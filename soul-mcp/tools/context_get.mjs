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

async function docxToText(buf) {
  const tmp = join(tmpdir(), `soul_docx_${Date.now()}.docx`);
  try {
    await writeFile(tmp, Buffer.from(buf));
    const { stdout } = await execFileAsync('pandoc', ['-f', 'docx', '-t', 'plain', '--wrap=none', tmp], { maxBuffer: 20 * 1024 * 1024 });
    return stdout;
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

export function register(server, token) {
  server.tool(
    'context_get',
    'Liest den Inhalt einer Kontext-Datei direkt als Text. Text-Formate (.md, .txt, .json, .csv) 1:1; .pdf und .docx werden serverseitig in Text konvertiert. Für Lebensläufe, Wissensdokumente, Notizen, strukturierte Daten, Tabellen, Verträge und Informationen der Person.',
    { filename: z.string().describe('Dateiname, z.B. "lebenslauf.pdf", "vertrag.docx" oder "notizen.md" – aus context_list bekannt') },
    async ({ filename }) => {
      const path = `/api/vault/context/${encodeURIComponent(filename)}`;
      const lower = filename.toLowerCase();
      const isPdf = lower.endsWith('.pdf');
      const isDocx = lower.endsWith('.docx');
      try {
        if (isPdf) {
          const buf = await getRawBytes(path, token);
          const text = await pdfToText(buf);
          return { content: [{ type: 'text', text: text.trim() || '(Kein lesbarer Text in der PDF gefunden)' }] };
        } else if (isDocx) {
          const buf = await getRawBytes(path, token);
          const text = await docxToText(buf);
          return { content: [{ type: 'text', text: text.trim() || '(Kein lesbarer Text im Word-Dokument gefunden)' }] };
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
