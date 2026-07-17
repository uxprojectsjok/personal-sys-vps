# SaveYourSoul — Personal SYS Node

> ⚠️ **Work in progress — not ready for use.**
> This repository reflects an actively developed system. Core features are live and running in production, and multi-hoster mode appears stable in initial testing. The codebase now requires thorough review across security, bugs, UX/UI, and potential risks before any broader use.
>
> **This software is a scientific development project. It is not approved for commercial use.**
> The goal is a decentralized ecosystem built for and by the people who interact with and participate in it.
>
> Expect breaking changes, incomplete documentation, and missing setup steps. Do not attempt to run this yourself at this stage — a guided setup and public release will follow once the testing phase is complete.
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
     →  AI systems (Claude, MCP tools, Zapier automations, …)
     →  other SYS nodes (peer-to-peer, encrypted)
```

The node accepts souls per its configured mode. In **Personal** mode, the first person to register becomes the permanent owner. In **Multi-Hoster** mode, multiple souls share one VPS (families, teams, hosting services).

### Core use case

> **Set up your soul. Interact in chat. The Soul-Archivar records.**

Three phases — nothing more:

| Phase | What happens | Who acts |
|-------|-------------|----------|
| **Set up** | Create soul, configure peers, connect MCP | You (once) |
| **Interact** | Chat — with AI, peers, community | You (ongoing) |
| **Record** | Soul grows silently, growth chain updated, server synced | Soul-Archivar KI (automatic) |

---

### What the node does

**Identity & Authentication**
- sys.md stored encrypted (AES-256-CBC, key stays in the browser)
- HMAC-SHA256 soul_cert — stateless, no cookies, no OAuth
- Gate password protects the entire interface
- WebAuthn/Passkey biometric unlock (PRF extension — no stored password)
- Per-soul master keys in Multi-Hoster mode — souls are cryptographically isolated

**AI & Soul**
- Chat with Claude — the KI embodies your soul in first person
- **Soul-Archivar KI**: automatically observes every conversation and grows your sys.md — no button required. Runs after 3 min, then every 8 min and every 4th message.
- **mind.md**: KI identity file — 7-section config the AI reads every session and can update itself (Selbstreflexion, Kommunikation, Intellekt). Write-protected sections: Identität, Grenzen.
- Manual soul update available for on-demand deep analysis (Claude Sonnet)
- Vision analysis: camera photo → Claude → soul reaction or AI image generation
- Food photo → automatic food_log entry (AI identifies food, assigns A–E nutrition rating, no prompt needed)
- Web search: KI can search the web mid-conversation and incorporate results
- Text-to-speech via ElevenLabs (voice cloning supported)
- Speech-to-text via ElevenLabs STT — voice input in chat
- AI image generation via WaveSpeed AI
- Background synthesis KI: reads the social sphere, contributes facts and impulses into the conversation
- Full tool manifest injected into system prompt from first message — no multi-session onboarding

> **Third-party services disclaimer:** The AI and voice services listed above (Anthropic, ElevenLabs, WaveSpeed AI, Reown, Pinata, Polygon) are independent third-party providers. I am not affiliated with, endorsed by, or a partner of any of them. Their inclusion in this codebase reflects my own personal technical choices at the time of writing — nothing more. Each operator who runs this software must independently evaluate these services, agree to their respective terms of use, and take full responsibility for their integration. You are free to swap in any compatible alternative.

**Health & Body**
- **health.md**: structured health context file — weekly/monthly Garmin metrics (resting HR, sleep, steps, active days) with WHO/ESC/NSF reference classifications
- **Food Log**: every food photo logged as dated entry (A–E nutrition rating, name, notes) — aggregated weekly and monthly, annual journal with KW breakdown
- **Health Sync**: Garmin Connect adapter (FR235 and others) — weekly cron or on-demand via chat command. Adapters for Apple Health and Oura ring included.
- Profile capture via chat: `@audio` / `@face` / `@body` — inline capture cards for voice, photo, and motion directly in the chat stream
- Health setup via init.sh script — the Settings UI shows connection status and the Garmin MFA login flow only (no credentials stored in the UI)

**Agent Runner (Autonomous Tasks)**
- **SYS Agent** runs tasks from `agent.md` autonomously — Claude Code executes them on a schedule without any manual prompt
- Hourly cron scan across all souls; runs only when pending tasks exist
- On-demand execution via **"Jetzt ausführen"** button in Settings → Agent tab
- **agent.md** three-section format: **`## Dauertasks`** (standing rules always applied after each task), **`## Offene Tasks`** (pending), **`## Erledigte Tasks`** (completed archive)
- **Dauertasks** persist permanently and never get marked done — example: "After every completed task, send email via Zapier"
- **Zapier MCP** integration: agent can call Zapier actions (send email, Slack, webhooks, Google Docs) during task execution
- Live log viewer in Settings → Agent tab: auto-polls while running, shows full output of the last run
- Per-soul enable/disable — disabled souls are skipped silently at cron time
- Agent writes directly to the soul's vault context files (full read/write access to `vault/context/`)

