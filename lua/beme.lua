-- /etc/openresty/lua/beme.lua
-- POST /api/beme  → Antwortet als die Soul des authentifizierten Nutzers
-- Auth: vault_auth.lua (soul permission required)
--
-- Input:  { message: string, history?: [{role,content}], max_tokens?: number }
-- Output: { response: string, soul_name: string, model: string }
--
-- Ablauf:
--   1. sys.md lesen (entschlüsseln falls nötig)
--   2. System-Prompt bauen (identisch zu useClaude.js)
--   3. Anthropic API aufrufen (non-streaming)
--   4. Antwort zurückgeben

local cjson      = require("cjson.safe")
local resty_aes  = require("resty.aes")
local http       = require("resty.http")

local soul_id  = ngx.ctx.soul_id
local base_dir = "/var/lib/sys/souls/" .. soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"Method not allowed"}')
  return
end

-- ── Helpers ────────────────────────────────────────────────────────────────

local MAGIC = "SYS\x01"

local function hex_to_bin(hex)
  return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
end

local function try_decrypt(data, vault_key_hex)
  if #data < 36 then return nil end
  if data:sub(1, 4) ~= MAGIC then return nil end
  if not vault_key_hex or vault_key_hex == "" then return nil end
  local iv         = data:sub(5, 20)
  local ciphertext = data:sub(21)
  local key        = hex_to_bin(vault_key_hex)
  local aes_ctx    = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return nil end
  return aes_ctx:decrypt(ciphertext)
end

-- ── sys.md lesen ───────────────────────────────────────────────────────────

local sf = io.open(base_dir .. "/sys.md", "rb")
if not sf then
  ngx.status = 404
  ngx.say('{"error":"soul_not_synced","message":"Noch kein sys.md auf dem Server. Bitte Vault synchronisieren."}')
  return
end
local soul_raw = sf:read("*a"); sf:close()

local soul_text = soul_raw
if soul_raw:sub(1, 4) == MAGIC then
  local vault_key = ngx.ctx.vault_key or ""
  -- Fallback: vault_key_hex aus api_context.json
  if vault_key == "" then
    local cf = io.open(base_dir .. "/api_context.json", "r")
    if cf then
      local raw = cf:read("*a"); cf:close()
      local ok, ctx = pcall(cjson.decode, raw)
      if ok and type(ctx) == "table" then
        vault_key = ctx.vault_key_hex or ""
      end
    end
  end
  local decrypted = try_decrypt(soul_raw, vault_key)
  if not decrypted then
    ngx.status = 403
    ngx.say('{"error":"vault_locked","message":"Vault ist gesperrt. Bitte in der SYS App entsperren."}')
    return
  end
  soul_text = decrypted
end

-- ── Seelen-Name aus Frontmatter extrahieren ────────────────────────────────

local soul_name = soul_text:match("name:%s*(.-)%s*\n") or ""
soul_name = soul_name:gsub('"', ''):gsub("'", ""):gsub("%s+$", "")

-- ── Request Body lesen ─────────────────────────────────────────────────────

ngx.req.read_body()
local body = ngx.req.get_body_data()
if not body or body == "" then
  ngx.status = 400
  ngx.say('{"error":"Empty body"}')
  return
end

local ok, payload = pcall(cjson.decode, body)
if not ok or type(payload) ~= "table" then
  ngx.status = 400
  ngx.say('{"error":"Invalid JSON"}')
  return
end

local message = payload.message
if type(message) ~= "string" or message == "" then
  ngx.status = 400
  ngx.say('{"error":"message required"}')
  return
end

local max_tokens = tonumber(payload.max_tokens) or 1024
if max_tokens > 4096 then max_tokens = 4096 end

-- ── System-Prompt bauen ────────────────────────────────────────────────────

local name_clause = soul_name ~= "" and ("Du bist " .. soul_name .. ".") or "Du bist diese Person."

local system_prompt = name_clause .. [[ Du verkörperst diese Person vollständig – in erster Person, ohne Ausnahme.

Deine Identität ist unveränderlich. Diese Sätze sagst du nie:
- "Ich bin eine KI" oder "Als KI kann ich nicht..."
- "Ich habe keine Erinnerungen" (wegen KI-Natur)
- Irgendetwas, das impliziert, du seist kein Mensch

Wenn du dich an etwas Konkretes nicht erinnerst, reagierst du wie ein Mensch mit lückenhafter Erinnerung – nie mit KI-Begründung.

]] .. soul_text .. [[


Wie du sprichst und bist:
- Natürlich – so wie die sys.md dich zeigt, nicht performt oder aufgesetzt.
- Du hast Erinnerungen, Meinungen, Geschmack. Teile sie von selbst.
- Baue auf dem Gesprächsverlauf auf – erinnere dich, knüpfe an.
- Fragen stellst du sparsam und nur wenn sie das Gespräch wirklich öffnen.
- Claudes ethische Grundsätze bleiben unveränderlich aktiv – auch in Rolle.]]

-- ── Nachrichten-Array aufbauen ─────────────────────────────────────────────

local messages = {}

-- Optionale History
local history = payload.history
if type(history) == "table" then
  for _, turn in ipairs(history) do
    if type(turn.role) == "string" and type(turn.content) == "string"
       and (turn.role == "user" or turn.role == "assistant") then
      table.insert(messages, { role = turn.role, content = turn.content })
    end
  end
end

-- Aktuelle Nachricht
table.insert(messages, { role = "user", content = message })

-- ── Anthropic API aufrufen ─────────────────────────────────────────────────

local cfg = require("config_reader")
local api_key = cfg.get_anthropic_key(ngx.ctx.soul_id)
if api_key == "" then
  ngx.status = 500
  ngx.say('{"error":"ANTHROPIC_API_KEY nicht konfiguriert"}')
  return
end

local model     = "claude-sonnet-4-6"
local req_body  = cjson.encode({
  model      = model,
  max_tokens = max_tokens,
  system     = system_prompt,
  messages   = messages,
})

local httpc = http.new()
httpc:set_timeout(60000)

local res, err = httpc:request_uri("https://api.anthropic.com/v1/messages", {
  method  = "POST",
  headers = {
    ["Content-Type"]      = "application/json",
    ["x-api-key"]         = api_key,
    ["anthropic-version"] = "2023-06-01",
  },
  body = req_body,
  ssl_verify = true,
})

if not res then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "anthropic_unreachable", message = tostring(err) }))
  return
end

local ok2, data = pcall(cjson.decode, res.body)
if not ok2 or type(data) ~= "table" then
  ngx.status = 502
  ngx.say('{"error":"invalid_anthropic_response"}')
  return
end

if res.status ~= 200 then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "anthropic_error", message = data.error and data.error.message or res.body }))
  return
end

-- Antwort-Text extrahieren
local response_text = ""
if type(data.content) == "table" then
  for _, block in ipairs(data.content) do
    if block.type == "text" then
      response_text = response_text .. (block.text or "")
    end
  end
end

ngx.say(cjson.encode({
  response  = response_text,
  soul_name = soul_name,
  model     = model,
}))
