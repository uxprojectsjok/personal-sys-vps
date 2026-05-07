/**
 * soul_read — Peer-Variante für Verbundene Souls (trusted peers).
 * Liest direkt vom Dateisystem, bypasses OpenResty-Auth.
 * Liefert nur den <!-- AGENT:START --> ... <!-- AGENT:END --> Block.
 */

import { readFile } from 'fs/promises';
import crypto from 'crypto';

const SOULS_DIR    = '/var/lib/sys/souls/';
const MAGIC        = Buffer.from([0x53, 0x59, 0x53, 0x01]); // SYS\x01
const AGENT_START  = '<!-- AGENT:START -->';
const AGENT_END    = '<!-- AGENT:END -->';

export function register(server, targetSoulId) {
  server.tool(
    'soul_read',
    [
      'Liest den öffentlichen Soul-Inhalt (Agent-Bereich von sys.md).',
      'Gibt nur den explizit freigegebenen Abschnitt zurück.',
      '',
      'WICHTIG: soul_read zu Beginn jeder Sitzung aufrufen, bevor geantwortet wird.',
    ].join('\n'),
    {},
    async () => {
      try {
        // api_context für optionalen Vault-Key laden
        let vaultKeyHex = '';
        try {
          const raw = await readFile(`${SOULS_DIR}${targetSoulId}/api_context.json`, 'utf8');
          const ctx = JSON.parse(raw);
          vaultKeyHex = ctx?.vault_key_hex || '';
        } catch { /* kein api_context oder kein Key */ }

        let buf = await readFile(`${SOULS_DIR}${targetSoulId}/sys.md`);

        // Verschlüsselung prüfen (Magic: SYS\x01)
        if (buf.slice(0, 4).equals(MAGIC)) {
          if (!vaultKeyHex) {
            return {
              content: [{ type: 'text', text: 'sys.md ist verschlüsselt — Soul muss einmal im SYS-Browser entsperrt werden.' }],
              isError: true,
            };
          }
          const key        = Buffer.from(vaultKeyHex, 'hex');
          const iv         = buf.slice(4, 20);
          const ciphertext = buf.slice(20);
          const decipher   = crypto.createDecipheriv('aes-256-cbc', key, iv);
          buf = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        }

        const md  = buf.toString('utf8');
        const s   = md.indexOf(AGENT_START);
        const e   = md.indexOf(AGENT_END);

        if (s === -1 || e === -1 || e <= s) {
          return {
            content: [{ type: 'text', text: 'Kein Agent-Bereich definiert (<!-- AGENT:START --> fehlt).' }],
            isError: true,
          };
        }

        const agentContent = md.slice(s + AGENT_START.length, e).trim();
        if (!agentContent) {
          return {
            content: [{ type: 'text', text: 'Agent-Bereich ist leer.' }],
            isError: true,
          };
        }

        return { content: [{ type: 'text', text: agentContent }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `soul_read fehlgeschlagen: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
