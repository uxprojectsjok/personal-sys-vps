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
  free_tools      = setmetatable({}, cjson.array_mt),
  trusted_souls   = setmetatable({}, cjson.array_mt),
  token_duration  = "1d",
  activated_at    = cjson.null,
  verified_wallet = cjson.null,
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

-- free_tools: Array von Strings (nur erlaubte Tools; muss mit AgentMarketplacePanel.AVAILABLE_TOOLS übereinstimmen)
local ALLOWED_TOOLS = {
  soul_read=true, soul_maturity=true, soul_skills=true, soul_discover=true, soul_earnings=true,
  audio_get=true, audio_list=true, image_get=true, image_list=true,
  video_get=true, video_list=true, context_get=true, context_list=true,
  profile_get=true, calendar_read=true, soul_write=true, verify_human=true,
}
if type(incoming.free_tools) == "table" then
  local clean = {}
  for _, t in ipairs(incoming.free_tools) do
    if type(t) == "string" and #t <= 64 and ALLOWED_TOOLS[t] then
      clean[#clean + 1] = t
    end
  end
  amort.free_tools = #clean > 0 and clean or setmetatable({}, cjson.array_mt)
end

-- trusted_souls: Array von soul_ids (UUID-Format) — bekommen free_tools ohne Zahlung
if type(incoming.trusted_souls) == "table" then
  local clean = {}
  for _, sid in ipairs(incoming.trusted_souls) do
    if type(sid) == "string" and sid:match("^[a-fA-F0-9%-]+$") and #sid <= 64 then
      clean[#clean + 1] = sid
    end
  end
  amort.trusted_souls = #clean > 0 and clean or setmetatable({}, cjson.array_mt)
end

-- token_duration: erlaubte Werte
local valid_dur = { ["1h"]=true, ["12h"]=true, ["1d"]=true, ["30d"]=true, ["182d"]=true, ["365d"]=true, ["unlimited"]=true }
if type(incoming.token_duration) == "string" and valid_dur[incoming.token_duration] then
  amort.token_duration = incoming.token_duration
end

ctx.amortization = amort
ctx.updated_at   = ngx.now()

if not write_ctx(ctx) then
  ngx.status = 500
  ngx.say('{"error":"Storage error"}')
  return
end

ngx.say(cjson.encode({ ok = true, amortization = amort }))
