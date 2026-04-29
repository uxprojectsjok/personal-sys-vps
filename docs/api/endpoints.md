# API Reference

**Base URL:** `https://YOUR_DOMAIN`
**Auth:** See [spec/auth.md](../spec/auth.md)

---

## Authentication

All protected endpoints require:

```
Authorization: Bearer {soul_id}.{soul_cert}
```

Where `soul_cert = HMAC-SHA256(SOUL_MASTER_KEY, soul_id).hex()[0:32]`

---

## Endpoint Index

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/soul-cert` | none | Derive soul_cert for a soul_id |
| POST | `/api/soul-sign-session` | none | Sign a growth chain entry |
| GET | `/api/validate` | soul_cert | Validate cert (returns 200 or 401) |
| GET | `/api/context` | soul_cert | Read API context + permissions |
| PUT | `/api/context` | soul_cert | Update API context + upload sys.md |
| POST | `/api/vault/unlock` | soul_cert | Unlock vault with AES key |
| POST | `/api/vault/lock` | soul_cert | Lock vault immediately |
| GET | `/api/vault/session` | soul_cert | Query vault session status |
| POST | `/api/vault/sync` | soul_cert | Upload a file to vault |
| GET | `/api/vault/manifest` | vault_auth | Vault index |
| GET | `/api/soul` | vault_auth | Read sys.md |
| GET | `/api/vault/audio[/{file}]` | vault_auth | List or get audio files |
| GET | `/api/vault/video[/{file}]` | vault_auth | List or get video files |
| GET | `/api/vault/images[/{file}]` | vault_auth | List or get image files |
| GET | `/api/vault/context[/{file}]` | vault_auth | List or get context files |
| GET | `/api/vault/profile/{type}` | vault_auth | Read analysis profile (face/voice/motion/expertise) |
| PUT | `/api/vault/profile/{type}` | vault_auth | Write analysis profile (encrypted) |
| DELETE | `/api/vault/profile/{type}` | soul_cert | Delete analysis profile |
| DELETE | `/api/vault/{type}/{file}` | soul_cert | Delete a vault file |
| POST | `/api/chat` | soul_cert | Chat proxy (SSE streaming) |
| POST | `/api/soul-update` | soul_cert | Soul enrichment (JSON) |
| GET | `/api/vault/external/soul` | vault_auth | Fetch soul from external URL |
| POST | `/api/fetch-bundle` | none | Fetch encrypted bundle from URL |
| POST | `/api/webhook` | service_token | Generic webhook (all resources) |
| POST | `/api/webhook/mnemonic` | BIP39 in body | Mnemonic-auth webhook |
| POST | `/api/soul/v1/token` | soul_cert | Issue JWT service token |
| GET/POST | `/api/vault/connections/network` | vault_auth | Soul Network |
| POST | `/api/beme` | vault_auth | Talk as soul — beme_chat MCP backend |
| GET | `/api/vault/public/config` | soul_cert | Read own public vault config |
| PUT | `/api/vault/public/config` | soul_cert | Save public vault config |
| POST | `/api/vault/public/sync` | soul_cert | Upload file to public vault |
| DELETE | `/api/vault/public/{file}` | soul_cert | Remove file from public vault |
| GET | `/api/vault/public/{soul_id}` | none | Manifest of a soul's public vault |
| GET | `/api/vault/public/{soul_id}/{file}` | soul_cert or api_grant | Download public vault file |

---

## Endpoint Details

### POST /api/soul-cert

Derive a soul_cert. No authentication required.

```http
POST /api/soul-cert
Content-Type: application/json

{ "soul_id": "uuid-v4" }
```

```json
{ "cert": "a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5" }
```

---

### GET /api/validate

Validate a soul_cert. Returns 200 on success, 401 on failure.

```http
GET /api/validate
Authorization: Bearer {soul_id}.{cert}
```

---

### GET /api/context

Read the current API context for a soul.

```http
GET /api/context
Authorization: Bearer {soul_id}.{cert}
```

```json
{
  "enabled": true,
  "cipher_mode": "ciphered",
  "has_token": true,
  "external_soul_url": "",
  "permissions": {
    "soul": true,
    "calendar": false,
    "audio": true,
    "video": false,
    "images": false,
    "context_files": true
  },
  "synced_files": { "audio": ["voice.mp3"], "context": ["hash.txt"] },
  "active_files": { "audio": "voice.mp3" }
}
```

Note: `webhook_token` is never returned. `has_token` indicates presence only.

---

### PUT /api/context

Update API context. Accepts partial updates — only provided fields are changed.

```http
PUT /api/context
Authorization: Bearer {soul_id}.{cert}
Content-Type: application/json

