import { z } from 'zod';
import { postJson, getJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'verify_identity',
    [
      'Fordert eine biometrische Verifikation der Person an.',
      '',
      'Ablauf:',
      '1. Tool erstellt eine Challenge (method: fingerprint/face/voice).',
      '2. Person öffnet die App unter verify_url und verifiziert sich biometrisch.',
      '3. Tool erneut aufrufen mit challenge_id um Status zu prüfen.',
      '',
      'Fingerabdruck = WebAuthn/Face ID/Touch ID (stärkste Sicherheit)',
      'Gesicht       = Kamera-Selfie + Bestätigung',
      'Stimme        = Sprach-Sample + Bestätigung',
      '',
      'Immer aufrufen wenn sichergestellt werden muss, dass die Person persönlich anwesend ist.',
    ].join('\n'),
    {
      method:       z.enum(['fingerprint', 'face', 'voice']).default('fingerprint').describe('Biometrische Methode'),
      challenge_id: z.string().length(32).optional().describe('Bestehende Challenge-ID zum Status-Check (32 Hex-Zeichen)'),
    },
    async ({ method, challenge_id }) => {
      try {
        // Status einer laufenden Challenge prüfen
        if (challenge_id) {
          const pending = await getJson('/api/verify/pending', token);
          const match = pending.pending?.find(c => c.challenge_id === challenge_id);
          if (match) {
            return { content: [{ type: 'text', text: JSON.stringify({
              status: 'pending',
              challenge_id,
              method: match.method,
              message: `Verifikation ausstehend — Person muss die App öffnen und sich via ${match.method} verifizieren.`,
              expires_at: match.expires_at,
            }, null, 2) }] };
          }
          // Nicht mehr in pending → abgeschlossen oder abgelaufen
          return { content: [{ type: 'text', text: JSON.stringify({
            status: 'completed_or_expired',
            challenge_id,
            message: 'Challenge nicht mehr aktiv — abgeschlossen, abgelaufen oder abgelehnt.',
          }, null, 2) }] };
        }

        // Neue Challenge erstellen
        const data = await postJson('/api/verify/challenge', token, { method });
        const methodLabels = { fingerprint: 'Fingerabdruck/Face ID', face: 'Gesicht', voice: 'Stimme' };
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok: true,
            challenge_id:  data.challenge_id,
            method:        data.method,
            status:        'pending',
            expires_at:    data.expires_at,
            verify_url:    data.verify_url,
            message:       `Verifikationsanfrage erstellt. Person muss ${data.verify_url} öffnen und sich via ${methodLabels[data.method] ?? data.method} verifizieren. challenge_id für Status-Check merken: ${data.challenge_id}`,
          }, null, 2) }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );
}
