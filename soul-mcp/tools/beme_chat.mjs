/**
 * beme_chat – Gespräch mit der eigenen Soul
 *
 * Sendet eine Nachricht an die Soul und erhält eine Antwort,
 * die die Soul-Persönlichkeit vollständig verkörpert.
 * So können Menschen Gespräche mit sich selbst führen.
 */

import { postJson, verificationRequiredMsg } from '../lib/api.mjs';
import { z } from 'zod';

export function register(server, token) {
  server.tool(
    'beme_chat',
    [
      'Conversation with your own soul — the AI responds as you yourself.',
      '',
      'Use cases:',
      '- Self-reflection: How would I personally respond to this question?',
      '- Perspective shift: What do I really think about this topic?',
      '- Decision support: Hear my own voice on a dilemma.',
      '- Allow others to speak with the digital representation.',
      '',
      'Behavioural rules:',
      '- The soul always responds in first person, without revealing itself as an AI.',
      '- history contains the previous conversation turns (user/assistant).',
      '- max_tokens controls response length (default 1024, max 4096).',
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
        const vr = verificationRequiredMsg(err);
        const msg = vr
          ? vr
          : err.status === 403
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
