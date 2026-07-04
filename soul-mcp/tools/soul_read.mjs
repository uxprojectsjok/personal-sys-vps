import { getText } from '../lib/api.mjs';
import { extractLongmem, extractLongmemIndex, queryLongmem } from '../lib/soul_parser.mjs';

export function register(server, token) {
  server.tool(
    'soul_read',
    [
      'Reads the complete soul content (sys.md): personality, values, biography, projects, goals, communication style.',
      '',
      'IMPORTANT – behavioural rule for the AI agent:',
      '1. Call soul_read AT THE START OF EVERY SESSION, before responding.',
      '   The soul is the user\'s memory. Without soul_read you respond without context.',
      '2. During the conversation: reference soul content. Do not ask questions the soul already answers.',
      '3. AFTER meaningful conversations call soul_write when:',
      '   - Important decisions, new projects, or goals were discussed',
      '   - The user shared something about themselves that is missing from the soul',
      '   - Progress on known projects was mentioned',
      '   - An experience or insight is relevant long-term',
      '   For session logs: section="Session Log", mode="prepend", start with a date.',
      '4. Do NOT call soul_write for: factual questions, short answers, when user objects.',
    ].join('\n'),
    {},
    async () => {
      try {
        const text = await getText('/api/soul', token);
        const longmem = extractLongmem(text);
        const index   = longmem ? extractLongmemIndex(text) : null;
        const digest  = longmem
          ? [
              queryLongmem(longmem, index, { dimension: 'facts', x_minScore: 4, limit: 8 }).formatted,
              queryLongmem(longmem, index, { dimension: 'memories', limit: 5 }).formatted,
            ].filter(Boolean).join('\n')
          : '';
        const output = digest
          ? `## Kern-Kontext (indexbasiert, Top-Facts + neueste Erinnerungen)\n${digest}\n\n---\n\n${text}`
          : text;
        return { content: [{ type: 'text', text: output }] };
      } catch (err) {
        return { content: [{ type: 'text', text: apiErrMsg(err) }], isError: true };
      }
    }
  );
}

function apiErrMsg(err) {
  if (err.status === 403) return 'Vault ist gesperrt oder Berechtigung fehlt. Bitte Vault in der SYS App entsperren.';
  if (err.status === 401) return 'Token ungültig oder abgelaufen.';
  return err.message;
}
