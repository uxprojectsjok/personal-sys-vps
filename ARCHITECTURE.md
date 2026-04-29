# SaveYourSoul — Architecture & Protocol Specification

> **Protocol, not a product.**
> This document describes the SYS protocol specification and its reference implementation. The reference implementation is invite-only and serves as a living proof-of-concept. It is not a deployable product. Anyone building a compatible implementation does so independently.
>
> **Note:** This file is superseded by the structured documentation in [docs/](docs/). It is retained for context.

---

## Overview

SYS defines a portable, user-controlled identity layer for AI systems. The core unit is the **sys.md** — a Markdown file with YAML frontmatter that encodes a personal identity profile and grows with each interaction. The sys.md never leaves the user's device unless the user explicitly initiates a transfer.

```
┌─────────────────────────────────────────────────────┐
│                   Browser (SPA)                     │
│  sys.md → sessionStorage  (cleared on tab close)   │
│  Vault → local filesystem  (File System Access API) │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS / TLS
                     ▼
┌─────────────────────────────────────────────────────┐
│              OpenResty (nginx + Lua)                │
│                                                     │
│  /               → Static SPA  (.output/public/)    │
│  /api/soul-cert  → soul_cert.lua   (unauthenticated)│
│  /api/chat       → soul_auth.lua  → Anthropic API   │
│  /api/soul       → vault_auth.lua → sys.md serve   │
│  /api/context    → vault_auth.lua → api_context.lua │
│  /api/vault/*    → vault_auth.lua → vault_sync.lua  │
│  /api/webhook    → vault_auth.lua → webhook.lua     │
│  /mcp            → soul-mcp (Node.js :3098)         │
│  /oauth/         → soul-mcp (Node.js :3098)         │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│       /var/lib/sys/souls/{soul_id}/                 │
│                                                     │
│  sys.md              identity file (enc. or plain) │
│  api_context.json     permissions + vault index     │
│  soul_connections.json  network connections         │
│  vault/audio/           audio files                 │
│  vault/images/          image files                 │
│  vault/video/           video files                 │
│  vault/context/         context/text files          │
└─────────────────────────────────────────────────────┘
```

---

## Two-Environment Design

**Development:** `npm run dev` starts Nuxt 4 with the Nitro server. API routes live in `server/api/*.js`. No OpenResty needed.

**Production:** `npm run generate` produces a pure static SPA in `.output/public/`. No Node.js process runs in production. All API logic is handled by OpenResty Lua scripts. The Nitro routes exist only to mirror the Lua backend for local development.

```
Dev:   Browser → Nuxt/Nitro (localhost:3007) → API handlers in server/api/
Prod:  Browser → OpenResty → Lua scripts in /etc/openresty/lua/
```

---

## sys.md — Protocol Specification

The sys.md is a standard Markdown file. The YAML frontmatter is machine-readable; the body is structured by `## Section` headings.

```markdown
---
soul_id: 00000000-0000-0000-0000-0000000000000
soul_name: ""
created: YYYY-MM-DD
last_session: YYYY-MM-DD
version: 1
soul_cert: [automatically generated]
vault_hash: ""
soul_growth_chain: []
soul_chain_anchor: null
storage_tx: ""
---

## Core Identity

_Who is this person in one sentence?_

## Values ​​& Beliefs

_What motivates them? What do they believe in?_

## Aesthetics & Resonance

_Music, atmospheres, visual stimuli that attract this person._

## Speech Patterns & Expression

_How do they speak? How does she write?_

## Recurring Themes & Obsessions

_What keeps coming back to her?_

## Emotional Signature

_What is it like to talk to her?_

## Worldview

_How does she see the world? What is her view of humanity?_

## Unanswered Questions from this Person

_What is she still looking for?_

## Session Log (compressed)

...

## Calendar

...

**Frontmatter fields:**

| Field        | Type     | Description                                                        |
| ------------ | -------- | ------------------------------------------------------------------ |
| `soul_id`    | UUID v4  | Globally unique identifier. Primary key for all server operations. |
| `name`       | string   | Display name (chosen by user).                                     |
| `version`    | string   | sys.md schema version.                                            |
| `created_at` | ISO 8601 | Creation timestamp.                                                |
| `updated_at` | ISO 8601 | Last modification timestamp.                                       |
| `maturity`   | 0–100    | Computed completeness score. See `shared/utils/soulMaturity.js`.   |

**Section names** are freeform `## Headings`. The MCP `soul_write` tool targets sections by name. Parsers must handle missing sections gracefully (treat as empty, not as error).

