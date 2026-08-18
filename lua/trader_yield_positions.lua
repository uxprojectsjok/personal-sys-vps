-- GET /api/trader/yield/positions → { ok, address, positions }
--
-- TILL/Trader: Yield-Positionen (Aave V3) für die per-Soul x402-Wallet.
-- Gleiches Auth-/Proxy-Muster wie x402_agent_balances.lua — der eigentliche
-- Contract-Zugriff lebt in soul-mcp (lib/aave_client.mjs). PRIVATE-REPO-ONLY.

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
local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/trader/yield/positions?soul_id=" .. ngx.escape_uri(soul_id), { method = "GET" })

if not res then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "internal_unreachable", detail = tostring(err) }))
  return
end

ngx.status = res.status
ngx.say(res.body)
