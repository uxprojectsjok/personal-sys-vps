-- /etc/openresty/lua/verify_challenge.lua
-- POST /api/verify/challenge  (soul_cert auth)
-- Erstellt eine biometrische Verifikations-Challenge (MCP → App).
-- Response: { challenge_id, method, expires_at, verify_url, status }

local cjson  = require("cjson.safe")
local random = require("resty.random")
local str    = require("resty.string")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local soul_id    = ngx.ctx.soul_id
local VERIFY_DIR = "/var/lib/sys/verify/"
local TTL        = 300   -- 5 Minuten

ngx.req.read_body()
local body_raw = ngx.req.get_body_data() or ""
local method   = "fingerprint"
if body_raw ~= "" then
  local ok, b = pcall(cjson.decode, body_raw)
  if ok and type(b) == "table" and type(b.method) == "string" then
    local m = b.method:lower()
    if m == "face" or m == "voice" or m == "fingerprint" then method = m end
  end
end

local id_bytes   = random.bytes(16, true)
local challenge_id = str.to_hex(id_bytes)
local now        = math.floor(ngx.now())
local expires_at = os.date("!%Y-%m-%dT%TZ", now + TTL)
local created_at = os.date("!%Y-%m-%dT%TZ", now)

os.execute("mkdir -p " .. VERIFY_DIR)
local data = cjson.encode({
  soul_id      = soul_id,
  challenge_id = challenge_id,
  method       = method,
  status       = "pending",
  created_at   = created_at,
  expires_at   = expires_at,
  verified_at  = cjson.null,
})
local f = io.open(VERIFY_DIR .. soul_id .. "_" .. challenge_id .. ".json", "w")
if not f then
  ngx.status = 500; ngx.say('{"error":"storage_failed"}'); return
end
f:write(data); f:close()

local host     = ngx.var.host or "localhost"
local base_url = "https://" .. host

ngx.say(cjson.encode({
  challenge_id = challenge_id,
  method       = method,
  status       = "pending",
  expires_at   = expires_at,
  verify_url   = base_url .. "/verbindung",
}))