---

## Authentication Model

All protected API endpoints validate an **HMAC-SHA256 soul_cert** token.
```

cert = HMAC-SHA256(SOUL_MASTER_KEY, soul_id).hex()[:32]
bearer = soul_id + "." + soul_cert

```

The server recomputes the expected cert and compares with constant-time equality. No database lookup. No session state. The cert is stateless — it is always the same for a given `soul_id` + `SOUL_MASTER_KEY` pair.

**Cert rotation:** Changing `SOUL_MASTER_KEY` invalidates all existing certs simultaneously. There is no per-user cert rotation without key rotation.

**Three auth paths:**

| Path           | Token format          | Used for                                     |
| -------------- | --------------------- | -------------------------------------------- |
| Soul-Cert      | `{uuid}.{32hexchars}` | Owner operations (upload, update, delete)    |
| Service-Token  | `{64hexchars}`        | External services with granular permissions  |
| BIP39-Mnemonic | 12 words in POST body | Direct cipher-mode auth without stored token |

---

## Encryption Layers

```

Local (browser only):
sys.md + vault files → AES-256-GCM → .soul bundle
Key: derived from Passkey (WebAuthn) or BIP39 mnemonic
Server never sees this key.

VPS upload (default):
sys.md + vault files → AES-256-CBC → stored on VPS
Magic prefix: SYSCRYPT01 (bytes: 53 59 53 01)
Format: [4 magic bytes][16 IV bytes][ciphertext]
Key: vault_key_hex stored in api_context.json
Server can decrypt for authorized service-token requests.

Transit:
All API traffic over TLS 1.2+.
soul_cert is a Bearer token — TLS is the transport security.

```

**Key derivation (AES-256-GCM bundle):** PBKDF2-SHA256, 100 000 iterations, 32-byte output, random 16-byte salt prepended to bundle.

---

## VPS Data Layout

