-- /etc/openresty/lua/soul_auth.lua
-- access_by_lua_file für /api/chat, /api/validate, /api/set-config, /api/get-config
-- Prüft "Authorization: Bearer {soul_id}.{cert}"
-- cert = HMAC-SHA256(SOUL_MASTER_KEY, soul_id [+ ":" + cert_version]).hex().slice(0, 32)
-- Unterstützt Grace-Period (dual-key) nach Master-Key-Rotation.

local cfg        = require("config_reader")
local master_key = cfg.get_master_key()

-- Kein Master-Key → Dev-Modus, pass-through
if master_key == "" then return end

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

-- 1. Aktuellen Key prüfen
local matched = hmac.cert_for_soul(master_key, soul_id, cert_version) == cert

-- 2. Vorherigen Key prüfen (Grace-Period nach Rotation)
if not matched then
  local prev_key = cfg.get_master_key_prev()
  if prev_key and prev_key ~= "" then
    if hmac.cert_for_soul(prev_key, soul_id, cert_version) == cert then
      ngx.log(ngx.INFO, "[sys/auth] Grace-Period Cert akzeptiert soul_id=", soul_id)
      matched = true
    end
  end
end

if not matched then
  ngx.log(ngx.WARN, "[sys/auth] Ungültiges Cert soul_id=", soul_id)
  return ngx.exit(401)
end

-- 3. Single-Soul-Lock: nur der registrierte Node-Inhaber darf sich authentifizieren
local node_soul_id = cfg.get_node_soul_id()
if node_soul_id and node_soul_id ~= soul_id then
  ngx.log(ngx.WARN, "[sys/auth] Falsche soul_id – Node gesperrt soul_id=", soul_id)
  return ngx.exit(403)
end

ngx.ctx.soul_id = soul_id
ngx.req.clear_header("Authorization")
