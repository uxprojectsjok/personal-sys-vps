-- /etc/openresty/lua/soul_paid_read.lua
-- GET /api/soul/paid-read
-- Bearer = pol_access_token. Liefert sys.md für zahlende externe Agenten.
-- Prüft: Token gültig + Amortisierung aktiv für diese Soul.

local cjson  = require("cjson.safe")
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

-- Verschlüsselte sys.md ablehnen (SYSCRYPT01 Magic)
if content:sub(1, 9) == "SYSCRYPT0" then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"encrypted","message":"sys.md ist verschlüsselt — bezahlter Zugang nur für unverschlüsselte Souls."}')
  return
end

ngx.say(content)
