# MCP Tools Specification

**Version:** 1.3
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

## 3. Tool Catalog

### 3.1 soul_read

Read the full sys.md content.

**Requires:** `soul` permission

**Input:** none

**Output:**
```json
{ "content": "---\nsoul_id: ...\n---\n\n## Core Identity\n..." }
```

---

### 3.2 soul_write

Update a `## Section` in sys.md.

**Requires:** `soul` permission

**Input:**
```json
{
  "section": "Session Log (compressed)",
  "content": "### 2026-04-10\nNew session content...",
  "mode": "append"
}
```

| `mode` | Behavior |
|---|---|
| `replace` | Replace entire section content |
| `append` | Add content after existing section content |
| `prepend` | Add content before existing section content |

If the section does not exist, it MUST be created.

---

### 3.3 soul_maturity

Compute and optionally persist the maturity score.

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

### 3.4 soul_skills

List declared skills or invoke a skill handler.

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

### 3.5 vault_manifest

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

### 3.6 audio_list / audio_get

List or retrieve audio vault files.

**Requires:** `audio` permission

**audio_list input:** none

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

### 3.7 image_list / image_get

List or retrieve image vault files.

**Requires:** `images` permission

**image_list input:** none

**image_get input:**
```json
{ "filename": "profile.jpg" }
```

**image_get output:** Returns the image as a base64-encoded MCP `image` content block plus metadata:
```json
{ "filename": "profile.jpg", "size_kb": 420, "hint": "Bild direkt analysieren, dann profile_save face aufrufen." }
```

The image content block is directly visible to Claude — no fetch required.

---

### 3.8 video_list / video_get

List or retrieve video vault files.

**Requires:** `video` permission

**video_list input:** none

**video_get input:**
```json
{ "filename": "bewegung.webm", "max_frames": 6 }
```

`max_frames` — number of frames to extract, equally spaced over the video duration (1–12, default 6).

**video_get output:** ffmpeg extracts `max_frames` JPEG frames and returns each as a base64-encoded MCP `image` block. Claude can analyze all frames directly.

---

### 3.9 context_list / context_get

List or retrieve text context files from `vault/context/`.

**Requires:** `context_files` permission

Same interface as `audio_list` / `audio_get` for text types (`.md`, `.txt`).

---

### 3.10 profile_get / profile_save

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

Recommended data structures:
- **face:** `{ description, features, expression, estimated_age, style, notes }`
- **voice:** `{ tone, pace, energy, style, vocabulary_markers, notes }`
- **motion:** `{ energy_level, gesture_style, presence, posture, behavioral_notes }`
- **expertise:** `{ domains[], strengths[], experience_level, notes }`

**Typical workflow:**
1. `image_get` → analyze face → `profile_save face`
2. `video_get` → analyze motion frames → `profile_save motion`
3. `soul_read` → derive expertise → `profile_save expertise`

---

### 3.11 network_list

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

### 3.12 network_peer_get

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

**PDF delivery:**
PDFs are fetched server-side by the MCP Node.js process via the `/api/vault/peer-stream`
endpoint and returned as a standard MCP resource blob (`type: "resource"`, `mimeType: "application/pdf"`).
The binary data is complete — no truncation. MCP clients that support PDF resources can
read the content directly without any additional fetch.

**Peer Stream Endpoint (direct access):**

```
GET /api/vault/peer-stream?soul_id={id}&file={name}&token={service-token}
```

- Returns the raw file binary with correct `Content-Type`
- Auth: service-token via `?token=` query parameter (no header needed)
- Validates: connection exists + soul_grant scope + file in public_files + not ciphered
- Works for any file type: PDF, images, audio, video, text
- Standard HTTP + correct MIME type — readable by any HTTP client (browser, curl, Python, etc.)

**Access control:**
Access is governed by the peer's `soul_grants` in their `vault_public/config.json`.
The peer must have explicitly added the requesting soul_id as a grant with the relevant
scope (`context_files`, `images`, `audio`, `video`, or `all`).

---

### 3.13 soul_cloud_push

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

### 3.14 verify_human

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

### 3.15 beme_chat

Talk to the soul — the AI responds as the soul owner would.
Enables people to have conversations with their digital self.

**Requires:** `soul` permission + unlocked vault (sys.md must be synced)

**Input:**
```json
{
  "message": "Was denkst du über dieses Projekt?",
  "history": [
    { "role": "user",      "content": "Hallo!" },
    { "role": "assistant", "content": "Hey, schön dass du da bist." }
  ],
  "max_tokens": 1024
}
```

| Field | Required | Description |
|---|---|---|
| `message` | ✓ | Current user message (max 8000 chars) |
| `history` | — | Prior conversation turns (max 20, optional) |
| `max_tokens` | — | Max response length (64–4096, default 1024) |

**Output:**
```json
{ "response": "...", "soul_name": "Till", "model": "claude-sonnet-4-6" }
```

The response is rendered as `**Soul-Name:** response text`.

**How it works:**
- Server reads sys.md directly from disk (decrypts if vault is open)
- Builds the same system prompt as the SYS chat app
- Calls Anthropic API server-side (no API key needed in the MCP client)
- Returns a single non-streaming response

**Endpoint (direct access):**
```
POST /api/beme
Authorization: Bearer {service-token}   (soul permission required)
Content-Type: application/json
```

---

### 3.16 calendar_read

Read the `## Calendar` section of sys.md.

**Requires:** `calendar` permission

---

### 3.16 elevenlabs_agent_update

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

### 3.17 twilio_call_config

Configure an outbound Twilio call with voice agent settings.

**Requires:** `soul` permission + Twilio integration configured

---

## 4. Public Vault API

The Public Vault exposes files from `vault_public/files/` to network partners and MCP tools.

### Manifest

```
GET /api/vault/public/{soul_id}
```

Returns the list of public files with type and cipher status. No auth required.

### File Access

```
GET /api/vault/public/{soul_id}/{filename}
Authorization: Bearer {soul-cert}
```

Or via token:

```
GET /api/vault/public/{soul_id}/{filename}?token={api-grant-token}
```

Auth options:
- **Soul-cert** — own soul_cert as Bearer (soul_grant must include requesting soul_id)
- **API-grant-token** — token from `vault_public/config.json → api_grants[].token` (scoped)

**Limits:** max file size 200 MB. Filenames must match `[a-zA-Z0-9._-]+`.

### Peer Stream (direct binary, for MCP tools)

```
GET /api/vault/peer-stream?soul_id={id}&file={name}&token={service-token}
```

Fetches a peer's public vault file as raw binary. Used internally by `network_peer_get`
but also callable directly. Returns correct `Content-Type` for every file type.

---

## 5. Error Responses

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

---

## 6. Rate Limits

| Zone | Rate | Burst | Endpoints |
|---|---|---|---|
| `mcp` | 5 r/s | 10 | `/mcp` |
| `oauth` | 3 r/s | 5 | `/oauth/` |
| `chat` | 2 r/s | 20 | `/api/vault/connections/*`, `/api/vault/peer-stream` |
