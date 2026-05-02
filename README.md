# Personal SYS VPS

**Protocol, not a product.**

SYS defines a portable, user-controlled identity layer for AI systems. The core unit is the **sys.md** — a Markdown file with YAML frontmatter that encodes a personal identity profile. It lives in the user's browser, grows with each session, and serves as authentic context for AI systems.

> **sys.md is a file about the user — not about the AI.** It encodes who you are (values, expertise, relationships, session history) so that AI systems can represent you authentically. This is the inverse of AI agent personality files: instead of defining how an agent speaks, sys.md defines what the agent knows about *you*.

This repository contains the protocol specification and a reference implementation. The reference implementation is invite-only and serves as an example implementation only. It is not intended as a deployable product. Any compatible implementation can be built independently.

> Think of it like email: the protocol is open, the reference implementation is one example of many possible servers.

---

## Core Concept

```
sys.md  →  sessionStorage (browser)  →  never leaves without user action
         →  VPS (encrypted, AES-256-CBC, user-initiated)
         →  AI context (Anthropic Claude API, transient, user-initiated)
         →  MCP tools (soul_read / soul_write, authorized per token)
```

The sys.md belongs to the user. The operator has no access to encrypted content. Encryption is the default, plaintext is an explicit opt-in.

---

## Repository Structure

```
├── ARCHITECTURE.md          Protocol specification & reference implementation docs
├── app/                     Nuxt 4 frontend (SSG, pure client-side)
├── server/
│   ├── api/                 Nitro API routes (development only)
│   └── openresty/           Lua scripts for OpenResty (production API layer)
├── shared/
│   └── utils/               soulParser.js, soulMaturity.js — core protocol logic
├── soul-mcp/                MCP server (Node.js, OAuth 2.0 + PKCE)
├── browser-extension/       Chrome MV3 extension
├── docs/
│   ├── overview.md          Protocol overview & design principles
│   ├── quickstart.md        Getting started guide
│   ├── spec/                Protocol specifications (soul-md, auth, mcp-tools)
│   ├── api/                 API reference & examples
│   └── architecture/        OpenResty, vault, encryption internals
└── test/                    sys.md test fixtures
```

---

## sys.md Format

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

## Values & Beliefs

_What motivates them? What do they believe in?_

## Aesthetics & Resonance

_Music, atmospheres, visual stimuli that attract this person._

## Speech Patterns & Expression

_How do they speak? How do they write?_

## Recurring Themes & Obsessions

_What keeps coming back?_

## Emotional Signature

_What is it like to talk to this person?_

## Worldview

_How do they see the world?_

## Unanswered Questions

_What are they still looking for?_

## Session Log (compressed)

...

## Calendar

...
```

Full specification: [docs/spec/sys_md.md](docs/spec/sys_md.md)

---

## Authentication

All protected endpoints use HMAC-SHA256 soul_cert tokens — stateless, no database:

```
cert   = HMAC-SHA256(SOUL_MASTER_KEY, soul_id).hex()[:32]
bearer = soul_id + "." + soul_cert
```

---

## MCP Integration

`soul-mcp/` implements the [Model Context Protocol](https://modelcontextprotocol.io) with OAuth 2.0 + PKCE. Claude, or any MCP-compatible AI client, can connect and access sys.md and vault files with granular permissions.

Key tools: `soul_read`, `soul_write`, `vault_manifest`, `audio_list`, `network_list`

---

## Self-Hosting

The production stack uses OpenResty (nginx + LuaJIT) as the API layer — no Node.js in production. See [docs/architecture/openresty.md](docs/architecture/openresty.md) for the full component breakdown.

### Voraussetzungen

> **Hinweis:** Du brauchst eine Domain (z.B. `soul.deinname.de`) mit einem A-Eintrag der auf die IP deines Servers zeigt. Ohne diesen DNS-Eintrag schlägt die automatische SSL-Zertifizierung fehl. Die Domain ist keine Pflicht — der Node lässt sich auch ohne SSL betreiben — aber für den produktiven Einsatz empfohlen.

- Frischer Ubuntu 24.04 VPS (min. 2 vCores, 2 GB RAM, 10 GB Disk)
- Root-Zugang per SSH
- Domain mit A-Eintrag auf die Server-IP
- Anthropic API Key

### Installation

```bash
git clone https://github.com/uxprojectsjok/personal-sys-vps.git /opt/sys
cd /opt/sys
bash init.sh
```

Das Script erledigt alles automatisch:
1. OpenResty, Certbot, Node.js installieren
2. SSL-Zertifikat via Let's Encrypt anfordern
3. API-Keys abfragen (interaktiv, kein nano nötig)
4. Nuxt-Frontend bauen und deployen
5. Lua-Scripts und nginx-Config einrichten

Am Ende: **Root-Passwort mit `passwd` ändern** — das Script erinnert dich daran.

### Soul verwalten

| Script | Was es tut |
|--------|-----------|
| `bash reset.sh` | **Soul entfernen** — löscht alle Soul-Daten und gibt den Node frei für eine neue Soul. OpenResty, SSL und alle anderen Systemdaten bleiben unberührt. |
| `bash deinstall.sh` | **Komplett deinstallieren** — entfernt alles was `init.sh` installiert hat. OpenResty, Node.js, Certbot, SSL-Zertifikat, Swap und alle Daten werden gelöscht. Der Ubuntu-Server bleibt als saubere Basis zurück. |

> `reset.sh` ≠ `deinstall.sh`: Reset entfernt nur die Soul (Mieter zieht aus). Deinstall entfernt die gesamte SYS-Installation (Haus wird abgerissen).

---

## Status

- **Concept project** — living proof-of-concept, not a commercial product
- **Reference implementation** — invite-only, experimental, no warranty
- **Protocol** — Apache 2.0, compatible implementations welcome

---

## Disclaimer

This software is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement.

The authors and operators are not liable for any damages, data loss, downtime, security incidents, or other consequences arising from the use or misuse of this software. Use at your own risk.

---

## License

Apache License 2.0 — see [LICENSE](LICENSE)

Copyright © 2026 Jan-Oliver Karo — [UX-Projects](https://uxprojects-jok.com), Marburg, Germany

"SaveYourSoul" and "SYS" are trademarks of Jan-Oliver Karo. See [NOTICE](NOTICE) for trademark and attribution requirements.
