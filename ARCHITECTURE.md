# Personal SYS VPS — Architecture

For setup and operations: [ONBOARDING.md](ONBOARDING.md)

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
│  /api/soul/pay          → soul_pay.lua  (public, POL)   │
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
│  earnings.json           POL payment records            │
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
cert_version: 0
soul_cert: [generated automatically]
vault_hash: ""
soul_growth_chain: []
soul_chain_anchor: null
storage_tx: ""
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
| **Agent Sandbox** | `<!-- AGENT:START/END -->` | Owner + paid agents | Owner only |

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
| `cert_version` | integer | Cert rotation counter. Incremented by `soul_rotate_cert`. |
| `soul_cert` | hex(32) | HMAC-SHA256 cert. Issued by the server, stored in the browser. |
| `vault_hash` | string | SHA-256 of the last vault snapshot. |
| `soul_growth_chain` | array | Growth milestones (maturity-based). |
| `soul_chain_anchor` | object | Blockchain anchor (Polygon tx + IPFS CID). |
| `storage_tx` | string | IPFS/Arweave reference of last cloud push. |

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

**Gate protection:** A gate (`gate_auth.lua`) sits in front of the soul cert. The gate password is stored as `HMAC-SHA256(raw_master_key, "gate_pw:" + password)` in `master.json`. Sessions live in an OpenResty shared dict.

**Three auth paths:**

| Path | Token format | Use |
|------|-------------|-----|
| Soul cert | `{uuid}.{32 hex}` | Owner operations (upload, update, delete) |
| Service token | `{64 hex}` | External services with granular permissions |
| BIP39 mnemonic | 12 words in POST body | Cipher-mode auth without stored token |
| POL access token | `{48 hex}` | Paid external agent access (amortization) |

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
  "access_password_hash": "<hmac-sha256>"
}
```

`config_reader.lua` reads via `M.get_master_path()` using the domain-specific path — multiple isolated domains on one OpenResty instance without conflicts.

**Multi-Hoster flag:** When `init.sh` is run in Multi-Hoster mode, `master.json` receives `"multi_hoster": true`. This causes `soul_cert.lua` to skip the node soul lock and `node_status.lua` to always return `locked: false`.

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

Setup: enter the peer's `soul_id` in the **Agent Marketplace → Connected Peers** field and save. The connecting soul uses their own `soul_id.soul_cert` as Bearer token — their credentials never leave their system, yours never leave yours.

**Token type detection in `soul-mcp/server.mjs`:**

| Token format | Type | Access |
|---|---|---|
| 64 hex chars | service_token (OAuth owner) | full tools + full sys.md |
| 48 hex chars | pol_access_token (paying agent) | agent_tools only |
| uuid.32hex | peer soul_cert | agent_tools + Social Sphere only |

Whitelist stored in `api_context.json` under `amortization.trusted_souls[]`.

For **cross-domain peers** (on a different server), add the peer as `{ "soul_id": "uuid", "endpoint": "https://peer.domain" }`. The peer can then access the Social Sphere via `GET /api/soul/social-read` with their cert — the endpoint verifies the cert against the peer's home server via `/api/soul/verify-peer-cert`.

---

## Amortization (Agent Marketplace)

Souls can expose MCP access for paid external agents using Polygon (POL) payments:

```
External agent → POST /api/soul/pay { soul_id, tx_hash }
              → Polygon TX verified on-chain
              → pol_access_token issued (1h validity)
              → POST /mcp with Bearer pol_access_token
              → access restricted to configured agent_tools
```

Per-soul configuration stored in:
- `api_context.json` → `amortization` object (pricing, wallet, agent_tools)
- `{soul_id}/pinata_jwt` → Pinata JWT for IPFS soul registration
- `{soul_id}/earnings.json` → payment ledger

Agent Marketplace endpoints: `/api/soul/register`, `/api/soul/amortization`, `/api/soul/pinata-config`, `/api/soul/pay`, `/api/soul/paid-read`, `/api/soul/paid-write`, `/api/soul/paid-beme`, `/api/soul/paid-context`, `/api/soul/paid-profile/{type}`

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

Rate limit zones are globally defined in `/etc/openresty/nginx.conf`:

| Zone | Rate | Applied to |
|------|------|-----------|
| `chat` | 2 r/s | `/api/chat`, vision endpoints |
| `api` | 5 r/s | `/api/vault/*` |
| `gate` | 5 r/min | `/gate`, gate auth endpoints |
| `mcp` | 10 r/s burst | `/mcp` |
| `oauth` | 5 r/s burst | `/oauth/*` |

---

## MCP Server

`soul-mcp/` — Node.js MCP server with OAuth 2.0 + PKCE, port 3098, accessible via OpenResty at `/mcp`.

**Available tools (owner):** `soul_read`, `soul_write`, `soul_maturity`, `soul_skills`, `soul_earnings`, `soul_discover`, `soul_cloud_push`, `profile_get`, `profile_save`, `audio_list`, `audio_get`, `image_list`, `image_get`, `video_list`, `video_get`, `context_get`, `context_list`, `vault_manifest`, `verify_human`, `beme_chat`, `elevenlabs_agent_update`

**Available tools (paid agent / pol_access_token):** configured per soul via `amortization.agent_tools` (13 options: `soul_read`, `soul_maturity`, `soul_skills`, `audio_get`, `audio_list`, `image_get`, `image_list`, `video_get`, `video_list`, `context_get`, `context_list`, `profile_get`, `verify_human`)

**Available tools (trusted peer soul):** same list as paid agents — `soul_read` returns the Social Sphere block only; `soul_write` and `soul_comment` write only to the Social Sphere block

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
| `useConnectedVault` | Public vault context from peer souls via MCP |

---

## Environment Variables

Server secrets (via systemd override, never in the build):

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API (chat + vision). Optional — can also be set via Admin UI. |
| `SOUL_MASTER_KEY` | HMAC root key for soul_cert. Never expose. |
| `API_SIGNING_KEY` | Secondary signing key for service tokens. |

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
Copyright © 2026 Jan-Oliver Karo — UX-Projects, Marburg, Germany
