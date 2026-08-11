/**
 * peer_send — Sendet eine Textnachricht an einen oder alle Peers.
 * Schreibt <!-- @msg --> in den SOCIAL-Block von sys.md. Bewusst text-only —
 * Datei-/Bild-Anhänge deckt SYS strukturell nicht besser ab als bestehende
 * Messenger, deshalb entfernt (siehe vorheriger vault_filename/data_b64-Anhang-
 * Code, git history).
 * Namensauflösung über zwei Quellen: connected_souls.json (alte direkte
 * Soul-zu-Soul-Verbindungen, siehe project_sys_v2_vision Memory) UND jede
 * Soul, die über einen gemeinsamen Gatekeeper erreichbar ist — siehe
 * lib/gatekeeper_peers.mjs.
 */

import { z } from 'zod';
import { getText, putJson, verificationRequiredMsg } from '../lib/api.mjs';
import { loadConnected } from '../lib/connected_souls.mjs';
import { resolveGatekeeperPeers } from '../lib/gatekeeper_peers.mjs';

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

export function register(server, token, soulId = null) {
  server.tool(
    'peer_send',
    [
      'Sendet eine Textnachricht an einen Peer (wie ein Messenger, text-only).',
      'Direkt senden: to + message → fertig.',
      'Beispiel: "@peer Till Bis morgen!" → to="Till", message="Bis morgen!"',
    ].join('\n'),
    {
      to: z.string().min(1).max(200)
           .describe('Empfänger: Peer-Name (z.B. "Till"), "alle" für alle Peers, "community", "agent"'),
      message: z.string().min(1).max(5000)
                .describe('Nachrichtentext'),
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
            if (!soulId) {
              return { content: [{ type: 'text', text: 'Peer-Auflösung nicht verfügbar (kein soulId).' }], isError: true };
            }
            // Zwei unabhängige Quellen: die alten 1:1-Connections UND jede Soul,
            // die über einen gemeinsamen Gatekeeper erreichbar ist (Geschwister-
            // Spokes + der Gatekeeper selbst, siehe gatekeeper_peers.mjs).
            const connected = await loadConnected(soulId);
            const candidates = Object.entries(connected)
              .filter(([, e]) => e.status === 'accepted')
              .map(([id, e]) => ({ id, alias: e.alias }));
            const gkPeers = await resolveGatekeeperPeers(soulId, token).catch(() => []);
            for (const p of gkPeers) candidates.push({ id: p.soul_id, alias: p.name });

            const match = candidates.find(({ id, alias }) =>
              (alias || '').toLowerCase() === toNorm ||
              (alias || '').toLowerCase().startsWith(toNorm) ||
              id.toLowerCase().startsWith(toNorm)
            );
            if (!match) {
              const available = candidates.map(c => c.alias).filter(Boolean).join(', ') || '(keine)';
              return {
                content: [{ type: 'text', text: `Peer "${to}" nicht gefunden.\nVerfügbare Peers: ${available}` }],
                isError: true,
              };
            }
            toField = match.id;
          }

          const ts = new Date().toISOString();
          const fullMsg = message.trim();
          if (!fullMsg) {
            return { content: [{ type: 'text', text: 'Leere Nachricht.' }], isError: true };
          }
          const safeMsg = fullMsg.replace(/-->/g, '-- >');
          const entry   = `\n<!-- @msg ${ts} me ${toField} ${safeMsg} -->`;

          const current = await getText('/api/soul', token);
          let updated = appendToBlock(current, SOCIAL_START, SOCIAL_END, entry);

          if (toField === 'agent' || toField === 'community') {
            updated = appendToBlock(updated, AGENT_START, AGENT_END, entry);
          }

          const result = await putJson('/api/context', token, { soul_content: updated });
          if (!result?.ok) {
            return {
              content: [{ type: 'text', text: `Fehler beim Speichern: ${JSON.stringify(result)}` }],
              isError: true,
            };
          }

          const isIndividual = !['peer', 'community', 'agent'].includes(toField);
          const recipientLabel =
            toField === 'peer'        ? 'alle Peers'
            : toField === 'community' ? 'Community'
            : toField === 'agent'     ? 'Agent-Sandbox'
            : `Peer ${to} (soul_id: ${toField})`;

          // Beantwortet proaktiv "wo wurde das hingeschickt?" — peer_send
          // sendet nicht aktiv, sondern schreibt die Nachricht ins EIGENE
          // sys.md (SOCIAL-Block), adressiert an die Ziel-soul_id. Die
          // Gegenseite (oder wer für sie peer_inbox aufruft) holt sie erst
          // beim nächsten peer_inbox-Aufruf ab — kein Push, kein Node-Hop
          // bei diesem Schritt.
          const mechanismNote = isIndividual
            ? ` In dein eigenes sys.md geschrieben (SOCIAL-Block), adressiert an soul_id ${toField} — kein aktiver Versand: ${to} (bzw. wer für die Soul peer_inbox aufruft) holt die Nachricht beim nächsten peer_inbox-Aufruf ab.`
            : '';

          return {
            content: [{ type: 'text', text: `Gesendet an ${recipientLabel}.${mechanismNote}\n[${ts}] Du → ${recipientLabel}\n${fullMsg}` }],
          };
        });
      } catch (err) {
        let msg = err.message;
        const vr = verificationRequiredMsg(err);
        if (vr) {
          msg = vr;
        } else {
          try {
            const body = JSON.parse(err.body || '{}');
            if (body.error === 'vault_locked' || body.error === 'encrypted') {
              msg = 'Vault gesperrt — Vault in der App entsperren, dann erneut versuchen.';
            }
          } catch { /* kein JSON */ }
        }
        return { content: [{ type: 'text', text: `Fehler: ${msg}` }], isError: true };
      }
    }
  );
}
