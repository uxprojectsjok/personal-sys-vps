-- POST /api/trader/predictions/bet  { tokenId, side, usdcAmount, price, negRisk? }
--
-- Platziert eine echte Polymarket-Order (USDC.e) — siehe
-- soul-mcp/lib/polymarket_client.mjs Datei-Kommentar: Auth-/Signier-Pfad
-- live gegen die echte API verifiziert, der Order-Pfad selbst NICHT
-- Ende-zu-Ende gegen eine echte Order getestet. PRIVATE-REPO-ONLY.

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
-- L1-Auth-Handshake + Order-Signatur + API-Roundtrip brauchen mehr Zeit als
-- reine Lesezugriffe.
httpc:set_timeout(30000)
local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/trader/predictions/bet", {
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
