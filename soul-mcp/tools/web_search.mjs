import { z } from 'zod';
import { postJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'web_search',
    'Websuche via Brave Search API. Für aktuelle Informationen, Produktrecherche, Faktensuche, Preisverlgeiche. Entspricht dem @suche-Befehl im in-app Chat.',
    {
      query: z.string().min(1).max(300).describe('Suchanfrage'),
      count: z.number().int().min(1).max(8).optional().describe('Anzahl Ergebnisse (default 5, max 8)'),
    },
    async ({ query, count = 5 }) => {
      try {
        const data = await postJson('/api/web-search', token, { query });
        const results = (data.results || []).slice(0, count);
        if (!results.length) {
          return { content: [{ type: 'text', text: `Keine Ergebnisse für: "${query}"` }] };
        }
        const text = results
          .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description}`)
          .join('\n\n');
        return { content: [{ type: 'text', text: `# Suchergebnisse: "${query}"\n\n${text}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Suche fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}
