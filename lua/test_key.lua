-- /etc/openresty/lua/test_key.lua
-- POST /api/test-key — testet Anthropic API-Key serverseitig
-- Auth: soul_cert (via soul_auth.lua access phase)

local cjson = require("cjson.safe")
local http  = require("resty.http")

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

ngx.req.read_body()
local raw = ngx.req.get_body_data()
local ok, body = pcall(cjson.decode, raw or "")
if not ok or type(body) ~= "table" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_json"}')
  return
end

local api_key = body.anthropic_key
if type(api_key) ~= "string" or api_key:sub(1,7) ~= "sk-ant-" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_key"}')
  return
end

local httpc = http.new()
httpc:set_timeout(10000)
local res, err = httpc:request_uri("https://api.anthropic.com/v1/messages", {
  method  = "POST",
  headers = {
    ["x-api-key"]          = api_key,
    ["anthropic-version"]  = "2023-06-01",
    ["content-type"]       = "application/json",
  },
  body = '{"model":"claude-haiku-4-5-20251001","max_tokens":5,"messages":[{"role":"user","content":"Hi"}]}',
  ssl_verify = true,
})

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if not res then
  ngx.status = 502
  ngx.say(cjson.encode({ ok = false, status = 0, error = err }))
  return
end

ngx.status = 200
ngx.say(cjson.encode({ ok = res.status == 200, status = res.status }))
