import { z } from 'zod';
import { getText, putJson } from '../lib/api.mjs';

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
  const re = new RegExp(
    `(^## ${escapeRe(heading)}[ \\t]*\\n)([\\s\\S]*?)(?=^## |\\s*$)`,
    'm'
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
    return md.replace(re, block(heading, body) + '\n');
  }

  // Sektion existiert nicht → am Ende anhängen
  return md.trimEnd() + '\n\n' + block(heading, newContent) + '\n';
}

export function register(server, token) {
  server.tool(
    'soul_write',
    [
      'Schreibt Inhalt dauerhaft in eine sys.md Sektion.',
      'Anwendungsfälle:',
      '- Session-Protokoll → section "Session-Log", mode "prepend" (neuestes oben)',
      '- Persönlichkeitsprofil → section "Werte & Überzeugungen", mode "replace"',
      '- Neues Thema hinzufügen → mode "replace" (legt Sektion an wenn nicht vorhanden)',
      '- Eintrag ergänzen → mode "append"',
      '',
      'Liest zuerst die aktuelle sys.md, aktualisiert die Sektion und schreibt zurück.',
      'Benötigt soul-Berechtigung.',
    ].join('\n'),
    {
      section: z.string().min(1).max(200).regex(/^[^\n\r]+$/, 'Sektionsname darf keine Zeilenumbrüche enthalten').describe(
        'Name der ## Sektion ohne "##", z.B. "Session-Log" oder "Werte & Überzeugungen"'
      ),
      content: z.string().min(1).max(50000).describe(
        'Markdown-Inhalt. Für Session-Logs: mit Datum-Header beginnen, z.B. "- **2026-04-05:** …"'
      ),
      mode: z.enum(['replace', 'append', 'prepend'])
        .default('replace')
        .describe('replace = Sektion ersetzen | append = ans Ende | prepend = an den Anfang (empfohlen für Logs)'),
    },
    async ({ section, content, mode }) => {
      try {
        // 1. Aktuelle sys.md lesen (Server entschlüsselt; beim Schreiben re-verschlüsselt der Server automatisch)
        const current = await getText('/api/soul', token);

        // 2. Sektion aktualisieren
        const updated = updateSection(current, section, content, mode);

        // 3. Zurückschreiben via /api/context PUT
        const result = await putJson('/api/context', token, { soul_content: updated });

        if (!result?.ok) {
          return {
            content: [{ type: 'text', text: `Fehler beim Schreiben: ${JSON.stringify(result)}` }],
            isError: true,
          };
        }

        const verb = mode === 'replace' ? 'ersetzt' : mode === 'append' ? 'erweitert (Ende)' : 'erweitert (Anfang)';
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              section: `## ${section}`,
              mode,
              message: `Sektion "${section}" ${verb}. Änderung ist sofort in sys.md aktiv.`,
            }, null, 2),
          }],
        };
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
