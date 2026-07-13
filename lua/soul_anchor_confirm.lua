-- /etc/openresty/lua/soul_anchor_confirm.lua
-- POST /api/soul/anchor/confirm  → offene Anker-Anfrage bestätigen
-- Auth: soul_auth.lua (soul_cert) — bewusst dieselbe Session wie jedes andere
-- Owner-Tool, kein separates Credential für Zapier/Vermittlungsdienste nötig,
-- da die KI diesen Endpunkt innerhalb ihrer eigenen authentifizierten Session
-- aufruft (siehe verify-identity-hq-plan.md, Abschnitt Anchor-PoC).
-- Body: { reference_code, amount, human_override }
-- human_override=true: Mensch bestätigt manuell trotz gescheitertem/
-- übersprungenem automatischem Abgleich — landet mit reduzierter Confidence
-- ("low" statt "medium") in der Kette, siehe chain_lib.lua.

local cjson   = require("cjson.safe")
local chain   = require("chain_lib")
local soul_id = ngx.ctx.soul_id

if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unauthorized"}')
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"method_not_allowed"}')
  return
end

ngx.req.read_body()
local body_raw = ngx.req.get_body_data() or ""
local ok_b, body = pcall(cjson.decode, body_raw)
if not ok_b or type(body) ~= "table" or type(body.reference_code) ~= "string" then
  ngx.status = 400
  ngx.say('{"error":"reference_code erforderlich"}')
  return
end

local amount = tonumber(body.amount)
local opts   = { human_override = body.human_override == true }

local link, err = chain.confirmPendingAnchor(soul_id, body.reference_code, amount, opts)
if not link then
  ngx.status = 409
  ngx.say(cjson.encode({ error = err or "confirm_failed" }))
  return
end

ngx.say(cjson.encode({ ok = true, link = link }))
