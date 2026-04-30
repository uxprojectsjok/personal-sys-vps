-- /etc/openresty/lua/soul_paid_profile.lua
-- GET /api/soul/paid-profile/{type}
-- Bearer = pol_access_token. Liest Analyse-Profil für zahlende externe Agenten.
-- Nur unverschlüsselte Profile werden ausgeliefert.
--
-- Typen: face | voice | motion | expertise

local cjson     = require("cjson.safe")
local resty_aes = require("resty.aes")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
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

local soul_id = tdata.soul_id

-- soul_id auf UUID-Format prüfen (Path Traversal verhindern)
local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
if not soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.say('{"error":"invalid_soul_id"}')
  return
end

-- ── Profiltyp aus URI ──────────────────────────────────────────────────────

local ptype = ngx.var.uri:match("/api/soul/paid%-profile/([a-z]+)$")
local allowed = { face = true, voice = true, motion = true, expertise = true }

if not ptype or not allowed[ptype] then
  ngx.status = 400
  ngx.say('{"error":"Ungültiger Profiltyp. Erlaubt: face, voice, motion, expertise"}')
  return
end

-- ── Amortisierung prüfen ───────────────────────────────────────────────────

local SOULS_DIR = "/var/lib/sys/souls/"
local cf = io.open(SOULS_DIR .. soul_id .. "/api_context.json", "r")
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

-- ── Profil lesen ──────────────────────────────────────────────────────────

local profile_path = SOULS_DIR .. soul_id .. "/vault/profile/" .. ptype .. ".json"
local pf = io.open(profile_path, "rb")
if not pf then
  ngx.status = 404
  ngx.say(cjson.encode({
    exists  = false,
    type    = ptype,
    message = "Kein " .. ptype .. "-Profil vorhanden.",
  }))
  return
end
local content = pf:read("*a"); pf:close()

-- Verschlüsselte Profile on-the-fly entschlüsseln (Magic: "SYS\x01")
if content:sub(1, 4) == "SYS\x01" then
  local vault_key_hex = ctx.vault_key_hex or ""
  if vault_key_hex == "" then
    ngx.status = 403
    ngx.say('{"error":"vault_key_missing","message":"Vault-Schlüssel nicht verfügbar."}')
    return
  end
  local function hex_to_bin(hex)
    return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
  end
  local iv  = content:sub(5, 20)
  local ct  = content:sub(21)
  local key = hex_to_bin(vault_key_hex)
  local aes = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes then
    ngx.status = 500; ngx.say('{"error":"decrypt_init_failed"}'); return
  end
  local dec = aes:decrypt(ct)
  if not dec then
    ngx.status = 500; ngx.say('{"error":"decrypt_failed"}'); return
  end
  ngx.say(dec)
  return
end

ngx.say(content)
