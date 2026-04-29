-- /etc/openresty/lua/soul_paid_read.lua
-- GET /api/soul/paid-read
-- Bearer = pol_access_token. Liefert sys.md für zahlende externe Agenten.
-- Prüft: Token gültig + Amortisierung aktiv für diese Soul.

local cjson     = require("cjson.safe")
local resty_aes = require("resty.aes")
local lfs_ok, lfs = pcall(require, "lfs")

ngx.header["Content-Type"]  = "text/plain; charset=utf-8"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Method not allowed"}')
  return
end

-- Token extrahieren
local auth = ngx.req.get_headers()["Authorization"] or ""
local token = auth:match("^[Bb]earer%s+(.+)$")

if not token or not token:match("^[0-9a-fA-F]+$") or #token < 32 then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.header["WWW-Authenticate"] = 'Bearer realm="soul-paid"'
  ngx.say('{"error":"Bearer pol_access_token erforderlich"}')
  return
end

-- pol_access shared dict prüfen
local access_cache = ngx.shared.pol_access
local raw = access_cache:get("tok:" .. token:lower())

if not raw then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"token_expired_or_invalid","message":"pol_access_token ungültig oder abgelaufen. Neue Zahlung erforderlich."}')
  return
end

local ok_t, tdata = pcall(cjson.decode, raw)
if not ok_t or type(tdata) ~= "table" or not tdata.soul_id then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"token_data_corrupt"}')
  return
end

local soul_id = tdata.soul_id

-- soul_id auf UUID-Format prüfen (Path Traversal verhindern)
local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
if not soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_soul_id"}')
  return
end

-- api_context.json lesen → Amortisierung aktiv?
local SOULS_DIR = "/var/lib/sys/souls/"
local ctx_file  = SOULS_DIR .. soul_id .. "/api_context.json"
local cf = io.open(ctx_file, "r")
if not cf then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Soul nicht gefunden"}')
  return
end
local raw_ctx = cf:read("*a"); cf:close()
local ok_c, ctx = pcall(cjson.decode, raw_ctx)
if not ok_c or type(ctx) ~= "table" then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"api_context corrupt"}')
  return
end

local amort = ctx.amortization
if type(amort) == "table" and amort.private == true then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"soul_private","message":"Diese Soul ist nicht öffentlich zugänglich."}')
  return
end
if type(amort) ~= "table" or amort.enabled ~= true then
  ngx.status = 402
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"payment_not_required","message":"Diese Soul ist im Frei-Modus — normaler MCP-OAuth-Zugang genügt."}')
  return
end

-- sys.md lesen
local soul_file = SOULS_DIR .. soul_id .. "/sys.md"
local sf = io.open(soul_file, "r")
if not sf then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"sys.md nicht gefunden"}')
  return
end
local content = sf:read("*a"); sf:close()

-- Verschlüsselte sys.md on-the-fly entschlüsseln (Magic: "SYS\x01")
if content:sub(1, 4) == "SYS\x01" then
  local vault_key_hex = ctx.vault_key_hex or ""
  if vault_key_hex == "" then
    ngx.status = 403
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"vault_key_missing","message":"Vault-Schlüssel nicht verfügbar — Soul muss einmal entsperrt werden."}')
    return
  end

  local function hex_to_bin(hex)
    return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
  end

  local iv         = content:sub(5, 20)
  local ciphertext = content:sub(21)
  local key        = hex_to_bin(vault_key_hex)
  local aes_ctx    = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })

  if not aes_ctx then
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"decrypt_init_failed"}')
    return
  end

  local decrypted = aes_ctx:decrypt(ciphertext)
  if not decrypted then
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"decrypt_failed","message":"Entschlüsselung fehlgeschlagen."}')
    return
  end

  content = decrypted
end

-- ── Nur Agent-Bereich ausliefern ──────────────────────────────────────────
-- Sicherheitsregel: niemals die volle sys.md an zahlende Agenten senden.
-- Nur der explizit markierte Block <!-- AGENT:START --> … <!-- AGENT:END -->
-- verlässt den Server in Richtung Agent.
local AGENT_START = "<!-- AGENT:START -->"
local AGENT_END   = "<!-- AGENT:END -->"
local s = content:find(AGENT_START, 1, true)
local e = content:find(AGENT_END,   1, true)

if not s or not e or e <= s then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"no_agent_content","message":"Kein Agent-Bereich definiert. Füge <!-- AGENT:START --> ... <!-- AGENT:END --> in deine sys.md ein."}')
  return
end

local agent_content = content:sub(s + #AGENT_START, e - 1):match("^%s*(.-)%s*$")
if not agent_content or #agent_content == 0 then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"agent_content_empty","message":"Agent-Bereich ist leer."}')
  return
end

ngx.header["Content-Type"] = "text/plain; charset=utf-8"
ngx.say(agent_content)
