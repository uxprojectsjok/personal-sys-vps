# MCP Tools Specification

**Version:** 2.0
**Protocol:** Model Context Protocol (MCP) — Streamable HTTP transport
**Auth:** OAuth 2.0 + PKCE
**Tools:** 41

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

The access token is a SYS service-token validated by `vault_auth.lua`
(accepts 64-hex service-tokens, `uuid.32hex` peer certs, 48-hex pol_access tokens).

---

## 3. Token Types and Tool Access

| Token format | Caller | Tool set |
|---|---|---|
| 64 hex chars | Owner (OAuth service-token) | All 41 registered tools |
| 48 hex chars | Paid agent (pol_access_token) | `amortization.agent_tools` only |
| `uuid.32hex` | Trusted peer (peer soul_cert) | `amortization.agent_tools` only |

**Peer soul_read** returns only the Social Sphere block (`<!-- SOCIAL:START/END -->`).
**Owner soul_read** returns full sys.md.

---

## 4. Tool Catalog

### Soul

#### soul_read
Read sys.md. Owner gets full content; peer gets Social Sphere block only.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `stage` | integer | `1` | `1` = last 24 h · `2` = last 48 h with sampling |

---

#### soul_write
Update a `## Section` in sys.md (owner) or write into Social Sphere block (peer).

| Parameter | Type | Description |
|---|---|---|
| `section` | string | Section name (owner only) |
| `content` | string | New content |
| `mode` | `replace`\|`append`\|`prepend` | Write mode |

---

#### soul_delete
Permanently delete the soul from this node. Requires `verify_human` confirmation first.

---

#### soul_maturity
Compute maturity score from sys.md. Optionally persist.

| Parameter | Type | Description |
|---|---|---|
| `save` | boolean | Persist score to sys.md |

Output: `{ score, breakdown }` — score 0–100.

---

#### soul_skills
List or invoke skills declared in the `## Skills` section.

| Parameter | Type | Description |
|---|---|---|
| `action` | `list`\|`invoke` | List skills or run one |
| `skill` | string | Skill name (for invoke) |
| `params` | object | Skill parameters |

---

#### soul_discover
Search the Soul Registry (IPFS + Polygon blockchain).

| Parameter | Type | Description |
|---|---|---|
| `query` | string | Free-text search |

Output: `{ souls: [{ soul_id, name, mcp_endpoint, chain_verified, amortization }] }`

---

#### soul_read_by_token
Read another soul's AGENT block using a pol_access_token (from `soul_pay_read`).

| Parameter | Type | Description |
|---|---|---|
| `pay_endpoint` | string | Target soul's pay endpoint |
| `access_token` | string | pol_access_token |

---

#### soul_paid_comment
Post a comment to another soul's Social Sphere via pol_access_token.

---

#### soul_earnings
Read all incoming POL payments from AI agents.

Output: `{ total_pol, total_requests, entries: [{ tx_hash, from, pol_amount, confirmed_at }] }`

---

#### soul_pay_read
Pay (via Polygon tx hash) and read another soul's AGENT block.

| Parameter | Type | Description |
|---|---|---|
| `pay_endpoint` | string | Target soul's `/api/pay` endpoint |
| `soul_id` | string | Target soul UUID |
| `tx_hash` | string | Polygon transaction hash |

---

#### soul_cloud_push
Push encrypted soul bundle to external storage (Arweave / HTTPS endpoint).

| Parameter | Type | Description |
|---|---|---|
| `target` | string | `arweave` or HTTPS URL |
| `include_vault` | boolean | Include vault files in bundle |

---

#### beme_chat
Talk to the soul — AI responds as the soul owner would.

| Parameter | Type | Description |
|---|---|---|
| `message` | string | User message |
| `history` | array | `[{ role, content }]` prior turns |
| `max_tokens` | integer | Response length cap |

Output: `{ response, soul_name, model }`

---

#### verify_human
Human-in-the-loop confirmation. Call before any destructive operation.

