-- /etc/openresty/lua/vault_consent_delete.lua
-- DELETE /api/vault/consent-doc/{uuid}
-- Nur der Owner kann eigene Widerrufsbestätigungs-PDFs löschen.
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

local path = "/var/lib/sys/souls/" .. soul_id .. "/consent_docs/" .. reference_id .. ".pdf"
local f = io.open(path, "r")
if not f then
  ngx.status = 404; ngx.say('{"error":"not_found"}'); return
end
f:close()

local ok = os.remove(path)
if not ok then
  ngx.status = 500; ngx.say('{"error":"delete_failed"}'); return
end

ngx.status = 200
ngx.say('{"ok":true}')
