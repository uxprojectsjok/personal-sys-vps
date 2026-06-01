-- /etc/openresty/lua/connect_create.lua
-- POST /api/connect/create  (soul_cert auth via soul_auth.lua access phase)
-- Erzeugt ein QR-Connect-Token (48 hex, TTL 120s).
-- Response: { token, qr_url, expires_seconds }

local cjson   = require("cjson.safe")
local random  = require("resty.random")
local str     = require("resty.string")
local cfg     = require("config_reader")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"Method not allowed"}'); return
end

local soul_id    = ngx.ctx.soul_id
local CONNECT_DIR = "/var/lib/sys/connect/"
local TTL         = 120

-- Token erzeugen
local token_bytes = random.bytes(24, true)
local token       = str.to_hex(token_bytes)

local now         = ngx.now()
local created_at  = os.date("%Y-%m-%dT%H:%M:%S", math.floor(now))
local expires_at  = os.date("%Y-%m-%dT%H:%M:%S", math.floor(now) + TTL)

local data = cjson.encode({
  soul_id    = soul_id,
  status     = "waiting",
  created_at = created_at,
  expires_at = expires_at,
})

-- Auf Disk speichern
os.execute("mkdir -p " .. CONNECT_DIR)
local f = io.open(CONNECT_DIR .. token .. ".json", "w")
if not f then
  ngx.status = 500; ngx.say('{"error":"Konnte Token nicht speichern"}'); return
end
f:write(data); f:close()

-- Im shared dict cachen (für schnellen Ablauf-Check)
local cache = ngx.shared.connect_sessions
if cache then cache:set("c:" .. token, soul_id, TTL + 10) end

local scheme   = ngx.var.scheme or "https"
local own_host = ngx.var.host or ""
local base_url = scheme .. "://" .. own_host

ngx.say(cjson.encode({
  token          = token,
  qr_url         = base_url .. "/connect?s=" .. token,
  expires_seconds = TTL,
}))
