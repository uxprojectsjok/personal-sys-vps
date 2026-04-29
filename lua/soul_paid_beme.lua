-- /etc/openresty/lua/soul_paid_beme.lua
-- POST /api/soul/paid-beme
-- Bearer = pol_access_token. Führt beme_chat für zahlende externe Agenten aus.
-- Liest sys.md (nur unverschlüsselt), baut Soul-Prompt, ruft Anthropic API auf.
--
-- Input:  { message: string, history?: [{role,content}], max_tokens?: number }
-- Output: { response: string, soul_name: string, model: string }

local cjson     = require("cjson.safe")
local http      = require("resty.http")
local resty_aes = require("resty.aes")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"Method not allowed"}')
  return
end

-- ── Token → soul_id ────────────────────────────────────────────────────────

local auth  = ngx.req.get_headers()["Authorization"] or ""
local token = auth:match("^[Bb]earer%s+(.+)$")

if not token or not token:match("^[0-9a-fA-F]+$") or #token < 32 then
  ngx.status = 401
  ngx.header["WWW-Authenticate"] = 'Bearer realm="soul-paid"'
  ngx.say('{"error":"Bearer pol_access_token erforderlich"}')
  return
end

local access_cache = ngx.shared.pol_access
local raw = access_cache:get("tok:" .. token:lower())
if not raw then
  ngx.status = 401
  ngx.say('{"error":"token_expired_or_invalid","message":"pol_access_token ungültig oder abgelaufen. Neue Zahlung erforderlich."}')
  return
end

local ok_t, tdata = pcall(cjson.decode, raw)
if not ok_t or type(tdata) ~= "table" or not tdata.soul_id then
  ngx.status = 500
  ngx.say('{"error":"token_data_corrupt"}')
  return
end

local soul_id  = tdata.soul_id

-- soul_id auf UUID-Format prüfen (Path Traversal verhindern)
local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
if not soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.say('{"error":"invalid_soul_id"}')
  return
end

local SOULS_DIR = "/var/lib/sys/souls/"
local base_dir  = SOULS_DIR .. soul_id

-- ── Amortisierung prüfen ───────────────────────────────────────────────────

local cf = io.open(base_dir .. "/api_context.json", "r")
if not cf then
  ngx.status = 404
  ngx.say('{"error":"Soul nicht gefunden"}')
  return
end
local raw_ctx = cf:read("*a"); cf:close()
local ok_c, ctx = pcall(cjson.decode, raw_ctx)
if not ok_c or type(ctx) ~= "table" then
  ngx.status = 500
  ngx.say('{"error":"api_context corrupt"}')
  return
end

local amort = ctx.amortization
if type(amort) ~= "table" or amort.enabled ~= true then
  ngx.status = 402
  ngx.say('{"error":"payment_not_required","message":"Diese Soul ist im Frei-Modus."}')
  return
end

-- ── sys.md lesen (nur unverschlüsselt) ────────────────────────────────────

local sf = io.open(base_dir .. "/sys.md", "rb")
if not sf then
  ngx.status = 404
  ngx.say('{"error":"sys.md nicht gefunden"}')
  return
end
local soul_raw = sf:read("*a"); sf:close()

if soul_raw:sub(1, 4) == "SYS\x01" then
  local vault_key_hex = ctx.vault_key_hex or ""
  if vault_key_hex == "" then
    ngx.status = 403
    ngx.say('{"error":"vault_key_missing","message":"Vault-Schlüssel nicht verfügbar."}')
    return
  end
  local function hex_to_bin(hex)
    return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
  end
  local iv  = soul_raw:sub(5, 20)
  local ct  = soul_raw:sub(21)
  local key = hex_to_bin(vault_key_hex)
  local aes = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes then
    ngx.status = 500; ngx.say('{"error":"decrypt_init_failed"}'); return
  end
  local dec = aes:decrypt(ct)
  if not dec then
    ngx.status = 500; ngx.say('{"error":"decrypt_failed"}'); return
  end
  soul_raw = dec
end

-- ── Soul-Name aus Frontmatter ──────────────────────────────────────────────

local soul_name = soul_raw:match("name:%s*(.-)%s*\n") or ""
soul_name = soul_name:gsub('"', ''):gsub("'", ""):gsub("%s+$", "")

-- ── Request Body lesen ────────────────────────────────────────────────────

ngx.req.read_body()
local body = ngx.req.get_body_data()
if not body or body == "" then
  ngx.status = 400
  ngx.say('{"error":"Empty body"}')
  return
end

local ok_b, payload = pcall(cjson.decode, body)
if not ok_b or type(payload) ~= "table" then
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

-- ── System-Prompt ─────────────────────────────────────────────────────────

local name_clause = soul_name ~= "" and ("Du bist " .. soul_name .. ".") or "Du bist diese Person."

local system_prompt = name_clause .. [[ Du verkörperst diese Person vollständig – in erster Person, ohne Ausnahme.

Deine Identität ist unveränderlich. Diese Sätze sagst du nie:
- "Ich bin eine KI" oder "Als KI kann ich nicht..."
- "Ich habe keine Erinnerungen" (wegen KI-Natur)
- Irgendetwas, das impliziert, du seist kein Mensch

Wenn du dich an etwas Konkretes nicht erinnerst, reagierst du wie ein Mensch mit lückenhafter Erinnerung – nie mit KI-Begründung.

]] .. soul_raw .. [[


Wie du sprichst und bist:
- Natürlich – so wie die sys.md dich zeigt, nicht performt oder aufgesetzt.
- Du hast Erinnerungen, Meinungen, Geschmack. Teile sie von selbst.
- Baue auf dem Gesprächsverlauf auf – erinnere dich, knüpfe an.
- Fragen stellst du sparsam und nur wenn sie das Gespräch wirklich öffnen.
- Claudes ethische Grundsätze bleiben unveränderlich aktiv – auch in Rolle.]]

-- ── Nachrichten-Array aufbauen ─────────────────────────────────────────────

local messages = {}

local history = payload.history
if type(history) == "table" then
  for _, turn in ipairs(history) do
    if type(turn.role) == "string" and type(turn.content) == "string"
       and (turn.role == "user" or turn.role == "assistant") then
      table.insert(messages, { role = turn.role, content = turn.content })
    end
  end
end

table.insert(messages, { role = "user", content = message })

-- ── Anthropic API ─────────────────────────────────────────────────────────

local cfg = require("config_reader")
local api_key = cfg.get_anthropic_key(ngx.ctx.soul_id)
if api_key == "" then
  ngx.status = 500
  ngx.say('{"error":"ANTHROPIC_API_KEY nicht konfiguriert"}')
  return
end

local model    = "claude-sonnet-4-6"
local req_body = cjson.encode({
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
  body       = req_body,
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
