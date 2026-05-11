# SaveYourSoul — Personal SYS Node

> ⚠️ **Work in progress — not ready for use.**
> This repository reflects an actively developed system. Core features are live and running in production, but the codebase is in ongoing refinement. **Multi-hoster mode is in final testing.** Expect breaking changes, incomplete documentation, and missing setup steps. Do not attempt to run this yourself at this stage — a guided setup and public release will follow once the final testing phase is complete.
>
> 🌐 For an overview of the protocol and vision: [sys.uxprojects-jok.com](https://sys.uxprojects-jok.com)

---

**Your node on the internet. As a human.**

A SYS node is not a service someone runs for you — it runs on your server, under your domain, with your data. You are the owner, the operator, and the sole user.

The node is where your **sys.md** lives: a personal identity file you can feed into AI systems. It grows with every session, belongs exclusively to you, and leaves your server only when you actively decide to share it.

> **Decentralized, self-hosted, password-protected.**
> No provider has access. No cloud dependency. No terms of service that can change.

---

## What is a SYS node?

A SYS node is your personal endpoint on the internet — like an email address, but for your identity as a human in a world with AI.

```
You  →  sys.md (your identity file)
     →  SYS node (your VPS, your domain)
     →  AI systems (Claude, MCP tools, WhatsApp bot, …)
     →  other SYS nodes (peer-to-peer, encrypted)
```

The node accepts souls per its configured mode. In **Personal** mode, the first person to register becomes the permanent owner. In **Multi-Hoster** mode, multiple souls share one VPS (families, teams, hosting services).

### What the node does

**Identity & Authentication**
- sys.md stored encrypted (AES-256-CBC, key stays in the browser)
- HMAC-SHA256 soul_cert — stateless, no cookies, no OAuth
- Gate password protects the entire interface

**AI Features**
- Chat with Claude (Anthropic API, SSE streaming, context control)
- Vision analysis: camera image → Claude → description or image generation
- Text-to-speech via ElevenLabs (voice cloning supported)
- AI image generation via WaveSpeed AI
- Soul update: Claude writes structured data into sys.md sections

> **Third-party services disclaimer:** The AI and voice services listed above (Anthropic, ElevenLabs, WaveSpeed AI, Twilio, WalletConnect, Pinata, Polygon) are independent third-party providers. I am not affiliated with, endorsed by, or a partner of any of them. Their inclusion in this codebase reflects my own personal technical choices at the time of writing — nothing more. Each operator who runs this software must independently evaluate these services, agree to their respective terms of use, and take full responsibility for their integration. You are free to swap in any compatible alternative.

**Vault**
- Local vault (File System Access API, no upload needed)
- Server vault: images, audio, video, context files — encrypted upload
- Optional vault encryption (AES-256-CBC, magic header `SYSCRYPT01`)
- File viewer, audio player, video player built in

**Networking**
- MCP server (OAuth 2.0 + PKCE) — Claude and other AI clients connect
- Soul whitelist: trusted souls connect via MCP using their own soul_cert — no handshake, no setup
- WhatsApp integration via Twilio (personal bot with soul context)
- Browser extension (Chrome MV3) for automatic soul_cert injection

**Growth & Anchoring**
- Soul Growth Chain: every session is cryptographically signed
- Blockchain anchoring on Polygon (optional, user-initiated)
- Maturity score 0–100 based on sys.md content depth

### What the node does NOT do

- No multi-user roles or tenants (Multi-Hoster: multiple souls, each isolated)
- No usage analytics, no tracking
- No database server (flat files, no PostgreSQL/Redis)
- No public access — the gate password protects everything

---

## Technical Stack

**Frontend:** Nuxt 4, statically built (SSG), runs entirely in the browser — no Node.js process on the server.

**Backend:** OpenResty (nginx + LuaJIT) as the API layer. All endpoints are Lua scripts. No web framework, no runtime dependencies beyond OpenResty.

**Data:** Flat files under `/var/lib/sys/souls/{soul_id}/` — portable, inspectable, no migration needed.

**Encryption:** AES-256-CBC in the browser (WebCrypto API). The server only sees encrypted bytes with the magic header `SYSCRYPT01`. The key never leaves the browser.

---

## Repository Structure

```
├── init.sh                  Setup script — zero to running in one command
├── reset.sh                 Delete soul, release node (data gone, config preserved)
├── recover-password.sh      Reset gate password without losing soul data
├── deinstall.sh             Remove everything init.sh installed
│
├── app/                     Nuxt 4 frontend (SSG, runs entirely in the browser)
│   ├── pages/               Routes: index, session, gate, api-docs, …
│   ├── components/          UI components (SoulViewer, Vault, Chat, AgentMarketplacePanel, …)
│   └── composables/         Shared state: useSoul, useVault, useChainAnchor, …
│
├── lua/                     OpenResty Lua scripts (production API layer)
│   ├── soul_cert.lua        Soul cert issuance (HMAC-SHA256)
│   ├── soul_auth.lua        Request authentication
│   ├── gate_auth.lua        Gate password protection
│   ├── soul_amortization.lua Agent Marketplace + trusted souls whitelist
│   ├── vault_sync.lua       Vault file upload/sync
│   └── …                   (40+ additional Lua endpoints)
│
├── server/
│   ├── api/                 Nitro API routes (development server only)
│   └── openresty/           nginx.conf.template, vhost.conf.template
│
├── shared/
│   └── utils/               soulParser.js, soulMaturity.js — shared browser logic
│
├── soul-mcp/                MCP server (Node.js, OAuth 2.0 + PKCE)
│   └── tools/               soul_read, soul_write, vault_manifest, …
│
├── browser-extension/       Chrome MV3 extension
├── utils/
│   ├── killMetas.mjs        Strip CSP meta tags from the build
│   └── project-hash.mjs     SHA-256 fingerprint of all source files
└── docs/                    Protocol documentation, API reference, specs
```

---

## sys.md Format

```markdown
---
soul_id: 00000000-0000-0000-0000-000000000000
soul_name: ""
created: YYYY-MM-DD
last_session: YYYY-MM-DD
version: 2
soul_cert: [generated automatically]
vault_hash: ""
soul_growth_chain: []
soul_chain_anchor: null
storage_tx: ""
---

## Core Identity
## Values & Beliefs
## Aesthetics & Resonance
## Language Patterns & Expression
## Recurring Themes & Obsessions
## Emotional Signature
## Worldview
## Open Questions
## Session Log (compressed)

## Social Sphere
<!-- SOCIAL:START -->
<!-- @msg 2026-05-09T10:00:00Z me peer Hello, peers! Working on anything interesting? -->
<!-- @msg 2026-05-09T10:01:00Z alice_abc me Deep in the identity protocol spec right now. -->
<!-- SOCIAL:END -->

## Agent Sandbox
<!-- AGENT:START -->
<!-- @msg 2026-05-09T10:05:00Z me community Hello to all — peers and agents! -->
<!-- AGENT:END -->
```

**Three-sphere protection model (v2):**

| Sphere | Delimiter | Who reads | Who writes |
|---|---|---|---|
| **Private Sphere** | All `## sections` | Owner only | Owner only |
| **Social Sphere** | `<!-- SOCIAL:START/END -->` | Owner + trusted peers | Owner + trusted peers |
| **Agent Sandbox** | `<!-- AGENT:START/END -->` | Owner + paid agents | Owner only |

Messages use structured comments: `<!-- @msg {ISO-timestamp} {from} {to} {content} -->`

- `from`: `me` (owner) · peer soul_id · agent id
- `to`: `peer` · `agent` · `community` (community messages are written to **both** blocks)

Read tools apply stage-based filtering: **stage 1** (default) returns the last 24 h. **stage 2** (user-requested) returns up to 48 h with every-other-message sampling for the older half.

Full specification: [docs/spec/sys_md.md](docs/spec/sys_md.md)

---

## Authentication

All protected endpoints use stateless HMAC-SHA256 soul_cert tokens — no database:

```
cert   = HMAC-SHA256(SOUL_MASTER_KEY, soul_id + ":" + cert_version).hex()[:32]
bearer = soul_id + "." + soul_cert
```

---

## MCP Integration

`soul-mcp/` implements the [Model Context Protocol](https://modelcontextprotocol.io) with OAuth 2.0 + PKCE. Claude and other MCP-compatible AI clients can connect and access sys.md and vault files with granular permissions.

Key tools: `soul_read`, `soul_write`, `vault_manifest`, `audio_list`, `soul_discover`, `verify_human`

---

## Installation

The production stack uses OpenResty (nginx + LuaJIT) as the API layer — no Node.js in production.

**Full guide:** [ONBOARDING.md](ONBOARDING.md)

> **Note:** You need a domain with an A record pointing to your server's IP — SSL issuance fails without a valid DNS entry.

**Requirements:** Ubuntu 24.04 VPS (min. 2 GB RAM), a domain

```bash
git clone https://github.com/uxprojectsjok/personal-sys-vps.git /opt/sys
cd /opt/sys && bash init.sh
```

The script prompts for domain, email, and optionally an Anthropic API key and WalletConnect Project ID — everything else runs automatically. Change the root password with `passwd` when done.

### Node modes

`init.sh` offers two modes at startup:

| Mode | Description |
|------|-------------|
| **Personal Node** | Single soul. First registrant is the permanent owner. |
| **Multi-Hoster** | Multiple souls on one VPS. No soul lock. Suitable for families, teams, or soul hosting services. |

### Managing your soul

| Script | What it does |
|--------|-------------|
| `bash /opt/sys/recover-password.sh` | **Forgot password** — sets a new gate password. Soul data is fully preserved. Requires SSH access. |
| `bash /opt/sys/reset.sh` | **Remove soul** — deletes all soul data, releases the node for a new registration. OpenResty, SSL, and all configuration are preserved. |
| `bash /opt/sys/deinstall.sh` | **Full uninstall** — removes everything init.sh installed. Ubuntu is untouched. Delete the DNS record manually at your provider afterward. |

> `recover-password.sh` ≠ `reset.sh` ≠ `deinstall.sh`
> Forgot password: soul stays. Reset: tenant moves out. Uninstall: house is torn down.

---

## Integrity

Verify your clone against the official release:

```bash
node utils/project-hash.mjs
```

Current release fingerprint: 80006024f5c4e7bbb0f6590c7288823a6da5e6e7e7f6cbc71ec7635689355a5a

The hash covers all source files (`.vue`, `.js`, `.lua`, `.sh`, `.json`, `.md`) — excluding `node_modules`, build output, secrets, and lock files.

---

## Protocol Network

SYS is an open protocol. This node is one implementation — others can emerge independently.

Planned protocol nodes (open for contributions):

| Node type | Function |
|-----------|----------|
| **soul-discover** | Directory service — nodes register, peers find each other |
| **soul-relay** | Message relay between nodes |
| **soul-bridge** | Bridge to other identity systems (DID, ActivityPub) |
| **soul-archive** | Long-term storage for encrypted soul snapshots |

The SYS protocol is Apache 2.0 licensed. Compatible implementations, nodes, and extensions are explicitly welcome.

---

## On-Chain Anchoring

Souls can anchor their identity hash on the Polygon blockchain.

**Smart contract:** `0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B` (Polygon Mainnet)

```
Soul identity hash  →  anchor()  →  Polygon blockchain
                                 →  IPFS (content)
                                 →  soul_chain_anchor in sys.md
```

Anchoring is voluntary and user-initiated. Each anchor transaction pays an `anchorFee` directly to the smart contract — on-chain, transparent, verifiable on [Polygonscan](https://polygonscan.com/address/0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B).

Operators who want blockchain features need their own WalletConnect Project ID (free: cloud.walletconnect.com). The contract address is fixed in the protocol — a custom contract instance would break cross-node compatibility.

---

## Legal

I am the author of this software, not an operator.

Anyone who clones this repository and runs `init.sh` operates their own fully independent server — under their own domain, on their own hardware, with their own data. I have no access to these servers and no knowledge of the data stored on them.

- I do not provide hosting infrastructure, accounts, or managed servers.
- User data resides exclusively on users' own servers.
- The anchoring contract runs autonomously on the Polygon blockchain. On-chain transactions are entirely the responsibility of the initiating person.

**Third-party services:** The AI and voice integrations in this codebase (Anthropic, ElevenLabs, WaveSpeed AI, Twilio, WalletConnect, Pinata, Polygon) are independent third-party providers. I am not affiliated with, endorsed by, or in any partnership with any of them. Their inclusion reflects my own personal technical choices — not a recommendation. Each operator who runs this software must independently evaluate these services, agree to their respective terms of use, obtain their own API keys, and bear full responsibility for their integration and any associated costs.

Use of this software is at your own risk. The Apache 2.0 license excludes warranty and liability.

---

## Status

- **Open protocol** — Apache 2.0, compatible implementations welcome
- **Smart contract** — live on Polygon Mainnet, verifiable on Polygonscan

---

## License

Apache License 2.0 — see [LICENSE](LICENSE)

Copyright © 2026 Jan-Oliver Karo — [UX-Projects](https://uxprojects-jok.com), Marburg, Germany

"SaveYourSoul" and "SYS" are trademarks of Jan-Oliver Karo. See [NOTICE](NOTICE) for trademark and attribution requirements.

---

**Project site:** [sys.uxprojects-jok.com](https://sys.uxprojects-jok.com/)
