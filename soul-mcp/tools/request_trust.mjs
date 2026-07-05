/**
 * request_trust — Bewirbt eine kryptografisch verifizierte, aber (noch) nicht
 * getrustete Soul-Identität um Aufnahme in die trusted_souls-Whitelist der
 * Ziel-Soul. Schreibt eine Anfrage-Datei und stößt eine Push-Benachrichtigung
 * an den Soul-Inhaber an — gleicher Mechanismus wie die ElevenLabs-Agent-
 * Verifikation (agent_verify.lua → /internal/send-push).
 *
 * Wird NUR für Peer-Cert-Inhaber registriert, deren soul_id (noch) nicht in
 * trusted_souls steht, aber deren Cert kryptografisch gültig ist (siehe
 * server.mjs handleMcp). Genehmigung erfolgt manuell durch den Soul-Inhaber
 * in der SYS-App (/connection).
 */

import { z } from 'zod';
import { writeFile, mkdir } from 'fs/promises';
import { randomBytes } from 'crypto';

const TRUST_DIR = '/var/lib/sys/trust/';
const TTL_MS    = 15 * 60 * 1000; // 15 Minuten

export function register(server, requesterSoulId, targetSoulId, port) {
  server.tool(
    'request_trust',
    [
      'Bewirbt diese Soul-Identität um Aufnahme in die trusted_souls-Whitelist',
      'der Ziel-Soul. Der Soul-Inhaber bekommt eine Push-Benachrichtigung in die',
      'SYS-App und muss die Anfrage dort manuell freigeben oder ablehnen — kein',
      'automatischer Zugriff.',
      '',
      'Danach mit request_trust_status (Parameter: request_id aus dieser Antwort)',
      'alle paar Sekunden pollen, bis status nicht mehr "pending" ist.',
    ].join('\n'),
    {
      label: z.string().max(120).optional()
        .describe('Menschenlesbarer Name für diesen Connector, z.B. "Login-Autofill-Extension"'),
      reason: z.string().max(400).optional()
        .describe('Kurze Begründung, wofür der Zugriff gebraucht wird'),
    },
    async ({ label, reason } = {}) => {
      try {
        await mkdir(TRUST_DIR, { recursive: true });
        const requestId = randomBytes(16).toString('hex');
        const now = Date.now();
        const record = {
          soul_id: targetSoulId,
          requester_soul_id: requesterSoulId,
          request_id: requestId,
          label: label || null,
          reason: reason || null,
          status: 'pending',
          created_at: new Date(now).toISOString(),
          expires_at: new Date(now + TTL_MS).toISOString(),
        };
        await writeFile(`${TRUST_DIR}${targetSoulId}_${requestId}.json`, JSON.stringify(record), 'utf8');

        try {
          await fetch(`http://127.0.0.1:${port}/internal/send-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              soul_id: targetSoulId,
              title: 'Vertrauensanfrage',
              body: `${label || 'Ein Connector'} möchte Zugriff auf deine Identitätsdaten.`,
              url: '/connection',
            }),
            signal: AbortSignal.timeout(4000),
          });
        } catch { /* Push best effort — Anfrage bleibt trotzdem gültig, manuelles Polling in der App greift */ }

        return {
          content: [{
            type: 'text',
            text: `Anfrage gesendet (request_id: ${requestId}). Der Soul-Inhaber wurde benachrichtigt und muss in der SYS-App bestätigen. Mit request_trust_status(request_id="${requestId}") den Status abfragen.`,
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `request_trust fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}
