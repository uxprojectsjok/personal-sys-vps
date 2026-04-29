-- /etc/openresty/lua/soul_pol_validate.lua
-- GET /internal/validate-pol-token?token=xxx
-- Nur localhost. Prüft pol_access shared dict. Gibt {ok, soul_id, expires_at} zurück.

local cjson = require("cjson.safe")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

-- Nur localhost
local addr = ngx.var.remote_addr
if addr ~= "127.0.0.1" and addr ~= "::1" then
  ngx.status = 403
  ngx.say('{"ok":false,"error":"forbidden"}')
  return
end

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.say('{"ok":false,"error":"method_not_allowed"}')
  return
end

local args = ngx.req.get_uri_args()
local token = args.token or ""

if not token:match("^[0-9a-fA-F]+$") or #token < 32 then
  ngx.status = 400
  ngx.say('{"ok":false,"error":"invalid_token_format"}')
  return
end

local access_cache = ngx.shared.pol_access
local raw = access_cache:get("tok:" .. token:lower())

if not raw then
  ngx.status = 401
  ngx.say('{"ok":false,"error":"token_not_found_or_expired"}')
  return
end

local ok, data = pcall(cjson.decode, raw)
if not ok or type(data) ~= "table" then
  ngx.status = 500
  ngx.say('{"ok":false,"error":"token_data_corrupt"}')
  return
end

ngx.say(cjson.encode({
  ok         = true,
  soul_id    = data.soul_id,
  expires_at = data.expires_at,
  from       = data.from,
  pol_amount = data.pol_amount,
  tx_hash    = data.tx_hash,
}))
