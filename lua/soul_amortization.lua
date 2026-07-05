-- /etc/openresty/lua/soul_amortization.lua
-- GET /api/soul/amortization  → aktuelle Config lesen
-- PUT /api/soul/amortization  → Config setzen (nur wenn Polygon-verifiziert)
-- Auth: vault_auth.lua (soul_cert)

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unauthorized"}')
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local SOULS_DIR  = "/var/lib/sys/souls/"
local ctx_file   = SOULS_DIR .. soul_id .. "/api_context.json"

local function read_ctx()
  local f = io.open(ctx_file, "r")
  if not f then return {} end
  local raw = f:read("*a"); f:close()
  local ok, data = pcall(cjson.decode, raw)
  return (ok and type(data) == "table") and data or nil
end

local function write_ctx(data)
  local f = io.open(ctx_file, "w")
  if not f then return false end
  f:write(cjson.encode(data)); f:close()
  return true
end

local DEFAULTS = {
  enabled         = false,
  private         = false,
  pol_per_request = "0.001",
  wallet          = "",
  agent_tools     = setmetatable({}, cjson.array_mt),
  trusted_souls   = setmetatable({}, cjson.array_mt),
  token_duration       = "1d",
  token_duration_days  = 1,
  activated_at         = cjson.null,
  verified_wallet = cjson.null,
  paypal_enabled  = false,
  paypal_link     = "",
  paypal_email    = "",
  price_eur       = "",
}

-- ── GET ───────────────────────────────────────────────────────────────────────

if ngx.req.get_method() == "GET" then
  local ctx = read_ctx()
  if not ctx then
    ngx.status = 500
    ngx.say('{"error":"api_context nicht lesbar"}')
    return
  end
  local amort = type(ctx.amortization) == "table" and ctx.amortization or DEFAULTS
  ngx.say(cjson.encode({
    ok                = true,
    amortization      = amort,
    agent_registry_cid = ctx.agent_registry_cid or cjson.null,
    agent_registry_url = ctx.agent_registry_url or cjson.null,
  }))
  return
end

-- ── PUT ───────────────────────────────────────────────────────────────────────

if ngx.req.get_method() ~= "PUT" then
  ngx.status = 405
  ngx.say('{"error":"Method not allowed"}')
  return
end

ngx.req.read_body()
local body = ngx.req.get_body_data()
if not body or body == "" then
  ngx.status = 400
  ngx.say('{"error":"Empty body"}')
  return
end

local ok_b, incoming = pcall(cjson.decode, body)
if not ok_b or type(incoming) ~= "table" then
  ngx.status = 400
  ngx.say('{"error":"Invalid JSON"}')
  return
end

local ctx = read_ctx()
if not ctx then
  ngx.status = 500
  ngx.say('{"error":"api_context corrupt"}')
  return
end

local amort = type(ctx.amortization) == "table" and ctx.amortization or {}
for k, v in pairs(DEFAULTS) do
  if amort[k] == nil then amort[k] = v end
end

-- Aktivieren
if incoming.enabled == true and amort.enabled ~= true then
  amort.enabled      = true
  amort.activated_at = os.date("!%Y-%m-%dT%H:%M:%SZ")
  -- Wallet aus Anfrage übernehmen wenn vorhanden
  if type(incoming.wallet) == "string" and incoming.wallet:match("^0x[0-9a-fA-F]+$") then
    amort.verified_wallet = incoming.wallet
  end
end

if incoming.enabled == false then
  amort.enabled      = false
  amort.activated_at = cjson.null
end

-- private: boolean
if type(incoming.private) == "boolean" then
  amort.private = incoming.private
end

-- pol_per_request: positive Zahl als String
if type(incoming.pol_per_request) == "string" then
  local n = tonumber(incoming.pol_per_request)
  if n and n >= 0 then
    amort.pol_per_request = incoming.pol_per_request
  end
end

-- wallet: Ethereum-Adresse
if type(incoming.wallet) == "string" and incoming.wallet:match("^0x[0-9a-fA-F]+$") then
  amort.wallet = incoming.wallet
end

-- paypal_enabled: Nicht-Krypto-Zahlungsweg (manuell bestätigt, kein Auto-Verify)
if incoming.paypal_enabled == true or incoming.paypal_enabled == false then
  amort.paypal_enabled = incoming.paypal_enabled
end

-- paypal_link: PayPal.me-URL
if type(incoming.paypal_link) == "string" then
  local link = incoming.paypal_link:match("^%s*(.-)%s*$"):sub(1, 200)
  if link == "" or link:match("^https://[%w%.]-paypal%.me/[%w%.%-_]+$")
                 or link:match("^https://[%w%.]-paypal%.com/paypalme/[%w%.%-_]+$") then
    amort.paypal_link = link
  end
end

-- paypal_email: Alternative zum Link
if type(incoming.paypal_email) == "string" then
  local email = incoming.paypal_email:match("^%s*(.-)%s*$"):sub(1, 254)
  if email == "" or email:match("^[%w%.%-_%+]+@[%w%.%-]+%.%a%a+$") then
    amort.paypal_email = email
  end
