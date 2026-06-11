/**
 * peer_send — Sendet eine Nachricht an einen oder alle Peers.
 * Schreibt <!-- @msg --> in den SOCIAL-Block von sys.md.
 * Gleicher Mechanismus wie der sys-Chat im Browser.
 */

import { z } from 'zod';
import { getText, putJson, getJson } from '../lib/api.mjs';

// Race-Condition-Schutz (identisch zu soul_write.mjs)
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

const SOCIAL_START = '<!-- SOCIAL:START -->';
const SOCIAL_END   = '<!-- SOCIAL:END -->';
const AGENT_START  = '<!-- AGENT:START -->';
const AGENT_END    = '<!-- AGENT:END -->';

function appendToBlock(md, startMarker, endMarker, entry) {
  const s = md.indexOf(startMarker);
  const e = md.indexOf(endMarker);
  if (s !== -1 && e !== -1 && e > s) {
    return md.slice(0, e) + entry + '\n' + md.slice(e);
  }
  return md.trimEnd() + '\n\n' + startMarker + entry + '\n' + endMarker + '\n';
}

export function register(server, token) {
  server.tool(
    'peer_send',
    [
      'Sendet eine Nachricht an einen oder alle Peers (wie WhatsApp-Nachricht).',
      'Die Nachricht landet im SOCIAL-Block von sys.md und ist für verbundene Peers sichtbar.',
      '',
      'Beispiele:',
      '- "Schreibe an Till: Bis morgen!" → to="Till", message="Bis morgen!"',
      '- "@alle Wer ist dabei?" → to="alle", message="Wer ist dabei?"',
      '- Nachricht an den Agent-Sandbox → to="agent"',
    ].join('\n'),
    {
      to: z.string().min(1).max(200)
           .describe('Empfänger: Peer-Name (z.B. "Till"), "alle" für alle Peers, "community", "agent"'),
      message: z.string().min(1).max(5000)
                .describe('Die Nachricht'),
    },
    async ({ to, message }) => {
      try {
        return await withSoulLock(token, async () => {
          const toNorm = to.trim().toLowerCase();
          let toField;

          if (['alle', 'all', 'peer', 'peers'].includes(toNorm)) {
            toField = 'peer';
          } else if (toNorm === 'community') {
            toField = 'community';
          } else if (toNorm === 'agent') {
            toField = 'agent';
          } else {
            // Peer-Name → soul_id auflösen
            const { connections } = await getJson('/api/vault/connections', token);
            const match = (connections || []).find(c =>
              c.alias?.toLowerCase() === toNorm ||
              c.alias?.toLowerCase().startsWith(toNorm) ||
              c.soul_id?.toLowerCase().startsWith(toNorm)
            );
            if (!match) {
              const available = (connections || []).map(c => c.alias).filter(Boolean).join(', ') || '(keine)';
              return {
                content: [{ type: 'text', text: `Peer "${to}" nicht gefunden.\nVerfügbare Peers: ${available}` }],
                isError: true,
              };
            }
            toField = match.soul_id;
          }

          const ts      = new Date().toISOString();
          // --> in Nachrichten escapen damit der HTML-Kommentar nicht gebrochen wird
          const safeMsg = message.trim().replace(/-->/g, '-- >');
          const entry   = `\n<!-- @msg ${ts} me ${toField} ${safeMsg} -->`;

          // sys.md lesen
          const current = await getText('/api/soul', token);

          // In SOCIAL-Block schreiben
          let updated = appendToBlock(current, SOCIAL_START, SOCIAL_END, entry);

          // Bei community/agent zusätzlich in AGENT-Block
          if (toField === 'agent' || toField === 'community') {
            updated = appendToBlock(updated, AGENT_START, AGENT_END, entry);
          }

          // Zurückschreiben
          const result = await putJson('/api/context', token, { soul_content: updated });
          if (!result?.ok) {
            return {
              content: [{ type: 'text', text: `Fehler beim Speichern: ${JSON.stringify(result)}` }],
              isError: true,
            };
          }

          const recipientLabel =
            toField === 'peer'      ? 'alle Peers'
            : toField === 'community' ? 'Community'
            : toField === 'agent'     ? 'Agent-Sandbox'
            : `Peer ${to}`;

          return {
            content: [{ type: 'text', text: `Nachricht an ${recipientLabel} gesendet.\n[${ts}] Du → ${recipientLabel}\n${message}` }],
          };
        });
      } catch (err) {
        let msg = err.message;
        try {
          const body = JSON.parse(err.body || '{}');
          if (body.error === 'vault_locked' || body.error === 'encrypted') {
            msg = `Vault gesperrt — Vault in der App entsperren, dann erneut versuchen.`;
          }
        } catch { /* kein JSON */ }
        return { content: [{ type: 'text', text: `Fehler: ${msg}` }], isError: true };
      }
    }
  );
}
