import { z } from 'zod';
import { postJson, getJson } from '../lib/api.mjs';
import { ethers } from 'ethers';

const SOUL_REGISTRY = '0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B'
const POLYGON_RPC   = 'https://polygon-bor-rpc.publicnode.com'
const OWNER_ABI     = ['function soulOwner(bytes32 soulId) view returns (address)']

async function verifyIdentityProof(proof) {
  if (!proof?.nonce || !proof?.signature || !proof?.wallet) return null
  let recovered
  try {
    recovered = ethers.verifyMessage(ethers.getBytes(proof.nonce), proof.signature)
  } catch { return { valid: false, reason: 'invalid_signature' } }
  const signatureValid = recovered.toLowerCase() === proof.wallet.toLowerCase()
  if (!signatureValid) return { valid: false, reason: 'signature_mismatch', recovered }
  let onChainMatch = false
  const anchorCount = proof.anchorCount ?? 0
  if (proof.soulId) {
    try {
      const provider = new ethers.JsonRpcProvider(POLYGON_RPC)
      const contract = new ethers.Contract(SOUL_REGISTRY, OWNER_ABI, provider)
      const owner    = await contract.soulOwner(proof.soulId)
      const ZERO     = '0x0000000000000000000000000000000000000000'
      onChainMatch   = owner !== ZERO && owner.toLowerCase() === proof.wallet.toLowerCase()
    } catch { onChainMatch = anchorCount > 0 }
  }
  return { valid: true, signatureValid, onChainMatch, anchorCount,
    wallet: proof.wallet, firstAnchor: proof.firstAnchor ?? null, latestAnchor: proof.latestAnchor ?? null }
}

// Kurzer Poll: max 5×3s = 15s — passt in Claude AIs Tool-Timeout
async function pollShort(challenge_id, token) {
  const POLLS   = 5
  const POLL_MS = 3000
  let status
  for (let i = 0; i < POLLS; i++) {
    try {
      status = await getJson(`/api/verify/status?id=${challenge_id}`, token)
    } catch {
      return { __not_found: true }
    }
    if (status.status !== 'pending') return status
    if (i < POLLS - 1) await new Promise(r => setTimeout(r, POLL_MS))
  }
  return status  // status === 'pending'
}

async function buildVerifiedResult(status, challenge_id) {
  const level     = status.verified_level || (status.status === 'verified' ? 'biometric' : null)
  const wallet2fa = status.wallet_2fa
  const proof     = status.identity_proof
  let proofVerification = null
  if (proof && level === '2fa') proofVerification = await verifyIdentityProof(proof)
  const proofValid  = proofVerification?.valid ?? null
  const onChain     = proofVerification?.onChainMatch ?? null
  const score       = status.score ?? (level === '2fa' ? 3 : 1)
  const completed   = Array.isArray(status.completed_methods) ? status.completed_methods : (status.method ? [status.method] : [])
  const methodResults = Array.isArray(status.method_results) ? status.method_results : null
  const methodLabels  = { fingerprint: 'Fingerabdruck', face: 'Gesichtserkennung', voice: 'Stimm-Analyse', face_hq: 'Gesichtserkennung HQ', voice_hq: 'Stimm-Analyse HQ' }

  // Biometrische Detail-Zeilen
  const bioLines = completed.map(m => {
    const res = methodResults?.find(r => r.method === m)
    const ts  = res?.timestamp ? ` · ${res.timestamp.slice(11,16)} UTC` : ''
    return `  ${methodLabels[m] || m} ✅${ts}`
  })
  if (wallet2fa) {
    const ts = wallet2fa.signed_at ? ` · ${wallet2fa.signed_at.slice(11,16)} UTC` : ''
    bioLines.push(`  Wallet ${wallet2fa.address?.slice(0,6)}…${wallet2fa.address?.slice(-4)} ✅${ts}`)
  }
  if (status.human_verified) {
    bioLines.push(`  Blockchain-Anker ✅ (${status.human_anchor_count ?? 0}× on-chain, Wallet ${status.human_wallet?.slice(0,6)}…)`)
  }
  if (status.is_2fa) bioLines.push('  Mobilgerät (2FA) ✅')

  const maxScore = completed.length + (wallet2fa ? 1 : 0) + (status.human_verified ? 1 : 0)
  const message  = [
    `Score ${score} — ${level === '2fa' ? 'vollständig verifiziert' : 'biometrisch verifiziert'}`,
    ...bioLines,
  ].join('\n')

  return {
    status:             'verified',
    verified_level:     level ?? 'biometric',
    score,
    is_2fa:             status.is_2fa ?? false,
    challenge_id,
    completed_methods:  completed,
    method_results:     methodResults,
    verified_at:        status.verified_at,
    wallet_2fa: wallet2fa ? {
      address:      wallet2fa.address,
      signed_at:    wallet2fa.signed_at,
      anchor_count: wallet2fa.anchor_count ?? 0,
      on_chain:     onChain ?? false,
    } : null,
    proof_valid:        proofValid,
    human_verified:     status.human_verified ?? false,
    message,
  }
}

