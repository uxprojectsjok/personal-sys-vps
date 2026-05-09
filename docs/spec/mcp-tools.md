# MCP Tools Specification

**Version:** 1.4
**Protocol:** Model Context Protocol (MCP) — Streamable HTTP transport
**Auth:** OAuth 2.0 + PKCE

---

## 1. Connection

```
MCP endpoint:     https://YOUR_DOMAIN/mcp
OAuth authorize:  https://YOUR_DOMAIN/oauth/authorize
OAuth token:      https://YOUR_DOMAIN/oauth/token
Discovery:        https://YOUR_DOMAIN/.well-known/oauth-authorization-server
```

The MCP server runs as a Node.js process proxied by OpenResty at `/mcp`.

---

## 2. OAuth Flow

```
1. GET  /oauth/authorize?response_type=code
                        &client_id=...
                        &redirect_uri=...
                        &code_challenge=...
                        &code_challenge_method=S256
   → HTML consent page (shows soul_id + permissions requested)

2. POST /oauth/authorize   { soul_id, cert, approved: true }
   → issues auth code (in-memory, 5 min TTL)

3. POST /oauth/token       { code, code_verifier, grant_type }
   → returns access_token (= service-token scoped to granted permissions)

4. All MCP tool calls      Authorization: Bearer {access_token}
```

The access token is a SYS service-token. It is validated by the same
mechanism as direct API service-tokens (see `spec/auth.md` §3).

---

## 3. Token Types and Tool Access

The MCP server distinguishes callers by token format:

| Token format | Caller | Tool set |
|---|---|---|
| 64 hex chars | Owner (OAuth service-token) | All registered tools |
| 48 hex chars | Paid agent (pol_access_token) | `amortization.agent_tools` only |
| `uuid.32hex` | Trusted peer (peer soul_cert) | `amortization.agent_tools` only |

**Available tools for paid agents and peers (14 tools, must be explicitly enabled per soul):**
`soul_read`, `soul_maturity`, `soul_skills`, `audio_get`, `audio_list`, `image_get`, `image_list`, `video_get`, `video_list`, `context_get`, `context_list`, `profile_get`, `calendar_read`, `verify_human`

**Important:** When a peer connects via `uuid.32hex`, `soul_read` reads the **Social Sphere** block (`<!-- SOCIAL:START/END -->`), not the full sys.md. When an owner connects, `soul_read` returns the full sys.md content.

---

## 4. Tool Catalog

### 4.1 soul_read

Read sys.md content. Behavior differs by caller:

- **Owner:** Returns full sys.md content.
- **Peer (trusted soul):** Returns only the Social Sphere block (`<!-- SOCIAL:START/END -->`). Auto-migrates v1 files to v2 on first access.
- **Paid agent (pol_access_token):** Not used — paid agents use `soul_paid_read` HTTP endpoint directly.

**Requires:** `soul` permission (owner) or trusted peer cert

**Input:** none

**Output (owner):**
```json
{ "content": "---\nsoul_id: ...\n---\n\n## Core Identity\n..." }
```

**Output (peer):**
```
(contents of <!-- SOCIAL:START --> ... <!-- SOCIAL:END --> block)
```

---

### 4.2 soul_write

Update content in sys.md. Behavior differs by caller:

- **Owner:** Updates any `## Section` by name.
- **Peer:** Writes only into the Social Sphere block (`<!-- SOCIAL:START/END -->`). Cannot touch the Private Sphere or Agent Sandbox.

**Requires:** `soul` permission (owner) or trusted peer cert with `soul_write` enabled

**Input (owner):**
```json
{
  "section": "Session Log (compressed)",
  "content": "### 2026-04-10\nNew session content...",
  "mode": "append"
}
```

**Input (peer):**
```json
{
  "content": "Content to write into Social Sphere",
  "mode": "append"
}
```

| `mode` | Behavior |
|---|---|
| `replace` | Replace entire block/section content |
| `append` | Add content after existing content |
| `prepend` | Add content before existing content |

---

### 4.3 soul_comment

Append a comment to the Social Sphere block. For trusted peer souls only.
The peer's soul_id is automatically attributed.

