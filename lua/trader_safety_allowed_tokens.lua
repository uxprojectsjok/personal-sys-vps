-- POST /api/trader/safety/allowed-tokens  { symbol: string, allowed: bool }
--
-- Siehe soul-mcp/lib/trader_config.mjs. PRIVATE-REPO-ONLY.

local cjson = require("cjson.safe")
local http  = require("resty.http")

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.say('{"error":"unauthorized"}')
  return
end

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"method not allowed"}')
  return
end

ngx.header["Content-Type"] = "application/json"

ngx.req.read_body()
local raw = ngx.req.get_body_data()
local ok, body = pcall(cjson.decode, raw or "")
if not ok or type(body) ~= "table" then
  ngx.status = 400
  ngx.say('{"error":"invalid_json"}')
  return
end
body.soul_id = soul_id

local httpc = http.new()
httpc:set_timeout(10000)
local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/trader/safety/allowed-tokens", {
  method  = "POST",
  body    = cjson.encode(body),
  headers = { ["Content-Type"] = "application/json" },
})

if not res then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "internal_unreachable", detail = tostring(err) }))
  return
end

ngx.status = res.status
ngx.say(res.body)
