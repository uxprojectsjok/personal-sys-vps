-- /etc/openresty/lua/soul_earnings.lua
-- GET /api/soul/earnings  → earnings.json lesen
-- Auth: vault_auth.lua (soul_cert)

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unauthorized"}')
  return
end

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Method not allowed"}')
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local earnings_file = "/var/lib/sys/souls/" .. soul_id .. "/earnings.json"
local ef = io.open(earnings_file, "r")

if not ef then
  -- Noch keine Einnahmen
  ngx.say(cjson.encode({
    ok             = true,
    total_pol      = "0.000000",
    total_requests = 0,
    entries        = cjson.empty_array,
  }))
  return
end

local raw = ef:read("*a"); ef:close()
local ok, data = pcall(cjson.decode, raw)

if not ok or type(data) ~= "table" then
  ngx.status = 500
  ngx.say('{"error":"earnings.json corrupt"}')
  return
end

-- Sicherstellen dass alle Felder vorhanden sind
data.ok             = true
data.total_pol      = data.total_pol or "0.000000"
data.total_requests = data.total_requests or 0
if type(data.entries) ~= "table" then data.entries = cjson.empty_array end

ngx.say(cjson.encode(data))