end

-- price_eur: positive Zahl als String, wie pol_per_request
if type(incoming.price_eur) == "string" then
  local n = tonumber(incoming.price_eur)
  if n and n >= 0 then
    amort.price_eur = incoming.price_eur
  end
end

-- agent_tools: Array von Strings (nur erlaubte Tools; muss mit AgentMarketplacePanel.AVAILABLE_TOOLS übereinstimmen)
-- Muss mit AgentMarketplacePanel.AVAILABLE_TOOLS und registerPaidTools() übereinstimmen.
-- soul_discover: immer frei, nicht konfigurierbar. soul_write/soul_earnings: nur für Owner.
local ALLOWED_TOOLS = {
  soul_read=true, soul_maturity=true, soul_skills=true,
  audio_get=true, audio_list=true, image_get=true, image_list=true,
  video_get=true, video_list=true, context_get=true, context_list=true,
  profile_get=true, calendar_read=true, verify_human=true,
  health_check_payed=true, shop_write_read=true,
}
local incoming_tools = incoming.agent_tools or incoming.free_tools  -- backward compat
if type(incoming_tools) == "table" then
  local clean = {}
  for _, t in ipairs(incoming_tools) do
    if type(t) == "string" and #t <= 64 and ALLOWED_TOOLS[t] then
      clean[#clean + 1] = t
    end
  end
  amort.agent_tools = #clean > 0 and clean or setmetatable({}, cjson.array_mt)
end

-- trusted_souls: Array von soul_ids (same-server) oder {soul_id,endpoint} (cross-domain)
local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
if type(incoming.trusted_souls) == "table" then
  local clean = {}
  for _, entry in ipairs(incoming.trusted_souls) do
    if type(entry) == "string" and entry:match(UUID_PAT) then
      -- Same-Server: plain UUID
      clean[#clean + 1] = entry
    elseif type(entry) == "table" then
      -- Cross-Domain: {soul_id, endpoint}
      local sid = entry.soul_id
      local ep  = entry.endpoint
      if type(sid) == "string" and sid:match(UUID_PAT)
         and type(ep) == "string" and ep:match("^https?://") and #ep <= 256 then
        clean[#clean + 1] = { soul_id = sid, endpoint = ep }
      end
    end
  end
  amort.trusted_souls = #clean > 0 and clean or setmetatable({}, cjson.array_mt)
end

-- token_duration: erlaubte Werte (Legacy-Feld, bleibt für Kompatibilität)
local valid_dur = { ["1h"]=true, ["12h"]=true, ["1d"]=true, ["30d"]=true, ["182d"]=true, ["365d"]=true, ["unlimited"]=true }
if type(incoming.token_duration) == "string" and valid_dur[incoming.token_duration] then
  amort.token_duration = incoming.token_duration
end

-- token_duration_days: 1–30 Tage (neues numerisches Feld, überschreibt token_duration)
if incoming.token_duration_days ~= nil then
  local d = tonumber(incoming.token_duration_days) or 1
  amort.token_duration_days = math.max(1, math.min(30, math.floor(d)))
end

-- dynamic_pricing: Preis wächst mit Genesis Chain-Alter und Anchor-Anzahl
if incoming.dynamic_pricing == true or incoming.dynamic_pricing == false then
  amort.dynamic_pricing = incoming.dynamic_pricing
end

ctx.amortization = amort
ctx.updated_at   = ngx.now()

-- Optionale Meta-Felder (description, tags) — für Vorausfüllung im UI
if type(incoming.description) == "string" then
  local d = incoming.description:match("^%s*(.-)%s*$"):sub(1, 500)
  ctx.description = #d > 0 and d or cjson.null
end
if type(incoming.tags) == "table" then
  local clean = setmetatable({}, cjson.array_mt)
  for _, t in ipairs(incoming.tags) do
    if type(t) == "string" then
      local trimmed = t:match("^%s*(.-)%s*$"):sub(1, 64)
      if #trimmed > 0 then clean[#clean+1] = trimmed end
    end
  end
  if #clean > 0 then ctx.tags = clean end
end
if type(incoming.name) == "string" then
  local n = incoming.name:match("^%s*(.-)%s*$"):sub(1, 128)
  ctx.name = #n > 0 and n or cjson.null
end

if not write_ctx(ctx) then
  ngx.status = 500
  ngx.say('{"error":"Storage error"}')
  return
end

-- Index sofort aktualisieren — damit soul_discover den neuen Bezahl-Endpunkt zeigt
local httpc = require("resty.http").new()
httpc:set_timeout(3000)
httpc:request_uri("http://127.0.0.1:3098/internal/seed-soul", {
  method  = "POST",
  headers = { ["Content-Type"] = "application/json" },
  body    = '{"soul_id":"' .. soul_id .. '"}',
})

ngx.say(cjson.encode({ ok = true, amortization = amort }))
