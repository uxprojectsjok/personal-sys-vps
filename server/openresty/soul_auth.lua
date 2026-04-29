-- /etc/openresty/lua/soul_auth.lua
-- access_by_lua_file für /api/chat und /api/validate
-- Prüft "Authorization: Bearer {soul_id}.{cert}"
-- cert = HMAC-SHA256(SOUL_MASTER_KEY, soul_id [+ ":" + cert_version]).hex().slice(0, 32)
-- Gibt ngx.exit(401) wenn ungültig, andernfalls fall-through.

local master_key = os.getenv("SOUL_MASTER_KEY")
if not master_key or master_key == "" then
  return
end

local auth  = ngx.req.get_headers()["authorization"] or ""
local token = auth:match("^[Bb]earer%s+(.+)$")
if not token then return ngx.exit(401) end

local dot = token:find(".", 1, true)
if not dot then return ngx.exit(401) end

local soul_id = token:sub(1, dot - 1)
local cert    = token:sub(dot + 1)
if soul_id == "" or cert == "" then return ngx.exit(401) end

local hmac         = require("hmac_helper")
local cert_version = hmac.read_cert_version(soul_id)
local expected     = hmac.cert_for_soul(master_key, soul_id, cert_version)

if cert ~= expected then
  ngx.log(ngx.WARN, "[sys/auth] Ungültiges Cert soul_id=", soul_id)
  return ngx.exit(401)
end

ngx.ctx.soul_id = soul_id
ngx.req.clear_header("Authorization")
