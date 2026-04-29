-- /etc/openresty/lua/vault_delete.lua
-- DELETE /api/vault  → Löscht den kompletten Soul-Ordner vom VPS
--
-- Auth: soul-cert only (via soul_auth.lua access phase)
-- Unwiderruflich: alle Dateien unter /var/lib/sys/souls/{soul_id}/ werden gelöscht

local cjson    = require("cjson.safe")
local soul_id  = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "DELETE" then
  ngx.status = 405
  ngx.say(cjson.encode({ error = "Method not allowed. Use DELETE." }))
  return
end

local soul_dir = "/var/lib/sys/souls/" .. soul_id

-- Whitelist: soul_id nur alphanumerisch + Bindestrich, max. 64 Zeichen
-- Blacklist-Ansatz (früherer Code) erlaubte ;|&$ → Shell-Injection möglich
if not soul_id or not soul_id:match("^[a-zA-Z0-9%-]+$") or #soul_id > 64 then
  ngx.status = 403
  ngx.say(cjson.encode({ error = "Invalid soul identity" }))
  return
end

-- Ordner existiert nicht → bereits gelöscht, idempotent OK
local f = io.open(soul_dir, "r")
if not f then
  ngx.say(cjson.encode({ ok = true, deleted = soul_id }))
  return
end
io.close(f)

-- Vault-Session invalidieren
local sessions = ngx.shared.vault_sessions
if sessions then
  sessions:delete(soul_id)
end

-- Löschen
local ret = os.execute("rm -rf " .. soul_dir)
if ret ~= 0 and ret ~= true then
  ngx.status = 500
  ngx.say(cjson.encode({ error = "Delete failed" }))
  return
end

ngx.log(ngx.WARN, "[vault_delete] Soul-Daten gelöscht: soul_id=", soul_id)
ngx.say(cjson.encode({ ok = true, deleted = soul_id }))
