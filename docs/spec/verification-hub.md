# Verification Hub

Pages: `/connection` (dashboard/launcher) and `/verify` (the actual verification flow)

---

## Status

Identity verification is a standalone, minimal-UI flow (`/verify`) launched from the owner's dashboard (`/connection`), from a raw `verify_url` an MCP tool hands the AI, or by scanning a QR code `/verify` displays itself. It supports four independent, stackable proof dimensions — fingerprint, face, voice, and an on-chain "real human" check — plus wallet 2FA, and every biometric method carries real server-side cryptographic or anti-replay proof instead of a client-asserted boolean.

- **Fingerprint** — WebAuthn via `useSoulPasskey.js`. The server now verifies a real WebAuthn assertion (signature + challenge + origin) against a public key registered ahead of time, rather than trusting the browser's word for it.
- **Face** — server-side via Claude Vision against `vault/images/profile.png`. An `hq` mode adds explicit anti-spoofing checks (screen reflection, paper edge/curl, flat lighting, moiré) and requires high confidence *and* a liveness pass.
- **Voice (`voice_hq`)** — the client-side FFT speaker-similarity check (unchanged) *plus* a server-side anti-replay proof: the user reads a server-generated 6-digit code aloud, and ElevenLabs Scribe (STT) confirms the code was actually spoken in that exact recording.
- **Human check** — a fourth, independent dimension: verifies the soul is anchored on the Polygon SoulRegistry contract (real owner + at least one anchor) and adds +1 to the score. Stacks with any/all biometric methods; not gated behind them.
- **2FA wallet** — `proveIdentity()` from `useChainAnchor` checks on-chain via `contract.soulOwner(soulIdBytes32)` that the connected wallet owns this soul, cryptographically re-verified by the MCP tool.
- **Cross-device (QR-scan)** — `/verify` can render a QR code of its own URL; a second device (typically a phone) scans it and authenticates via a short-lived `vt:` token instead of a soul session. A claim mechanism (`verify_claim.lua`) ensures only one device "wins" a challenge once it starts doing the actual work — the other device's tab self-closes.
- **MCP tool `verify_identity`** — creates challenges (now for one or more methods at once) and polls status, including a `score` that reflects everything completed so far.

---

## Pages: `/connection` vs `/verify`

These are two separate pages with different roles — there is no single "Verbindung" page anymore.

| Page | Role | Auth |
|---|---|---|
| **`/connection`** | Owner dashboard: QR-Connect (MCP endpoint pairing, unrelated to biometrics), the pending-MCP-challenge banner, a pending trust-request banner, trusted-connector list. Does **not** perform any biometric check itself — it only launches `/verify`. | Normal `soul_cert` session (`useSoul()`) |
| **`/verify`** | Standalone card UI (`layout: false`) that does all the actual work: method chooser, fingerprint/face/voice/voice_hq flows, wallet 2FA, human check, QR hand-off to a second device. | `soul_cert` **or** a `vt:` verify-token |

**The `vt:` token** is a 48-hex-char value minted alongside every challenge (`verify_challenge.lua`), stored in a shared-dict cache plus a flat-file fallback, and embedded in the challenge's `verify_url` (`.../verify?id=<challenge_id>&m=<methods>&vt=<verify_token>`). `vault_auth.lua` accepts it as a full stand-in for a soul_cert on every `/api/verify/*` endpoint — this is what lets a phone that scanned a QR code complete verification without ever being logged into the Soul app. `GET /api/verify/reown` is the one exception: it has no `access_by_lua_file` gate at all and parses the `vt:` prefix itself, since it's only ever called from the scanning device before that device has any other session.

When both a QR-showing device and a scanning device are open on the same challenge, each generates its own random `client_id` and calls `verify_claim.lua` before starting a method attempt; whichever device's `client_id` gets stored in `claimed_by` "wins," and the other device's status poll sees the mismatch and closes its own tab.

---

## Overview

Four independent proof dimensions, plus wallet 2FA — all stack into one cumulative score:

