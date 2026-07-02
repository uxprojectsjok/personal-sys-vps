/**
 * calendar_read — Peer/Paid-Variante.
 * Liest sys.md vom Dateisystem und parst den Kalender-Bereich.
 */

import { readFile } from 'fs/promises';
import { decryptIfNeeded, loadVaultMeta, SOULS_DIR } from '../lib/vault_fs.mjs';
import { parseCalendar, parseFrontmatter } from '../lib/soul_parser.mjs';

export function register(server, targetSoulId) {
  server.tool(
    'calendar_read',
    'Liest den Kalender aus der Soul (sys.md) und gibt strukturierte Termine zurück.',
    {},
    async () => {
      try {
        const { vaultKeyHex } = await loadVaultMeta(targetSoulId);

        let buf = await readFile(`${SOULS_DIR}${targetSoulId}/sys.md`);
        buf = decryptIfNeeded(buf, vaultKeyHex);
        const md = buf.toString('utf8');

        const fm = parseFrontmatter(md);
        const { entries, raw } = parseCalendar(md);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              owner:       fm.soul_name ?? fm.name ?? fm.soul_id ?? 'Unknown',
              entry_count: entries.length,
              entries,
              raw_section: raw || '(kein Kalender-Abschnitt gefunden)',
            }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `calendar_read fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}
