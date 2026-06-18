-- /etc/openresty/lua/vapid_key.lua
-- GET /api/push/vapid-key  (kein Auth nötig — public key ist öffentlich)

local cjson = require("cjson.safe")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "public, max-age=86400"

local f = io.open("/var/lib/sys/vapid.json", "r")
if not f then
  ngx.status = 503; ngx.say('{"error":"vapid nicht konfiguriert"}'); return
end
local raw = f:read("*a"); f:close()
local keys = cjson.decode(raw)
if not keys or not keys.publicKey then
  ngx.status = 503; ngx.say('{"error":"vapid key fehlt"}'); return
end
ngx.say(cjson.encode({ publicKey = keys.publicKey }))
