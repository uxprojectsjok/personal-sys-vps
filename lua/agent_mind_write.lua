-- /etc/openresty/lua/agent_mind_write.lua
-- POST /api/agent/mind-write  (vault_auth)
-- Body: { "content": "...", "mood": "..." }

local cjson   = require("cjson.safe")
local http    = require("resty.http")
local soul_id = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.header["Access-Control-Allow-Origin"]  = "*"
ngx.header["Access-Control-Allow-Methods"] = "POST, OPTIONS"
ngx.header["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Webhook-Token"

if ngx.req.get_method() == "OPTIONS" then ngx.status = 204; return end
if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

ngx.req.read_body()
local raw = ngx.req.get_body_data()
if not raw then
  local tmp = ngx.req.get_body_file()
  if tmp then local f = io.open(tmp,"r"); if f then raw=f:read("*a"); f:close() end end
end

local ok, body = pcall(cjson.decode, raw or "")
if not ok or type(body) ~= "table" then
  ngx.status = 400; ngx.say('{"error":"invalid_json"}'); return
end

if type(body.content) ~= "string" or body.content == "" then
  ngx.status = 400; ngx.say('{"error":"content_required"}'); return
end

local httpc = http.new()
httpc:set_timeout(15000)
local payload_ok, payload = pcall(cjson.encode, {
  tool  = "mind_write",
  input = { content = body.content, mood = body.mood }
})
if not payload_ok then ngx.status=500; ngx.say('{"error":"encode_failed"}'); return end

local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/run-tool", {
  method  = "POST",
  headers = { ["Content-Type"] = "application/json", ["x-soul-id"] = soul_id or "" },
  body    = payload,
})

if not res then
  ngx.status = 502
  local msg = (err or "timeout"):gsub('"', '\\"')
  ngx.say('{"error":"mcp_unreachable","message":"' .. msg .. '"}')
  return
end
ngx.status = res.status
ngx.say(res.body or '{"ok":true}')
