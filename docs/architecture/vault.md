# Vault Architecture

---

## 1. Overview

The vault is the user's personal file store. It exists in two locations:

| Location | Contents | Persistence |
|---|---|---|
| **Local filesystem** | Audio, images, video, context files | File System Access API, persisted across sessions via IndexedDB handle |
| **VPS** | Uploaded subset of vault files | Until user deletes them |

The vault is opt-in. A soul can exist and function without any vault files.

---

## 2. VPS Vault Structure

```
/var/lib/sys/souls/{soul_id}/
├── sys.md                    ← identity file (encrypted or plain)
├── api_context.json           ← permissions, vault index, vault_key_hex
├── soul_connections.json      ← peer network connections
└── vault/
    ├── audio/                 ← audio files (MP3 after conversion)
    ├── images/                ← image files
    ├── video/                 ← MP4 after conversion
    ├── context/               ← text/markdown files
    └── profile/               ← structured JSON profiles (expertise.json, etc.)
```

---

## 3. api_context.json

This file is the control plane for vault access. It is updated by
`PUT /api/context` and read by every vault operation.

```json
{
  "enabled": true,
  "cipher_mode": "ciphered",
  "webhook_token": "<64 hex — service token>",
  "vault_key_hex": "<64 hex — AES-256 key>",
  "external_soul_url": "https://...",
  "permissions": {
    "soul":          true,
    "calendar":      false,
    "audio":         true,
    "video":         false,
    "images":        false,
    "context_files": true
  },
  "synced_files": {
    "audio":    ["voice.mp3"],
    "video":    [],
    "images":   [],
    "context":  ["hash.txt"],
    "profiles": ["expertise"]
  },
  "active_files": {
    "audio":   "voice.mp3",
    "context": "hash.txt"
  },
  "updated_at": 1712845200.123
}
```

### Integrity Protection

- If `api_context.json` cannot be parsed on a PUT request, the server
  MUST return 500 and MUST NOT overwrite the file.
- On GET, `synced_files` entries are validated against the actual filesystem —
  entries for non-existent files are silently removed from the response.
  This self-heals corrupted state without data loss.

---

## 4. File Upload Pipeline

```
client: base64-encode file
  → POST /api/vault/sync { type, name, data, encrypted }
    → server: validate soul_id (alphanumeric, max 64 chars)
    → server: decode base64
    → server: check file size limit
    → server: check vault quota (200 files, 500 MB total)
    → server: validate file extension (whitelist per type)
    → server: validate magic bytes (signature check)
    → server: ClamAV scan via clamd INSTREAM protocol
    → server: write to vault/{type}/{filename}
    → server: convert audio → MP3 (ffmpeg)
    → server: convert video → MP4 H.264 + AAC (ffmpeg)
    → server: update synced_files in api_context.json
```

### File Size Limits

| Type | Max size |
|---|---|
| audio | 50 MB |
| video | 100 MB |
| image | 10 MB |
| context | 512 KB |

### Vault Quota

| Limit | Value |
|---|---|
| Total files | 200 |
| Total storage | 500 MB per soul |

---

## 5. Vault Session

The vault session holds the `vault_key` in OpenResty shared memory.
It is set by `POST /api/vault/unlock` and cleared by `POST /api/vault/lock`
or TTL expiry.

```
lua_shared_dict vault_sessions 10m;
```

Session entry format:
```json
{ "expires_at": 1712845200, "vault_key": "64hexstring" }
```

`expires_at = 0` means the session never expires (`"unlimited"` duration).

The session is required for:
- Serving decrypted sys.md (`GET /api/soul`)
- Serving decrypted vault files (`GET /api/vault/{type}/{file}`)
- Service-token access when `vault_key_hex` is not persisted

---

## 6. Active Files

Each vault type has an "active" file — the one currently selected for
use by AI systems. When a new file is uploaded and no active file is set,
the first uploaded file becomes active automatically.

The active file is what `audio_active`, `video_active`, etc. return in
webhook and MCP responses.

---

## 7. Public Vault & Soul Network

### Public Vault

Each soul can expose selected files to connected souls or external services via the
**public vault**. Files are stored under `vault_public/files/` on the VPS and listed
in `vault_public/config.json`.

**How sharing works:**

- Files added to `public_files` are automatically accessible — there is no
  separate enable/disable switch. An empty list means nothing is shared.
- **Soul Grants** allow specific connected souls to read files within a defined scope
  (`soul`, `audio`, `images`, `video`, `context_files`).
- **API Grants** issue a bearer token so external services can read files within
  a defined scope without a soul cert.

**Manifest (public, no auth):**

```
GET /api/vault/public/{soul_id}
```

Returns the list of physically present files with their cipher mode and type.

**File access:**

```
GET /api/vault/public/{soul_id}/{filename}
Authorization: Bearer {requesting_soul_cert}   ← Soul Grant auth
Authorization: Bearer {api_grant_token}        ← API Grant auth
```

**Owner management** (soul_cert required):

| Method | Endpoint | Action |
|---|---|---|
| GET | `/api/vault/public/config` | Read config |
| PUT | `/api/vault/public/config` | Save config (files, grants) |
| POST | `/api/vault/public/sync` | Upload file to public vault |
| DELETE | `/api/vault/public/{file}` | Remove file from public vault |

### Soul Network (Peer Context)

Connected souls (mutual connection via `soul_connections.json`) can read
each other's public vault content in the chat context via:

```
GET /api/vault/connections/network
Authorization: Bearer {soul_id}.{cert}
```

This returns the connected souls' manifests and shared context files.
Media files (images, audio, video, PDF) are loaded on-demand when the AI
references them in conversation.

---

## 8. Security

| Threat | Mitigation |
|---|---|
| Path traversal | soul_id and filenames validated with strict regex `^[a-zA-Z0-9%-]+$` |
| Shell injection | soul_id validated before any `os.execute` call |
| Malware upload | ClamAV scan before storage |
| Content type confusion | Magic-byte validation on upload |
| Cross-soul contamination | synced_files filtered against actual filesystem on every GET |
| Storage exhaustion | Quota enforced (200 files, 500 MB) |
