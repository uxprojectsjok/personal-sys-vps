# OpenResty Architecture

---

## 1. Why OpenResty

The reference implementation uses OpenResty (nginx + LuaJIT) as the sole
API layer in production. No Node.js process runs in production.

| Concern | Solution |
|---|---|
| No runtime process | `nuxt generate` produces a static SPA; OpenResty serves it |
| Key isolation | `ANTHROPIC_API_KEY` and `SOUL_MASTER_KEY` never reach the browser |
| Performance | nginx-native request handling, Lua runs in-process |
| Simplicity | No process manager, no Node.js, one binary |

---

## 2. Request Flow

```
Browser (SPA)
    │
    │  HTTPS / TLS
    ▼
OpenResty (nginx + LuaJIT)
    │
    ├── /                    → static files (.output/public/)
    ├── /api/soul-cert       → soul_cert.lua          (no auth)
    ├── /api/soul-sign-sess  → soul_sign_session.lua  (no auth)
    ├── /api/fetch-bundle    → fetch_bundle.lua        (no auth)
    ├── /api/validate        → soul_auth.lua → 200
    ├── /api/context         → soul_auth.lua → api_context.lua
    ├── /api/vault/unlock    → soul_auth.lua → vault_unlock.lua
    ├── /api/vault/sync      → soul_auth.lua → vault_sync.lua
    ├── /api/chat            → soul_auth.lua → Anthropic proxy (SSE)
    ├── /api/soul-update     → soul_auth.lua → Anthropic proxy (JSON)
    ├── /api/soul/v1/token   → soul_auth.lua → soul_token_jwt.lua
    ├── /api/soul            → vault_auth.lua → api_serve.lua
    ├── /api/vault/*         → vault_auth.lua → api_serve.lua
    ├── /api/webhook         → vault_auth.lua → webhook.lua
    ├── /api/webhook/mnemonic → webhook_mnemonic.lua  (BIP39 auth)
    ├── /api/vault/external  → vault_auth.lua → external_vault.lua
    ├── /api/vision          → soul_auth.lua → vision_analyze.lua
    ├── /api/tts             → soul_auth.lua → tts.lua
    ├── /api/wavespeed/*     → soul_auth.lua → wavespeed_*.lua
    ├── /api/beme            → vault_auth.lua → beme.lua
    ├── /mcp                 → proxy → soul-mcp (Node.js :3098)
    └── /oauth/              → proxy → soul-mcp (Node.js :3098)
```

---

## 3. Auth Guards

Two Lua access-phase guards protect different endpoint classes:

### soul_auth.lua

Validates `Authorization: Bearer {soul_id}.{cert}`.

On success:
- Sets `ngx.ctx.soul_id`
- Clears `Authorization` header (prevents forwarding to Anthropic)

On failure: returns `ngx.exit(401)`

### vault_auth.lua

Extended guard for vault and webhook endpoints. Accepts three auth methods:

1. **soul_cert** (`Bearer {soul_id}.{cert}`) — full owner access
2. **service_token** (`Bearer {64hexchars}` or `X-Webhook-Token: {token}`) — scoped access
3. **query param** (`?token={token}`) — for direct file downloads

On success sets: `ngx.ctx.soul_id`, `ngx.ctx.vault_key`,
`ngx.ctx.via_webhook`, `ngx.ctx.service_permissions`

---

## 4. Lua Script Inventory

| File | Phase | Purpose |
|---|---|---|
| `soul_auth.lua` | access | soul_cert validation |
| `vault_auth.lua` | access | soul_cert + service_token validation |
| `soul_cert.lua` | content | cert derivation endpoint |
| `soul_sign_session.lua` | content | growth chain signing |
| `soul_token_jwt.lua` | content | JWT issuance |
| `api_context.lua` | content | GET/PUT /api/context |
| `vault_unlock.lua` | content | vault session management |
| `vault_sync.lua` | content | file upload + ClamAV + ffmpeg |
| `api_serve.lua` | content | sys.md + vault file serving |
| `webhook.lua` | content | generic webhook |
| `webhook_mnemonic.lua` | content | BIP39-authenticated webhook |
| `external_vault.lua` | content | fetch soul from external URL |
| `fetch_bundle.lua` | content | fetch encrypted bundle (no auth) |
| `tts.lua` | content | ElevenLabs TTS proxy |
| `vision_analyze.lua` | content | Claude vision endpoint |
| `wavespeed_submit.lua` | content | WaveSpeed AI image generation |
| `wavespeed_result.lua` | content | WaveSpeed result polling |
| `soul_connections.lua` | content | soul network connections |
| `vault_connections_peer.lua` | content | peer vault access |
| `vault_profile.lua` | content | profile read/write |
| `vault_profile_analyze.lua` | content | AI profile analysis |
| `vault_public.lua` | content | public vault serving |
| `vault_services.lua` | content | service management |
| `vault_delete.lua` | content | file deletion |
| `beme.lua` | content | beme_chat backend — reads sys.md, calls Anthropic server-side |