{
  "enabled": true,
  "cipher_mode": "ciphered",
  "permissions": { "soul": true, "audio": true },
  "soul_content_encrypted": "<base64 AES-256-CBC ciphertext>",
  "active_files": { "audio": "voice.mp3" }
}
```

| Field | Type | Description |
|---|---|---|
| `enabled` | boolean | Enable/disable external API access |
| `cipher_mode` | `"ciphered"\|"open"` | Encryption mode for stored sys.md |
| `permissions` | object | Granular permission flags |
| `soul_content_encrypted` | base64 string | AES-256-CBC encrypted sys.md |
| `soul_content` | string | Plaintext sys.md (open mode only) |
| `webhook_token` | string | Service-token (max 256 chars) |
| `external_soul_url` | string | HTTPS URL for external soul storage |
| `active_files` | object | Active file selection per type |

---

### POST /api/vault/unlock

```http
POST /api/vault/unlock
Authorization: Bearer {soul_id}.{cert}
Content-Type: application/json

{
  "duration": "12h",
  "vault_key": "64-hex-char AES-256 key"
}
```

Allowed durations: `1h` `12h` `1d` `30d` `182d` `365d` `unlimited`

```json
{
  "ok": true,
  "unlocked": true,
  "duration": "12h",
  "expires_at": 1712845200,
  "has_key": true
}
```

---

### POST /api/vault/sync

Upload a file to the vault.

```http
POST /api/vault/sync
Authorization: Bearer {soul_id}.{cert}
Content-Type: application/json

{
  "type": "audio",
  "name": "voice-memo.webm",
  "data": "<base64-encoded file content>",
  "encrypted": false
}
```

| `type` | Allowed extensions | Max size |
|---|---|---|
| `audio` | mp3, wav, ogg, webm, m4a, opus, flac, aac | 50 MB |
| `video` | mp4, mov, avi, mkv, webm | 100 MB |
| `image` | jpg, jpeg, png, webp, gif, avif | 10 MB |
| `context` | md, txt | 512 KB |

Files are scanned by ClamAV before storage.
Audio files are converted to MP3 by ffmpeg on the server.
Video files are converted to MP4 H.264 + AAC.

---

### GET /api/soul

Read the sys.md. Decrypts on-the-fly if vault is unlocked.

```http
GET /api/soul
Authorization: Bearer {soul_id}.{cert}
```

Returns `text/markdown`. Requires `soul` permission.

Query parameter:
- `?raw=1` — return raw encrypted bytes (for cloud backup, only works on encrypted souls)

---

### POST /api/chat

Proxy to Anthropic Claude API with SSE streaming.
The server injects the `ANTHROPIC_API_KEY` — it is never exposed to the client.

```http
POST /api/chat
Authorization: Bearer {soul_id}.{cert}
Content-Type: application/json

{
  "model": "claude-sonnet-4-6",
  "max_tokens": 8192,
  "system": "...",
  "messages": [...]
}
```

Returns Server-Sent Events (SSE).

---

### POST /api/fetch-bundle

Fetch an encrypted .soul bundle from a public URL. No authentication required.

```http
POST /api/fetch-bundle
Content-Type: application/json

{ "url": "https://drive.google.com/..." }
```

Also accepts Arweave transaction IDs (43-char alphanumeric strings).
Google Drive share URLs are automatically rewritten to direct-download URLs.

Returns the parsed JSON bundle. Decryption happens client-side.

---

### GET/PUT/DELETE /api/vault/profile/{type}

Read, write, or delete a structured analysis profile.

**Profile types:** `face` · `voice` · `motion` · `expertise`

Profiles are stored in `vault/profile/{type}.json` and are **always AES-256-CBC encrypted** on disk.
A PUT requires an active vault session (vault_key must be set).

```http
GET /api/vault/profile/face
Authorization: Bearer {soul_id}.{cert}
```

```json
{
  "type": "face",
  "description": "...",
  "features": { "glasses": "...", "hair": "...", "beard": "..." },
  "expression": "neutral-ruhig",
  "estimated_age": "47–50",
  "soul_id": "...",
  "updated_at": "2026-04-11T11:57:08Z"
}
```

```http
PUT /api/vault/profile/motion
Authorization: Bearer {soul_id}.{cert}
Content-Type: application/json

{
  "energy_level": "niedrig-mittel",
  "gesture_style": "...",
  "presence": "...",
  "behavioral_notes": "..."
}
```

```json
{ "ok": true, "type": "motion", "updated_at": "...", "encrypted": true }
```

---

### POST /api/beme

Talk as the soul — the server reads sys.md, builds the same system prompt as the SYS chat app,
and calls the Anthropic API server-side. Used by the `beme_chat` MCP tool.

**Auth:** `vault_auth.lua` — requires `soul` permission (soul_cert or service-token)

```http
POST /api/beme
Authorization: Bearer {soul_id}.{cert}
Content-Type: application/json

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
| `history` | — | Prior conversation turns (max 20 turns) |
| `max_tokens` | — | Max response tokens (64–4096, default 1024) |

```json
{ "response": "...", "soul_name": "Till", "model": "claude-sonnet-4-6" }
```

The endpoint decrypts sys.md on-the-fly if the vault is unlocked.
No Anthropic API key is required in the calling client — the server injects it.

**Rate limit:** `chat` zone (same as `/api/chat`)