```

/var/lib/sys/souls/{soul_id}/
├── sys.md ← SYSCRYPT01 prefix if encrypted
├── api_context.json ← permissions, vault_key_hex, synced_files index
├── soul_connections.json ← peer connections (soul_id, alias, grant level)
└── vault/
├── audio/
├── images/
├── video/
└── context/

````

**api_context.json structure:**

```json
{
  "synced_files": {
    "profiles": ["expertise"],
    "audio": ["voice_2c81aa74_2026-04-08.webm"],
    "context": ["soul_hash.txt"]
  },
  "active_files": {
    "audio": "voice_2c81aa74_2026-04-08.webm",
    "context": "soul_hash.txt"
  },
  "cipher_mode": "ciphered",
  "enabled": true,
  "vault_key_hex": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "permissions": {
    "soul": true,
    "calendar": true,
    "audio": true,
    "video": true,
    "images": true,
    "context_files": true
  },
  "updated_at": 1775729499.837,
  "webhook_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
````

---

## MCP Server

The `soul-mcp/` directory contains a Node.js MCP server implementing the [Model Context Protocol](https://modelcontextprotocol.io) with OAuth 2.0 + PKCE authorization.

**Runtime:** Node.js 20+, port 3098, proxied by OpenResty at `/mcp`.

**OAuth flow:**

```
1. GET  /oauth/authorize         → Consent page (HTML, shows soul_id + permissions)
2. POST /oauth/authorize         → Validate soul_cert → issue auth code (in-memory, 5 min TTL)
3. POST /oauth/token             → code + PKCE verifier → access token (= service-token)
4. All MCP tool calls            → Bearer {service-token} → soul API
```

**Available MCP tools:**

| Tool                                | Description                                               |
| ----------------------------------- | --------------------------------------------------------- |
| `soul_read`                         | Read the full sys.md content                             |
| `soul_write`                        | Update a `## Section` in sys.md (replace/append/prepend) |
| `soul_maturity`                     | Compute and update the maturity score                     |
| `soul_skills`                       | List and invoke soul skills                               |
| `profile_get` / `profile_save`      | reads and writes profiles to the Vault                    |
| `audio_list` / `audio_get`          | List and retrieve audio vault files                       |
| `image_list` / `image_get`          | List and retrieve image vault files                       |
| `context_get` / `context_list`      | Context file access                                       |
| `vault_manifest`                    | Full vault index                                          |
| `network_list` / `network_peer_get` | Soul Network connections                                  |
| `soul_cloud_push`                   | Push encrypted bundle to external storage                 |
| `verify_human`                      | Human-in-the-loop confirmation step                       |

---

## Rate Limiting

OpenResty enforces per-IP rate limits:

| Zone     | Rate   | Burst | Applied to                                        |
| -------- | ------ | ----- | ------------------------------------------------- |
| `chat`   | 1 r/s  | 5–30  | `/api/chat`, `/api/soul-update`, vision endpoints |
| `api`    | 30 r/s | 10–30 | General API endpoints                             |
| `auth`   | 5 r/s  | 2–5   | `/api/soul-cert`, `/api/validate`                 |
| `mcp`    | 5 r/s  | 10    | `/mcp` (MCP Streamable HTTP)                      |
| `oauth`  | 3 r/s  | 5     | `/oauth/` (token endpoint)                        |
| `system` | 2 r/s  | —     | Health and system endpoints                       |

---

## Frontend Architecture

- **Framework:** Nuxt 4, `ssr: false` (pure client-side rendering)
- **State:** No Pinia/Vuex. Module-level singleton refs in composables.
- **Key composables:** `useSoul`, `useVault`, `useApiContext`, `useClaude`
- **Fonts:** Served locally — Noto Serif (headings), Oxanium (UI), Remix Icons
- **CSS:** Tailwind + custom CSS properties. Dark-only, no light mode.
- **Build output:** Static SPA, deployed via rsync to webroot.

---

## Repository Structure

```
SaveYourSoul/
├── app/                    ← Nuxt 4 frontend
│   ├── pages/              ← Routes (session.vue, index.vue, api-docs.vue, …)
│   ├── components/         ← UI components
│   └── composables/        ← Shared state (useSoul, useVault, …)
├── server/
│   ├── api/                ← Nitro API routes (dev only, mirror of Lua scripts)
│   └── openresty/          ← Source for /etc/openresty/lua/ (prod)
├── shared/
│   └── utils/              ← soulParser.js, soulMaturity.js (shared dev+browser)
├── soul-mcp/               ← MCP server (Node.js)
│   ├── tools/              ← MCP tool implementations
│   ├── server.mjs          ← Entry point
│   └── oauth.mjs           ← OAuth 2.0 + PKCE
├── soul-whatsapp/          ← Twilio Serverless WhatsApp integration
├── soul-voice-clone/       ← ElevenLabs voice clone + agent
├── browser-extension/      ← Chrome MV3 extension
├── docs/                   ← Protocol documentation
├── test/                   ← sys.md test fixtures
└── utils/                  ← Build utilities (killMetas.mjs, …)
```

---

## Environment Variables

Three secrets are required on the server. They are injected via systemd service override — not stored in `.env` or baked into the build.

| Variable            | Purpose                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Anthropic Claude API (chat + vision)                             |
| `SOUL_MASTER_KEY`   | 32-byte hex. HMAC root key for soul_cert derivation.             |
| `API_SIGNING_KEY`   | 32-byte hex. Secondary signing key for service-token operations. |

One variable is baked into the client bundle at build time:

| Variable                   | Purpose                                                   |
| -------------------------- | --------------------------------------------------------- |
| `WALLETCONNECT_PROJECT_ID` | WalletConnect v2 project ID (optional blockchain feature) |

---

## License

Apache License 2.0. See [LICENSE](LICENSE).

The sys.md format, API conventions, and MCP tool schema are intended as an open protocol. Compatible implementations are encouraged — independent of this reference implementation.

---

_Reference implementation: invite-only · Operator: UX-Projects – Jan-Oliver Karo, Marburg, Germany_
_This is experimental software. No warranty. Invite-only access._
