-- GET /api/x402/agent/status → { configured, address }
--
-- Per-soul test tooling (see lua/soul_pay_x402.lua header): lets any
-- authenticated soul act as a real x402 PAYER to test their own sell-side.
-- Per-soul since 2026-07-29 (was node-global/Single-Hoster-only before) —
-- same pattern as reown_project_id, each soul manages its own wallet. The
-- actual key handling/signing lives in soul-mcp (lib/x402_agent_wallet.mjs,
-- lib/x402_client.mjs) — this file only authenticates the soul and proxies
-- to the internal Node endpoint, same pattern as soul_pay_x402.lua's call
-- to /internal/verify-x402.

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
httpc:set_timeout(10000)
local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/x402-agent/status?soul_id=" .. ngx.escape_uri(soul_id), { method = "GET" })

if not res then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "internal_unreachable", detail = tostring(err) }))
  return
end

ngx.status = res.status
ngx.say(res.body)
