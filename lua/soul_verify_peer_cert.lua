-- /etc/openresty/lua/soul_verify_peer_cert.lua
-- GET /api/soul/verify-peer-cert?soul_id=&cert=
-- Öffentlicher Endpunkt — verifiziert ob ein soul_cert für eine soul_id auf DIESEM Server gültig ist.
-- Wird von fremden SYS-Nodes genutzt um Peer-Identität kryptografisch zu prüfen (Cross-Domain).

local cfg = require("config_reader")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.say('{"ok":false,"error":"Method not allowed"}')
  return
end

local args    = ngx.req.get_uri_args()
local soul_id = args.soul_id or ""
local cert    = args.cert    or ""

local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
if not soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.say('{"ok":false,"error":"invalid_soul_id"}')
  return
end

if not cert:match("^[0-9a-fA-F]+$") or #cert < 16 or #cert > 64 then
  ngx.status = 400
  ngx.say('{"ok":false,"error":"invalid_cert_format"}')
  return
end

local master_key = cfg.get_master_key()
if not master_key or master_key == "" then
  ngx.status = 503
  ngx.say('{"ok":false,"error":"no_master_key"}')
  return
end

local hmac = require("hmac_helper")

local function try_versions(key)
  for v = 0, 20 do
    if hmac.cert_for_soul(key, soul_id, v) == cert then
      return true
    end
  end
  return false
end

local matched = try_versions(master_key)

if not matched then
  local prev_key = type(cfg.get_master_key_prev) == "function" and cfg.get_master_key_prev() or ""
  if prev_key and prev_key ~= "" then
    matched = try_versions(prev_key)
  end
end

if matched then
  ngx.say('{"ok":true}')
else
  ngx.status = 401
  ngx.say('{"ok":false,"error":"invalid_cert"}')
end
