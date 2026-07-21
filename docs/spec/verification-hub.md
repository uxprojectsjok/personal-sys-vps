# Verification Hub

Page: `/verbindung`

---

## Status

The Verbindung page doubles as a **verification hub**: alongside its original QR-Connect flow, it offers three biometric verification tiles (fingerprint, face, voice) and a 2FA wallet card. A soul owner can prove their identity either on their own initiative or in response to a challenge raised by an MCP tool (Claude AI).

- **Fingerprint** — WebAuthn via `useSoulPasskey.js`. Fully functional.
- **Voice** — local spectral analysis, no external service. Chosen over ElevenLabs Speaker Verification in favor of a fully self-hosted solution (Web Audio FFT). Vault audio (`vault/audio/*.mp3`) serves as the reference sample, loaded via an auth token and decoded in the browser.
- **Face** — runs server-side via Claude Haiku Vision rather than a client-side `face-api.js` model (which would need ~25 MB of models and a CDN dependency). More accurate, no model download, and the Anthropic key is already available in `config.json`. The profile PNG from `vault/images/` is decrypted server-side and passed directly to Claude.
- **Motion verification** (`motion_face_*.mp4`, `motion_body_*.mp4`) — considered, currently deferred. The pending blink-detection liveness check (see Known Limitations) covers the use case sufficiently for now.
- **2FA wallet → soul identity proof** — replaces a plain `signMessage` with `proveIdentity()` from `useChainAnchor`. The proof checks on-chain via `contract.soulOwner(soulIdBytes32)` that the connected wallet actually owns this soul on Polygon. The MCP tool verifies cryptographically: `verifyMessage(nonce, signature) === wallet`, plus the on-chain check.
- **MCP tool `verify_identity`** — creates challenges and returns status, including `verified_level: "2fa"`. Two-step flow: create the challenge first, then check status after the user acts.
- **Pending-challenge banner** — the app polls `/api/verify/pending` every 8 seconds. When Claude creates a challenge, a banner appears with a direct "Verify now" button for the right method.

---

## Design Decisions

| Decision | Chosen | Rejected | Reason |
|---|---|---|---|
| Voice verification | Web Audio FFT (local) | ElevenLabs Speaker Verification | No external service, no API call |
| Face verification | Claude Haiku Vision (server) | face-api.js + models | More accurate, no 25 MB download, key already available |
| Motion | Deferred | MediaPipe Pose | Liveness check is sufficient for MVP |
| 2FA wallet | `proveIdentity()` via useChainAnchor | Raw `window.ethereum` | On-chain soulOwner check instead of trusting an arbitrary wallet |
| Liveness | Still open | Blink EAR (face-api.js) | Avoided the face-api.js dependency |

---

## Overview

Four levels, ascending in assurance:

| Level | Method | Mechanism | Data transferred |
|---|---|---|---|
| 1 | Fingerprint | WebAuthn (Face ID / Touch ID / Windows Hello) | None — secure enclave |
| 2 | Face | Camera frame → Claude Haiku Vision | JPEG to your own server |
| 3 | Voice | Web Audio FFT spectrum vs. vault audio | None — local in the browser |
| 4 | 2FA | Biometrics + wallet signature (ethers.js) | Signature to your own server |

---

## File Structure

```
app/pages/verbindung.vue          UI — QR-Connect + 3 tiles + 2FA card
lua/verify_challenge.lua          POST /api/verify/challenge
lua/verify_pending.lua            GET  /api/verify/pending
lua/verify_complete.lua           POST /api/verify/complete
lua/verify_face_check.lua         POST /api/verify/face-check
lua/verify_2fa.lua                POST /api/verify/2fa
lua/verify_status.lua             GET  /api/verify/status?id=
soul-mcp/tools/verify_identity.mjs  MCP tool
```

Challenge files: `/var/lib/sys/verify/<soul_id>_<challenge_id>.json` · TTL 300s

---

## API Endpoints

### `POST /api/verify/challenge`
Auth: soul_cert
Body: `{ method: "fingerprint" | "face" | "voice" }`
Response: `{ challenge_id, method, status: "pending", expires_at, verify_url }`

