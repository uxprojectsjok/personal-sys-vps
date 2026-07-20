-- POST /api/x402/agent/pay  { url, method?, body? }  → real x402 payment attempt
--
-- Lets the operator trigger an actual signed x402 payment from Settings —
-- e.g. against this node's own /api/soul/pay/x402, to test the sell-side
-- end-to-end without leaving the browser.

local cjson = require("cjson.safe")
local cfg   = require("config_reader")
local http  = require("resty.http")

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.say('{"error":"unauthorized"}')
  return
end

if cfg.get_multi_hoster() then
  ngx.status = 403
  ngx.say('{"error":"not_available_multi_hoster","message":"x402 test tooling is Personal-node only."}')
  return
end

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"method not allowed"}')
  return
end

ngx.header["Content-Type"] = "application/json"

ngx.req.read_body()
local body = ngx.req.get_body_data()

local httpc = http.new()
-- Zahlungsversuch braucht mehr Zeit als reine Statusabfragen: eine echte
-- Zahlung durchläuft fetch -> 402 -> signieren -> retry -> Facilitator
-- verify+settle, alles nacheinander.
httpc:set_timeout(30000)
local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/x402-agent/pay", {
  method  = "POST",
  body    = body,
  headers = { ["Content-Type"] = "application/json" },
})

if not res then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "internal_unreachable", detail = tostring(err) }))
  return
end

ngx.status = res.status
ngx.say(res.body)
