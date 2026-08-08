-- /etc/openresty/lua/vault_consent_delete.lua
-- DELETE /api/vault/consent-doc/{reference_id}
-- Nur der Owner kann eigene Kaufbeleg-Ordner löschen (ein Ordner pro Kauf,
-- siehe vault_consent_list.lua/eu_withdrawal_terms.mjs).
-- Auth: access_by_lua_file soul_auth.lua → ngx.ctx.soul_id

ngx.header["Cache-Control"] = "no-store"
ngx.header["Content-Type"]  = "application/json"

if ngx.req.get_method() ~= "DELETE" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401; ngx.say('{"error":"unauthorized"}'); return
end

local reference_id = ngx.var.uri:match("^/api/vault/consent%-doc/([^/]+)$")
local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"

if not reference_id or not reference_id:match(UUID_PAT) then
  ngx.status = 400; ngx.say('{"error":"invalid_reference_id"}'); return
end

local path = "/var/lib/sys/souls/" .. soul_id .. "/consent_docs/" .. reference_id
local check = io.open(path .. "/meta.json", "r")
if not check then
  ngx.status = 404; ngx.say('{"error":"not_found"}'); return
end
check:close()

-- reference_id ist oben bereits strikt gegen UUID_PAT geprüft — sicher für die
-- Shell-Interpolation. os.remove kann keine nicht-leeren Verzeichnisse entfernen,
-- daher rm -rf statt eines Lua-eigenen rekursiven Löschens.
local ok = os.execute('rm -rf "' .. path .. '"')
if not ok then
  ngx.status = 500; ngx.say('{"error":"delete_failed"}'); return
end

ngx.status = 200
ngx.say('{"ok":true}')