export function register(server, token) {
  server.tool(
    'verify_identity',
    [
      'Biometric identity verification. Runs in short steps (15s per call).',
      '',
      'TIP: before a sensitive action, call soul_chain_status first — it tells',
      'you whether an existing, recent verification already covers the',
      'sensitivity tier needed, so you can skip re-verifying if it does.',
      '',
      'FLOW:',
      '  1. Without challenge_id → creates challenge, shows verify URL, polls 15s.',
      '  2. While status="pending" → call this tool again immediately with challenge_id.',
      '  3. When status="verified" → result is complete.',
      '',
      'IMPORTANT: On status="pending" call again IMMEDIATELY (do not wait for user input).',
      'The tool runs multiple times in succession until the person has verified.',
      '',
      'Methods (optional — empty = user chooses on the verify page):',
      '  fingerprint  WebAuthn/Face ID/Touch ID — weight 1',
      '  face         Claude Vision face — weight 1',
      '  face_hq      Claude Vision face, stricter prompt: explicit confidence',
      '               tier + liveness signals (screen reflection, paper edge/',
      '               curl, flat lighting, moire) — weight 2. Use for sensitive',
      '               actions (large payments, wallet signing, data deletion)',
      '               instead of plain "face" — same camera flow for the user,',
      '               just a stricter check server-side.',
      '  voice_hq     FFT voice match plus a server-generated 6-digit code the',
      '               user reads aloud — a cheap STT call confirms the code was',
      '               actually spoken (anti-replay), so an old recording cannot',
      '               be reused — weight 2. The only voice option: a plain FFT-only',
      '               "voice" method used to exist but had no server-side proof at',
      '               all (client could just claim success) and was removed.',
      'Score +1 if mobile (2FA). Wallet signature in UI → Score 3/3.',
    ].join('\n'),
    {
      methods:      z.array(z.enum(['fingerprint', 'face', 'face_hq', 'voice_hq'])).optional().describe('Methods (one or more). Use face_hq/voice_hq for sensitive actions. Empty = user chooses.'),
      challenge_id: z.string().length(32).optional().describe('From previous pending result — call again immediately'),
    },
    async ({ methods, challenge_id }) => {
      try {
        // ── Polling-Schritt (challenge_id bekannt) ────────────────────────────
        if (challenge_id) {
          const status = await pollShort(challenge_id, token)

          if (status.__not_found) {
            return { content: [{ type: 'text', text: JSON.stringify({
              status: 'not_found', challenge_id,
              message: 'Challenge nicht gefunden — abgelaufen oder ungültige ID.',
            }, null, 2) }] }
          }

          if (status.status === 'verified' || status.verified_level) {
            const result = await buildVerifiedResult(status, challenge_id)
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
          }

          if (status.status === 'pending') {
            return { content: [{ type: 'text', text: JSON.stringify({
              status:       'pending',
              challenge_id,
              method:       status.method,
              expires_at:   status.expires_at,
              next_action:  `verify_identity(challenge_id="${challenge_id}") SOFORT erneut aufrufen`,
            }, null, 2) }] }
          }

          return { content: [{ type: 'text', text: JSON.stringify({
            status: status.status, challenge_id,
            message: status.status === 'failed' ? 'Verifikation fehlgeschlagen.' : 'Challenge abgelaufen.',
          }, null, 2) }] }
        }

        // ── Neue Challenge + erster Poll ──────────────────────────────────────
        const body       = methods?.length ? { methods } : {}
        const data       = await postJson('/api/verify/challenge', token, body)
        const cid        = data.challenge_id
        const verifyUrl  = data.verify_url

        const status = await pollShort(cid, token)

        if (status.__not_found) {
          return { content: [{ type: 'text', text: JSON.stringify({
            status: 'error', message: 'Challenge nach Erstellung nicht gefunden.',
          }, null, 2) }] }
        }

        if (status.status === 'verified' || status.verified_level) {
          const result = await buildVerifiedResult(status, cid)
          result.verify_url = verifyUrl
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        }

        // Noch pending → URL zeigen + sofort weiter pollen
        return { content: [{ type: 'text', text: JSON.stringify({
          status:       'pending',
          challenge_id: cid,
          verify_url:   verifyUrl,
          method:       methods?.[0] || 'all',
          expires_at:   data.expires_at,
          next_action:  `verify_identity(challenge_id="${cid}") SOFORT erneut aufrufen — wartet weitere 15s`,
        }, null, 2) }] }

      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true }
      }
    }
  );
}
