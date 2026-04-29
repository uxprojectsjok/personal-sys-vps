# Authentication Model

**Version:** 1.0-draft

---

## 1. Trust Model

```
SOUL_MASTER_KEY  (secret, server-side only)
    └── soul_cert = HMAC-SHA256(SOUL_MASTER_KEY, soul_id)[0:32]
            └── All owner API access validated against this cert
                    └── vault_key (AES-256) — encrypts content
                            └── service-token — scoped external access
```

| Identity | Key Material | Trust Level | Scope |
|---|---|---|---|
| Soul owner | soul_cert (= HMAC of master key) | Full | All operations on own soul |
| External service | service-token (64 hex) | Scoped | Permissions in api_context.json |
| Mnemonic caller | BIP39 12-word phrase | Scoped | Same as service-token |
| Server operator | SOUL_MASTER_KEY | Root | Can derive any cert |

---

## 2. soul_cert — Owner Authentication

### 2.1 Derivation

```
cert = HMAC-SHA256(SOUL_MASTER_KEY, soul_id).hex()[0:32]
```

- `SOUL_MASTER_KEY`: 32-byte hex string, set via server environment variable
- `soul_id`: UTF-8 encoded UUID v4 string
- Output: 32 lowercase hex characters (16 bytes)

### 2.2 Bearer Token Format

```
Authorization: Bearer {soul_id}.{cert}
```

Example:
```
Authorization: Bearer 7f3a2b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c.a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5
```

### 2.3 Server Validation

The server MUST:
1. Split the Bearer value on the first `.`
2. Recompute the expected cert from `SOUL_MASTER_KEY` + `soul_id`
3. Compare with constant-time equality (prevents timing attacks)
4. Set `ngx.ctx.soul_id` on success
5. Clear the `Authorization` header before proxying upstream

The server MUST return `401` on any validation failure without revealing
which part (soul_id or cert) was incorrect.

### 2.4 Properties

- **Stateless**: No database lookup. cert is always the same for a given soul_id + key pair.
- **No expiry**: cert is valid until `SOUL_MASTER_KEY` changes.
- **Instance-bound**: Certs from one SYS instance are invalid on any other instance.
- **Rotation**: Changing `SOUL_MASTER_KEY` invalidates all existing certs simultaneously.

---

## 3. Service-Token — Scoped External Access

### 3.1 Purpose

Service-tokens allow external systems (AI agents, MCP clients, webhooks)
to access a soul's data with granular, user-defined permissions.

### 3.2 Format

```
64 lowercase hex characters (32 bytes)
```

### 3.3 Token Derivation

```
service_token = HMAC-SHA256(vault_key_bytes, soul_id)[hex]
```

This links the token cryptographically to the vault key —
a token is only valid while the vault key it was derived from is active.

### 3.4 Transport

```
Authorization: Bearer {service_token}
```

or via query parameter for direct file downloads:

```
GET /api/vault/audio/file.mp3?token={service_token}
```

### 3.5 Permissions

Permissions are stored in `api_context.json`:

```json
{
  "permissions": {
    "soul":          true,   // read sys.md
    "calendar":      false,  // include ## Calendar section
    "audio":         true,   // read vault/audio/
    "video":         false,  // read vault/video/
    "images":        false,  // read vault/images/
    "context_files": true    // read vault/context/
  }
}
```

Service-tokens MUST NOT access fields they are not permitted to.
The server enforces this on every request.

---

## 4. BIP39 Mnemonic Authentication

### 4.1 Purpose

Allows accessing encrypted vault content using 12 BIP39 words
without an active vault session. Used primarily by the MCP client
for offline / stateless access.

### 4.2 Key Derivation

```
vault_key = PBKDF2-SHA256(mnemonic, soul_id, iterations=100000, length=32)
expected_token = HMAC-SHA256(vault_key, soul_id)[hex]
```

The derived token MUST match the `webhook_token` stored in `api_context.json`.

### 4.3 Request Format

```http
POST /api/webhook/mnemonic
Content-Type: application/json

{
  "soul_id": "uuid-v4",
  "words": ["word1", "word2", ..., "word12"]
}
```

or:

```json
{ "soul_id": "uuid-v4", "mnemonic": "word1 word2 ... word12" }
```

### 4.4 Security Notes

- PBKDF2 with 100 000 iterations costs ~100ms CPU per request
- Rate limiting on this endpoint is STRONGLY RECOMMENDED
- Comparison MUST be constant-time (prevents timing attacks)

---

## 5. JWT — Service Integration Token

### 5.1 Purpose

Issues a standard JWT for integrations that require Bearer JWT
(e.g. the MCP OAuth flow).

### 5.2 Endpoint

```http
POST /api/soul/v1/token
Authorization: Bearer {soul_id}.{cert}
```

```json
{
  "token": "<HS256 JWT>",
  "expires_in": 2592000,
  "soul_id": "uuid-v4"
}
```

### 5.3 JWT Structure

```
Header:  { "alg": "HS256", "typ": "JWT" }
Claims:  { "soul_id": "...", "iat": ..., "exp": ... }
Signing: HMAC-SHA256(API_SIGNING_KEY, header.payload)
TTL:     30 days
```

`API_SIGNING_KEY` MUST be distinct from `SOUL_MASTER_KEY`.

---

## 6. Security Considerations

| Concern | Mitigation |
|---|---|
| Timing attacks | Constant-time comparison on all token validation |
| soul_id enumeration | `/api/soul-cert` is unauthenticated but yields no useful info without the master key |
| SOUL_MASTER_KEY exposure | Server-side only, injected via systemd environment, never in build artifacts |
| Token replay | TLS in transit; tokens are bearer credentials — treat like passwords |
| cert rotation | Change SOUL_MASTER_KEY; all souls must re-fetch their cert |