**Input:**
```json
{
  "comment": "Great to connect!",
  "author": "Optional display name"
}
```

Comment format written to the Social Sphere:
```
---
**Optional display name · soul:peer-uuid** · 2026-05-09
Great to connect!
```

---

### 4.4 soul_maturity

Compute and optionally persist the maturity score. Reads full sys.md internally; returns only computed values.

**Requires:** `soul` permission

**Input:**
```json
{ "save": true }
```

**Output:**
```json
{ "score": 72, "breakdown": { "core_identity": 1, "values": 1, "session_log": 1, ... } }
```

---

### 4.5 soul_skills

List declared skills or invoke a skill handler. Reads full sys.md internally; returns only skill data.

**Requires:** `soul` permission

**Input (list):**
```json
{ "action": "list" }
```

**Input (invoke):**
```json
{ "action": "invoke", "skill": "skill-name", "params": {} }
```

Skills are declared in the `## Skills` section of sys.md as structured YAML blocks.

---

### 4.6 soul_discover

Discover registered souls from the Agent Marketplace. Searches both Pinata/IPFS and Polygon blockchain simultaneously (dual-source merge).

**Requires:** No permission required (always available)

**Input:**
```json
{ "query": "designer" }
```

**Output:**
```json
{
  "souls": [
    {
      "soul_id": "uuid-v4",
      "name": "Jan",
      "mcp_endpoint": "https://domain/mcp",
      "source": "ipfs+chain",
      "source_label": "Registered on IPFS + verified on Polygon blockchain",
      "chain_verified": true,
      "amortization": {
        "enabled": true,
        "pol_per_request": "0.001",
        "agent_tools": ["soul_read", "verify_human"]
      }
    }
  ]
}
```

**Source values:**
| `source` | Meaning |
|---|---|
| `ipfs` | Found in Pinata/IPFS registry only |
| `chain` | Found on Polygon blockchain only |
| `ipfs+chain` | Found in both — strongest trust signal |

---

### 4.7 vault_manifest

Return the full vault index.

**Requires:** Any vault permission

**Input:** none

**Output:**
```json
{
  "soul_id": "...",
  "enabled": true,
  "cipher_mode": "ciphered",
  "permissions": { "soul": true, "audio": true, ... },
  "synced_files": { "audio": ["file.mp3"], "images": [], ... },
  "active_files": { "audio": "file.mp3" },
  "endpoints": { "soul": "/api/soul", "audio": "/api/vault/audio", ... }
}
```

---

### 4.8 audio_list / audio_get

List or retrieve audio vault files.

**Requires:** `audio` permission

**audio_list output:**
```json
{
  "files": [
    { "name": "voice.mp3", "url": "...", "url_with_token": "...", "mime": "audio/mpeg", "active": true }
  ],
  "active_url": "https://..."
}
```

**audio_get input:**
```json
{ "filename": "voice.mp3" }
```

Returns a signed direct URL for download (Token already embedded — no Auth header needed).

---

### 4.9 image_list / image_get

List or retrieve image vault files.

**Requires:** `images` permission

**image_get output:** Returns the image as a base64-encoded MCP `image` content block plus metadata:
```json
{ "filename": "profile.jpg", "size_kb": 420, "hint": "Bild direkt analysieren, dann profile_save face aufrufen." }
```

The image content block is directly visible to Claude — no fetch required.

---

### 4.10 video_list / video_get

List or retrieve video vault files.

**Requires:** `video` permission

**video_get input:**
```json
{ "filename": "bewegung.webm", "max_frames": 6 }
```

`max_frames` — number of frames to extract, equally spaced over the video duration (1–12, default 6).

**video_get output:** ffmpeg extracts frames and returns each as a base64-encoded MCP `image` block.

---

### 4.11 context_list / context_get

List or retrieve text context files from `vault/context/`.

**Requires:** `context_files` permission

Same interface as `audio_list` / `audio_get` for text types (`.md`, `.txt`).

---

### 4.12 profile_get / profile_save

Read or write structured analysis profiles stored in `vault/profile/{type}.json`.
Profiles are always AES-256-CBC encrypted on disk.