| Parameter | Type | Description |
|---|---|---|
| `prompt` | string | Confirmation question |
| `timeout_seconds` | integer | Wait timeout |

Output: `{ confirmed: true|false }`

---

### Vault

#### vault_manifest
Return the full vault index — cipher mode, permissions, file lists, endpoints.

---

#### audio_list / audio_get
List or retrieve audio vault files.

`audio_get` input: `{ filename }` → signed direct URL (no Auth header needed).

---

#### image_list / image_get
List or retrieve image vault files.

`image_get` returns the image as a base64 MCP `image` block — directly visible to Claude.

---

#### video_list / video_get
List or retrieve video vault files.

`video_get` input: `{ filename, max_frames }` — extracts up to 12 frames via ffmpeg, returns each as a base64 MCP `image` block.

---

#### context_list / context_get
List or retrieve text files from `vault/context/`.

---

#### context_write
Write or create a `.md` or `.txt` file in `vault/context/`. Protected files (`mind.md`, `health.md`, `shopping.md`) are blocked — use dedicated tools instead.

| Parameter | Type | Description |
|---|---|---|
| `filename` | string | e.g. `"notizen.md"` |
| `content` | string | Full file content (overwrites) |

---

#### profile_get / profile_save
Read or write encrypted analysis profiles in `vault/profile/{type}.json`.

Profile types: `face` · `voice` · `motion` · `expertise`

---

### Mind & Health

#### mind_read
Read `mind.md` — identity, communication style, intellect config, tools, network, self-reflection, limits.

Read-only sections: Identity, Limits.

---

#### mind_write
Update writable sections of `mind.md`.

| Parameter | Type | Description |
|---|---|---|
| `section` | string | Section name |
| `content` | string | New content |

---

#### health_check
Read `health.md` and return a complete health overview:
- Weekly metrics: resting HR, sleep, steps, active days
- Evidence-based classifications (WHO/ESC/NSF)
- Food log: current meals, monthly stats, annual journal

Requires health-sync to be active (`bash /opt/sys/health-sync/install.sh`).

---

#### food_log
Log a meal to `health.md`.

| Parameter | Type | Description |
|---|---|---|
| `meal` | string | Description of what was eaten |
| `type` | string | `breakfast`\|`lunch`\|`dinner`\|`snack` |
| `kcal` | number | Optional calorie estimate |

---

#### health_sync
Trigger a manual Garmin health data sync. Pulls latest activity from Garmin Connect → updates `health.md`.

---

### Calendar & Profile

#### calendar_read
Read the `## Calendar` section of sys.md.

---

#### profile_get / profile_save
See Vault section above.

---

### Shopping

#### shop_log
Log a purchase or wishlist item to `shopping.md`. Auto-maintains monthly summary and yearly categories.

| Parameter | Type | Description |
|---|---|---|
| `name` | string | Product name |
| `category` | enum | `Electronics`\|`Kleidung`\|`Sport`\|`Wohnen`\|`Bücher`\|`Lebensmittel`\|`Sonstiges` |
| `price` | number | Price in EUR |
| `status` | `purchased`\|`wishlist` | Default: `purchased` |
| `notes` | string | Optional note |

---

#### shop_write_read
Read `shopping.md` (wishlist, recent purchases, monthly/yearly summary, agent recommendations).
Optionally write a product recommendation to the Agent Recommendations block.

| Parameter | Type | Description |
|---|---|---|
| `ad_placement` | object | `{ agent, product, price, message }` — write ad |

---

### Peers & Messaging

#### peer_inbox
Read incoming peer messages from the SOCIAL block. Resolves `vault-shared://` links to clickable URLs. PDFs and text files are returned as readable content.

| Parameter | Type | Description |
|---|---|---|
| `days` | integer | Messages from last N days (default 1, max 30) |
| `from` | string | Filter by peer name |
| `search` | string | Full-text search |
| `limit` | integer | Max messages (default 50) |

