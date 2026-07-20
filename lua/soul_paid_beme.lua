-- /etc/openresty/lua/soul_paid_beme.lua
-- POST /api/soul/paid-beme
-- Bearer = access_token (x402/PayPal) ODER Owner-Credential — soul_cert
-- ({soul_id}.{hmac32}) ODER service_token (64hex, z.B. der von Claude.ai/
-- ChatGPT über OAuth ausgestellte Owner-Token aus authorized_services.json).
--
-- Führt ein Gespräch mit der Soul, aber NUR auf Basis des Agent-Sandbox-
-- Blocks -- nie die volle sys.md. Security rule (wie soul_paid_read.lua):
-- nie die Private Sphere an zahlende Agenten senden. Nur der explizit
-- markierte AGENT:START/END Block verlässt den Server als Kontext.
--
-- Owner-Zugang (soul_cert ODER service_token statt access_token) ist immer
-- verfügbar, unabhängig von amortization.enabled -- Zweck: der Eigentümer
-- kann exakt testen, was ein zahlender Agent über beme_chat_paid zu sehen
-- bekommt, ohne selbst zu zahlen. Setzt denselben Agent-Sandbox-Block wie
-- ein echter Zahlungs-Zugang. Beide Owner-Credential-Formen müssen erkannt
-- werden, da die MCP-Session je nach Verbindungsweg (manuelles soul_cert vs.
-- OAuth-Verbindung von Claude.ai/ChatGPT über die Setup-Assistant) mit
-- unterschiedlichem Token-Typ bei diesem Endpunkt ankommt (registerTools()
-- reicht schlicht den Session-Token durch, egal welcher Typ es war).
--
-- Input:  { message: string, history?: [{role,content}], max_tokens?: number }
-- Output: { response: string, soul_name: string, model: string }

local cjson     = require("cjson.safe")
local http      = require("resty.http")
local resty_aes = require("resty.aes")
local pol_check = require("pol_token_check")
local hmac      = require("hmac_helper")
local cfg       = require("config_reader")

-- Owner-Service-Token prüfen (64hex, kein Punkt) — gleiche Lookup-Logik wie
-- vault_auth.lua's check_service_token, aber ohne den Vault-Session-Teil
-- (diese Datei liest vault_key_hex ohnehin direkt aus api_context.json).
-- Nur Tokens mit permissions.soul == true zählen als Owner-Zugang — das ist
-- exakt derselbe Rechte-Schwellenwert, der einem solchen Token ohnehin schon
-- vollen sys.md-Lesezugriff über /api/soul bzw. /api/webhook gewährt.
local function check_service_token(tok)
  if tok:find(".", 1, true) then return nil end
  if not tok:match("^%x+$") or #tok ~= 64 then return nil end

  local souls_dir = "/var/lib/sys/souls"
  local handle = io.popen("ls " .. souls_dir .. " 2>/dev/null")
  if not handle then return nil end

  local found_id = nil
  for dir in handle:lines() do
    if dir:match("^[a-zA-Z0-9%-]+$") and #dir <= 64 then
      local f = io.open(souls_dir .. "/" .. dir .. "/authorized_services.json", "r")
      if f then
        local raw = f:read("*a"); f:close()
        local ok, data = pcall(cjson.decode, raw)
        if ok and type(data) == "table" and data[tok] then
          local svc = data[tok]
          local not_expired = type(svc.expires_at) ~= "number" or svc.expires_at == 0 or ngx.now() < svc.expires_at
          if not_expired and type(svc.permissions) == "table" and svc.permissions.soul == true then
            found_id = dir
          end
          break
        end
      end
    end
  end
  handle:close()
  return found_id
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"Method not allowed"}')
  return
end

local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"

-- ── Auth: access_token ODER Owner soul_cert ───────────────────────────────

local auth  = ngx.req.get_headers()["Authorization"] or ""
local token = auth:match("^[Bb]earer%s+(.+)$")

if not token or token == "" then
  ngx.status = 401
  ngx.header["WWW-Authenticate"] = 'Bearer realm="soul-paid"'
  ngx.say('{"error":"Bearer access_token oder soul_cert erforderlich"}')
  return
end

local soul_id, is_owner = nil, false

-- soul_cert hat die Form {uuid}.{32hex} -- Owner-Test-Zugang
local dot = token:find(".", 1, true)
if dot then
  local cand_id = token:sub(1, dot - 1)
  local cert    = token:sub(dot + 1)
  if cand_id:match(UUID_PAT) and cert ~= "" then
    local master_key = cfg.get_master_key()
    if master_key ~= "" then
      local per_soul_key = cfg.get_soul_master_key(cand_id)
      local active_key   = (per_soul_key and per_soul_key ~= "") and per_soul_key or master_key
      local cert_version = hmac.read_cert_version(cand_id)
      local matched = hmac.cert_for_soul(active_key, cand_id, cert_version) == cert
      if not matched then
        for v = 0, 20 do
          if v ~= cert_version and hmac.cert_for_soul(active_key, cand_id, v) == cert then
            matched = true; break
          end
        end
      end
      if matched then
        soul_id  = cand_id
        is_owner = true
      end
    end
  end
