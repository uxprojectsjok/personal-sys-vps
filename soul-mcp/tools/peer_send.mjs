/**
 * peer_send — Sendet eine Nachricht (Text oder Datei) an einen oder alle Peers.
 * Schreibt <!-- @msg --> in den SOCIAL-Block von sys.md.
 * Bei Datei-Anhang: Upload in vault_shared → vault-shared:// Link in Nachricht.
 */

import { z } from 'zod';
import { writeFile, mkdir } from 'fs/promises';
import { getText, putJson, getJson } from '../lib/api.mjs';
import { SOULS_DIR } from '../lib/vault_fs.mjs';

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

async function uploadToVaultShared(soulId, filename, data_b64) {
  const safe = filename.replace(/[^A-Za-z0-9_\-.]/g, '_').replace(/_{2,}/g, '_');
  if (!safe) throw new Error('Ungültiger Dateiname');
  const buf = Buffer.from(data_b64, 'base64');
  if (buf.length > 50 * 1024 * 1024) throw new Error('Datei zu groß (max. 50 MB)');
  const storedName = `${Date.now()}_${safe}`;
  const dir = `${SOULS_DIR}${soulId}/vault_shared`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/${storedName}`, buf);
  return { storedName, sizeKb: Math.ceil(buf.length / 1024) };
}

export function register(server, token, soulId = null) {
  const sysUrl = process.env.SYS_API_URL || 'https://me.uxprojects-jok.com';

  server.tool(
    'peer_send',
    [
      'Sendet Text oder Datei an einen Peer (wie ein Messenger).',
      '',
      '── TEXT ────────────────────────────────────────────────────────────────',
      'Direkt senden: to + message → fertig.',
      'Beispiel: "@peer Till Bis morgen!" → to="Till", message="Bis morgen!"',
      '',
      '── DATEI / BILD ────────────────────────────────────────────────────────',
      'Claude AI kann keine Datei-Bytes aus dem Chat extrahieren.',
      'Workflow (automatisch ausführen, keine Rückfrage ob der User zustimmt):',
      '',
      'SCHRITT 1: Frage den User:',
      `  "Für die Datei brauche ich den SYS Chat. Öffne kurz: ${sysUrl}`,
      '   Schick die Datei dort — ich warte auf dein OK."',
      '',
      'SCHRITT 2: Warte bis User "ok", "fertig" oder "done" schreibt.',
      '',
      'SCHRITT 3: vault_shared_list aufrufen → neueste Datei zeigen:',
      '  "Gefunden: foto.jpg (2.1 MB, vor 30 Sek.) — an Till schicken?"',
      '',
      'SCHRITT 4: Nach Bestätigung → peer_send mit vault_filename aufrufen.',
      '',
      'vault_filename = bereits hochgeladene Datei in vault_shared (z.B. "1749123_foto.jpg")',
    ].join('\n'),
    {
      to: z.string().min(1).max(200)
           .describe('Empfänger: Peer-Name (z.B. "Till"), "alle" für alle Peers, "community", "agent"'),
      message: z.string().max(5000).optional()
                .describe('Nachrichtentext (optional wenn Datei angegeben)'),
      vault_filename: z.string().max(200).optional()
                      .describe('Dateiname einer bereits in vault_shared hochgeladenen Datei (z.B. "1749123456789_bericht.pdf") — Peer erhält direkten Download-Link'),
      filename: z.string().max(120).optional()
                 .describe('Dateiname inkl. Endung — nur zusammen mit data_b64 für programmatischen Upload'),
      data_b64: z.string().optional()
                 .describe('Dateiinhalt als Base64 — nur verwenden wenn raw bytes wirklich verfügbar sind, nicht für Claude AI Chat-Uploads'),
    },
    async ({ to, message, vault_filename, filename, data_b64 }) => {
      if (!message && !data_b64 && !vault_filename) {
        return { content: [{ type: 'text', text: 'message, vault_filename oder data_b64 erforderlich.' }], isError: true };
      }
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

          // Datei referenzieren oder hochladen
          let fileLink = '';
          let uploadInfo = '';
          if (vault_filename) {
            // Bereits hochgeladene Datei referenzieren
            if (!soulId) {
              return { content: [{ type: 'text', text: 'vault_filename nicht verfügbar (kein soulId).' }], isError: true };
            }
            const safe = vault_filename.replace(/[^A-Za-z0-9_\-.]/g, '_');
            const displayName = vault_filename.replace(/^\d+_/, ''); // Timestamp-Prefix entfernen
            fileLink = `[${displayName}](vault-shared://${soulId}/${safe})`;
            uploadInfo = ` + Datei (vault_shared)`;
          } else if (data_b64 && filename) {
            // Neue Datei hochladen
            if (!soulId) {
              return { content: [{ type: 'text', text: 'Datei-Upload nicht verfügbar (kein soulId).' }], isError: true };
            }
            const { storedName, sizeKb } = await uploadToVaultShared(soulId, filename, data_b64);
            fileLink = `[${filename}](vault-shared://${soulId}/${storedName})`;
            uploadInfo = ` + Datei (${sizeKb} KB)`;
          }

          const ts      = new Date().toISOString();
          const textPart = message?.trim() || '';
          const fullMsg  = [textPart, fileLink].filter(Boolean).join('\n');
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

          const recipientLabel =
            toField === 'peer'        ? 'alle Peers'
            : toField === 'community' ? 'Community'
            : toField === 'agent'     ? 'Agent-Sandbox'
            : `Peer ${to}`;

          return {
            content: [{ type: 'text', text: `Gesendet an ${recipientLabel}${uploadInfo}.\n[${ts}] Du → ${recipientLabel}\n${fullMsg}` }],
          };
        });
      } catch (err) {
        let msg = err.message;
        try {
          const body = JSON.parse(err.body || '{}');
          if (body.error === 'vault_locked' || body.error === 'encrypted') {
            msg = 'Vault gesperrt — Vault in der App entsperren, dann erneut versuchen.';
          }
        } catch { /* kein JSON */ }
        return { content: [{ type: 'text', text: `Fehler: ${msg}` }], isError: true };
      }
    }
  );
}
