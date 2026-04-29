-- /etc/openresty/lua/soul_cert.lua
-- Ersetzt server/api/soul-cert.post.js in Production (OpenResty).
-- POST /api/soul-cert  {"soul_id":"...", "cert_version": 0}  → {"cert":"<32 hex chars>"}
-- cert = HMAC-SHA256(SOUL_MASTER_KEY, soul_id [+ ":" + cert_version]).hex().slice(0, 32)
-- cert_version == 0 (default): altes Format – rückwärtskompatibel

local master_key = os.getenv("SOUL_MASTER_KEY")
if not master_key or master_key == "" then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"SOUL_MASTER_KEY nicht gesetzt"}')
  return
end

ngx.req.read_body()
local body = ngx.req.get_body_data()

if not body or body == "" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"soul_id erforderlich"}')
  return
end

local cjson = require("cjson.safe")
local ok, data = pcall(cjson.decode, body)
if not ok or type(data) ~= "table" or type(data.soul_id) ~= "string" or #data.soul_id < 1 then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"soul_id erforderlich"}')
  return
end

local soul_id     = data.soul_id
local cert_version = tonumber(data.cert_version) or 0

local hmac = require("hmac_helper")
local cert = hmac.cert_for_soul(master_key, soul_id, cert_version)

ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say('{"cert":"' .. cert .. '"}')
