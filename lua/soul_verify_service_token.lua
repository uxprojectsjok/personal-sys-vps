-- /etc/openresty/lua/soul_verify_service_token.lua
-- GET /api/soul/verify-service-token?soul_id=&token=
-- Öffentlicher Endpunkt — prüft ob ein Service-Token für eine soul_id auf DIESEM
-- Server existiert (nicht abgelaufen), ohne den Token selbst zurückzugeben.
-- Wird von fremden SYS-Nodes genutzt, um beim Cross-Node-Wiring (Gatekeeper-
-- Föderation) einen von einer Soul präsentierten, selbst erzeugten Service-Token
-- zu bestätigen, ohne dass der Fremd-Node lokalen Dateisystemzugriff braucht —
-- Pendant zu soul_verify_peer_cert.lua, nur für Service-Tokens statt Soul-Certs.

local cjson = require("cjson.safe")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.say('{"ok":false,"error":"Method not allowed"}')
  return
end

local args    = ngx.req.get_uri_args()
local soul_id = args.soul_id or ""
local token   = args.token   or ""

local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
if not soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.say('{"ok":false,"error":"invalid_soul_id"}')
  return
end

if not token:match("^[0-9a-fA-F]+$") or #token < 16 or #token > 128 then
  ngx.status = 400
  ngx.say('{"ok":false,"error":"invalid_token_format"}')
  return
end

local path = "/var/lib/sys/souls/" .. soul_id .. "/authorized_services.json"
local f = io.open(path, "r")
if not f then
  -- Gleiche Antwort wie bei unbekanntem Token — kein Enumerationsvektor
  ngx.status = 401
  ngx.say('{"ok":false,"error":"invalid_token"}')
  return
end
local raw = f:read("*a"); f:close()

local ok, svcs = pcall(cjson.decode, raw)
if not ok or type(svcs) ~= "table" or type(svcs[token]) ~= "table" then
  ngx.status = 401
  ngx.say('{"ok":false,"error":"invalid_token"}')
  return
end

local svc = svcs[token]
if type(svc.expires_at) == "number" and svc.expires_at > 0 and ngx.now() >= svc.expires_at then
  ngx.status = 401
  ngx.say('{"ok":false,"error":"invalid_token"}')
  return
end

ngx.say(cjson.encode({
  ok          = true,
  name        = svc.name,
  permissions = svc.permissions or cjson.empty_array,
}))
