-- /etc/openresty/lua/emergency_guard.lua
-- Rewrite-Phase: prüft ob ein Emergency-Lock aktiv ist.
-- Wird per rewrite_by_lua_file in betroffenen Locations eingebunden.
-- Blockiert KI-Endpunkte abhängig vom Lock-Level (1–3).

local cjson = require("cjson.safe")

-- Mindest-Lock-Level das diesen Endpunkt blockiert
local BLOCK_AT = {
  ["/api/chat"]              = 1,
  ["/api/soul-update"]       = 1,
  ["/api/beme"]              = 1,
}

local uri       = ngx.var.request_uri:match("^[^?]*") or ""
local min_level = BLOCK_AT[uri]
if not min_level then return end  -- dieser Endpunkt hat kein Lock-Ziel

-- soul_id aus Authorization-Header extrahieren (Bearer {soul_id}.{cert})
local auth     = ngx.var.http_authorization or ""
local soul_id  = auth:match("^Bearer%s+([0-9a-f%-]+)%.")
if not soul_id then return end

local lock_file = "/var/lib/sys/souls/" .. soul_id .. "/emergency.lock"
local f = io.open(lock_file, "r")
if not f then return end

local raw = f:read("*a"); f:close()
local ok, lock = pcall(cjson.decode, raw)
if not ok or type(lock) ~= "table" then return end

local level = tonumber(lock.level) or 0
if level < min_level then return end

ngx.status = 503
ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode({
  error        = "emergency_lock",
  level        = level,
  activated_at = lock.activated_at or "",
  message      = "Node im Notfall-Modus · Level " .. level .. " · Entsperren: POST /api/emergency/restore"
}))
return ngx.exit(503)