**Emergency Protocol**
- 3-level AI lock activatable from the header: KI-Sperre → AI-Blackout → Isolierung
- Lua-based guard blocks API endpoints per level
- Level 3 stops the MCP server via systemctl
- SSH-only Level 4 (full shutdown)

**Peer Network (Social Sphere)**
- Add trusted peers by soul_id + endpoint
- @mention peers by name in chat to send messages into the Social Sphere
- Attach images and files — uploaded to `vault/shared`, served cross-domain with peer auth
- Peer media proxy: browser fetches peer media through own node (no direct cross-domain exposure)
- KI synthesis: reads the live social stream, periodically contributes a brief — forwarded to peers with `[KI]` attribution
- Peer reachability shown inline; detailed error shown on auth failure
- Beme: community broadcast channel — short messages visible across the network

**AI-native Peer Messenger (Milestone — 2026-06-12)**

> The first complete AI-based peer-to-peer message exchange between two independent SYS nodes was confirmed on 2026-06-12.

The exchange worked as follows:
1. Peer A wrote a greeting in their SYS chat — stored in their Social Sphere.
2. The node owner asked Claude AI (via MCP): *"Do I have new messages from peers?"*
3. Claude AI called `peer_inbox` — fetched the message cross-domain from Peer A's node.
4. The owner said: *"Reply — you can read my soul."*
5. Claude AI called `soul_read`, extracted context from the owner's sys.md, formulated a personal reply, and sent it via `peer_send`.
6. Peer A saw the reply live in their chat on an independent VPS.

No third-party messaging service involved. No WhatsApp, no Telegram. The AI is the messenger interface — soul context is the signal. This is what SYS-protocol messaging looks like.

**Vault**
- Local vault (File System Access API, no upload needed)
- Server vault: images, audio, video, context files — encrypted upload
- Vault Shared: peer-accessible file store (`/var/lib/sys/souls/{soul_id}/vault_shared/`)
- Optional vault encryption (AES-256-CBC, magic header `SYSCRYPT01`)
- File viewer, audio player, video player built in

**Local Vault Folder Structure**
```
vault/
├── jan.md              ← Soul identity file (SYS frontmatter, soul_cert) — stays at root
├── sys.md              ← Soul content — stays at root
├── profile.png         ← Profile image — stays at root (jpg/png/webp)
├── vault-share.json    ← Vault metadata — stays at root, never synced
│
├── context/            ← All context files for AI (.md, .txt, .pdf)
│   ├── health.md       managed by health_sync / food_log
│   ├── mind.md         managed by mind_write (AI personality config)
│   ├── prompts.md      Single-host: auto-generated by generate-prompts.mjs after cert issuance. Multi-host: not present per soul — node-level file, kept in doc/ and distributed via init.sh
│   ├── shopping.md     managed by shop_write_read
│   └── *.md / *.pdf    any additional context (milestones, notes, CV…)
│
├── audio/              ← Voice recordings (.mp3, .webm)
├── images/             ← Additional images, not the profile photo
├── motion_samples/     ← Motion capture videos (.webm → synced as video type)
├── profile/            ← AI profile JSON files (personality profiles)
└── video/              ← Video files (.mp4)
```
Root `.md` files without SYS frontmatter are also picked up as context — but keeping them in `context/` is cleaner. The sync strips the folder path; the server always receives only the filename.

