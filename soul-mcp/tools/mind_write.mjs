import { readFile, writeFile, mkdir } from 'fs/promises';
import { z } from 'zod';
import { putJson } from '../lib/api.mjs';
import { SOULS_DIR, decryptIfNeeded, encryptBuf, loadVaultMeta } from '../lib/vault_fs.mjs';
import { withWriteLock } from '../lib/write_lock.mjs';

const WRITE_PROTECTED = new Set(['Identität', 'Grenzen', 'Identity', 'Boundaries']);

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Self-Reflection-Einträge beschreiben immer eine gerade eben passierte
// Korrektur — "jetzt" ist immer das richtige Datum, deshalb setzt der Server
// es selbst statt es dem Modell zu überlassen (geratene Daten sind genau der
// Bug, den das hier schließt). Falls das Modell trotz Anweisung noch einen
// eigenen Datums-Header mitschickt, wird der zuerst entfernt statt verdoppelt.
function withServerDate(content) {
  const date = new Date().toISOString().slice(0, 10);
  const stripped = content.replace(/^\s*(?:DATE:\s*|\*\*[^*\n]+\*\*:\s*)/i, '');
  return `**${date}:** ${stripped.trim()}`;
}

export function register(server, token, soulId = null) {
  server.tool(
    'mind_write',
    [
      'Writes or extends a section in your configuration file (mind.md).',
      '',
      'Writable sections:',
      '- Communication — how you speak and respond',
      '- Intellect — your thinking style and approach',
      '- Tools — available tools and capabilities',
      '- Network — peer interaction rules',
      '- Self-Reflection — what you have learned about this person',
      '',
      'Write-protected (cannot be changed): Identity, Boundaries.',
      '',
      '## SELF-REFLECTION — when to write IMMEDIATELY:',
      'When the user says: "that doesn\'t fit", "reflect on yourself", "not like that", "that\'s wrong",',
      '"you misunderstood me", "change your approach", "that was off", "no",',
      'or otherwise expresses criticism or correction of your response:',
      '1. First call mind_read to know the current state.',
      '2. Analyse CRITICALLY: What did I do wrong? Why? What does this person expect?',
      '3. DEDUP CHECK (required): Is there already an entry describing the same core principle — even in different words? If YES → do not write. The principle is already learned.',
      '4. Only if the principle is genuinely new: write with mode="prepend".',
      '',
      'Format for Self-Reflection entries:',
      '`[What didn\'t fit] → [Why it didn\'t fit] → [What I\'ll do differently next time]`',
      'Do NOT include a date yourself — the server prepends the real current date',
      'automatically for Self-Reflection entries. Never guess/estimate one.',
      '',
      'Only write for real, new insights — not for variations of already learned principles.',
      'Max. 20 entries. The server removes the oldest automatically when the limit is exceeded.',
    ].join('\n'),
    {
      section: z.string().min(1).max(200).describe(
        'Section name without "##", e.g. "Self-Reflection" or "Communication"'
      ),
      content: z.string().min(1).max(50000).describe(
        'New section content (Markdown). Never invent/guess a date or timestamp — omit it or ask the user if unsure. For "Self-Reflection", the server adds the date automatically — do not include one.'
      ),
      mode: z.enum(['replace', 'append', 'prepend'])
        .default('replace')
        .describe('replace = overwrite | append = add to end | prepend = add to start (recommended for logs)'),
    },
    async ({ section, content, mode }) => {
      if (WRITE_PROTECTED.has(section)) {
        return {
          content: [{
            type: 'text',
            text: `Section "${section}" is write-protected and cannot be changed via mind_write.`,
          }],
          isError: true,
        };
      }
      if (section === 'Self-Reflection') {
        content = withServerDate(content);
      }

      try {
        if (soulId) {
          // Eigener Lock-Namespace ("mind:") — mind.md ist eine andere Datei
          // als sys.md, muss also nicht gegen sys.md-Writes serialisieren,
          // aber sehr wohl gegen andere gleichzeitige mind_write-Aufrufe für
          // dieselbe Soul (sonst genau das Lost-Update-Muster, siehe
          // lib/write_lock.mjs).
          return await withWriteLock(`mind:${soulId}`, async () => {
          const mindPath = `${SOULS_DIR}${soulId}/vault/context/mind.md`;
          const { vaultKeyHex, cipherMode } = await loadVaultMeta(soulId);
          let md;
          let raw = null;
          try {
            raw = await readFile(mindPath);
          } catch {
            // mind.md existiert noch nicht → leer starten
            md = '';
          }
          if (raw) {
            try {
              md = decryptIfNeeded(raw, vaultKeyHex).toString('utf8');
            } catch (err) {
              return {
                content: [{ type: 'text', text: `mind_write fehlgeschlagen: ${err.message}` }],
                isError: true,
              };
            }
          }

          const re = new RegExp(
            `(## ${escapeRegex(section)}[ \\t]*\\n)([\\s\\S]*?)(?=\\n## |$)`
          );

          if (re.test(md)) {
            md = md.replace(re, (_, h, existing) => {
              const trim = existing.trim();
              let body;
              if (mode === 'prepend')     body = trim ? `${content}\n\n${trim}` : content;
              else if (mode === 'append') body = trim ? `${trim}\n\n${content}` : content;
              else                        body = content;
              return `${h}${body.trim()}\n\n`;
            });
          } else {
            md = md.trimEnd() + `\n\n## ${section}\n${content.trim()}\n`;
          }

          await mkdir(`${SOULS_DIR}${soulId}/vault/context`, { recursive: true });
          let outBuf = Buffer.from(md, 'utf8');
          if (cipherMode === 'ciphered' && vaultKeyHex) outBuf = encryptBuf(outBuf, vaultKeyHex);
          await writeFile(mindPath, outBuf);

          const verb = mode === 'replace' ? 'replaced' : mode === 'append' ? 'extended (end)' : 'extended (start)';
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                ok: true,
                section,
                mode,
                message: `Section "${section}" in mind.md ${verb}.`,
              }, null, 2),
            }],
          };
          }); // withWriteLock
        }

        // Fallback: API (only when soulId is unknown)
        const result = await putJson('/api/mind', token, { section, content, mode });
        if (!result?.ok) {
          return {
            content: [{ type: 'text', text: `Write error: ${JSON.stringify(result)}` }],
            isError: true,
          };
        }
        const verb = mode === 'replace' ? 'replaced' : mode === 'append' ? 'extended (end)' : 'extended (start)';
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              section,
              mode,
              message: `Section "${section}" in mind.md ${verb}.`,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `mind_write error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