---

### POST /api/webhook

Generic webhook endpoint. Returns all permitted resources in a single response.

```http
POST /api/webhook
Authorization: Bearer {service_token}
```

or

```http
POST /api/webhook
X-Webhook-Token: {service_token}
```

Returns a JSON object with soul, audio, video, images, and context data
according to the permissions configured in `api_context.json`.

---

### Public Vault

The public vault lets a soul share specific files with connected souls (Soul Grants) or
external services (API Grants). Files listed in `public_files` are accessible — no
separate enable/disable switch exists. If the list is empty, nothing is served.

#### GET /api/vault/public/config

Read own public vault configuration.

```http
GET /api/vault/public/config
Authorization: Bearer {soul_id}.{cert}
```

```json
{
  "v": 1,
  "updated_at": 1744000000,
  "public_files": [
    { "name": "profile.png", "cipher": "open" }
  ],
  "soul_grants": [
    {
      "id": "sc_abc123",
      "label": "Friend",
      "soul_id": "other-soul-uuid",
      "scope": ["soul", "images", "audio", "video", "context_files"],
      "created": 1744000000
    }
  ],
  "api_grants": [
    {
      "id": "ag_xyz",
      "label": "My Service",
      "scope": ["context_files"],
      "token_masked": "a1b2c3d4•••",
      "created": 1744000000
    }
  ]
}
```

#### PUT /api/vault/public/config

Save public vault configuration.

```http
PUT /api/vault/public/config
Authorization: Bearer {soul_id}.{cert}
Content-Type: application/json

{
  "v": 1,
  "public_files": [
    { "name": "profile.png", "cipher": "open" }
  ],
  "soul_grants": [
    {
      "id": "sc_abc123",
      "soul_id": "other-soul-uuid",
      "label": "Friend",
      "scope": ["soul", "images", "audio", "video", "context_files"]
    }
  ],
  "api_grants": [
    {
      "id": "ag_xyz",
      "label": "My Service",
      "scope": ["context_files"],
      "token": "a1b2c3d4e5f6..."
    }
  ]
}
```

| Field | Description |
|---|---|
| `public_files` | Files to share. `cipher`: `"open"` (plaintext) or `"ciphered"` (AES-encrypted) |
| `soul_grants` | Connected souls and their permitted file scopes |
| `api_grants` | External services with a token and permitted scope |

```json
{ "ok": true }
```

#### POST /api/vault/public/sync

Upload a file to the public vault. Must be listed in `public_files` (save config first).

```http
POST /api/vault/public/sync
Authorization: Bearer {soul_id}.{cert}
Content-Type: application/json

{
  "name": "profile.png",
  "data": "<base64>",
  "encrypted": false
}
```

```json
{ "ok": true }
```

#### DELETE /api/vault/public/{file}

Remove a file from the public vault (deletes the stored file; does not update `public_files` list automatically).

```http
DELETE /api/vault/public/profile.png
Authorization: Bearer {soul_id}.{cert}
```

```json
{ "ok": true }
```

#### GET /api/vault/public/{soul_id}

Fetch the manifest of another soul's public vault. No authentication required.
Returns only files that are physically present in the vault.

```http
GET /api/vault/public/other-soul-uuid
```

```json
{
  "soul_id": "other-soul-uuid",
  "files": [
    { "name": "profile.png", "cipher": "open", "type": "images" },
    { "name": "docs.md",     "cipher": "open", "type": "context_files" }
  ]
}
```

Returns `[]` for `files` if no files are available.

#### GET /api/vault/public/{soul_id}/{file}

Download a file from a soul's public vault. Requires authentication:

- **Soul Cert** — the requesting soul must have a Soul Grant with matching scope
- **API Grant Token** — via `Authorization: Bearer {token}` or `?token={token}`

```http
GET /api/vault/public/other-soul-uuid/profile.png
Authorization: Bearer {requesting_soul_id}.{cert}
```

File type → required scope:

| File type | Scope |
|---|---|
| `images` | `images` |
| `audio` | `audio` |
| `video` | `video` |
| `context_files` (md, txt, pdf) | `context_files` |
| sys.md (soul identity) | `soul` |

Returns the raw file bytes with appropriate `Content-Type`.

---

## Rate Limits

| Zone | Rate | Burst | Endpoints |
|---|---|---|---|
| `chat` | 1 r/s | 5–30 | `/api/chat`, `/api/soul-update`, vision |
| `api` | 30 r/s | 10–30 | General API |
| `auth` | 5 r/s | 2–5 | `/api/soul-cert`, `/api/validate` |
| `mcp` | 5 r/s | 10 | `/mcp` |
| `oauth` | 3 r/s | 5 | `/oauth/` |

---

## Error Format

All endpoints return errors in this format:

```json
{
  "error": "error_code",
  "message": "Optional human-readable description."
}
```

Common error codes: `vault_locked`, `encrypted`, `permission_denied`,
`invalid_soul_identity`, `api_not_enabled`, `storage_error`, `method_not_allowed`
