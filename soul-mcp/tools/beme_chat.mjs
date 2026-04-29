/**
 * beme_chat – Gespräch mit der eigenen Soul
 *
 * Sendet eine Nachricht an die Soul und erhält eine Antwort,
 * die die Soul-Persönlichkeit vollständig verkörpert.
 * So können Menschen Gespräche mit sich selbst führen.
 */

import { postJson } from '../lib/api.mjs';
import { z } from 'zod';

export function register(server, token) {
  server.tool(
    'beme_chat',
    [
      'Gespräch mit der eigenen Soul – die KI antwortet als du selbst.',
      '',
      'Einsatzzwecke:',
      '- Selbstreflexion: Wie würde ich selbst auf diese Frage antworten?',
      '- Perspektivwechsel: Was denke ich wirklich über dieses Thema?',
      '- Entscheidungshilfe: Meine eigene Stimme zu einem Dilemma hören.',
      '- Anderen ermöglichen, mit dem digitalen Abbild zu sprechen.',
      '',
      'Verhaltensregeln:',
      '- Die Soul antwortet immer in erster Person, ohne sich als KI zu erkennen zu geben.',
      '- history enthält den bisherigen Gesprächsverlauf (user/assistant-Turns).',
      '- max_tokens steuert die Antwortlänge (default 1024, max 4096).',
    ].join('\n'),
    {
      message: z.string().min(1).max(8000).describe('Die Nachricht an die Soul'),
      history: z.array(
        z.object({
          role:    z.enum(['user', 'assistant']),
          content: z.string().max(8000),
        })
      ).max(20).optional().describe('Bisheriger Gesprächsverlauf (optional)'),
      max_tokens: z.number().int().min(64).max(4096).optional()
        .describe('Maximale Antwortlänge in Tokens (default 1024)'),
    },
    async ({ message, history, max_tokens }) => {
      try {
        const data = await postJson('/api/beme', token, {
          message,
          history:    history    ?? [],
          max_tokens: max_tokens ?? 1024,
        });

        if (data.error) {
          const msg = data.message || data.error;
          return {
            content: [{ type: 'text', text: `Fehler: ${msg}` }],
            isError: true,
          };
        }

        const speaker = data.soul_name || 'Soul';
        return {
          content: [
            {
              type: 'text',
              text: `**${speaker}:** ${data.response}`,
            },
          ],
        };
      } catch (err) {
        const msg = err.status === 403
          ? 'Vault ist gesperrt. Bitte in der SYS App entsperren.'
          : err.status === 404
          ? 'Noch kein sys.md synchronisiert. Bitte Vault in der SYS App synchronisieren.'
          : err.message;
        return {
          content: [{ type: 'text', text: `Fehler: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
