import { getText } from '../lib/api.mjs';
import { parseCalendar, parseFrontmatter } from '../lib/soul_parser.mjs';

export function register(server, token) {
  server.tool(
    'calendar_read',
    'Liest den Kalender der Person aus sys.md und gibt strukturierte Termine zurück. Erfordert dass der Soul-Inhalt und die Kalender-Berechtigung aktiviert sind.',
    {},
    async () => {
      try {
        const md = await getText('/api/soul', token);
        const fm = parseFrontmatter(md);
        const { entries, raw } = parseCalendar(md);

        const result = {
          owner: fm.name || fm.soul_id || 'Unbekannt',
          entry_count: entries.length,
          entries,
          raw_section: raw || '(kein Kalender-Abschnitt gefunden)',
        };

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: apiErrMsg(err) }], isError: true };
      }
    }
  );
}

function apiErrMsg(err) {
  if (err.status === 403) return 'Kalender-Berechtigung nicht aktiviert oder Vault gesperrt.';
  if (err.status === 401) return 'Token ungültig.';
  return err.message;
}
