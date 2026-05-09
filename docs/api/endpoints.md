# API Reference

**Base URL:** `https://YOUR_DOMAIN`
**Auth:** See [spec/auth.md](../spec/auth.md)

---

## Authentication

All protected endpoints require one of these auth methods:

| Type | Format | Use |
|---|---|---|
| Soul cert (owner) | `Authorization: Bearer {soul_id}.{soul_cert}` | Full owner access |
| Service token | `Authorization: Bearer {64-hex-chars}` | Scoped external access |
| Peer soul cert | `Authorization: Bearer {peer_soul_id}.{peer_cert}` | Peer access to social block |
| POL access token | `Authorization: Bearer {48-hex-chars}` | Paid agent access |

Where `soul_cert = HMAC-SHA256(SOUL_MASTER_KEY, soul_id + ":" + cert_version).hex()[0:32]`

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
| GET | `/api/soul/social-read` | peer soul_cert | Read Sozialsphäre block (v2) |
| GET | `/api/soul/paid-read` | pol_access_token | Agent reads Agent-Sandbox block |
| POST | `/api/soul/paid-write` | pol_access_token | Agent writes to Agent-Sandbox block |
| POST | `/api/soul/paid-comment` | pol_access_token | Agent appends comment to Agent-Sandbox |
| GET | `/api/soul/paid-beme` | pol_access_token | Agent talk-as-soul |
| GET | `/api/soul/amortization` | soul_cert | Read Agent Marketplace config |
| PUT | `/api/soul/amortization` | soul_cert | Update Agent Marketplace config |
| POST | `/api/soul/register` | soul_cert | Register soul in IPFS marketplace |
| GET | `/api/soul/register-preview` | soul_cert | Preview marketplace registration |
| GET | `/api/soul/earnings` | soul_cert | POL payment ledger |
| POST | `/api/soul/pay` | none | Submit POL payment (agent) |
| GET | `/api/soul/verify-peer-cert` | none | Verify a peer soul_cert |
| GET | `/api/node-status` | none | Node registration status |

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

### GET /api/soul/social-read

Read the Sozialsphäre block (`<!-- SOCIAL:START/END -->`) of a soul. For authenticated peer souls only. Introduced in sys.md v2.

```http
GET /api/soul/social-read?soul_id={target_soul_id}
Authorization: Bearer {peer_soul_id}.{peer_cert}
```

- Returns `text/plain` — the content between `<!-- SOCIAL:START -->` and `<!-- SOCIAL:END -->`
- `peer_soul_id` must be in the target soul's `amortization.trusted_souls` list
- Same-server peers: cert verified locally via HMAC
- Cross-domain peers: cert verified via `GET /api/soul/verify-peer-cert` on the peer's home server
- Returns `204 No Content` if the SOCIAL block is empty
- Returns `404` if the SOCIAL block is not present (v1 soul without migration)

---

### GET /api/soul/paid-read

Read the Agent-Sandbox block (`<!-- AGENT:START/END -->`) of a soul. For paid external agents only.

```http
GET /api/soul/paid-read
Authorization: Bearer {pol_access_token}
```

Returns `text/plain` — content between `<!-- AGENT:START -->` and `<!-- AGENT:END -->`.
Token is issued after a verified Polygon payment via `POST /api/soul/pay`.

---

### GET /api/soul/amortization

Read the Agent Marketplace configuration for a soul.

```http
GET /api/soul/amortization
Authorization: Bearer {soul_id}.{cert}
```

```json
{
  "ok": true,
  "amortization": {
    "enabled": true,
    "private": false,
    "pol_per_request": "0.001",
    "wallet": "0x...",
    "agent_tools": ["soul_read", "soul_maturity", "verify_human"],
    "trusted_souls": ["uuid-peer-1", { "soul_id": "uuid-peer-2", "endpoint": "https://peer.domain" }],
    "token_duration_days": 1,
    "activated_at": "2026-05-01T10:00:00Z"
  },
  "agent_registry_cid": "Qm...",
  "agent_registry_url": "https://ipfs.io/ipfs/Qm..."
}
```

---

### PUT /api/soul/amortization

Update Agent Marketplace configuration.

```http
PUT /api/soul/amortization
Authorization: Bearer {soul_id}.{cert}
Content-Type: application/json

{
  "enabled": true,
  "pol_per_request": "0.001",
  "wallet": "0x...",
  "agent_tools": ["soul_read", "soul_maturity"],
  "trusted_souls": ["uuid-peer-id"],
  "token_duration_days": 1,
  "private": false
}
```

**Available `agent_tools` values (14 tools):**
`soul_read`, `soul_maturity`, `soul_skills`, `audio_get`, `audio_list`, `image_get`, `image_list`, `video_get`, `video_list`, `context_get`, `context_list`, `profile_get`, `calendar_read`, `verify_human`

**`trusted_souls` format:**
- Same-server peer: `"uuid-v4"` (plain string)
- Cross-domain peer: `{ "soul_id": "uuid-v4", "endpoint": "https://..." }`

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

```json
{ "response": "...", "soul_name": "Till", "model": "claude-sonnet-4-6" }
```

---

### POST /api/webhook

Generic webhook endpoint. Returns all permitted resources in a single response.

```http
POST /api/webhook
Authorization: Bearer {service_token}
```

Returns a JSON object with soul, audio, video, images, and context data
according to the permissions configured in `api_context.json`.

---

### Public Vault

See [architecture/vault.md](../architecture/vault.md) for full details.

#### GET /api/vault/public/{soul_id}

Fetch the manifest of another soul's public vault. No authentication required.

#### GET /api/vault/public/{soul_id}/{file}

Download a file from a soul's public vault. Requires Soul Cert or API Grant token.

---

### GET /api/soul/verify-peer-cert

Verify whether a soul_cert is valid for a given soul_id on this server. Used by remote servers for cross-domain peer auth.

```http
GET /api/soul/verify-peer-cert?soul_id={uuid}&cert={32-hex}
```

```json
{ "ok": true }
```

Returns `{ "ok": false, "error": "invalid_cert" }` on failure. Same response for unknown soul_id (no enumeration).

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
`invalid_soul_identity`, `api_not_enabled`, `storage_error`, `method_not_allowed`,
`peer_not_trusted`, `invalid_peer_cert`, `no_social_content`
