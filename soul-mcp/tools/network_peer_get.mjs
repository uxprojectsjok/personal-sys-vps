import { z } from 'zod';
import { getJson, getRawBytes } from '../lib/api.mjs';

const BASE = () => process.env.SYS_API_URL || '';

export function register(server, token) {
  server.tool(
    'network_peer_get',
    [
      'Liest alle freigegebenen Inhalte einer verbundenen Soul:',
      '- soul_content: Soul.md der Person (wenn freigegeben)',
      '- context_files: Alle freigegebenen Kontext-/Textdateien (md/txt als Text, PDF direkt lesbar)',
      '- files: Manifest aller freigegebenen Dateien (Bilder, Audio, Video)',
      '',
      'Zugriff basiert auf soul_grant in vault_public/config.json der Ziel-Soul.',
      'Nur explizit freigegebene Dateien sind sichtbar.',
    ].join('\n'),
    {
      soul_id: z.string().describe('UUID der verbundenen Soul (aus network_list)'),
      file:    z.string().optional().describe('Einzelne Datei lesen (optional, z.B. "about.md" oder "report.pdf")'),
    },
    async ({ soul_id, file }) => {
      try {
        const path = file
          ? `/api/vault/connections/peer-files?soul_id=${encodeURIComponent(soul_id)}&file=${encodeURIComponent(file)}`
          : `/api/vault/connections/peer-files?soul_id=${encodeURIComponent(soul_id)}`;

        const data = await getJson(path, token);

        const content = [];

        // ── Einzeldatei-Modus ─────────────────────────────────────────────────
        if (file && data.ok !== undefined) {
          const fname = data.name || file;
          const ext   = (fname.split('.').pop() || '').toLowerCase();

          if (ext === 'pdf') {
            // PDF direkt vom peer-stream Endpoint als Binary holen (Node.js-seitig, kein web_fetch)
            const streamPath = `/api/vault/peer-stream?soul_id=${encodeURIComponent(soul_id)}&file=${encodeURIComponent(fname)}&token=${token}`;
            try {
              const buf    = await getRawBytes(streamPath, token);
              const bytes  = Buffer.from(buf);
              const base64 = bytes.toString('base64');
              content.push({
                type: 'resource',
                resource: {
                  uri:      `vault://peer/${soul_id}/${fname}`,
                  mimeType: 'application/pdf',
                  blob:     base64,
                },
              });
              content.push({ type: 'text', text: `PDF "${fname}" von Soul ${soul_id} – ${Math.round(bytes.length / 1024)} KB, direkt lesbar.` });
            } catch (fetchErr) {
              content.push({ type: 'text', text: `PDF "${fname}" nicht abrufbar: ${fetchErr.message}` });
            }
          } else if (data.content) {
            content.push({ type: 'text', text: `### ${fname}\n\n${data.content}` });
          } else {
            content.push({ type: 'text', text: JSON.stringify(data, null, 2) });
          }

          return { content };
        }

        // ── Manifest-Modus ────────────────────────────────────────────────────
        const lines = [];

        if (data.alias)  lines.push(`## ${data.alias} (${soul_id})`);
        if (data.mutual) lines.push('Verbindung: gegenseitig ✓');
        if (data.granted_scopes?.length) {
          lines.push(`Freigegebene Scopes: ${data.granted_scopes.join(', ')}`);
        }

        if (data.soul_content) {
          lines.push('\n### Soul.md\n');
          lines.push(data.soul_content);
        }

        if (Array.isArray(data.context_files) && data.context_files.length > 0) {
          // Zuerst Text-Blöcke sammeln, dann PDFs als Resource-Blöcke anhängen
          const pendingPdfs = [];

          for (const cf of data.context_files) {
            const ext = (cf.name.split('.').pop() || '').toLowerCase();
            if (ext === 'pdf') {
              pendingPdfs.push(cf.name);
            } else if (cf.truncated) {
              lines.push(`\n### ${cf.name} (zu groß, ${Math.round(cf.size / 1024)} KB)`);
              lines.push(`_Einzeln abrufen: network_peer_get(soul_id, file="${cf.name}")_`);
            } else {
              lines.push(`\n### ${cf.name}\n`);
              lines.push(cf.content || '');
            }
          }

          // Text-Block ausgeben bevor PDFs kommen
          if (lines.length > 0) {
            content.push({ type: 'text', text: lines.join('\n') });
            lines.length = 0;
          }

          // PDFs: Node.js fetcht Binary, gibt als Resource-Block zurück
          for (const pdfName of pendingPdfs) {
            const streamPath = `/api/vault/peer-stream?soul_id=${encodeURIComponent(soul_id)}&file=${encodeURIComponent(pdfName)}&token=${token}`;
            try {
              const buf    = await getRawBytes(streamPath, token);
              const bytes  = Buffer.from(buf);
              const base64 = bytes.toString('base64');
              content.push({
                type: 'resource',
                resource: {
                  uri:      `vault://peer/${soul_id}/${pdfName}`,
                  mimeType: 'application/pdf',
                  blob:     base64,
                },
              });
              content.push({ type: 'text', text: `↑ PDF "${pdfName}" von ${data.alias || soul_id} – ${Math.round(bytes.length / 1024)} KB` });
            } catch (fetchErr) {
              lines.push(`\n_PDF "${pdfName}" nicht abrufbar: ${fetchErr.message}_`);
            }
          }
        }

        if (Array.isArray(data.files) && data.files.length > 0) {
          lines.push('\n### Weitere freigegebene Dateien');
          for (const f of data.files) {
            if (f.type !== 'context_files') {
              lines.push(`- ${f.name} (${f.type})`);
            }
          }
        }

        if (data.note) lines.push(`\n_Hinweis: ${data.note}_`);

        if (lines.length > 0) {
          content.push({ type: 'text', text: lines.join('\n') });
        }

        if (content.length === 0) {
          content.push({ type: 'text', text: JSON.stringify(data, null, 2) });
        }

        return { content };
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );
}