| Method | Mechanism | Weight | Data transferred |
|---|---|---|---|
| Fingerprint | WebAuthn assertion, verified server-side against a registered public key | 1 | Signature + client data to your own server (PRF output stays local) |
| Face | Camera frame → Claude Vision | 1 (2 in `hq` mode) | JPEG to your own server |
| Voice (`voice_hq`) | Client-side FFT similarity + server-side spoken-code anti-replay (ElevenLabs Scribe) | 2 | Recording to your own server, forwarded to ElevenLabs |
| Human check | On-chain SoulRegistry ownership + anchor history | +1 (stacks with anything) | None beyond the existing Polygon RPC read |
| 2FA wallet | Wallet signature + on-chain `soulOwner` check | +1 | Signature to your own server |

---

## Design Decisions

| Decision | Chosen | Rejected | Reason |
|---|---|---|---|
| Voice verification | Client FFT + server anti-replay code (`voice_hq`) | Plain FFT-only `voice` | Plain voice had no server-side proof — a client could claim success without ever recording |
| Face verification | Claude Vision (server), optional `hq` liveness mode | face-api.js + models | More accurate, no 25 MB download, key already available |
| Fingerprint verification | Server-side WebAuthn assertion check against a registered public key | Trusting the client's `verified: true` | Same reasoning as voice — closes a real gap where no scan needed to happen at all |
| Human check | Separate, stacking +1 dimension via on-chain anchor lookup | Folding it into another method's score | It's orthogonal to biometrics — a real proof of "anchored soul," not identity liveness |
| 2FA wallet | `proveIdentity()` via useChainAnchor | Raw `window.ethereum` | On-chain soulOwner check instead of trusting an arbitrary wallet |
| Cross-device flow | `vt:` token + claim mechanism | Requiring a soul session on the scanning device | Lets a phone complete verification without being logged into the app |
| Motion verification | Still deferred | MediaPipe Pose | Face/voice liveness now cover the anti-spoofing case sufficiently |

---

## API Endpoints

All 12 endpoints live under `/api/verify/*` and are registered in `server/openresty/vhost.conf.template`. Every one is gated by `vault_auth.lua` (accepts a `soul_cert` **or** a `vt:` token) except `verify_reown`, which parses `vt:` itself with no `access_by_lua_file` gate.