**Networking**
- MCP server (OAuth 2.0 + PKCE) — Claude and other AI clients connect
- Soul whitelist: trusted souls connect via MCP using their own soul_cert — no handshake, no setup
- Soul Skills: declarable capabilities exposed via MCP for agent discovery
- Zapier integration — automate workflows and notifications via webhooks
- Browser extension (Chrome MV3) for automatic soul_cert injection
- Twilio call config — voice call integration
- **Web Push Notifications**: browser subscribes at login via VAPID — node can push alerts without a background app

**Agent Marketplace**
- Register soul on-chain (Polygon + IPFS/Pinata) — discoverable by AI agents
- Paid agent access: Polygon (POL) micropayment → time-limited access token → Agent Sandbox read
- Earnings ledger: track incoming agent payments on-chain
- Trusted soul whitelist: grant read/write access to specific peer souls

**Growth & Anchoring**
- Soul Growth Chain: every session is cryptographically signed
- Blockchain anchoring on Polygon (optional, user-initiated)
- Maturity score 0–100 based on sys.md content depth
- Cloud push: encrypted soul bundle exportable to external storage

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

**Encryption:** AES-256-CBC, magic header `SYS\x01` + 16-byte IV. `sys.md` is encrypted client-side (WebCrypto API) before upload. The resulting key is also persisted server-side (`vault_key_hex` in `api_context.json`) — this is what lets background automation (Garmin health sync, mind consolidation, payment logging) read and write the vault without an active browser session. It means the key is not strictly browser-only; a compromised server can decrypt the vault. This is a deliberate trade-off in favor of working automation over a stricter zero-knowledge guarantee.

**Encrypted at rest, server-managed:** `health.md`, `mind.md`, `income.md`, `earnings.md`, `activity.md` and `agent.md` are AES-256-CBC encrypted using the same persisted key whenever `cipher_mode` is `"ciphered"` (the default) — the server encrypts/decrypts them itself on every read and write, since they're written by server-side automation (Garmin sync, `mind_write`, payment logging, the write-activity log, the agent task queue) rather than the browser. `shopping.md` is deliberately never encrypted, since ad placements written by external paid agents need to work without vault access. `prompts.md` is a technical file and also plaintext by design. On Single-host nodes it lives in the owner's soul vault and is auto-generated from source code markers. On Multi-host nodes it is a node-level file (not per-soul) — kept in `doc/` in this repository and distributed by `init.sh`. Tenant souls do not receive `prompts.md`; each tenant configures their AI behaviour via `mind.md` instead.

---

## Repository Structure

