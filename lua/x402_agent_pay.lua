-- POST /api/x402/agent/pay  { url, method?, body? }  → real x402 payment attempt
--
-- Lets the soul trigger an actual signed x402 payment from Settings — e.g.
-- against this node's own /api/soul/pay/x402, to test the sell-side
-- end-to-end without leaving the browser. Per-soul since 2026-07-29 (was
-- node-global/Single-Hoster-only before).

local cjson = require("cjson.safe")
local http  = require("resty.http")

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.say('{"error":"unauthorized"}')
  return
end

-- Signiert echte Zahlungen aus der Agent-Wallet — vault_auth.lua akzeptiert
-- sonst JEDEN gültigen, verifizierten Service-Token für diese ganze
-- Routen-Familie (permissions aus /api/vault/services werden hier nicht
-- geprüft). Für diese eine Route zusätzlich einschränken: nur der
-- Soul-Owner selbst (soul-cert) oder ein Service-Token, der exakt
-- "x402-Zahlung" heißt (siehe /setup → Services) darf zahlen.
if not ngx.ctx.via_soul_cert and ngx.ctx.service_actor ~= "x402-Zahlung" then
  ngx.status = 403
  ngx.say('{"error":"forbidden","message":"Dieser Service-Token ist nicht für x402-Zahlungen freigegeben. Lege unter Setup einen Service namens \\"x402-Zahlung\\" an."}')
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
-- Zahlungsversuch braucht mehr Zeit als reine Statusabfragen: eine echte
-- Zahlung durchläuft fetch -> 402 -> signieren -> retry -> Facilitator
-- verify+settle, alles nacheinander.
httpc:set_timeout(30000)
local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/x402-agent/pay", {
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
