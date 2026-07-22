# Personal SYS VPS — Architecture

For setup and operations, see [README: Installation](README.md#installation) and [Updating Your Node](README.md#updating-your-node).

---

## Overview

```
┌──────────────────────────────────────────────────────────┐
│                    Browser (SPA)                         │
│  sys.md       → sessionStorage  (cleared on tab close)  │
│  Vault        → File System Access API (local)          │
│  Encryption   → WebCrypto API  (key never leaves        │
│                                 the browser)             │
└───────────────────────────┬──────────────────────────────┘
                            │ HTTPS / TLS
                            ▼
┌──────────────────────────────────────────────────────────┐
│               OpenResty (nginx + LuaJIT)                 │
│                                                          │
│  /                   → Static SPA (.output/public/)      │
│  /gate               → gate_auth.lua  (password gate)   │
│  /api/soul-cert      → soul_cert.lua  (unauthenticated) │
│  /api/chat           → soul_auth.lua → Anthropic API    │
│  /api/soul           → vault_auth.lua → api_serve.lua   │
│  /api/vault/*        → vault_auth.lua → vault_sync.lua  │
│  /api/node-status       → node_status.lua               │
│  /api/soul/social-read → soul_social_read.lua (peer)    │
│  /api/soul/pay/x402     → soul_pay_x402.lua (public)     │
│  /api/soul/paid-read    → soul_paid_read.lua            │
│  /mcp                   → soul-mcp (Node.js :3098)      │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│          /var/lib/sys/souls/{soul_id}/                   │
│                                                          │
│  sys.md                  Identity file (enc. or plain)  │
│  api_context.json        Permissions + vault index      │
│  usdc_earnings.json      x402/USDC payment records       │
│  earnings.json           POL payment records (legacy)   │
│  pinata_jwt              Per-soul IPFS/Pinata JWT       │
│  vault/audio/                                            │
│  vault/images/                                           │
│  vault/video/                                            │
│  vault/context/                                          │
│  vault/profiles/                                         │
└──────────────────────────────────────────────────────────┘

Config: /var/lib/sys/config/{domain}/master.json
```

---

## Two-Environment Design

**Development:** `npm run dev` starts Nuxt 4 + Nitro. API routes in `server/api/*.js`.

**Production:** `npm run generate` produces a static SPA in `.output/public/`. No Node.js process runs in production. All API logic is handled by OpenResty via Lua scripts in `/etc/openresty/lua/`.

```
Dev:   Browser → Nuxt/Nitro (localhost:3007) → server/api/*.js
Prod:  Browser → OpenResty  → /etc/openresty/lua/*.lua
```

Nitro routes are a dev-only mirror of the Lua scripts. When changing API logic, keep both in sync.

---

## sys.md Format (v3)

sys.md v3 uses a three-sphere protection model, plus a crystallized long-term memory layer (LONGMEM) that gains a persistent 3D index (MINDIDX) at first crystallization. Full specification: [docs/spec/sys_md.md](docs/spec/sys_md.md)

```markdown
---
soul_id: 00000000-0000-0000-0000-000000000000
soul_name: ""
created: YYYY-MM-DD
last_session: YYYY-MM-DD
version: 3
soul_cert: [generated automatically]
vault_hash: ""
storage_tx: ""
elevenlabs_agent_id: ""
elevenlabs_voice_id: ""
---

<!-- LONGMEM + MINDIDX appear here automatically once the Archivist first
     crystallizes this soul — see docs/spec/sys_md.md for the full lifecycle -->

## Core Identity        ← Private Sphere (owner only)
## Values & Beliefs
## Aesthetics & Resonance
## Language Patterns & Expression
## Recurring Themes & Obsessions
## Emotional Signature
## Worldview
## Open Questions
## Session Log (compressed)

## Social Sphere        ← visible to trusted peer souls
<!-- SOCIAL:START -->
<!-- SOCIAL:END -->

## Agent Sandbox        ← visible to paid external agents
<!-- AGENT:START -->
<!-- AGENT:END -->
```

**Three-sphere access model:**

| Sphere | Delimiter | Who reads | Who writes |
|---|---|---|---|
| **Private Sphere** | All `## sections`, LONGMEM, MINDIDX | Owner only | Owner + the Archivist |
| **Social Sphere** | `<!-- SOCIAL:START/END -->` | Owner + trusted peers | Owner + trusted peers |
| **Agent Sandbox** | `<!-- AGENT:START/END -->` | Owner + paid agents | Owner + paid agents (append-only comment via `soul_paid_comment`) |

**LONGMEM + MINDIDX:** once the background Archivist (`soul-mcp/lib/herz.mjs`) first crystallizes a soul, two blocks are inserted right after the frontmatter — `LONGMEM` (crystallized facts/memories/ideas/learnings) and `MINDIDX` (a 3-axis index over it: category, relevance score, status/recency — applying the [MIND](https://github.com/uxprojectsjok/mind) discovery-format technique to personal long-term memory instead of a network of nodes). Lazy, no forced migration — see `docs/spec/sys_md.md` for the full lifecycle and consumer list.

**v1 → v2 migration:** Existing souls (version: 1) are auto-migrated on first peer access — the Social Sphere block is inserted before the Agent Sandbox block (or at end of file), and `version` is bumped to 2. **v2 → v3** needs no migration — `version: 3` is only set for newly created souls; existing souls gain LONGMEM/MINDIDX the same way any soul does, at their next crystallization.

**Frontmatter fields:**

| Field | Type | Description |
|-------|------|-------------|
| `soul_id` | UUID v4 | Global primary key. Basis for all cert calculations. |
| `soul_name` | string | Display name (chosen by the user). |
| `created` | ISO 8601 | Creation date. |
| `last_session` | ISO 8601 | Last session date. |
| `version` | integer | sys.md schema version. `1` = legacy, `2` = three-sphere, `3` = MIND-aware (LONGMEM/MINDIDX lifecycle). |
| `soul_cert` | hex(32) | HMAC-SHA256 cert. Issued by the server, stored in the browser. |
| `vault_hash` | string | SHA-256 of the last vault snapshot. |
| `storage_tx` | string | IPFS/Arweave reference of last cloud push. |
| `elevenlabs_agent_id` / `elevenlabs_voice_id` | string | ElevenLabs conversational agent + voice clone, if created. |

Three more fields exist but aren't part of a freshly created soul — `buildDefaultSoul()` (`app/composables/useSoul.js`) never writes them; each is added the first time its feature is used:

| Field | Type | Added when |
|-------|------|-------------|
| `cert_version` | integer | First soul_cert rotation (`soul_rotate_cert`) |
| `soul_growth_chain` | array | First session-signing growth entry |
| `soul_chain_anchor` | object | First on-chain anchor transaction (Polygon tx + IPFS CID) |

---

## Authentication Model

**HMAC-SHA256 Soul Cert:**

```
cert     = HMAC-SHA256(SOUL_MASTER_KEY, soul_id + ":" + cert_version).hex()[:32]
bearer   = soul_id + "." + cert
```

The server recalculates the expected cert and compares with constant-time equality. No database lookup, no session state.

**Cert rotation:** `cert_version` can be incremented (`soul_rotate_cert.lua`) without changing `SOUL_MASTER_KEY`. Old certs (lower `cert_version`) become invalid.

**Cert-version fallback:** If `api_context.json` is missing (e.g. after vault deletion), `soul_auth.lua` falls back to trying cert versions 0–20 before rejecting. This prevents lockout after vault operations.

`/var/lib/sys/souls/{soul_id}/api_context.json` — per-soul permissions and vault key, the file this fallback protects against:

```json
{
  "soul_cert_version": 0,
  "vault_key_hex": "<64hex>",
  "cipher_mode": "ciphered",
  "permissions": { "soul": true, "audio": true, "video": true, "images": true, "context_files": true }
}
```

**Gate protection:** A gate (`gate_auth.lua`) sits in front of the soul cert. The gate password is stored as `HMAC-SHA256(raw_master_key, "gate_pw:" + password)` in `master.json`. Sessions live in an OpenResty shared dict.

**Three auth paths:**

| Path | Token format | Use |
|------|-------------|-----|
| Soul cert | `{uuid}.{32 hex}` | Owner operations (upload, update, delete) |
| Service token | `{64 hex}` | External services with granular permissions |
| BIP39 mnemonic | 12 words in POST body | Cipher-mode auth without stored token |
| Access token | `{48 hex}` | Paid external agent access (amortization, x402 or PayPal) |

---

## Encryption

**Server-side (default):**
```
sys.md + vault files → AES-256-CBC → stored on VPS
Magic prefix: SYSCRYPT01  (bytes: 53 59 53 01)
Format: [4 magic][16 IV][ciphertext]
Key: vault_key_hex in api_context.json
```

**Local (browser bundle, optional):**
```
sys.md + vault → AES-256-GCM → .soul bundle
Key: PBKDF2-SHA256, 100,000 iter., 32 bytes, salt prepended
Key never leaves the browser.
```

**Transit:** TLS 1.2+. Soul cert is a bearer token — TLS provides transport security.

---

## Gate & Multi-Domain

`/var/lib/sys/config/{domain}/master.json` — isolated per domain:

```json
{
  "soul_master_key": "sys_<64hex>",
  "soul_master_key_prev": "",
  "prev_valid_until_ts": 0,
  "access_password_hash": "<hmac-sha256>",
  "admin_token": "adm_<64hex>",
  "multi_hoster": false,
  "node_soul_id": ""
}
```

Also accumulates operator-configured service settings once set via Settings (Anthropic/ElevenLabs keys, `mcp_url`, `reown_project_id`, …) — omitted above for brevity.

`config_reader.lua` reads via `M.get_master_path()` using the domain-specific path — multiple isolated domains on one OpenResty instance without conflicts.

**Multi-Hoster flag:** When `init.sh` is run in Multi-Hoster mode, `master.json` receives `"multi_hoster": true`. This causes `soul_cert.lua` to skip the node soul lock and `node_status.lua` to always return `locked: false`. `node_soul_id` is what that lock checks in Personal mode — the single owner soul's ID, set once at first registration.

---

## Soul-to-Soul Connections (Trusted Peers)

Peer souls connect via the MCP endpoint — no handshake, no separate protocol.

```
Soul B → POST /mcp  Authorization: Bearer soul_id_B.soul_cert_B
       → server checks: is soul_id_B in amortization.trusted_souls?
       → yes → registerPaidTools with agent_tools
               → soul_read returns Social Sphere block (not full sys.md)
               → soul_write writes only to Social Sphere block
       → no  → 401
```

Setup: add the peer's `soul_id` on the dedicated **Peers** page (`app/pages/peers.vue`). Stored server-side under `amortization.trusted_souls` regardless of UI entry point — same backend the Agent Marketplace uses for paid-agent access, different frontend. The connecting soul uses their own `soul_id.soul_cert` as Bearer token — their credentials never leave their system, yours never leave yours.

**Token type detection in `soul-mcp/server.mjs`:**

| Token format | Type | Access |
|---|---|---|
| 64 hex chars | service_token (OAuth owner) | full tools + full sys.md |
| 48 hex chars | access_token (paying agent, x402 or PayPal) | agent_tools only |
| uuid.32hex | peer soul_cert | agent_tools + Social Sphere only |

Whitelist stored in `api_context.json` under `amortization.trusted_souls[]` — a mixed array, plain UUID for same-server peers, `{soul_id, endpoint}` for cross-domain:

```json
"trusted_souls": [
  "2c81aa74-1234-4a3b-9c21-abcdef123456",
  { "soul_id": "9f3d21a0-5678-4c9e-bb12-fedcba654321", "endpoint": "https://peer.example.com" }
]
```

For **cross-domain peers** (on a different server), add the peer as `{ "soul_id": "uuid", "endpoint": "https://peer.domain" }`. The peer can then access the Social Sphere via `GET /api/soul/social-read` with their cert — the endpoint verifies the cert against the peer's home server via `/api/soul/verify-peer-cert`.

---

## Amortization (Agent Marketplace)

Souls can expose MCP access for paid external agents. Two rails: x402 (USDC on Polygon, crypto-native agents) and PayPal (human buyers without a wallet, manually reviewed).

```
External agent → GET /api/soul/pay/x402  (no payment proof)
              → 402 + PAYMENT-REQUIRED header (amount, asset, payTo)
              → agent signs EIP-3009 transferWithAuthorization, retries
                with PAYMENT-SIGNATURE header
              → verified/settled via the Polygon x402 facilitator
              → access_token issued (1d default validity, configurable)
              → POST /mcp with Bearer access_token
              → access restricted to configured agent_tools
```

Per-soul configuration stored in:
- `api_context.json` → `amortization` object (`price_usdc`, wallet, agent_tools, PayPal target)
- `{soul_id}/pinata_jwt` → Pinata JWT for IPFS soul registration
- `{soul_id}/usdc_earnings.json` → x402 payment ledger
- `{soul_id}/earnings.json` → legacy POL payment ledger (historical, rail retired)

Agent Marketplace endpoints: `/api/soul/register`, `/api/soul/amortization`, `/api/soul/pinata-config`, `/api/soul/pay/x402`, `/api/soul/paid-read`, `/api/soul/paid-write`, `/api/soul/paid-beme`, `/api/soul/paid-context`, `/api/soul/paid-profile/{type}`

### AI/Agent Payments — Operator's Own x402 Wallet (Experimental)

Everything above is the soul's *receiving* side. To test the other direction — an agent actually *paying* via x402 — the operator can equip their own node with a dedicated wallet: export a private key from a MetaMask account and paste it into Settings → x402. It's stored AES-256-GCM encrypted with its own dedicated encryption key (`soul-mcp/lib/x402_agent_wallet.mjs`), and signs real payments on **Polygon mainnet** via `@x402/evm` + viem (`x402_client.mjs`) — not a testnet, not simulated.

> [!WARNING]
> A private key means full, irreversible control over whatever funds that wallet holds. This is explicitly designed for a small, dedicated MetaMask account created only for this purpose — the Settings UI itself says it: **never paste in the private key of a wallet you use for anything else.** There is no recovery path if the key or the server is compromised.

Autonomous AI-driven payments are an early, experimental capability industry-wide, not something unique to this codebase. SYS's implementation is deliberately scoped as operator test tooling — a manual "Send test payment" button in Settings, node-global rather than soul-scoped — not a production "give your AI a spending budget" feature. Treat it as a future-facing capability being tried out, not a hardened one.

---

## On-Chain Anchoring

```
Soul hash → anchor() → Polygon Mainnet
                     → IPFS (content)
                     → soul_chain_anchor in sys.md
```

Smart contract: `0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B` (Polygon Mainnet)
Requires own `REOWN_PROJECT_ID` (free: cloud.reown.com).

---

## Rate Limiting

Rate limit zones are globally defined in `nginx.conf`'s `http` block (`limit_req_zone`), applied per-location via `limit_req zone=...`:

| Zone | Rate | Applied to (examples) |
|------|------|-----------|
| `api` | 30 r/s | General API catch-all — 56 locations, e.g. `/api/create-agent`, `/api/elevenlabs-token`, `/api/diagnose` |
| `chat` | 1 r/s | 49 locations, e.g. `/api/tts`, `/api/x402/agent/pay`, `/api/agent/post-call` |
| `auth` | 5 r/s | 25 locations, e.g. `/api/soul/peer-inbox`, `/api/soul/verify-peer-cert`, `/api/peer/verify` |
| `chat_api` | 2 r/s | `/api/chat` |
| `vault_upload` | 5 r/s | `/api/vault/sync`, `/api/vault/shared` |
| `gate` | 5 r/min | `/api/gate-auth` |
| `mcp` | 5 r/s burst 10 | `/mcp` |
| `oauth` | 3 r/s burst 5 | `/oauth/` |

Three more zones (`main` 10 r/s, `system` 2 r/s, `health` 30 r/s) are declared in `nginx.conf` but not currently applied to any location — reserved, not dead config to remove.

---

## MCP Server

`soul-mcp/` — Node.js MCP server with OAuth 2.0 + PKCE, port 3098, accessible via OpenResty at `/mcp`.

**Available tools (owner):** effectively every registered tool (~45) — `registerTools()` in `soul-mcp/tools/index.mjs`, reachable via MCP OAuth (Claude Desktop, Claude Code, ChatGPT connectors, …) or the ElevenLabs voice agent. Includes full sys.md/mind.md read-write, all vault media, health, shopping, peer messaging, and account-level tools (`soul_delete`, `soul_cloud_push`, `create_agent`) no other tier gets. The ElevenLabs voice agent (`lua/create_agent.lua`) uses a separately curated ~27-tool webhook list rather than the raw MCP protocol — generous, but not literally identical to the owner's MCP set.

**Available tools (paid agent / access_token):** configured per soul via `amortization.agent_tools` (16 configurable options: `soul_read`, `verify_human`, `soul_maturity`, `soul_skills`, `audio_list`, `audio_get`, `image_list`, `image_get`, `video_list`, `video_get`, `context_list`, `context_get`, `profile_get`, `beme_chat_paid`, `health_check_payed`, `shop_write_read`), plus `soul_discover`, `soul_preview`, `soul_paid_comment`, and read-only `vault_shared_get`/`vault_shared_list` always available regardless of configuration. Never gets `soul_write` or `soul_earnings`.

**Available tools (trusted peer soul):** a distinct, fixed tool set (`registerPeerTools()`) — not the same list as paid agents, and no per-tool allowlist (every trusted peer gets the same set). Peer-specific implementations that read directly from the filesystem, since a peer's own soul_cert isn't valid on the target server: `soul_read`/`soul_write` (Social Sphere only), `verify_human`, `soul_maturity`, `soul_skills`, `soul_context_query`, `profile_get`, per-media-type vault list/get (audio, images, video, context), plus `soul_discover`/`soul_preview`.

---

## Frontend

- **Framework:** Nuxt 4, `ssr: false` — pure client-side rendering
- **State:** No Pinia/Vuex. Module-level singleton refs in composables
- **Fonts:** Served locally — Noto Serif (headings), Oxanium (UI), Remix Icons
- **CSS:** Tailwind + CSS custom properties. Dark-only, no light mode
- **Build:** Static SPA, deployed by `init.sh` to the webroot

**Key composables:**

| Composable | Responsibility |
|------------|---------------|
| `useSoul` | sys.md content, soul_cert, maturity |
| `useVault` | File System Access API, image preprocessing |
| `useApiContext` | API permissions, AES-256-CBC vault encryption |
| `useChainAnchor` | Polygon + IPFS blockchain anchoring |
| `useClaude` | Claude API SSE streaming |
| `useConnectedVault` | Public vault context from peer souls via `/api/vault/public/{soul_id}` (plain REST, not MCP) |

---

## Environment Variables

Server secrets (via systemd override, never in the build):

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API (chat + vision). Optional — can also be set via Admin UI. |
| `SOUL_MASTER_KEY` | HMAC root key for soul_cert. Never expose. |
| `API_SIGNING_KEY` | Secondary signing key for service tokens. |
| `ELEVENLABS_API_KEY` | ElevenLabs voice features (TTS/STT, conversational agent). Optional. |

Baked into the build (read from `.env` at build time):

| Variable | Purpose |
|----------|---------|
| `REOWN_PROJECT_ID` | Reown Project ID (optional, anchoring feature). Cannot be changed post-build. |
| `NODE_NAME` | Display name of the node on the landing page. |
| `NODE_TAGLINE` | Node subtitle (optional). |

---

## Critical OpenResty Configuration Notes

### Anthropic Proxy: Origin header

**Symptom:** `/api/chat` returns 401 from Anthropic despite valid soul cert.
**Cause:** Browsers send an `Origin` header automatically. OpenResty forwards it to Anthropic, which rejects direct browser requests.

**Fix** — required in every Anthropic proxy location block:
```nginx
proxy_set_header Origin  "";
proxy_set_header Referer "";
```

### Environment variables in nginx workers

nginx strips all environment variables from worker processes except those explicitly declared. Add to `nginx.conf` main block (outside `http {}`):

```nginx
env ANTHROPIC_API_KEY;
env SOUL_MASTER_KEY;
env API_SIGNING_KEY;
env ELEVENLABS_API_KEY;
```

After changing the systemd override or `nginx.conf`, use `systemctl restart openresty` (not just `reload`) so the master process picks up new environment variables.

### Lua package path

Required in the `http` block so `require("hmac_helper")` and other local modules resolve:

```nginx
lua_package_path "/etc/openresty/lua/?.lua;;";
```

Without this line, `require()` calls fail with 500.

---

## License

Apache License 2.0 — see [LICENSE](LICENSE).
Copyright © 2026 UX-Projects Jan-Oliver Karo, Marburg, Germany