> Installer scripts (`init.sh`, `reset.sh`, `recover-password.sh`, `deinstall.sh`) are distributed via a private repository — see [Installation](#installation).

```
├── app/                     Nuxt 4 frontend (SSG, runs entirely in the browser)
│   ├── pages/               session, soul, gate, dateien, chronik, einnahmen,
│   │                        marketplace, peers, reife, verankern, verbindung, connect,
│   │                        einrichten, einstellungen, exportieren
│   ├── components/          ChatInterface, VaultExplorer, SoulViewer, AgentMarketplacePanel,
│   │                        AgentSandboxCard, ApiContextPanel, AudioCaptureCard, CameraRecorder,
│   │                        ConfirmModal, EmergencyModal, FirstSetupModal, LiveProfile,
│   │                        MediaPlayer, ModalCreateSoul, MotionCaptureCard, MotionRecorder,
│   │                        SettingsModal, SoulAnchorModal, SoulDecryptModal,
│   │                        SoulDownload, SoulEncryptModal, SoulMaturityMeter, SoulSetupWizard,
│   │                        SoulSyncModal, SoulUpload, SysCommandPalette, SysIcon, SysMobileNav,
│   │                        SysSidebar, SysTopbar, VaultServicesPanel, VaultSessionPanel,
│   │                        VaultUpload, VideoBackground, VoiceRecorder
│   │   └── ui/              Alert, Button, GlowText, Modal
│   └── composables/         useSoul, useVault, useClaude, useSession, useMind, useProfile,
│                            useVaultSession, useVaultServices, useConnectedVault, useApiContext,
│                            useCamera, useMotion, useVoice, usePlayer, useElevenLabsConversation,
│                            useMcpTools, useChainAnchor, useSoulEncrypt, useSoulDecrypt,
│                            useSoulPasskey, useSavedCreds, useNodeStatus, useColorScheme,
│                            useConfirm, usePwaInstall, useSpotify, useTrezorKey,
│                            useVerifySpecial, useYouTube
│
├── lua/                     OpenResty Lua scripts (production API layer, 80+ endpoints)
│   ├── soul_cert.lua        Soul cert issuance — per-soul key on multi-hoster
│   ├── soul_auth.lua        Request authentication (per-soul key + X-Soul-Id aware)
│   ├── vault_auth.lua       Vault endpoint auth
│   ├── gate_auth.lua        Gate password protection
│   ├── emergency_guard.lua  Emergency protocol — blocks endpoints per lock level
│   ├── food_log.lua         Food entry writer — health.md + monthly rollover + KW archive
│   ├── health_sync_trigger.lua  Trigger Garmin sync from chat
│   ├── mind.lua             mind.md read/write endpoint
│   ├── vision_analyze.lua   Camera photo → Claude Haiku → soul reaction or food detection
│   ├── web_search.lua       Web search proxy for KI mid-conversation
│   ├── beme.lua             Community broadcast channel
│   ├── soul_amortization.lua Agent Marketplace + trusted souls whitelist
│   ├── soul_paid_*.lua      Agent payment flow — POL token, access control, earnings
│   ├── vault_shared_*.lua   Peer-accessible file store — upload, serve, delete
│   ├── vault_peer_*.lua     Peer media proxy + stream
│   └── …                   (see lua/ directory for full list)
│
├── health-sync/             Garmin / Apple Health / Oura adapter (Python, optional experiment)
│   ├── health_sync.py       Main sync runner
│   ├── writer.py            Writes health.md — preserves Food Log + Annual Journal
│   ├── install.sh           Interactive setup (credentials, soul selection, cron)
│   └── adapters/            garmin.py, apple_health.py, oura.py
│
├── soul-mcp/                MCP server (Node.js, OAuth 2.0 + PKCE)
│   ├── server.mjs           Main server — OAuth flow, /internal/run-tool, X-Soul-Id routing
│   ├── oauth.mjs            OAuth 2.0 + PKCE token management
│   ├── tools/               50+ tools — soul_read/write, vault_manifest, health_check,
│   │                        health_sync, food_log, mind_read/write, soul_discover,
│   │                        soul_skills, beme_chat, verify_human,
│   │                        soul_earnings, soul_maturity, soul_cloud_push, soul_delete,
│   │                        soul_paid_comment, soul_pay_read, shop_write_read,
│   │                        twilio_call_config,
│   │                        audio/image/video list+get, context_get/list, profile_get/save,
│   │                        soul_read_by_token, *_peer variants, …
│   ├── lib/                 api.mjs, blockchain.mjs, herz.mjs, soul_indexer.mjs,
│   │                        soul_parser.mjs, vault_fs.mjs
│   └── prompts/             index.mjs — soul_guide + tool_guide (Selbstreflexion-Workflow)
│
├── server/
│   ├── api/                 Nitro API routes (development server only)
│   ├── plugins/             env.js — server-side env injection
│   ├── utils/               validateSoulToken.js
│   └── openresty/           nginx.conf.template, vhost.conf.template
│
├── shared/
│   └── utils/               soulParser.js, soulMaturity.js — shared browser/server logic
│
├── utils/
│   ├── killMetas.mjs        Strip CSP meta tags from the build
│   ├── project-hash.mjs     SHA-256 fingerprint $HASH$HASH$HASH$HASH$HASHof all source files
│   ├── generate-prompts.mjs Sync prompts.md into vault on build
│   └── sync-server.sh       Sync /opt/sys changes back to repo (on demand)
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

<!-- SYS:LONGMEM:START -->
{
  "v": 1,
  "updated": "YYYY-MM-DD",
  "facts": [
    { "id": "name_birth", "cat": "identity", "text": "...", "score": 5, "since": "YYYY-MM-DD" }
  ],
  "memories": [
    { "id": "mem_...", "date": "YYYY-MM-DD", "text": "...", "since": "YYYY-MM-DD" }
  ],
  "ideas": [
    { "id": "...", "title": "...", "text": "...", "status": "idea|planned|done", "since": "YYYY-MM-DD" }
  ],
  "learnings": [
    { "id": "...", "date": "YYYY-MM-DD", "cat": "arch|tech|personal", "text": "...", "since": "YYYY-MM-DD" }
  ]
}
<!-- SYS:LONGMEM:END -->

## Core Identity
## Values & Beliefs
## Aesthetics & Resonance
## Language Patterns & Expression
## Recurring Themes & Obsessions
## Emotional Signature
## Worldview
## Open Questions
## Session Log

## Vault

## Social Sphere
<!-- SOCIAL:START -->
<!-- @msg 2026-05-09T10:00:00Z me peer Hello, peers! Working on anything interesting? -->
<!-- @msg 2026-05-09T10:01:00Z alice_abc me Deep in the identity protocol spec right now. -->
<!-- SOCIAL:END -->

## Agent Sandbox
<!-- AGENT:START -->
Name: Your Name
Location: City, Country

Short bio and what you're working on. No ## headings inside this block.

For external agents: what kind of contact is welcome.
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
- `to`: `me` · `peer` · `agent` · `community`

Read tools apply stage-based filtering: **stage 1** (default) returns the last 24 h. **stage 2** returns up to 48 h with every-other-message sampling for the older half. Static text without `@msg` markers is always returned unfiltered.

**LONGMEM — Long-Term Memory:**

The Soul Archivar automatically distills conversations into a structured JSON block (`<!-- SYS:LONGMEM:START/END -->`). It never requires manual editing.

| Field | Description |
|---|---|
| `facts` | Stable core facts about the person. Each has a `score` (1–5): 5 = absolute core (name, values, key project), 1 = peripheral, first to be dropped on consolidation. Auto-deduplicated when > 18 entries. |
| `memories` | Significant past events and experiences worth long-term retention. |
| `ideas` | Projects and concepts with status tracking (`idea` → `planned` → `done`). |
| `learnings` | Insights and architectural decisions with category tags (`arch`, `tech`, `personal`). |

The Archivar compresses `## section` content into LONGMEM facts after each crystallization, then clears the section. Both representations are maintained in parallel: LONGMEM for AI context, `## sections` for tool access.

> **Note:** Do not use `## ` headings inside `<!-- AGENT:START/END -->` or `<!-- SOCIAL:START/END -->` blocks. Use plain text or `###` subheadings. Top-level `## ` headings are parsed as independent sections and will be processed (and potentially removed) by the Archivar.

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

> **This is `personal-sys-vps-private`** — the live, running repo behind
> **kro.uxprojects-jok.com**. `/opt/sys` on that VPS *is* this checkout (`origin`
> = this repo) — there is no separate build/staging copy anymore. Unlike the
> public `personal-sys-vps` template, this repo already includes
> `init.sh`/`reset.sh`/`recover-password.sh`/`deinstall.sh` — no separate
> installer checkout needed. It also still contains **my own** operator-specific
> data in a few spots (see "Before you install" below) — anyone cloning this as
> a base for a *different* node must review and replace those first.

The production stack uses OpenResty (nginx + LuaJIT) as the API layer — no Node.js in production.

> **Note:** You need a domain with an A record pointing to your server's IP — SSL issuance fails without a valid DNS entry.

**Requirements:** Ubuntu 24.04 VPS (min. 2 GB RAM), a domain

```bash
git clone https://github.com/uxprojectsjok/personal-sys-vps-private.git /opt/sys
cd /opt/sys
sudo bash init.sh
```

The setup script prompts for domain, email, and optionally an Anthropic API key and Reown Project ID — everything else runs automatically. Change the root password with `passwd` when done.

### Before you install (this repo only, not the public template)

This repo carries over content from my own live instance that's specific to
me, not to whoever runs the new node:

- **Legal pages** (`app/pages/impressum.vue`, `datenschutz.vue`, `lizenz.vue`) —
  populated with my own operator details (name, address, contact). Replace
  with the new operator's details before the node is publicly reachable —
  German law requires an accurate Impressum for anything beyond a purely
  private, password-gated instance.
- **`app/components/ConsentBanner.vue`** — points at my own self-hosted
  Plausible analytics endpoint. Replace with your own analytics (or remove
  the component) rather than sending a new node's traffic to my instance.
- **API keys** (ElevenLabs, WaveSpeed, Anthropic) are *not* in this repo —
  they live in `/var/lib/sys/souls/{soul_id}/config.json` on the server,
  outside version control, and start empty on a fresh `init.sh` run. Add
  them via Settings → Dienste after setup.
- **`README.md`'s release fingerprint** (below) reflects *my* build at
  push time — regenerate it after your own changes with
  `node utils/project-hash.mjs`.

### Node modes

`init.sh` offers two modes at startup:

| Mode | Description |
|------|-------------|
| **Personal Node** | Single soul. First registrant is the permanent owner. Includes the **Autonomous Agent Runner** — processes tasks from `agent.md`, maintains the node, runs hourly + on-demand with optional Zapier MCP support. |
| **Multi-Hoster** | Multiple souls on one VPS. No soul lock. Suitable for families, teams, or soul hosting services. Agent Runner not available — it runs as root and would have access to all souls on the node. |

These modes are independent of the server's infrastructure. A Personal Node can run on a VPS that already hosts other websites — SYS detects existing sites automatically and integrates safely alongside them.

### Shared-server support

If `init.sh` detects other active sites on the server (via `sites-enabled`), it switches to shared-server mode:

- **nginx.conf** is extended only with the directives SYS needs — not overwritten
- **Existing vhost configs** are left untouched
- **Packages** (OpenResty, Node.js, Certbot) are not reinstalled or upgraded
- **`deinstall.sh`** removes only SYS-owned files: vhost, Lua scripts, soul data, soul-mcp — OpenResty and all other sites remain intact

> **Node mode ≠ Shared server**
> *Personal Node* / *Multi-Hoster* controls how many souls the SYS node accepts.
> *Shared server* describes whether other websites exist alongside SYS on the same VPS.
> Both combinations are fully supported.

### Managing your soul

| Script | What it does |
|--------|-------------|
| `bash /opt/sys/recover-password.sh` | **Forgot password** — sets a new gate password. Soul data is fully preserved. Requires SSH access. |
| `bash /opt/sys/reset.sh` | **Remove soul** — Personal Node: deletes the single soul. Multi-Hoster: lists all souls, delete one or all. OpenResty, SSL, and all configuration are preserved. |
| `bash /opt/sys/deinstall.sh` | **Full uninstall** — removes everything init.sh installed. Ubuntu is untouched. Delete the DNS record manually at your provider afterward. |

> `recover-password.sh` ≠ `reset.sh` ≠ `deinstall.sh`
> Forgot password: soul stays. Reset: tenant moves out. Uninstall: house is torn down.

> All four scripts (`init.sh`, `reset.sh`, `recover-password.sh`, `deinstall.sh`) are included
> in this repo, in the repo root — no separate installer checkout needed. The public
> `personal-sys-vps` template does not include them; they're distributed separately there.

---

## Updating This Node

This repo is **not** the protocol foundation — `personal-sys-vps` (public) is. This repo is `personal-sys-vps` **plus a private layer**: the EU consent/Widerrufsrecht flow (`accept_digital_content_terms`, pdfkit), Impressum/Datenschutz/AGB pages, and other operator-specific content that must never ship in the neutral public template (see [README: No legal pages included](https://github.com/uxprojectsjok/personal-sys-vps#legal) for why). That's the whole reason this repo exists separately instead of kro pulling straight from public — see the rationale below before changing this workflow.

**Why not pull straight from `personal-sys-vps`:** doing so would either drop the private layer on every update, or force it to be reapplied by hand, untracked, after each pull — the exact failure mode that has already caused real data loss here (`git diff`-before-sync is the recorded fix, not "stop tracking it"). This repo's `CHANGELOG.md` and this repo's git history are what make the private layer recoverable and diffable at all.

### Update workflow (public → private → live)

1. **Pull the public update into this repo, don't hand-copy files.**
   ```bash
   cd /opt/sys
   git fetch upstream          # personal-sys-vps (public), remote already configured
   git log HEAD..upstream/main --oneline    # see what's new before merging
   git merge upstream/main     # or: git rebase upstream/main, if history should stay linear
   ```
   Resolve conflicts in favor of keeping the private layer (legal pages, consent flow, personalized `init.sh` text, i18n keys) — the public side of any conflict is the one that just got updated and should win everywhere else.

2. **Tag and changelog this repo — independently of the public repo's version.**
   Add an entry to `CHANGELOG.md` (this repo) noting which public tag/commit was just merged in, then:
   ```bash
   git tag -a v1.X.0 -m "merge personal-sys-vps v1.X.0 + private layer"
   ```

3. **Redeploy.** Since `/opt/sys` *is* the checkout (no separate build dir since `SaveYourSoul_me_live` was retired), there's no file-copy step anymore for most changes — just rebuild and restart what changed:
   ```bash
   npm run generate && node utils/killMetas.mjs
   node utils/project-hash.mjs                          # update the fingerprint below if it changed
   ```
   If the merge touched `lua/*.lua`: `cp lua/*.lua /etc/openresty/lua/ && openresty -s reload`
   If it touched `soul-mcp/`: `systemctl restart soul-mcp` (no copy needed — `/opt/sys/soul-mcp` is already the running path)

4. **Commit and push to `origin`** (this repo) so the update is recoverable from GitHub, not just from this one VPS.

5. **Local full backup (FileZilla or equivalent) stays a good idea afterward** — it protects against total VPS loss, but it is a point-in-time snapshot, not a substitute for steps 1–4. If the server is ever rebuilt from scratch, `git clone` + `git checkout <tag>` reconstructs the exact code state; the FileZilla copy is for the parts git doesn't track (`.env`, `/var/lib/sys/souls/*` soul data, TLS certs).

`karo-familie.de` has no private layer and pulls tags directly from `personal-sys-vps` — steps 1–2 above don't apply there, only 3–5 in simplified form.

---

## Integrity

Verify your clone against the official release:

```bash
node utils/project-hash.mjs
```

Current release fingerprint (v1.0.25): 95fe50018a59fbfe

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

Operators who want blockchain features need their own Reown Project ID (free: cloud.reown.com).

> **Protocol requirement:** The contract address `0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B` is the designated anchoring contract of the SYS protocol. All nodes must use this contract.
>
> This is what makes SYS a shared ecosystem rather than a collection of isolated nodes. Every soul that anchors writes into the same immutable ledger — and as the contract grows older, the full history of all participating souls becomes traceable across the network. A node using a different contract is no longer SYS-compatible and its anchored identities will not be recognized by the community.
>
> **Agent Marketplace:** The `soul_discover` tool — used by the Agent Marketplace to list souls — reads exclusively from this contract (Polygon blockchain as the single source of truth). A soul that anchors on a different contract will not appear in `soul_discover` and is invisible to all agents on the network.

---

## Legal

I am the author of this software, not an operator.

**SYS is an infrastructure protocol — not an AI system.**
It functions as a connectivity layer between the user's own server and external AI services (Anthropic, ElevenLabs, etc.) over the MCP protocol. SYS does not develop AI, operate AI, or make AI-based decisions. All AI processing is performed by external, independently regulated services. The analogy is DNS or HTTP: the protocol enables communication but is not the service.

**EU AI Act (Regulation (EU) 2024/1689):** SYS does not qualify as an AI system under Article 3 of the EU AI Act and is therefore not subject to its requirements as a provider. Two independent grounds apply: (1) SYS is infrastructure, not a system that generates outputs such as predictions, recommendations, or decisions — it transmits requests to third-party AI services that are themselves subject to their own regulatory obligations. (2) The codebase is published as open-source software under Apache 2.0. Recital 12 of the EU AI Act provides for reduced obligations for freely available open-source AI components; this further supports the position that the Act's provider obligations do not apply to this repository. The openness of the source code is also substantively relevant: the EU AI Act is most concerned with opaque, unverifiable systems. This codebase is fully inspectable — no hidden model, no hidden inference, no hidden decision logic.

**Apache 2.0 — No Warranty:** This software is provided *"AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.* This exclusion is legally binding under the Apache License 2.0, which is recognized in all major jurisdictions.

This software is published with the explicit intent to empower individuals
over their own data and identity. The author expressly distances himself from
any use of this software for criminal purposes, unauthorized surveillance,
identity fraud, harassment, or any activity that violates applicable law.
Operators are solely responsible for ensuring lawful use on their own
infrastructure.

Anyone who clones this repository and runs `init.sh` operates their own fully independent server — under their own domain, on their own hardware, with their own data. I have no access to these servers and no knowledge of the data stored on them.

- I do not provide hosting infrastructure, accounts, or managed servers.
- User data resides exclusively on users' own servers.
- The anchoring contract runs autonomously on the Polygon blockchain. On-chain transactions are entirely the responsibility of the initiating person.

**Data processing:** UX-Projects does not process personal data on behalf of users. All soul data, biometric references, and vault content reside exclusively on the operator's own VPS. The `verify_identity` tools run on the user's own infrastructure — biometric verification (WebAuthn, voice, face) is performed by the user's browser or by the external APIs the operator has independently configured. No biometric data is transmitted to or stored by UX-Projects.

The only technical touchpoint between a running SYS node and UX-Projects infrastructure is the Polygon anchoring contract — which stores SHA-256 hashes only, contains no personal data, and operates autonomously on a public blockchain.

**Third-party services:** The AI and voice integrations in this codebase (Anthropic, ElevenLabs, WaveSpeed AI, Reown, Pinata, Polygon) are independent third-party providers. I am not affiliated with, endorsed by, or in any partnership with any of them. Their inclusion reflects my own personal technical choices — not a recommendation. Each operator who runs this software must independently evaluate these services, agree to their respective terms of use, obtain their own API keys, and bear full responsibility for their integration and any associated costs.

Use of this software is at your own risk. The Apache 2.0 license excludes warranty and liability.

**Reference legal pages:** This repo ships `/impressum`, `/datenschutz`, and `/lizenz` as a working example of the node-operator-responsibility split described above — populated with my own (Jan-Oliver Karo / UX-Projects) details, exactly as `/agb` already was. If you run your own node, **replace the contents of these pages with your own operator details** before going live; they are not templated per-installation. The same applies to `ConsentBanner.vue`: it points at my own self-hosted Plausible instance (`analytics.uxprojects-jok.com`) — replace this with your own analytics endpoint (or remove the component) so visitor data from your installation doesn't get sent to mine.

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
