import { z } from 'zod';
import { getText, putJson } from '../lib/api.mjs';
import { withWriteLock, writeLockKey } from '../lib/write_lock.mjs';

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Three-sphere protection model (see README "sys.md Format" / docs/spec/sys_md.md):
// Social Sphere and Agent Sandbox content lives between these delimiter comments.
// A naive section replace/append/prepend on raw section text silently drops or
// misplaces them (append/prepend land content outside the markers; replace
// without them collapses the sphere to plain, unprotected text) — that broke
// the Agent Sandbox in practice: soul_write mode="replace" on "Agent Sandbox"
// stripped <!-- AGENT:START/END -->, and the chat UI stopped rendering the
// section because it relies on the markers to recognize it.
const SPHERE_MARKERS = [
  { start: '<!-- SOCIAL:START -->', end: '<!-- SOCIAL:END -->' },
  { start: '<!-- AGENT:START -->',  end: '<!-- AGENT:END -->' },
];

// If the section's existing content is wrapped in a recognized sphere marker
// pair, returns the inner content plus a `wrap()` to re-apply the same
// markers around whatever body the caller computes next. Sections without
// markers pass through unchanged.
function unwrapSphere(existing) {
  for (const { start, end } of SPHERE_MARKERS) {
    const s = existing.indexOf(start);
    const e = existing.indexOf(end);
    if (s !== -1 && e !== -1 && e > s) {
      const inner = existing.slice(s + start.length, e).trim();
      return { inner, wrap: (body) => `${start}\n${body}\n${end}` };
    }
  }
  return { inner: existing, wrap: (body) => body };
}

/**
 * Aktualisiert eine ## Sektion in einem Markdown-Dokument.
 * - mode "replace"  → Sektionsinhalt wird vollständig ersetzt
 * - mode "append"   → neuer Inhalt wird ans Ende der Sektion gehängt
 * - mode "prepend"  → neuer Inhalt wird an den Anfang der Sektion gestellt
 * Existiert die Sektion nicht, wird sie am Ende des Dokuments angelegt.
 * Social-Sphere-/Agent-Sandbox-Marker in der bestehenden Sektion bleiben dabei
 * erhalten — die Operation wirkt auf den Inhalt zwischen den Markern, nicht
 * auf den rohen Sektionstext (siehe unwrapSphere).
 */
// Exportiert für gatekeeper_proxy.mjs' wired_soul_write — dieselbe reine
// Sektions-Update-Logik, nur mit einem anderen Fetch-Layer (fetchApi mit
// node_url statt getText/putJson, die fest an den eigenen Node gebunden
// sind) angewendet auf eine verdrahtete statt die eigene Soul.
export function updateSection(md, heading, newContent, mode) {
  // CRLF normalisieren (Windows-Zeilenenden) + trailing whitespace entfernen
  md = md.replace(/\r\n/g, '\n').trimEnd();

  const re = new RegExp(
    `(## ${escapeRe(heading)}[ \\t]*\\n)([\\s\\S]*?)(?=\\n## |$)`
  );
  const match = md.match(re);

  const block = (h, body) => `## ${h}\n${body.trim()}\n`;

  if (match) {
    const rawExisting = match[2].trim();
    const { inner: existing, wrap } = unwrapSphere(rawExisting);
    // Caller already supplied their own markers (marker-aware tool/agent) — trust it verbatim.
    const newHasOwnMarkers = SPHERE_MARKERS.some(({ start }) => newContent.includes(start));
    let body;
    if (mode === 'replace') {
      body = newHasOwnMarkers ? newContent : wrap(newContent);
    } else if (mode === 'prepend') {
      body = newHasOwnMarkers ? newContent : wrap(newContent + (existing ? '\n\n' + existing : ''));
    } else {
      // append (default)
      body = newHasOwnMarkers ? newContent : wrap((existing ? existing + '\n\n' : '') + newContent);
    }
    // Replacement-Funktion statt String verhindert $1/$&/$' Sonderzeichen-Interpretation
    const replacement = block(heading, body) + '\n';
    return md.replace(re, () => replacement);
  }

  // Sektion existiert nicht → am Ende anhängen
  return md + '\n\n' + block(heading, newContent) + '\n';
}