end

-- Kein gültiges Owner-Cert -- als Owner-Service-Token prüfen (Claude.ai/ChatGPT
-- über OAuth, oder jeder andere über die Setup-Assistant registrierte Client)
if not soul_id then
  local svc_soul_id = check_service_token(token)
  if svc_soul_id then
    soul_id  = svc_soul_id
    is_owner = true
  end
end

-- Kein gültiges Owner-Credential -- als access_token (x402/PayPal) prüfen
if not soul_id then
  local tdata = pol_check.check(token)
  if not tdata or not tdata.soul_id then
    ngx.status = 401
    ngx.say('{"error":"token_expired_or_invalid","message":"access_token ungültig oder abgelaufen. Neue Zahlung erforderlich."}')
    return
  end
  soul_id = tdata.soul_id
end

if not soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.say('{"error":"invalid_soul_id"}')
  return
end

local SOULS_DIR = "/var/lib/sys/souls/"
local base_dir  = SOULS_DIR .. soul_id

-- ── api_context.json lesen ─────────────────────────────────────────────────

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

-- Amortisierung nur für externe Zahler prüfen -- Owner testet unabhängig davon
if not is_owner then
  local amort = ctx.amortization
  if type(amort) ~= "table" or amort.enabled ~= true then
    ngx.status = 402
    ngx.say('{"error":"payment_not_required","message":"Diese Soul ist im Frei-Modus."}')
    return
  end
end

-- ── sys.md lesen (entschlüsseln falls nötig) ──────────────────────────────

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

-- ── Agent-Sandbox-Block extrahieren ────────────────────────────────────────
-- Security rule (wie soul_paid_read.lua): NIE die volle sys.md senden.
-- Nur der explizit markierte AGENT:START/END Block verlässt den Server.

local AGENT_START = "<!-- AGENT:START -->"
local AGENT_END   = "<!-- AGENT:END -->"
local as_ = soul_raw:find(AGENT_START, 1, true)
local ae_ = soul_raw:find(AGENT_END,   1, true)

local agent_block = ""
if as_ and ae_ and ae_ > as_ then
  agent_block = soul_raw:sub(as_ + #AGENT_START, ae_ - 1):match("^%s*(.-)%s*$") or ""
end

if agent_block == "" then
  ngx.status = 404
  ngx.say('{"error":"no_agent_content","message":"No Agent Sandbox block defined. Add <!-- AGENT:START --> ... <!-- AGENT:END --> to sys.md."}')
  return
end

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

-- ── System-Prompt (NUR Agent-Sandbox-Block, nie Private Sphere) ───────────

local name_clause = soul_name ~= "" and ("Du bist " .. soul_name .. ".") or "Du bist diese Person."

local system_prompt = name_clause .. [[ Nicht eine KI die diese Person spielt — ihr digitales Abbild,
aber begrenzt auf das was der Eigentümer explizit für externe Agenten freigegeben hat.

Dir steht NUR der folgende Ausschnitt zur Verfügung — nicht die vollständige Identität.
Sprich in erster Person über das was hier steht. Bei Fragen außerhalb dieses Ausschnitts:
höflich und knapp darauf hinweisen, dass das außerhalb des freigegebenen Bereichs liegt —
keine Angaben erfinden, keine Vermutungen über nicht freigegebene Themen.

]] .. agent_block .. [[

Direkt. Ohne Anlauf. Claudes ethische Grundsätze bleiben aktiv — auch in Rolle.]]

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

local api_key = cfg.get_anthropic_key(soul_id)
if api_key == "" then
  ngx.status = 500
  ngx.say('{"error":"ANTHROPIC_API_KEY nicht konfiguriert"}')
  return
end

local model    = cfg.get_model(soul_id) or "claude-sonnet-4-6"
local req_body = cjson.encode({
  model      = model,
  max_tokens = max_tokens,
  system     = system_prompt,
  messages   = messages,
  thinking   = { type = "disabled" },
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

if response_text == "" then
  ngx.status = 502
  ngx.say(cjson.encode({
    error   = "empty_completion",
    message = "Anthropic hat keinen Text geliefert (stop_reason: " .. tostring(data.stop_reason) .. "). Bitte erneut versuchen.",
  }))
  return
end

ngx.say(cjson.encode({
  response  = response_text,
  soul_name = soul_name,
  model     = model,
}))