**Note:** `soul_auth.lua`, `vault_auth.lua`, `soul_cert.lua`,
`soul_sign_session.lua`, `soul_token_jwt.lua`, and `hmac_helper.lua`
are published as interface stubs only. See `CONTRIBUTING.md`.

---

## 5. Dev vs Production

```
┌─────────────────────────────────┐    ┌────────────────────────────────┐
│  nuxt dev (local)               │    │  nuxt generate → VPS           │
├─────────────────────────────────┤    ├────────────────────────────────┤
│  Vite dev server                │    │  Static files only             │
│  server/api/*.js  ←── mirrors   │    │  OpenResty Lua scripts         │
│  └── soul-cert.post.js          │    │  └── soul_cert.lua             │
│  └── chat.post.js               │    │  └── (Anthropic proxy)         │
│  └── soul-update.post.js        │    │  └── (soul-update proxy)       │
│  └── soul-sign-session.post.js  │    │  └── soul_sign_session.lua     │
│  └── soul/v1/token.post.js      │    │  └── soul_token_jwt.lua        │
└─────────────────────────────────┘    └────────────────────────────────┘
```

Both environments MUST exhibit identical behavior.
Changes to a JS handler MUST be mirrored in the corresponding Lua script.

---

## 6. Environment Variables

Declared in `nginx.conf` `main` block (required for Lua access):

```nginx
env ANTHROPIC_API_KEY;
env SOUL_MASTER_KEY;
env API_SIGNING_KEY;
env ELEVENLABS_API_KEY;
env WAVESPEED_KEY;
```

Injected via systemd override:

```ini
[Service]
Environment="ANTHROPIC_API_KEY=..."
Environment="SOUL_MASTER_KEY=..."
Environment="API_SIGNING_KEY=..."
```

After editing the override: `sudo systemctl restart openresty`
(`reload` is insufficient — workers inherit environment only on restart)

---

## 7. Security Headers

Applied via `more_set_headers` (headers-more-nginx-module, built into OpenResty).
Using `more_set_headers` instead of `add_header` ensures headers are inherited
by all location blocks, including those with their own `add_header` directives.

```nginx
more_set_headers "Strict-Transport-Security: max-age=63072000; includeSubDomains; preload";
more_set_headers "X-Content-Type-Options: nosniff";
more_set_headers "Referrer-Policy: no-referrer";
more_set_headers "Cross-Origin-Opener-Policy: same-origin";
```

CSP nonce is generated per request using `resty.random` (CSPRNG):

```lua
set_by_lua_block $nonce {
  local random = require("resty.random")
  local str    = require("resty.string")
  return str.to_hex(random.bytes(12))
}
```

---

## 8. Additional Server Dependencies

| Package | Purpose | Install |
|---|---|---|
| `lua-resty-openssl` | PBKDF2 + HMAC for `webhook_mnemonic.lua` | `opm get fffonion/lua-resty-openssl` |
| `resty.http` | HTTP client for external fetches | Built into OpenResty |
| `resty.aes` | AES-256-CBC | Built into OpenResty |
| `ffmpeg` | Audio/video conversion | `apt install ffmpeg` |
| `clamav-daemon` | Malware scanning | `apt install clamav-daemon` |

### resty.http DNS resolution

Any location block that uses `resty.http` to make outbound HTTP requests (e.g. `beme.lua`
calling `api.anthropic.com`) **must** include a `resolver` directive. OpenResty's Lua HTTP
client does not use the system resolver — it requires an explicit DNS server in the nginx config:

```nginx
location = /api/beme {
  resolver 1.1.1.1 8.8.8.8 valid=60s ipv6=off;
  resolver_timeout 5s;
  ...
}
```

Without this, `resty.http` returns a DNS resolution failure even though `curl` works from the shell.
