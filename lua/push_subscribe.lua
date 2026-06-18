-- /etc/openresty/lua/push_subscribe.lua
-- POST /api/push/subscribe  (soul_auth)
-- Speichert eine WebPush-Subscription für den aktuellen Soul.

local cjson = require("cjson.safe")
local http  = require("resty.http")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() == "OPTIONS" then ngx.status = 204; return end
if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local soul_id = ngx.ctx.soul_id
ngx.req.read_body()
local body_str = ngx.req.get_body_data() or "{}"
local sub = cjson.decode(body_str)
if not sub or not sub.endpoint then
  ngx.status = 400; ngx.say('{"error":"subscription.endpoint erforderlich"}'); return
end

local hc = http.new()
hc:set_timeout(3000)
local ok, err = hc:request_uri("http://127.0.0.1:3098/internal/push-subscribe", {
  method  = "POST",
  headers = { ["Content-Type"] = "application/json" },
  body    = cjson.encode({ soul_id = soul_id, subscription = sub }),
})
if not ok then
  ngx.status = 502; ngx.say(cjson.encode({ error = "push-subscribe fehlgeschlagen: " .. (err or "?") })); return
end
ngx.say(ok.body)
