-- /etc/openresty/lua/soul_admin_token.lua
-- GET /api/soul/admin-token
-- Auth: soul_auth.lua (soul-cert only)
--
-- Gibt den eigenen admin_token zurück (Multi-Hoster: jede Soul bekommt einen
-- bei der Erstellung, siehe soul_cert.lua). Bisher wurde er nur EINMALIG im
-- Frontend angezeigt und ausschließlich in localStorage gecacht — verloren
-- (Cache geleert, anderes Gerät/Browser) gab es keinen Weg zurück, obwohl der
-- Server ihn die ganze Zeit in soul_admin.json hat. Kein neues Sicherheits-
-- risiko: ngx.ctx.soul_id kommt aus dem bereits kryptografisch geprüften
-- Cert (soul_auth.lua), der Pfad wird nicht aus User-Input gebaut — exakt
-- dasselbe Owner-kann-eigene-Secrets-erneut-abrufen-Muster wie
-- GET /api/vault/services.

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local path = "/var/lib/sys/souls/" .. soul_id .. "/soul_admin.json"
local f = io.open(path, "r")
if not f then
  ngx.status = 404
  ngx.say('{"error":"no_admin_token"}')
  return
end
local raw = f:read("*a"); f:close()
local ok, data = pcall(cjson.decode, raw)
if not ok or type(data) ~= "table" or type(data.admin_token) ~= "string" or data.admin_token == "" then
  ngx.status = 404
  ngx.say('{"error":"no_admin_token"}')
  return
end

ngx.say(cjson.encode({ admin_token = data.admin_token }))