Creates a challenge. Called both by the MCP tool and directly by the browser (when the user taps "Verify" without an MCP context).

---

### `GET /api/verify/pending`
Auth: soul_cert
Response: `{ pending: [{ challenge_id, method, created_at, expires_at }] }`

The app polls every 8 seconds and shows a banner when Claude has created an open challenge.

---

### `POST /api/verify/complete`
Auth: soul_cert
Body: `{ challenge_id, method, verified: bool }`
Response: `{ ok, challenge_id, verified, method, verified_at }`

The browser sends the biometric result. `verified_level` stays `"biometric"` until `verify_2fa` is called.

---

### `POST /api/verify/face-check`
Auth: soul_cert
Body: `{ image_base64: "<JPEG base64>", mime: "image/jpeg" }`
Response: `{ match: bool, confidence: "high"|"low", message }`

Reads `vault/images/profile.png` (decrypted if a vault key is present in context). Sends both images to `claude-haiku-4-5-20251001` with the prompt: `"Do these two photos show the same person? Reply with exactly one word: MATCH or NO_MATCH."` The model can be raised to Opus/Sonnet at any time in `verify_face_check.lua`.

---

### `POST /api/verify/2fa`
Auth: soul_cert
Body: `{ challenge_id, signature: "0x...", address: "0x..." }`
Response: `{ ok, challenge_id, verified_level: "2fa" }`

Stores the wallet signature in the challenge file. No cryptographic verification happens in Lua — that is handled by the MCP tool via ethers.js. If `challenge_id` does not exist (standalone 2FA without a prior biometric challenge), a new challenge file is created.

---

### `GET /api/verify/status?id=<challenge_id>`
Auth: soul_cert
Response: full challenge JSON + `registered_wallet` from `api_context.json`

For the MCP tool: returns all data including `wallet_2fa.signature` for ethers.js `verifyMessage`.

---

## Browser Logic (`verbindung.vue`)

### Voice — Web Audio FFT

```
Load vault audio (/api/vault/audio → active_url)
  ↓ ArrayBuffer → AudioContext.decodeAudioData()
Record microphone (3 seconds, MediaRecorder)
  ↓ Blob → ArrayBuffer → decodeAudioData()
Spectral envelope of both audio sources
  ↓ FFT (Cooley-Tukey, frameSize=2048, hop=512)
  ↓ log(1 + magnitude) averaged across all frames
Cosine similarity of the envelopes
  ↓ score > 0.78 → verified
```

The 0.78 threshold can be adjusted in `doVoice()`. Score is shown as a percentage.

**Known limitations:**
- Encrypted vault audio (SYS\x01 magic) fails if the vault is locked
- Very different microphone quality can lower the score
- Background noise affects high frequencies (less critical for formants)

**Improvement path:** a mel filterbank (40 bands, 100–8000 Hz) before the cosine calculation → MFCC-like features → better speaker identification independent of content.

---

### Face — Claude Vision

```
Open camera (getUserMedia, facingMode: user)
  ↓ Live preview (mirrored for a natural look)
User clicks "Capture"
  ↓ Canvas.drawImage(video) → toDataURL('image/jpeg', 0.85)
  ↓ Base64 without the data-URI prefix
POST /api/verify/face-check
  ↓ Server: reads vault/images/profile.png (decrypt if needed)
  ↓ Claude Haiku: MATCH / NO_MATCH
Result → verified / failed
```

**Improvement path (liveness check):**
No anti-spoofing against photo attacks currently. Options:
1. **ML-free blink detection**: track brightness in the eye region (top quarter, middle 40% of width) → 2 brightness dips below 0.7 × EMA within 5s = 2 blinks → capture
2. **face-api.js** `SsdMobilenetv1` + 68 landmarks → Eye Aspect Ratio (EAR) < 0.25 = blink (requires ~12 MB of models in `/public/models/`)
3. **MediaPipe Face Mesh** (WASM, ~400 KB model) → more precise landmarks, lighter weight

