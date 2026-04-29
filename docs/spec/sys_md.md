# sys.md Format Specification

**Version:** 1.0-draft
**Status:** Working draft

---

## 1. Overview

A SYS identity file is a plain UTF-8 Markdown file. It consists of a YAML
frontmatter block followed by a Markdown body structured by `## Section`
headings.

The frontmatter is machine-readable and carries protocol metadata.
The body is human-readable and AI-consumable identity content.

---

## 1.1 File Naming

**The filename is not part of the protocol.** The SYS client detects the
identity file by content, not by name: it scans all `.md` files in the vault
root and identifies the one with valid YAML frontmatter containing `soul_id`
and `soul_cert`.

**Allowed naming conventions:**

| Filename | When to use |
|---|---|
| `sys.md` | Default — short, unambiguous, matches the project name |
| `jan.md` | Personal — your first name or any identifier that feels right |
| `identity.md` | Descriptive — useful in multi-user or organizational contexts |
| `<any-name>.md` | Any valid filename works, as long as there is only one `.md` file with valid SYS frontmatter in the vault root |

**Rules:**
- Only one `.md` file with valid SYS frontmatter per vault (multiple `.md` files are allowed but only the first valid one is loaded)
- The name on the VPS is always `sys.md` (server-side fixed, independent of local naming)
- Renaming a local file does not affect server-side storage or sync behavior

---

## 2. File Structure

```
{frontmatter}
{body}
```

### 2.1 Frontmatter

MUST be a valid YAML block delimited by `---` at the start of the file.

```yaml
---
soul_id:          <uuid-v4>          # REQUIRED
soul_name:        <string>           # REQUIRED
created:          <YYYY-MM-DD>       # REQUIRED
last_session:     <YYYY-MM-DD>       # REQUIRED
version:          <integer>          # REQUIRED, currently 1
soul_cert:        <32 hex chars>     # REQUIRED for authenticated use
vault_hash:       <sha256 hex>       # OPTIONAL, hash of last vault state
soul_growth_chain: []                # OPTIONAL, growth chain entries
soul_chain_anchor: <string|null>     # OPTIONAL, blockchain tx hash
storage_tx:       <string>           # OPTIONAL, Arweave tx ID
---
```

### 2.2 Frontmatter Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `soul_id` | UUID v4 | MUST | Primary key. Globally unique. Never changes. |
| `soul_name` | string | MUST | Display name chosen by the user. |
| `created` | ISO 8601 date | MUST | Creation date of this soul. |
| `last_session` | ISO 8601 date | MUST | Date of most recent session. Updated each session. |
| `version` | integer | MUST | Schema version. Currently `1`. |
| `soul_cert` | 32 hex chars | MUST | HMAC auth token. See `spec/auth.md`. |
| `vault_hash` | SHA-256 hex | MAY | Hash of the last synced vault state. |
| `soul_growth_chain` | array | MAY | Chronological chain of session hashes. |
| `soul_chain_anchor` | string\|null | MAY | Blockchain tx hash for on-chain anchoring. |
| `storage_tx` | string | MAY | Arweave transaction ID for decentralized storage. |

### 2.3 Body

The body MUST consist of `## Section` headings followed by Markdown content.
Parsers MUST handle missing sections gracefully (treat as empty, not as error).

**Standard sections** (all OPTIONAL, any order):

| Section | Purpose |
|---|---|
| `## Core Identity` | One-sentence identity summary |
| `## Values & Beliefs` | Motivations, worldview foundations |
| `## Aesthetics & Resonance` | Music, visuals, atmospheres |
| `## Speech Patterns & Expression` | How the person communicates |
| `## Recurring Themes & Obsessions` | Persistent interests |
| `## Emotional Signature` | Felt quality of interaction |
| `## Worldview` | View of humanity, society, future |
| `## Unanswered Questions` | Open questions this person carries |
| `## Session Log (compressed)` | AI-compressed session history |
| `## Calendar` | Calendar events (requires `calendar` permission) |
| `## Skills` | Structured skill declarations |

Additional `##` sections are valid and MUST be preserved by compliant parsers.

---

## 3. Maturity Score

The maturity score is a computed value (0–100) representing profile completeness.
It is derived from the presence and density of standard sections.

Reference implementation: `shared/utils/soulMaturity.js`

Implementors MAY use their own scoring algorithm. The score SHOULD NOT be
stored in the frontmatter as a canonical value — it is always recomputed.

---

## 4. Growth Chain

The `soul_growth_chain` is an append-only array of session records:

```json
[
  {
    "date": "2026-03-22",
    "hash": "sha256-of-soul-content-on-that-date",
    "signature": "hmac-sha256-signed-by-server"
  }
]
```

The signature proves the session occurred on a specific SYS server instance.
The chain MUST be append-only. Entries MUST NOT be modified after insertion.

Server-side signing endpoint: `POST /api/soul-sign-session`

---

## 5. Encoding and Size

- Encoding: UTF-8, no BOM
- Maximum size (unencrypted): 2 MB
- Line endings: LF preferred, CRLF tolerated
- The file MUST NOT contain null bytes

---

## 6. Versioning

The `version` field tracks the schema version. The current version is `1`.

Future versions MUST be backwards-compatible unless the major version changes.
Parsers encountering an unknown version SHOULD treat unknown frontmatter fields
as opaque and preserve them on write.

---

## 7. Example

```markdown
---
soul_id: 7f3a2b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c
soul_name: "Jan"
created: 2026-01-15
last_session: 2026-04-10
version: 1
soul_cert: a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5
vault_hash: ""
soul_growth_chain: []
soul_chain_anchor: null
storage_tx: ""
---

## Core Identity

Designer and builder working at the intersection of identity, AI, and privacy.

## Values & Beliefs

Believes tools should serve people, not the other way around.
Prefers depth over breadth.

## Session Log (compressed)

### 2026-04-10
Finalized the SYS protocol specification. Discussed SSRF mitigations.
Decided rate-limiting on /api/fetch-bundle is pre-launch, not critical.
```