// Three-Sphere-Protokoll (docs/spec/sys_md.md): Social Sphere ist zu 100%
// strukturierte <!-- @msg {ISO-ts} {from} {to} {content} -->-Einträge, für
// die peer_send bereits Zeitstempel, from/to und Escaping korrekt erzeugt —
// über soul_write/wired_soul_write hätte ein Modell diese Syntax von Hand
// nachbauen müssen, was wiederholt zu protokollwidrigen Feldern geführt hat
// (falsche/geratene Timestamps, falsche from/to-Werte, fehlende Marker).
// Zusätzlich: ein handgetippter "<!-- @msg"-Marker in JEDER Sektion (auch
// Agent Sandbox, das freien Bio-Text und paid-agent-@msg-Einträge mischt)
// wird abgelehnt, statt eine kaputte/gefälschte Nachricht zuzulassen.
const PROTOCOL_MANAGED_SECTIONS = new Set(['Social Sphere']);
const MSG_MARKER = '<!-- @msg';

export function checkMessageProtocolViolation(section, content) {
  if (PROTOCOL_MANAGED_SECTIONS.has(section)) {
    return `Section "${section}" is protocol-managed (structured <!-- @msg --> entries only) and cannot be edited directly — use peer_send instead, it generates the correct timestamp/from/to fields automatically.`;
  }
  if (content.includes(MSG_MARKER)) {
    return `Content contains a hand-written "${MSG_MARKER}" marker. Structured message entries must be generated by peer_send (or soul_paid_comment for Agent Sandbox), never hand-typed — they need a real server-side timestamp and correct from/to fields. Use the dedicated messaging tool, or remove the marker if unintentional.`;
  }
  return null;
}

export function register(server, token, soulId = null) {
  // Gemeinsamer Schreib-Lock (lib/write_lock.mjs) — siehe Kommentar dort für
  // den Live-Bug (Lost-Update zwischen soul_write/peer_send/wired_*), der
  // das nötig gemacht hat.
  const lockSoulId = soulId || token.split('.')[0] || token.slice(0, 16);
  server.tool(
    'soul_write',
    [
      'Writes content permanently to a sys.md section.',
      'Use cases:',
      '- Session log → use session_end instead, NOT this tool — it timestamps automatically',
      '  with the real server date/time. Only use soul_write on "Session Log (compressed)"',
      '  directly if session_end genuinely does not fit (e.g. bulk edit/cleanup).',
      '- Personality profile → section "Values & Beliefs", mode "replace"',
      '- Add new topic → mode "replace" (creates section if not present)',
      '- Extend entry → mode "append"',
      '',
      'NEVER use this for messages: "Social Sphere" is rejected outright — use peer_send,',
      'it builds the correct <!-- @msg {ISO-ts} {from} {to} {content} --> entry with a real',
      'server timestamp. Hand-typing an "<!-- @msg" marker into ANY section (incl. Agent',
      'Sandbox) is rejected too — that has repeatedly produced protocol-violating fields',
      '(wrong/guessed timestamps, wrong from/to). Use peer_send / soul_paid_comment instead.',
      '',
      'WICHTIG — never guess dates/timestamps: if content should include a date or time',
      'and you are not already certain of it from verified context (e.g. a timestamp you',
      'just read from this soul, or something the user just told you), do NOT estimate it',
      'from conversational flow. Ask the user, or omit the date rather than guess one.',
      '',
      'Reads the current sys.md first, updates the section, and writes back.',
      'Requires soul permission.',
    ].join('\n'),
    {
      section: z.string().min(1).max(200).regex(/^[^\n\r]+$/, 'Section name must not contain line breaks').describe(
        'Name of the ## section without "##", e.g. "Session Log (compressed)" or "Values & Beliefs"'
      ),
      content: z.string().min(1).max(50000).describe(
        'Markdown content. Never invent/guess a date or timestamp here — omit it or ask the user if unsure.'
      ),
      mode: z.enum(['replace', 'append', 'prepend'])
        .default('replace')
        .describe('replace = overwrite section | append = add to end | prepend = add to start (recommended for logs)'),
    },
    async ({ section, content, mode }) => {
      const violation = checkMessageProtocolViolation(section, content);
      if (violation) {
        return { content: [{ type: 'text', text: violation }], isError: true };
      }
      try {
        return await withWriteLock(writeLockKey(lockSoulId), async () => {
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
        }); // withWriteLock
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