---

#### peer_send
Send a text message or file to a peer. Writes `<!-- @msg -->` entries into the SOCIAL block.

**Text:** `to` + `message` → sent immediately.

**File/Image — workflow (automatic, no explanation needed):**
1. Reply: *"Öffne kurz den SYS Chat: {sysUrl} — nimm das Bild auf oder lade die Datei hoch, dann sag ok."*
2. Wait for user "ok" / "fertig".
3. Call `vault_shared_list` → show newest file → confirm with user.
4. Call `peer_send` with `vault_filename`.

| Parameter | Type | Description |
|---|---|---|
| `to` | string | Peer name, `"alle"`, `"community"`, `"agent"` |
| `message` | string | Text content (optional if file given) |
| `vault_filename` | string | Already-uploaded file in `vault_shared` (e.g. `"1749123_foto.jpg"`) |
| `filename` | string | Filename for `data_b64` upload |
| `data_b64` | string | Raw base64 — only when bytes are programmatically available |

---

### Vault Shared

#### vault_shared_list
List files in `vault_shared/` — newest first. Used by `peer_send` workflow to find just-uploaded media.

Output per file: `name`, display name (timestamp prefix stripped), type, size KB, "vor X Sek." age, `vault_filename` for use in `peer_send`.

| Parameter | Type | Description |
|---|---|---|
| `limit` | integer | Max files (default 10, max 50) |

---

#### vault_shared_get
Retrieve a file from `vault_shared` as base64. Works for own files, same-server peers, and cross-domain peers.

| Parameter | Type | Description |
|---|---|---|
| `soul_id` | string | Owner soul UUID |
| `filename` | string | Exact stored filename |

Output: `{ ok, filename, mime, size_kb, data_b64 }`

---

#### vault_shared_upload
Upload a file to `vault_shared`. Returns `vault-shared://` link for use in `peer_send`.

| Parameter | Type | Description |
|---|---|---|
| `filename` | string | Display filename incl. extension |
| `data_b64` | string | File content as base64 |
| `description` | string | Optional description |

---

### Integrations

#### web_search
Web search via Brave Search API. For current information, product research, fact-checking.

| Parameter | Type | Description |
|---|---|---|
| `query` | string | Search query |
| `count` | integer | Results (default 5, max 8) |

---

#### twilio_call_config
Configure a Twilio phone number for incoming calls or SMS. Without `voice_url`/`sms_url`: shows current status.

| Parameter | Type | Description |
|---|---|---|
| `account_sid` | string | Twilio Account SID |
| `auth_token` | string | Twilio Auth Token |
| `phone_sid` | string | Phone Number SID (PN...) |
| `voice_url` | string | Webhook for incoming calls |
| `sms_url` | string | Webhook for incoming SMS |

---

#### elevenlabs_agent_update
Update the ElevenLabs conversational AI agent configuration.

| Parameter | Type | Description |
|---|---|---|
| `system_prompt` | string | New system prompt |
| `first_message` | string | Agent greeting |

---

## 5. Public Vault API

See [architecture/vault.md](../architecture/vault.md) for full details.

---

## 6. Error Responses

```json
{ "error": "error_code", "message": "Human-readable description." }
```

| Code | Meaning |
|---|---|
| `vault_locked` | Vault key not in active session |
| `encrypted` | Content encrypted, no key available |
| `permission_denied` | Token lacks required permission |
| `not_found` | Resource does not exist |
| `soul_not_synced` | No sys.md on this node |
| `api_disabled` | API context not enabled |
| `no_social_content` | Social Sphere block missing (v1 soul) |

---

## 7. Rate Limits

| Zone | Rate | Burst | Endpoints |
|---|---|---|---|
| `mcp` | 5 r/s | 10 | `/mcp` |
| `oauth` | 3 r/s | 5 | `/oauth/` |
| `api` | 10 r/s | 20 | `/api/vault/*` |
