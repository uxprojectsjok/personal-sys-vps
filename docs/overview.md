# SYS — Protocol Overview

**SYS is a distributed, file-based, AI-accessible identity and memory protocol
with MCP-compatible tool interfaces and optional cryptographic anchoring.**

---

## What SYS is

SYS defines a portable, user-controlled identity layer for AI systems.
The core unit is the **sys.md** — a plain Markdown file with YAML frontmatter
that encodes a personal identity profile, grows with each interaction,
and serves as persistent context for AI systems.

**sys.md is a file about the user — not about the AI.**
It encodes who you are (values, expertise, relationships, session history)
so that AI systems can represent you authentically. This is structurally
different from AI agent personality or system-prompt files: those define how
an agent behaves; sys.md defines what the agent knows about *you*.

```
sys.md  →  sessionStorage (browser)       never leaves without user action
         →  VPS (AES-256-CBC, optional)     user-initiated
         →  AI context (Anthropic Claude)   transient, user-initiated
         →  MCP tools (soul_read/write)     authorized per service-token
         →  Blockchain anchor (Polygon)     optional, hash only
```

The sys.md belongs to the user. The server operator has no access to
encrypted content. Encryption is the default; plaintext is an explicit opt-in.

---

## Design Principles

| Principle | Implementation |
|---|---|
| **Local-first** | sys.md lives in sessionStorage; vault files in local filesystem |
| **Privacy-by-design** | AES-256-CBC encryption before any server upload |
| **Stateless auth** | HMAC-SHA256 cert derived from key + soul_id — no session DB |
| **User-controlled sharing** | Granular service-token permissions per data type |
| **Protocol, not platform** | sys.md format is open; any compatible server is valid |

---

## Protocol Layers

```
┌─────────────────────────────────────────────┐
│  Identity Layer                              │
│  sys.md — YAML frontmatter + Markdown body  │
│  soul_id (UUID v4) — primary key             │
│  soul_cert — HMAC-SHA256 auth token          │
├─────────────────────────────────────────────┤
│  Storage Layer                               │
│  Browser: sessionStorage + File System API   │
│  VPS: /var/lib/sys/souls/{soul_id}/          │
│  Cloud: encrypted .soul bundle (AES-256-GCM) │
├─────────────────────────────────────────────┤
│  Access Layer                                │
│  soul_cert     — owner full access           │
│  service-token — scoped external access      │
│  BIP39-auth    — ciphertext access via words │
├─────────────────────────────────────────────┤
│  AI Interface Layer                          │
│  REST API  — direct HTTP endpoints           │
│  MCP tools — Model Context Protocol (OAuth)  │
│  Webhook   — push to external services       │
└─────────────────────────────────────────────┘
```

---

## Key Concepts

| Term | Definition |
|---|---|
| **sys.md** | The identity file. Plain Markdown, YAML frontmatter, grows over time. |
| **soul_id** | UUID v4. Primary key for all server operations. |
| **soul_cert** | 32 hex chars. HMAC-SHA256(SOUL_MASTER_KEY, soul_id)[0:32]. Stateless auth token. |
| **vault_key** | 32-byte AES key. Encrypts sys.md and vault files. Never stored by server in plaintext. |
| **vault** | Local filesystem folder. Contains audio, images, video, context files. |
| **service-token** | 64 hex chars. Scoped access token for external services. |
| **soul_grant** | Permission record created when two souls connect in the network. |
| **soul_cert bundle** | AES-256-GCM encrypted export. Key derived from Passkey or BIP39. |

---

## Relation to Existing Standards

| Standard | Relation |
|---|---|
| MCP (Model Context Protocol) | SYS implements MCP server + OAuth 2.0 + PKCE |
| ActivityPub | Conceptually similar — federated identity, but AI-native |
| DID (W3C) | soul_id is not a DID, but could be mapped to one |
| JWT | soul_cert is simpler than JWT — stateless HMAC, no claims payload |
| BIP39 | Used for key derivation in mnemonic auth path |

---

## Reference Implementation

The reference implementation runs as a closed beta at the operator's domain.
It is not a deployable product. It demonstrates that the protocol is viable
at real-world scale.

Anyone MAY build a compatible SYS server. Compatible implementations:
- MUST accept `Authorization: Bearer {soul_id}.{cert}` on protected endpoints
- MUST store sys.md at `{base}/{soul_id}/sys.md`
- MUST implement the soul_cert derivation algorithm (see `spec/auth.md`)
- MAY implement MCP, webhook, vault, or blockchain features independently

See [CONTRIBUTING.md](../CONTRIBUTING.md) for self-hosting requirements.

---

*Specification version: 1.0-draft · Apache License 2.0*
*Full spec: [spec/sys_md.md](spec/sys_md.md) · [spec/auth.md](spec/auth.md) · [spec/mcp-tools.md](spec/mcp-tools.md)*
