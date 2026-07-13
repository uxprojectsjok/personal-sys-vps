-- /etc/openresty/lua/soul_anchor_start.lua
-- POST /api/soul/anchor/start  → neue Anker-Anfrage erzeugen (Referenzcode + Betrag)
-- Auth: soul_auth.lua (soul_cert)
-- Body: { kind }  — bisher nur "paypal_transfer" unterstützt (PoC).

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
if not ok_b or type(body) ~= "table" then body = {} end

local kind = body.kind or "paypal_transfer"
local SUPPORTED = { paypal_transfer = true }
if not SUPPORTED[kind] then
  ngx.status = 400
  ngx.say('{"error":"unsupported_kind"}')
  return
end

-- PayPal-Zieladresse aus amortization lesen (dieselbe, die Käufer schon nutzen).
local ctx_file = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
local f = io.open(ctx_file, "r")
local paypal_target = nil
if f then
  local raw = f:read("*a"); f:close()
  local ok_c, ctx = pcall(cjson.decode, raw)
  if ok_c and type(ctx) == "table" and type(ctx.amortization) == "table" then
    local amort = ctx.amortization
    paypal_target = (amort.paypal_link and amort.paypal_link ~= "") and amort.paypal_link
                  or (amort.paypal_email or nil)
  end
end

if kind == "paypal_transfer" and not paypal_target then
  ngx.status = 400
  ngx.say('{"error":"no_paypal_target","message":"Kein PayPal-Ziel in Access-Einstellungen konfiguriert."}')
  return
end

local pending, err = chain.createPendingAnchor(soul_id, kind, 0.01)
if not pending then
  ngx.status = 500
  ngx.say(cjson.encode({ error = err or "create_failed" }))
  return
end

ngx.say(cjson.encode({
  ok             = true,
  reference_code = pending.reference_code,
  amount         = pending.amount,
  kind           = pending.kind,
  paypal_target  = paypal_target,
  expires_at     = os.date("!%Y-%m-%dT%TZ", pending.expires_at),
  instructions   = "Zahle " .. pending.amount .. " EUR per PayPal an " .. (paypal_target or "") ..
                    " mit dem Referenzcode '" .. pending.reference_code .. "' in der Notiz. " ..
                    "Danach soul_anchor_paypal_confirm mit den gefundenen Transaktionsdaten aufrufen.",
}))
