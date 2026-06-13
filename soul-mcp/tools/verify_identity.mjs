import { z } from 'zod';
import { postJson, getJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'verify_identity',
    [
      'Fordert eine biometrische Verifikation der Person an oder prüft den Status einer laufenden Challenge.',
      '',
      'Ablauf:',
      '1. Tool aufrufen (method wählen) → Challenge erstellen → verify_url ausgeben',
      '2. Person öffnet die App, verifiziert sich biometrisch',
      '3. Tool erneut mit challenge_id aufrufen → Status prüfen',
      '',
      'Methoden (Stufen):',
      '  fingerprint  Stufe 1 · WebAuthn/Face ID/Touch ID — kryptografisch, kein Datentransfer',
      '  face         Stufe 2 · Claude Vision vergleicht Live-Frame mit Vault-Profilbild',
      '  voice        Stufe 3 · Spektralanalyse Live-Aufnahme vs. Vault-Audio',
      '',
      'verified_level in der Antwort:',
      '  "biometric"  → eine Stufe verifiziert',
      '  "2fa"        → Biometrik + Wallet-Signatur (höchster Grad)',
    ].join('\n'),
    {
      method:       z.enum(['fingerprint', 'face', 'voice']).default('fingerprint'),
      challenge_id: z.string().length(32).optional().describe('Bestehende Challenge-ID zum Status-Check'),
    },
    async ({ method, challenge_id }) => {
      try {
        const methodLabels = {
          fingerprint: 'Fingerabdruck/Face ID',
          face:        'Gesichtserkennung (Claude Vision)',
          voice:       'Stimm-Spektralanalyse',
        }

        // ── Status einer bestehenden Challenge prüfen ──────────────────────────
        if (challenge_id) {
          let status
          try {
            status = await getJson(`/api/verify/status?id=${challenge_id}`, token)
          } catch {
            return { content: [{ type: 'text', text: JSON.stringify({
              status: 'not_found',
              challenge_id,
              message: 'Challenge nicht gefunden — abgelaufen oder ungültige ID.',
            }, null, 2) }] }
          }

          if (status.status === 'pending') {
            return { content: [{ type: 'text', text: JSON.stringify({
              status:      'pending',
              challenge_id,
              method:      status.method,
              expires_at:  status.expires_at,
              message:     `Warte auf Verifikation — Person muss /verbindung öffnen und sich via ${methodLabels[status.method] ?? status.method} verifizieren.`,
            }, null, 2) }] }
          }

          const level = status.verified_level || (status.status === 'verified' ? 'biometric' : null)

          if (status.status === 'verified' || level) {
            const wallet2fa = status.wallet_2fa
            return { content: [{ type: 'text', text: JSON.stringify({
              status:          'verified',
              verified_level:  level ?? 'biometric',
              challenge_id,
              method:          status.method,
              verified_at:     status.verified_at,
              wallet_2fa:      wallet2fa ? {
                address:   wallet2fa.address,
                signed_at: wallet2fa.signed_at,
              } : null,
              message: level === '2fa'
                ? `2FA verifiziert — Biometrik + Wallet ${wallet2fa?.address?.slice(0,6)}…${wallet2fa?.address?.slice(-4)}.`
                : `Biometrisch verifiziert via ${methodLabels[status.method] ?? status.method}.`,
            }, null, 2) }] }
          }

          return { content: [{ type: 'text', text: JSON.stringify({
            status:      status.status,
            challenge_id,
            message:     status.status === 'failed' ? 'Verifikation fehlgeschlagen.' : 'Challenge abgelaufen.',
          }, null, 2) }] }
        }

        // ── Neue Challenge erstellen ───────────────────────────────────────────
        const data = await postJson('/api/verify/challenge', token, { method })
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok:           true,
            challenge_id: data.challenge_id,
            method:       data.method,
            status:       'pending',
            expires_at:   data.expires_at,
            verify_url:   data.verify_url,
            message:      `Challenge erstellt. Person muss ${data.verify_url} öffnen → "${methodLabels[data.method]}" Tile → Verifizieren. challenge_id für Status-Check: ${data.challenge_id}`,
          }, null, 2) }],
        }
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true }
      }
    }
  );
}