---

### Fingerprint — WebAuthn

Calls `authenticatePasskey()` from `useSoulPasskey.js`. Returns the PRF output (ArrayBuffer) — used as a truthy check for `verified: true`. The PRF output is never stored or transmitted.

---

### 2FA Wallet

```
anyBiometricVerified === true → 2FA card visible
User clicks "Connect & sign wallet"
  ↓ import('ethers') → BrowserProvider(window.ethereum)
  ↓ eth_requestAccounts
  ↓ signer.signMessage(activeChallengeId)
  ↓ signer.getAddress()
POST /api/verify/2fa { challenge_id, signature, address }
verifiedLevel = '2fa', show walletShort
```

`activeChallengeId` = either an MCP challenge ID or a freshly created one (from `POST /api/verify/challenge`).

**Cryptographic verification** runs in the MCP tool (`verify_identity.mjs`):

```js
// 1. Signature check
const recovered = ethers.verifyMessage(ethers.getBytes(proof.nonce), proof.signature)
const signatureValid = recovered.toLowerCase() === proof.wallet.toLowerCase()

// 2. On-chain: does this wallet own the soul on Polygon?
const contract = new ethers.Contract(SOUL_REGISTRY, OWNER_ABI, provider)
const owner = await contract.soulOwner(proof.soulId)
const onChainMatch = owner.toLowerCase() === proof.wallet.toLowerCase()
```

Ethers is a direct dependency in `soul-mcp/package.json` (`^6.13.4`).
Lua trusts the submitted proof — cryptographic verification deliberately happens in the MCP tool (Node.js).

---

## MCP Tool `verify_identity`

```
verify_identity({ method: "fingerprint" })
→ { challenge_id, verify_url, expires_at, ... }

verify_identity({ challenge_id: "abc123..." })
→ { status: "pending" | "verified" | "failed", verified_level, ... }
```

`verified_level`:
- `"biometric"` — one method succeeded
- `"2fa"` — biometrics + wallet signature

Typical Claude flow:
1. `verify_identity({ method: "fingerprint" })` → create challenge, output the URL
2. User opens the app, verifies
3. `verify_identity({ challenge_id: "..." })` → check status
4. Optional: `verify_identity({ challenge_id: "..." })` again after 2FA → `verified_level: "2fa"`

---

## Challenge File Format

```json
{
  "soul_id": "2c81aa74-...",
  "challenge_id": "a3f8b2c1...",
  "method": "fingerprint",
  "status": "verified",
  "verified_level": "2fa",
  "created_at": "2026-06-13T12:00:00Z",
  "expires_at": "2026-06-13T12:05:00Z",
  "verified_at": "2026-06-13T12:01:23Z",
  "wallet_2fa": {
    "address": "0xAbCd...1234",
    "signature": "0x...",
    "signed_at": "2026-06-13T12:02:10Z"
  }
}
```

---

## Known Limitations & Roadmap

- [ ] **Face liveness check** — blink detection (see above)
- [ ] **Voice MFCC** — mel filterbank for better speaker identification
- [x] **ethers.js verifyMessage** enabled + on-chain `soulOwner` check implemented
- [ ] **Vault audio fallback** — if the vault is locked, show an error with unlock instructions
- [ ] **Challenge cleanup** — delete expired JSON files in `/var/lib/sys/verify/` (cron or on `verify_pending`)
- [ ] **Motion verification** (motion_face / motion_body from vault) — deferred, since blink-based liveness is sufficient for now
- [ ] **registered_wallet cross-check** — verify `verified_wallet` from `api_context.json` against the 2FA address

---

## Vault Reference Data

| Type | Path | Used for |
|---|---|---|
| Face | `vault/images/profile.png` | Claude Vision comparison |
| Voice | `vault/audio/voice_<soul_id>_<date>.mp3` | FFT spectral comparison |
| Motion | `vault/video/motion_face_*.mp4` | (not yet implemented) |
| Profile JSON | `vault/profile/face.json` etc. | Structured metadata |
