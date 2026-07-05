/**
 * request_trust_status — Fragt den Status einer per request_trust gestellten
 * Vertrauensanfrage ab. Minimale Antwortform, analog zu agent_verify_status.lua.
 */

import { z } from 'zod';
import { readFile } from 'fs/promises';

const TRUST_DIR = '/var/lib/sys/trust/';

export function register(server, requesterSoulId, targetSoulId) {
  server.tool(
    'request_trust_status',
    [
      'Fragt den Status einer per request_trust gestellten Vertrauensanfrage ab.',
      'status: "pending" (noch keine Entscheidung), "approved" (Zugriff gewährt),',
      '"rejected" (abgelehnt) oder "expired" (Anfrage verfallen, TTL überschritten).',
    ].join('\n'),
    {
      request_id: z.string().length(32).describe('request_id aus der request_trust-Antwort'),
    },
    async ({ request_id }) => {
      try {
        const raw    = await readFile(`${TRUST_DIR}${targetSoulId}_${request_id}.json`, 'utf8');
        const record = JSON.parse(raw);
        if (record.requester_soul_id !== requesterSoulId) {
          return { content: [{ type: 'text', text: JSON.stringify({ ok: false, status: 'not_found' }) }], isError: true };
        }
        let status = record.status;
        if (status === 'pending' && new Date(record.expires_at).getTime() < Date.now()) {
          status = 'expired';
        }
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, status, approved: status === 'approved' }) }],
        };
      } catch {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, status: 'not_found' }) }], isError: true };
      }
    }
  );
}
