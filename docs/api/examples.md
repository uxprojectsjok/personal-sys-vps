# API Examples

---

## 1. Full login flow (curl)

```bash
SOUL_ID="7f3a2b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c"
BASE="https://YOUR_DOMAIN"

# 1. Get cert
CERT=$(curl -s -X POST "$BASE/api/soul-cert" \
  -H "Content-Type: application/json" \
  -d "{\"soul_id\":\"$SOUL_ID\"}" | jq -r '.cert')

# 2. Validate
curl -s "$BASE/api/validate" \
  -H "Authorization: Bearer $SOUL_ID.$CERT"
# → 200 OK

# 3. Read context
curl -s "$BASE/api/context" \
  -H "Authorization: Bearer $SOUL_ID.$CERT" | jq .
```

---

## 2. Upload sys.md (plaintext, open mode)

```bash
SOUL_CONTENT=$(cat sys.md)

curl -s -X PUT "$BASE/api/context" \
  -H "Authorization: Bearer $SOUL_ID.$CERT" \
  -H "Content-Type: application/json" \
  -d "{
    \"enabled\": true,
    \"cipher_mode\": \"open\",
    \"soul_content\": $(echo "$SOUL_CONTENT" | jq -Rs .)
  }"
```

---

## 3. Unlock vault + read encrypted sys.md

```bash
VAULT_KEY="$(openssl rand -hex 32)"

# Unlock for 12 hours
curl -s -X POST "$BASE/api/vault/unlock" \
  -H "Authorization: Bearer $SOUL_ID.$CERT" \
  -H "Content-Type: application/json" \
  -d "{\"duration\":\"12h\",\"vault_key\":\"$VAULT_KEY\"}"

# Read soul (decrypts on-the-fly)
curl -s "$BASE/api/soul" \
  -H "Authorization: Bearer $SOUL_ID.$CERT"
```

---

## 4. Upload audio file

```bash
# Encode file
B64=$(base64 -w 0 voice-memo.webm)

curl -s -X POST "$BASE/api/vault/sync" \
  -H "Authorization: Bearer $SOUL_ID.$CERT" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"audio\",
    \"name\": \"voice-memo.webm\",
    \"data\": \"$B64\",
    \"encrypted\": false
  }" | jq .
# → { "ok": true, "name": "voice-memo.mp3", "processed": true }
```

---

## 5. Service-token access (external service)

```bash
SERVICE_TOKEN="abcdef1234..." # 64 hex chars from api_context.json

# Read soul via service-token
curl -s "$BASE/api/soul" \
  -H "Authorization: Bearer $SERVICE_TOKEN"

# Get active audio file directly
curl -s "$BASE/api/vault/audio" \
  -H "Authorization: Bearer $SERVICE_TOKEN" | jq '.active_url'
```

---

## 6. Webhook (single call, all resources)

```bash
curl -s -X POST "$BASE/api/webhook" \
  -H "X-Webhook-Token: $SERVICE_TOKEN" | jq '{
    soul: .soul[0:100],
    audio_active: .audio_active
  }'
```

---

## 7. BIP39 mnemonic authentication

```bash
curl -s -X POST "$BASE/api/webhook/mnemonic" \
  -H "Content-Type: application/json" \
  -d '{
    "soul_id": "'"$SOUL_ID"'",
    "words": ["word1","word2","word3","word4","word5","word6",
              "word7","word8","word9","word10","word11","word12"]
  }' | jq '{soul_id: .soul_id, has_soul: (.soul != null)}'
```

---

## 8. MCP via Claude Desktop (claude_desktop_config.json)

```json
{
  "mcpServers": {
    "saveyoursoul": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/client-stdio"],
      "env": {
        "MCP_SERVER_URL": "https://YOUR_DOMAIN/mcp"
      }
    }
  }
}
```

After connecting, Claude will prompt for OAuth authorization.
The consent page asks which soul to connect and which permissions to grant.

---

## 9. Read soul via MCP tool (AI pseudo-code)

```
// After OAuth, AI client has a service-token

soul_read()
→ "---\nsoul_id: ...\n---\n\n## Core Identity\n..."

soul_write({
  section: "Session Log (compressed)",
  content: "### 2026-04-10\nDiscussed protocol architecture...",
  mode: "append"
})
→ { ok: true }

vault_manifest()
→ { enabled: true, synced_files: { audio: ["voice.mp3"] }, ... }
```

---

## 10. Fetch encrypted bundle from Arweave

```bash
# Using Arweave TX ID directly
curl -s -X POST "$BASE/api/fetch-bundle" \
  -H "Content-Type: application/json" \
  -d '{"url": "Cv3x4H9eF2mK1pLqR7sT3uV6wX8yZ0aB2cD4eF6g7h"}' \
  | jq '{schema: .schema, file_count: (.files | length)}'
# Decryption of the bundle happens client-side with passphrase or BIP39
```
