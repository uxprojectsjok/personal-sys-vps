# Quickstart

> **Reference implementation is invite-only.**
> This guide assumes you have access to a running SYS instance.
> For self-hosting, see [docs/PRODUCTION_SETUP.md](PRODUCTION_SETUP.md).

---

## 1. Create your sys.md

A sys.md is a plain Markdown file. Minimum valid sys.md:

```markdown
---
soul_id: 00000000-0000-0000-0000-000000000000
soul_name: "Your Name"
created: 2026-01-01
last_session: 2026-01-01
version: 1
soul_cert: ""
vault_hash: ""
soul_growth_chain: []
soul_chain_anchor: null
storage_tx: ""
---

## Core Identity

One sentence describing who you are.
```

The `soul_id` MUST be a valid UUID v4. The `soul_cert` is populated
automatically on first login.

---

## 2. Get a soul_cert

```http
POST /api/soul-cert
Content-Type: application/json

{ "soul_id": "your-uuid-v4" }
```

```json
{ "cert": "a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5" }
```

Write the cert into your sys.md frontmatter:

```yaml
soul_cert: a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5
```

All subsequent requests use:

```
Authorization: Bearer {soul_id}.{cert}
```

---

## 3. Validate your cert

```http
GET /api/validate
Authorization: Bearer {soul_id}.{cert}
```

Returns `200 OK` if the cert is valid. Returns `401` otherwise.

---

## 4. Upload your sys.md to the VPS

```http
PUT /api/context
Authorization: Bearer {soul_id}.{cert}
Content-Type: application/json

{
  "enabled": true,
  "cipher_mode": "ciphered",
  "soul_content_encrypted": "<base64-encoded AES-256-CBC ciphertext>",
  "permissions": {
    "soul": true,
    "audio": false,
    "video": false,
    "images": false,
    "context_files": false,
    "calendar": false
  }
}
```

If uploading plaintext (open mode only):

```json
{
  "soul_content": "raw markdown string",
  "cipher_mode": "open"
}
```

---

## 5. Read your sys.md via API

```http
GET /api/soul
Authorization: Bearer {soul_id}.{cert}
```

Returns the sys.md as `text/markdown`. If the file is encrypted and
no vault session is active, returns `403 { "error": "encrypted" }`.

---

## 6. Unlock your vault (for encrypted souls)

```http
POST /api/vault/unlock
Authorization: Bearer {soul_id}.{cert}
Content-Type: application/json

{
  "duration": "12h",
  "vault_key": "64-hex-char AES-256 key"
}
```

Allowed durations: `1h`, `12h`, `1d`, `30d`, `182d`, `365d`, `unlimited`

---

## 7. Connect via MCP (for AI clients)

MCP endpoint: `https://YOUR_DOMAIN/mcp`

Authorization uses OAuth 2.0 + PKCE. The consent page is served at
`/oauth/authorize`. After authorization, the AI client receives a
service-token scoped to the permissions granted.

See [spec/mcp-tools.md](spec/mcp-tools.md) for the full tool catalog.

---

## Next steps

| Goal | Read |
|---|---|
| Understand the sys.md format | [spec/sys_md.md](spec/sys_md.md) |
| Set up external service access | [api/endpoints.md](api/endpoints.md) |
| Self-host a SYS instance | [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md) |
| Connect an AI agent via MCP | [spec/mcp-tools.md](spec/mcp-tools.md) |
| Understand encryption | [architecture/encryption.md](architecture/encryption.md) |
