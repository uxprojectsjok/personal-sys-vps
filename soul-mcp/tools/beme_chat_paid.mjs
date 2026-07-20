/**
 * beme_chat_paid – Gespräch mit der Soul, begrenzt auf den Agent-Sandbox-Block
 *
 * Wie beme_chat, aber für zahlende externe Agenten: der Kontext ist NICHT die
 * volle sys.md (Private Sphere bleibt geschützt), sondern nur der Ausschnitt,
 * den der Eigentümer explizit für Agenten freigegeben hat
 * (<!-- AGENT:START --> … <!-- AGENT:END -->).
 *
 * Owner-Zugang: funktioniert immer mit dem eigenen Token, unabhängig davon ob
 * Amortisierung aktiv ist — damit lässt sich testen was ein zahlender Agent
 * über dieses Tool zu sehen bekäme, ohne selbst zu zahlen.
 */

import { postJson, verificationRequiredMsg } from '../lib/api.mjs';
import { z } from 'zod';

export function register(server, token) {
  server.tool(
    'beme_chat_paid',
    [
      'Conversation with this soul, scoped to the Agent Sandbox block only —',
      'never the private sphere. For external agents with paid access, and for',
      'the owner to test exactly what a paying agent would experience.',
      '',
      'Use cases:',
      '- A paying external agent wants a conversational interface instead of raw',
      '  reads — the reply stays within whatever the owner put in the Agent',
      '  Sandbox block, nothing more.',
      '- Owner: preview/test the paid conversational experience before enabling',
      '  it for external agents (works with the owner\'s own token, no payment',
      '  needed).',
      '',
      'Behavioural rules:',
      '- The soul responds in first person, but only about what is in its Agent',
      '  Sandbox block. Out-of-scope questions get a brief, polite decline —',
      '  never a fabricated answer, never a hint at what the private sphere',
      '  might contain.',
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
        const data = await postJson('/api/soul/paid-beme', token, {
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
        let msg = vr ? vr : err.message;
        if (!vr) {
          try {
            const body = JSON.parse(err.body || '{}');
            if (body.message) msg = body.message;
            else if (body.error === 'no_agent_content') msg = 'Diese Soul hat noch keinen Agent-Sandbox-Block freigegeben.';
            else if (body.error === 'token_expired_or_invalid') msg = 'access_token abgelaufen oder ungültig. Neue Zahlung erforderlich.';
            else if (body.error === 'payment_not_required') msg = 'Diese Soul ist im Frei-Modus — normaler MCP-Zugang genügt, kein beme_chat_paid nötig.';
          } catch { /* body kein JSON */ }
        }
        return {
          content: [{ type: 'text', text: `Fehler: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
