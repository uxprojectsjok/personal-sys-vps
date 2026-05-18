-- /etc/openresty/lua/vault_shared_delete.lua
-- DELETE /api/vault/shared/{filename}
-- Only the owning soul can delete their own shared files.
-- Auth via access_by_lua_file soul_auth.lua → ngx.ctx.soul_id

ngx.header["Cache-Control"] = "no-store"
ngx.header["Content-Type"]  = "application/json"

if ngx.req.get_method() ~= "DELETE" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401; ngx.say('{"error":"unauthorized"}'); return
end

local filename = ngx.var.uri:match("^/api/vault/shared/([^/]+)$")
if not filename then
  ngx.status = 400; ngx.say('{"error":"invalid_path"}'); return
end

filename = filename:match("^([%w%-%._]+)$")
if not filename then
  ngx.status = 400; ngx.say('{"error":"invalid_filename"}'); return
end

local path = "/var/lib/sys/souls/" .. soul_id .. "/vault_shared/" .. filename
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