| Endpoint | Method | Handles |
|---|---|---|
| `/api/verify/challenge` | POST | Creates a challenge; mints `challenge_id` + `vt` token; pre-generates the voice anti-replay code and WebAuthn challenge regardless of requested method |
| `/api/verify/pending` | GET | Lists open challenges for the calling soul (used by `/connection`'s banner) |
| `/api/verify/complete` | POST | Central score/state machine — re-derives `verified` from server-side proof flags, applies method weights, appends to the on-chain continuity chain |
| `/api/verify/face-check` | POST | Claude Vision comparison; `hq` mode adds liveness + confidence requirements |
| `/api/verify/voice-hq-check` | POST | Anti-replay check via ElevenLabs Scribe against the server-generated code |
| `/api/verify/passkey-register` | POST | Stores a WebAuthn public key server-side, prerequisite for `fingerprint-check` |
| `/api/verify/fingerprint-check` | POST | Verifies a real WebAuthn assertion against the registered public key and server-issued challenge |
| `/api/verify/2fa` | POST | Stores wallet-2FA proof; can create a standalone challenge if none exists yet |
| `/api/verify/status` | GET | Full challenge JSON + `registered_wallet`; polled by `/verify` and the MCP tool |
| `/api/verify/reown` | GET | Returns the Reown/WalletConnect project ID so `/verify` can init AppKit — `vt:`-only auth |
| `/api/verify/claim` | POST | Multi-device coordination — marks a challenge as claimed by a specific `client_id` |
| `/api/verify/human-check` | POST | On-chain SoulRegistry check; standalone +1 to score, independent of any biometric method |

---

### `POST /api/verify/challenge`
Body: `{ methods: ["fingerprint" | "face" | "face_hq" | "voice_hq", ...] }` (plural; empty array = user picks in the UI)
Response: `{ challenge_id, methods, required_methods, status, expires_at, verify_token, verify_url }`

Plain `"voice"` is no longer an accepted method — see the security-fix note above.

---

### `POST /api/verify/complete`
Body: `{ challenge_id, method, verified, is_2fa, selected_methods?, finalize? }`
Response: `{ ok, challenge_id, verified, method, verified_at, score, is_2fa, status, completed_methods, all_done }`

`verified` is **not** trusted from the request body for biometric methods — it's re-derived from server-set proof flags (`fingerprint_verified`, `face_check_verified`/`face_hq_check_verified`, `voice_hq_digits_verified`). Method weights: fingerprint = 1, face = 1, face_hq = 2, voice_hq = 2, plus +1 if `human_verified` and +1 if a wallet is attached. On success, fire-and-forgets an append to the genesis chain's "continuity" record (see [docs/spec/genesis-chain.md](genesis-chain.md)).

---

### `POST /api/verify/face-check`
Body: `{ image_base64, mime, hq?, challenge_id }`
Response: `{ match, confidence, liveness?, message }`

Standard mode: Claude Vision MATCH/NO_MATCH against `vault/images/profile.png`. `hq` mode requires `confidence: "high"` **and** `liveness: "pass"` from an explicit anti-spoofing prompt (screen reflection, paper edge/curl, flat lighting, moiré). On a match, persists `face_check_verified` (and `face_hq_check_verified` if `hq`) to the challenge file.

---

### `POST /api/verify/voice-hq-check?challenge_id=<id>`
Body: raw audio bytes (`audio/webm`, `audio/mp4`, …)
Response: `{ digits_match, transcript }`

Anti-replay only — the identity signal itself is the unchanged client-side FFT comparison. This endpoint forwards the recording to ElevenLabs Scribe (`scribe_v1`) via a dedicated multipart implementation (not the shared `elevenlabs_stt.lua` route, which doesn't understand `vt:` tokens), extracts spoken/written digits (handles both digit characters and German/English number words), and compares against the server-generated `voice_code` stored on the challenge at creation time. On a match, persists `voice_hq_digits_verified`.

---

### `POST /api/verify/passkey-register`
Body: `{ credential_id, public_key (base64url SPKI-DER), alg }`
Response: `{ ok: true }`

Called right after a new WebAuthn credential is created — from normal first-time passkey setup, from `/verify`'s QR-scanned-device flow, and as a self-healing step whenever `fingerprint-check` reports `unknown_credential` (a passkey created before this endpoint existed). Stores keys per `credential_id` in `/var/lib/sys/souls/<soul_id>/passkeys.json`; multiple entries accumulate for multiple devices.

---

### `POST /api/verify/fingerprint-check`
Body: `{ challenge_id, credential_id, client_data_json, authenticator_data, signature }`
Response: `{ match, reason? }`

Full server-side WebAuthn assertion verification: looks up the public key by `credential_id`, checks `type == "webauthn.get"`, checks the client-supplied challenge matches the server-issued one stored on the challenge file (anti-replay), checks `origin`, then recomputes the signed message (`authenticatorData || SHA256(clientDataJSON)`) and verifies the signature against the stored public key. On success, persists `fingerprint_verified` and updates the passkey's `last_verified_at`.

---

### `POST /api/verify/2fa`
Body: `{ challenge_id, identity_proof }` (or legacy `{ challenge_id, signature, address }`)
Response: `{ ok, challenge_id, verified_level: "2fa", score, cached? }`

Stores the wallet proof; sets `verified_level: "2fa"` and +1 score. Cryptographic/on-chain verification is double-checked later by the MCP tool, not in Lua.

---

### `GET /api/verify/status?id=<challenge_id>`
Response: full challenge JSON + `registered_wallet` from `api_context.json`

Polled by both `/verify` (every 6s) and the MCP tool.

---

### `GET /api/verify/reown`
Auth: `vt:` token only, no `soul_cert` accepted
Response: `{ project_id }`

Called only from the scanning-device side of the flow, inside the wallet-connect step, so that device can initialize WalletConnect AppKit without needing its own soul session.

---

### `POST /api/verify/claim`
Body: `{ challenge_id, client_id }`
Response: `{ ok: bool }`

Sets `claimed_by` unless already claimed by a *different* `client_id` (idempotent for the same device, rejected for another). Called fire-and-forget before every method attempt.

---

### `POST /api/verify/human-check`
Body: `{ challenge_id }`
Response: `{ ok, verified, anchor_count, first_anchor, latest_anchor, total_sessions, wallet, score }`

Shells out to `check_human.mjs`, a thin CLI wrapper around `verifyHuman(soulId)` in `blockchain.mjs`, which checks the Polygon SoulRegistry for a real owner and at least one anchor. Independent of every biometric method — a standalone +1 that stacks with anything else completed on the same challenge.

---

## Browser Logic (`verify.vue`)

### Fingerprint — WebAuthn

Calls `authenticatePasskey()` from `useSoulPasskey.js`, passing the server-issued `webauthn_challenge`. Two distinct outputs come out of the same WebAuthn ceremony:

1. **PRF output** — still stays entirely local, used only to derive the AES-256-GCM vault encryption key. Never transmitted.
2. **The assertion itself** (`credentialId`, `clientDataJson`, `authenticatorData`, `signature`) — now POSTed to `/api/verify/fingerprint-check` so the server can cryptographically verify a real scan happened. The public key it's checked against was registered ahead of time via `/api/verify/passkey-register`.

If the browser hands back an unexpected credential (can happen with multiple accumulated passkeys and `residentKey: 'preferred'`), the server correctly rejects it as `unknown_credential` and `verify.vue` triggers a self-healing re-registration.

---

### Face — Claude Vision

```
Open camera (getUserMedia, facingMode: user)
  ↓ Live preview (mirrored for a natural look)
User clicks "Capture"
  ↓ Canvas.drawImage(video) → toDataURL('image/jpeg', 0.85)
  ↓ Base64 without the data-URI prefix
POST /api/verify/face-check { image_base64, hq? }
  ↓ Server: reads vault/images/profile.png (decrypt if needed)
  ↓ Claude Vision: MATCH/NO_MATCH, or (hq) confidence + liveness
Result → verified / failed
```

Standard mode has no anti-spoofing beyond the model's own judgment. `hq` mode explicitly prompts for liveness (screen reflection, paper edge/curl, flat lighting, moiré) and only counts as a match on `confidence: "high"` **and** `liveness: "pass"`.

---

### Voice — `voice_hq`

```
Client-side (unchanged): FFT speaker-similarity vs. vault reference audio
Server-side (new): read the on-screen code aloud
  ↓ Record 5 seconds
  ↓ POST /api/verify/voice-hq-check?challenge_id=<id> (raw audio)
  ↓ ElevenLabs Scribe (STT) → extract digits from transcript
  ↓ Compare against server-generated voice_code
digits_match → voice_hq_digits_verified
```

The code is generated server-side at challenge creation and shown in the UI — never supplied by the client — specifically so an old recording can't be replayed. Plain FFT-only `voice` (no code) can no longer be requested as a challenge method.

**Known limitation:** encrypted vault audio (`SYS\x01` magic) fails if the vault is locked; very different microphone quality can still lower the FFT similarity score.

---

### Human Check — On-Chain Anchor

```
User clicks "No-Robot · Blockchain anchor +1"
  ↓ POST /api/verify/human-check { challenge_id }
  ↓ Server: check_human.mjs → verifyHuman(soul_id) → SoulRegistry.soulOwner() + getHistory()
Real owner + ≥1 anchor → human_verified, score +1
```

Independent of every biometric method — offered as an extra both during an active challenge and retroactively from the "done" summary screen if skipped earlier.

---

### 2FA Wallet

```
Any biometric verified → wallet step visible
User clicks "Connect & sign wallet"
  ↓ (scanning device only) GET /api/verify/reown → project_id → init AppKit
  ↓ connectWallet() → proveIdentity() from useChainAnchor
  ↓ on-chain check: does this wallet own the soul? (contract.soulOwner)
POST /api/verify/2fa { challenge_id, identity_proof }
verified_level = '2fa'
```

Cryptographic verification (`ethers.verifyMessage` + on-chain `soulOwner` check) is double-checked in the MCP tool (`verify_identity.mjs`), not just trusted from the Lua write.

---

## MCP Tool `verify_identity`

```
verify_identity({ methods: ["fingerprint", "voice_hq"] })
→ { challenge_id, verify_url, expires_at, ... }

verify_identity({ challenge_id: "abc123..." })
→ { status: "pending" | "verified" | "failed", verified_level, score, ... }
```

- `methods` is now a plural array (`fingerprint`, `face`, `face_hq`, `voice_hq` — no plain `voice`).
- The tool short-polls internally (5× over 15s) to fit inside a single tool-call timeout, instead of requiring the caller to always issue a second call.
- `verified_level`: `"biometric"` (one or more methods succeeded) or `"2fa"` (biometrics + wallet signature).
- The result message now surfaces every scoring dimension: per-method completions with timestamps, a wallet line if 2FA was done, and a blockchain-anchor line if `human_verified` — not just a single pass/fail.

Typical Claude flow:
1. `verify_identity({ methods: ["fingerprint"] })` → create challenge, output the URL
2. User opens the app (or scans the QR on their phone), verifies
3. `verify_identity({ challenge_id: "..." })` → check status (auto-retries internally while pending)
4. Optional: call again after 2FA or the human check → updated `score`

---

## Challenge File Format

```json
{
  "soul_id": "2c81aa74-...",
  "challenge_id": "a3f8b2c1... (32 hex)",
  "method": "fingerprint",
  "required_methods": ["fingerprint", "voice_hq"],
  "completed_methods": ["fingerprint"],
  "method_results": [
    { "method": "fingerprint", "verified": true, "timestamp": "2026-...Z" }
  ],
  "status": "pending",
  "score": 3,
  "created_at": "2026-...Z",
  "expires_at": "2026-...Z",
  "verified_at": null,
  "verify_token": "... (48 hex)",
  "triggering_token": null,
  "voice_code": "482913",
  "webauthn_challenge": "base64url...",
  "fingerprint_verified": true,
  "face_check_verified": true,
  "face_hq_check_verified": true,
  "voice_hq_digits_verified": true,
  "claimed_by": "a1b2c3... (client_id)",
  "claimed_at": "2026-...Z",
  "is_2fa": true,
  "verified_level": "2fa",
  "identity_proof": { "nonce": "...", "signature": "0x...", "wallet": "0x...", "soulId": "...", "anchorCount": 2 },
  "wallet_2fa": { "address": "0x...", "signature": "0x...", "signed_at": "2026-...Z", "anchor_count": 2 },
  "human_verified": true,
  "human_verified_at": "2026-...Z",
  "human_anchor_count": 2,
  "human_wallet": "0x..."
}
```

Most fields beyond `soul_id`/`challenge_id`/`status`/`created_at`/`expires_at` are populated incrementally as methods complete, not present from creation. `verify_status.lua`'s response additionally injects `registered_wallet` (from `api_context.json`) — that field is never persisted to the file itself.

---

## Known Limitations & Roadmap

- [x] **Fingerprint server-side verification** — real WebAuthn assertion check against a registered public key, closing the client-trust gap
- [x] **Face liveness (`hq` mode)** — explicit anti-spoofing prompt with confidence + liveness requirements
- [x] **Voice anti-replay (`voice_hq`)** — server-generated spoken code verified via ElevenLabs Scribe; plain FFT-only `voice` retired as a challenge method
- [x] **On-chain human check** — independent +1 scoring dimension via SoulRegistry anchor lookup
- [x] **Cross-device QR flow** — `vt:` token + claim mechanism for scan-with-phone verification
- [ ] **Voice MFCC** — mel filterbank for better speaker identification (the FFT comparison itself is unchanged since the original spec)
- [ ] **Vault audio fallback** — if the vault is locked, show an error with unlock instructions
- [ ] **Challenge cleanup** — delete expired JSON files in `/var/lib/sys/verify/` (cron or on `verify_pending`)
- [ ] **Motion verification** (motion_face / motion_body from vault) — deferred, face/voice liveness cover the anti-spoofing case for now
- [ ] **registered_wallet cross-check** — verify `verified_wallet` from `api_context.json` against the 2FA address

---

## Vault Reference Data

| Type | Path | Used for |
|---|---|---|
| Face | `vault/images/profile.png` | Claude Vision comparison |
| Voice | `vault/audio/voice_<soul_id>_<date>.mp3` | FFT spectral comparison |
| Motion | `vault/video/motion_face_*.mp4` | (not yet implemented) |
| Profile JSON | `vault/profile/face.json` etc. | Structured metadata |
