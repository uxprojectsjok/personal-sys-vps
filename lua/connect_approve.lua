-- /etc/openresty/lua/connect_approve.lua
-- POST /api/connect/approve  (soul_cert auth via soul_auth.lua)
-- Body: { token, approved: true|false }
-- Setzt Token-Status auf "approved" oder "rejected".

local cjson       = require("cjson.safe")
local soul_id     = ngx.ctx.soul_id
local CONNECT_DIR = "/var/lib/sys/connect/"

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"Method not allowed"}'); return
end

ngx.req.read_body()
local body = ngx.req.get_body_data() or "{}"
local ok, payload = pcall(cjson.decode, body)
if not ok or type(payload) ~= "table" then
  ngx.status = 400; ngx.say('{"error":"Ungültiges JSON"}'); return
end

local token    = payload.token
local approved = payload.approved

if type(token) ~= "string" or #token ~= 48 or not token:match("^[a-f0-9]+$") then
  ngx.status = 400; ngx.say('{"error":"Token ungültig"}'); return
end

local path = CONNECT_DIR .. token .. ".json"
local f = io.open(path, "r")
if not f then
  ngx.status = 404; ngx.say('{"error":"Token nicht gefunden"}'); return
end
local raw = f:read("*a"); f:close()
local dok, d = pcall(cjson.decode, raw)
if not dok or type(d) ~= "table" then
  ngx.status = 500; ngx.say('{"error":"Token-Daten korrupt"}'); return
end

if d.soul_id ~= soul_id then
  ngx.status = 403; ngx.say('{"error":"Nicht berechtigt"}'); return
end
if d.status ~= "probed" then
  ngx.status = 409; ngx.say('{"error":"Token nicht in Probe-Status"}'); return
end

d.status      = approved and "approved" or "rejected"
d.approved_at = os.date("%Y-%m-%dT%H:%M:%S")

local wf = io.open(path, "w")
if not wf then
  ngx.status = 500; ngx.say('{"error":"Konnte Token nicht aktualisieren"}'); return
end
wf:write(cjson.encode(d)); wf:close()

ngx.say(cjson.encode({ ok = true, status = d.status }))
