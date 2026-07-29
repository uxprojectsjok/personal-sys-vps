-- GET /api/x402/agent/balances → { ok, address, usdc, pol }
-- Per-soul since 2026-07-29 (was node-global/Single-Hoster-only before).

local cjson = require("cjson.safe")
local http  = require("resty.http")

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.say('{"error":"unauthorized"}')
  return
end

ngx.header["Content-Type"] = "application/json"

local httpc = http.new()
httpc:set_timeout(15000)
local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/x402-agent/balance?soul_id=" .. ngx.escape_uri(soul_id), { method = "GET" })

if not res then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "internal_unreachable", detail = tostring(err) }))
  return
end

ngx.status = res.status
ngx.say(res.body)