**Requires:** `soul` permission + unlocked vault

**Profile types (fixed enum):** `face` · `voice` · `motion` · `expertise`

**profile_get input:**
```json
{ "type": "face" }
```

**profile_save input:**
```json
{
  "type": "face",
  "data": {
    "description": "...",
    "features": { "glasses": "...", "hair": "...", "beard": "..." },
    "expression": "neutral-ruhig",
    "estimated_age": "47–50",
    "notes": "..."
  }
}
```

---

### 4.13 network_list

List all connected souls in the Soul Network.

**Requires:** `soul` permission

**Output:**
```json
{
  "connections": [
    { "soul_id": "...", "alias": "...", "grant_level": "read", "connected_at": "..." }
  ]
}
```

---

### 4.14 network_peer_get

Read shared content from a connected peer's Public Vault.

**Requires:** `soul` permission + peer must have granted `soul_grant` access

**Input:**
```json
{ "soul_id": "uuid-v4" }
```

Optional — read a single file:
```json
{ "soul_id": "uuid-v4", "file": "report.pdf" }
```

**Output (manifest mode):**
- `soul_content` — peer's sys.md (if `soul` scope granted)
- Text/Markdown files — inline as text blocks
- **PDF files — as MCP `resource` blob (application/pdf, directly readable)**
- Images, Audio, Video — listed by name

**Peer Stream Endpoint (direct access):**

```
GET /api/vault/peer-stream?soul_id={id}&file={name}&token={service-token}
```

---

### 4.15 soul_cloud_push

Push an encrypted bundle to external storage (Arweave, HTTPS endpoint).

**Requires:** `soul` permission

**Input:**
```json
{
  "target": "arweave",
  "include_vault": false
}
```

The bundle is always AES-256-CBC encrypted before upload.

---

### 4.16 verify_human

Human-in-the-loop confirmation step. The AI client MUST pause and
wait for explicit user confirmation before proceeding.

**Input:**
```json
{
  "prompt": "Are you sure you want to delete all VPS data?",
  "timeout_seconds": 60
}
```

**Output:**
```json
{ "confirmed": true }
```

Call before any destructive or irreversible operation.

---

### 4.17 beme_chat

Talk to the soul — the AI responds as the soul owner would.

**Requires:** `soul` permission + unlocked vault

**Input:**
```json
{
  "message": "What do you think about this project?",
  "history": [
    { "role": "user",      "content": "Hello!" },
    { "role": "assistant", "content": "Hey, great to have you here." }
  ],
  "max_tokens": 1024
}
```

**Output:**
```json
{ "response": "...", "soul_name": "Till", "model": "claude-sonnet-4-6" }
```

---

### 4.18 calendar_read

Read the `## Calendar` section of sys.md.

**Requires:** `calendar` permission

---

### 4.19 elevenlabs_agent_update

Update the ElevenLabs conversational AI agent configuration.

**Requires:** `soul` permission + `ELEVENLABS_API_KEY` configured

**Input:**
```json
{
  "system_prompt": "...",
  "first_message": "..."
}
```

---

## 5. Public Vault API

See [architecture/vault.md](../architecture/vault.md) for full details.

---

## 6. Error Responses

All tools return structured errors:

```json
{ "error": "error_code", "message": "Human-readable description." }
```

| Code | HTTP | Meaning |
|---|---|---|
| `vault_locked` | 403 | Vault key not in active session |
| `encrypted` | 403 | Content is encrypted, no key available |
| `permission_denied` | 403 | Service-token lacks required permission |
| `not_found` | 404 | Resource does not exist |
| `soul_not_synced` | 404 | No sys.md uploaded to VPS |
| `api_disabled` | 403 | API context not enabled by user |
| `no_social_content` | 404 | Social Sphere block missing (v1 soul) |

---

## 7. Rate Limits

| Zone | Rate | Burst | Endpoints |
|---|---|---|---|
| `mcp` | 5 r/s | 10 | `/mcp` |
| `oauth` | 3 r/s | 5 | `/oauth/` |
| `chat` | 2 r/s | 20 | `/api/vault/connections/*`, `/api/vault/peer-stream` |
