-- /etc/openresty/lua/soul_herz.lua
-- GET/POST /api/soul/herz/toggle|status|tick
-- Auth: soul_auth.lua (soul_cert)
-- Proxy zu /internal/herz/* im MCP-Server

local cjson   = require("cjson.safe")
local http    = require("resty.http")
local soul_id = ngx.ctx.soul_id

if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unauthorized"}')
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local uri    = ngx.var.uri  -- z.B. /api/soul/herz/toggle
local action = uri:match("/api/soul/herz/(.+)$") or "status"
local method = ngx.req.get_method()

local body = "{}"
if method == "POST" then
  ngx.req.read_body()
  body = ngx.req.get_body_data() or "{}"
end

-- soul_id in body injizieren
local ok_b, incoming = pcall(cjson.decode, body)
if ok_b and type(incoming) == "table" then
  incoming.soul_id = soul_id
  body = cjson.encode(incoming)
else
  body = cjson.encode({ soul_id = soul_id })
end

local httpc = http.new()
httpc:set_timeout(15000)

local target_url
if action == "status" then
  target_url = "http://127.0.0.1:3098/internal/herz/status?soul_id=" .. soul_id
  method = "GET"
  body = nil
else
  target_url = "http://127.0.0.1:3098/internal/herz/" .. action
end

local res, err = httpc:request_uri(target_url, {
  method  = method,
  body    = body,
  headers = { ["Content-Type"] = "application/json" },
})

if not res or err then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "herz nicht erreichbar", detail = tostring(err) }))
  return
end

ngx.status = res.status
ngx.say(res.body)
