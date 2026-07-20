-- GET /api/x402/agent/balances → { ok, address, usdc, pol }

local cjson = require("cjson.safe")
local cfg   = require("config_reader")
local http  = require("resty.http")

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.say('{"error":"unauthorized"}')
  return
end

-- Operator-only: this wallet is node-global, not soul-scoped. On a
-- Multi-Hoster node there is no "admin soul" concept to check against, so
-- any authenticated soul owner would otherwise reach another party's test
-- wallet — the safe default is to disable this surface entirely there,
-- matching the existing Agent/Claude Code tab precedent.
if cfg.get_multi_hoster() then
  ngx.status = 403
  ngx.say('{"error":"not_available_multi_hoster","message":"x402 test tooling is Personal-node only."}')
  return
end

ngx.header["Content-Type"] = "application/json"

local httpc = http.new()
httpc:set_timeout(15000)
local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/x402-agent/balance", { method = "GET" })

if not res then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "internal_unreachable", detail = tostring(err) }))
  return
end

ngx.status = res.status
ngx.say(res.body)
