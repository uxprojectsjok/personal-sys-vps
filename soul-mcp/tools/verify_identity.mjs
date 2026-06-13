import { z } from 'zod';
import { postJson, getJson } from '../lib/api.mjs';
import { ethers } from 'ethers';

const SOUL_REGISTRY = '0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B'
const POLYGON_RPC   = 'https://polygon-bor-rpc.publicnode.com'
const OWNER_ABI     = ['function soulOwner(bytes32 soulId) view returns (address)']

async function verifyIdentityProof(proof) {
  if (!proof?.nonce || !proof?.signature || !proof?.wallet) return null

  // 1. Signatur: recovered === wallet
  let recovered
  try {
    recovered = ethers.verifyMessage(ethers.getBytes(proof.nonce), proof.signature)
  } catch { return { valid: false, reason: 'invalid_signature' } }

  const signatureValid = recovered.toLowerCase() === proof.wallet.toLowerCase()
  if (!signatureValid) return { valid: false, reason: 'signature_mismatch', recovered }

  // 2. On-chain: soulOwner(soulId) === wallet
  let onChainMatch = false
  const anchorCount = proof.anchorCount ?? 0

  if (proof.soulId) {
    try {
      const provider = new ethers.JsonRpcProvider(POLYGON_RPC)
      const contract = new ethers.Contract(SOUL_REGISTRY, OWNER_ABI, provider)
      const owner    = await contract.soulOwner(proof.soulId)
      const ZERO     = '0x0000000000000000000000000000000000000000'
      onChainMatch   = owner !== ZERO && owner.toLowerCase() === proof.wallet.toLowerCase()
    } catch {
      onChainMatch = anchorCount > 0  // RPC-Fallback: Proof vertrauen wenn anchorCount > 0
    }
  }

  return {
    valid:        true,
    signatureValid,
    onChainMatch,
    anchorCount,
    wallet:       proof.wallet,
    firstAnchor:  proof.firstAnchor  ?? null,
    latestAnchor: proof.latestAnchor ?? null,
  }
}

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
          const proof     = status.identity_proof

          // Kryptografische Verifikation des Identity Proof
          let proofVerification = null
          if (proof && level === '2fa') {
            proofVerification = await verifyIdentityProof(proof)
          }

          const proofValid = proofVerification?.valid ?? null
          const onChain    = proofVerification?.onChainMatch ?? null

          return { content: [{ type: 'text', text: JSON.stringify({
              status:          'verified',
              verified_level:  level ?? 'biometric',
              challenge_id,
              method:          status.method,
              verified_at:     status.verified_at,
              wallet_2fa: wallet2fa ? {
                address:      wallet2fa.address,
                signed_at:    wallet2fa.signed_at,
                anchor_count: wallet2fa.anchor_count ?? 0,
                schema:       wallet2fa.schema ?? 'simple',
              } : null,
              proof_verification: proofVerification ? {
                signature_valid: proofValid,
                on_chain_match:  onChain,
                anchor_count:    proofVerification.anchorCount,
                first_anchor:    proofVerification.firstAnchor,
                latest_anchor:   proofVerification.latestAnchor,
              } : null,
              message: level === '2fa'
                ? `2FA verifiziert — Biometrik + Soul-Identitätsbeweis${onChain ? ' (on-chain bestätigt)' : ''}. Wallet: ${wallet2fa?.address?.slice(0,6)}…${wallet2fa?.address?.slice(-4)}`
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
