# Quickstart

> This guide assumes a running SYS node.
> Don't have one yet? → [ONBOARDING.md](../ONBOARDING.md)

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
cert_version: 0
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

Returns `200 OK` if valid, `401` otherwise.

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

Plaintext (open mode only):

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

Returns sys.md as `text/plain`. If encrypted and no vault session is active,
returns `403 { "error": "encrypted" }`.

---

## 6. Unlock vault (for encrypted souls)

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
service token scoped to the permissions granted.

Supported MCP clients: Claude Desktop, Claude.ai (remote MCP), any MCP-compatible agent.

---

## 8. Issue a service token

```http
POST /api/soul/v1/token
Authorization: Bearer {soul_id}.{cert}
```

```json
{
  "token": "<JWT>",
  "expires_in": 2592000,
  "soul_id": "..."
}
```

Service tokens are HS256 JWTs valid for 30 days, signed with `API_SIGNING_KEY`.

---

## API Reference

| Endpoint | Method | Auth | Handler | Purpose |
|----------|--------|------|---------|---------|
| `/api/soul-cert` | POST | — | soul_cert.lua | Issue soul cert |
| `/api/validate` | GET | soul_cert | — | Validate cert |
| `/api/context` | GET/PUT | soul_cert | api_context.lua | Read/write API config |
| `/api/soul` | GET | vault_auth | api_serve.lua | Read sys.md |
| `/api/vault/sync` | POST | soul_cert | vault_sync.lua | Upload vault file |
| `/api/vault/manifest` | GET | vault_auth | api_serve.lua | List vault resources |
| `/api/vault/audio[/{f}]` | GET | vault_auth | api_serve.lua | Audio files |
| `/api/vault/images[/{f}]` | GET | vault_auth | api_serve.lua | Image files |
| `/api/vault/video[/{f}]` | GET | vault_auth | api_serve.lua | Video files |
| `/api/vault/context[/{f}]` | GET | vault_auth | api_serve.lua | Context files |
| `/api/vault/unlock` | POST | soul_cert | vault_unlock.lua | Start vault session |
| `/api/vault/lock` | POST | soul_cert | vault_lock.lua | End vault session |
| `/api/soul/v1/token` | POST | soul_cert | soul_token_jwt.lua | Issue service token |
| `/api/soul/earnings` | GET | soul_cert | soul_earnings.lua | POL payment ledger |
| `/api/soul/pay` | POST | — | soul_pay.lua | Submit POL payment (agent) |
| `/api/soul/paid-read` | GET | pol_access_token | soul_paid_read.lua | Agent reads sys.md |
| `/api/soul/register` | POST | soul_cert | soul_register.lua | Register in marketplace |
| `/api/soul/amortization` | GET/PUT | soul_cert | soul_amortization.lua | Agent pricing config |
| `/api/soul/pinata-config` | GET/PUT/DELETE | soul_cert | soul_pinata_config.lua | Pinata JWT config |
| `/api/chat` | POST | soul_cert | Anthropic proxy (SSE) | AI chat streaming |
| `/api/peer/verify` | GET | — | peer_verify.lua | Node identity check |
| `/api/peer/connect` | POST | soul_cert | peer_connect.lua | Connect peer soul |
| `/api/node-status` | GET | — | node_status.lua | Node registration status |
| `/api/webhook` | POST | vault_auth | webhook.lua | Push to external service |

---

## Next steps

| Goal | Read |
|---|---|
| Understand the sys.md format | [spec/sys_md.md](spec/sys_md.md) |
| Technical architecture | [../ARCHITECTURE.md](../ARCHITECTURE.md) |
| Self-host a SYS node | [../ONBOARDING.md](../ONBOARDING.md) |
| Connect an AI agent via MCP | [spec/mcp-tools.md](spec/mcp-tools.md) |
| Protocol overview | [overview.md](overview.md) |
