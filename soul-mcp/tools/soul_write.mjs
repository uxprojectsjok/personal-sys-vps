import { z } from 'zod';
import { getText, putJson } from '../lib/api.mjs';

// Per-soul write serializer — verhindert Race Conditions bei parallelen soul_write-Calls
const _queues = new Map();
async function withSoulLock(token, fn) {
  const key = token.slice(0, 16);
  const prev = _queues.get(key) ?? Promise.resolve();
  let resolveCurrent;
  const current = new Promise(r => { resolveCurrent = r; });
  _queues.set(key, prev.then(() => current));
  await prev;
  try { return await fn(); } finally { resolveCurrent(); }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Aktualisiert eine ## Sektion in einem Markdown-Dokument.
 * - mode "replace"  → Sektionsinhalt wird vollständig ersetzt
 * - mode "append"   → neuer Inhalt wird ans Ende der Sektion gehängt
 * - mode "prepend"  → neuer Inhalt wird an den Anfang der Sektion gestellt
 * Existiert die Sektion nicht, wird sie am Ende des Dokuments angelegt.
 */
function updateSection(md, heading, newContent, mode) {
  // CRLF normalisieren (Windows-Zeilenenden) + trailing whitespace entfernen
  md = md.replace(/\r\n/g, '\n').trimEnd();

  const re = new RegExp(
    `(## ${escapeRe(heading)}[ \\t]*\\n)([\\s\\S]*?)(?=\\n## |$)`
  );
  const match = md.match(re);

  const block = (h, body) => `## ${h}\n${body.trim()}\n`;

  if (match) {
    const existing = match[2].trim();
    let body;
    if (mode === 'replace') {
      body = newContent;
    } else if (mode === 'prepend') {
      body = newContent + (existing ? '\n\n' + existing : '');
    } else {
      // append (default)
      body = (existing ? existing + '\n\n' : '') + newContent;
    }
    // Replacement-Funktion statt String verhindert $1/$&/$' Sonderzeichen-Interpretation
    const replacement = block(heading, body) + '\n';
    return md.replace(re, () => replacement);
  }

  // Sektion existiert nicht → am Ende anhängen
  return md + '\n\n' + block(heading, newContent) + '\n';
}

export function register(server, token) {
  server.tool(
    'soul_write',
    [
      'Writes content permanently to a sys.md section.',
      'Use cases:',
      '- Session log → section "Session Log", mode "prepend" (newest at top)',
      '- Personality profile → section "Values & Beliefs", mode "replace"',
      '- Add new topic → mode "replace" (creates section if not present)',
      '- Extend entry → mode "append"',
      '',
      'Reads the current sys.md first, updates the section, and writes back.',
      'Requires soul permission.',
    ].join('\n'),
    {
      section: z.string().min(1).max(200).regex(/^[^\n\r]+$/, 'Section name must not contain line breaks').describe(
        'Name of the ## section without "##", e.g. "Session Log" or "Values & Beliefs"'
      ),
      content: z.string().min(1).max(50000).describe(
        'Markdown content. For session logs: start with a date header, e.g. "- **2026-04-05:** …"'
      ),
      mode: z.enum(['replace', 'append', 'prepend'])
        .default('replace')
        .describe('replace = overwrite section | append = add to end | prepend = add to start (recommended for logs)'),
    },
    async ({ section, content, mode }) => {
      try {
        return await withSoulLock(token, async () => {
        // 1. Aktuelle sys.md lesen (Server entschlüsselt; beim Schreiben re-verschlüsselt der Server automatisch)
        const current = await getText('/api/soul', token);

        // 2. Sektion aktualisieren
        const updated = updateSection(current, section, content, mode);

        // 3. Zurückschreiben via /api/context PUT
        const result = await putJson('/api/context', token, { soul_content: updated });

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
              section: `## ${section}`,
              mode,
              message: `Section "${section}" ${verb}. Change is immediately active in sys.md.`,
            }, null, 2),
          }],
        };
        }); // withSoulLock
      } catch (err) {
        let msg = err.message;
        try {
          const body = JSON.parse(err.body || '{}');
          if (body.error === 'vault_locked' || body.error === 'encrypted') {
            msg = `Vault gesperrt — Vault-Session öffnen bevor soul_write aufgerufen wird. Nutzer muss Vault in der App entsperren (Passkey oder 12 Wörter). (${body.message || body.error})`;
          } else if (body.error === 'encryption_failed') {
            msg = `Verschlüsselung fehlgeschlagen — vault_key_hex fehlt auf dem Server. Vault in der App entsperren und sys.md einmal synchronisieren, dann erneut versuchen. (${body.message || ''})`;
          } else if (body.error === 'decryption_failed') {
            msg = `Entschlüsselung fehlgeschlagen — Vault mit korrektem Schlüssel öffnen und sys.md erneut synchronisieren. (${body.message || ''})`;
          } else if (body.message) {
            msg = body.message;
          }
        } catch { /* body kein JSON */ }
        if (err.status === 401) msg += ' – Token ungültig oder abgelaufen.';
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    }
  );
}
