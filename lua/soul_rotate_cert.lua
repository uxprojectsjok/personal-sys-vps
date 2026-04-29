-- /etc/openresty/lua/soul_rotate_cert.lua
-- POST /api/soul-rotate-cert
-- Auth: Bearer {soul_id}.{current_cert}   (via vault_auth.lua access phase)
--
-- Inkrementiert cert_version in sys.md und gibt den neuen Cert zurück.
-- Alter Cert wird damit sofort ungültig.

local master_key = os.getenv("SOUL_MASTER_KEY")
if not master_key or master_key == "" then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"SOUL_MASTER_KEY nicht gesetzt"}')
  return
end

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Nicht authentifiziert"}')
  return
end

-- cert_version lesen und inkrementieren
local hmac         = require("hmac_helper")
local old_version  = hmac.read_cert_version(soul_id)
local new_version  = old_version + 1
local new_cert     = hmac.cert_for_soul(master_key, soul_id, new_version)

-- sys.md wird NICHT direkt modifiziert: sie kann AES-verschlüsselt sein.
-- Der Frontend-Client pusht die aktualisierte sys.md nach der Rotation via PUT /api/context.

-- cert_version in api_context.json persistieren (immer plaintext, für Auth lesbar)
local cjson    = require("cjson.safe")
local ctx_path = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
local ctx      = {}
local cf = io.open(ctx_path, "r")
if cf then
  local raw = cf:read("*a"); cf:close()
  local ok, parsed = pcall(cjson.decode, raw)
  if ok and type(parsed) == "table" then ctx = parsed end
end
ctx.cert_version = new_version
-- Verzeichnis anlegen falls noch nicht vorhanden
os.execute("mkdir -p /var/lib/sys/souls/" .. soul_id)
local wc = io.open(ctx_path, "w")
if wc then wc:write(cjson.encode(ctx)); wc:close() end

ngx.log(ngx.INFO, "[soul_rotate_cert] soul_id=", soul_id,
  " version ", old_version, " → ", new_version)

ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode({
  cert         = new_cert,
  cert_version = new_version,
}))
