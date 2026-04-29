-- /etc/openresty/lua/soul_amortization.lua
-- GET /api/soul/amortization  → aktuelle Config lesen
-- PUT /api/soul/amortization  → Config setzen (nur wenn Polygon-verifiziert)
-- Auth: vault_auth.lua (soul_cert)

local cjson   = require("cjson.safe")
local http    = require("resty.http")
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
  pol_per_request = "0.001",
  wallet          = "",
  free_tools      = { "soul_read", "verify_human", "soul_maturity" },
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
  ngx.say(cjson.encode({ ok = true, amortization = amort }))
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

-- Aktivieren: Verifikation prüfen
if incoming.enabled == true and amort.enabled ~= true then
  -- 1. Erst im shared-dict Cache nachschauen
  local cache    = ngx.shared.verify_cache
  local cached   = cache and cache:get("v1:" .. soul_id)
  local verified = false
  local wallet   = nil

  if cached then
    local ok_c, cd = pcall(cjson.decode, cached)
    if ok_c and type(cd) == "table" then
      verified = cd.verified == true
      wallet   = cd.wallet
    end
  else
    -- Cache kalt: live Abfrage via internem Endpoint
    local httpc = http.new()
    httpc:set_timeout(12000)
    local res, err = httpc:request_uri(
      "http://127.0.0.1:3098/internal/verify/" .. soul_id,
      { method = "GET", headers = { ["Accept"] = "application/json" } }
    )
    if res and res.status == 200 then
      local ok_v, vd = pcall(cjson.decode, res.body)
      if ok_v and type(vd) == "table" then
        verified = vd.verified == true
        wallet   = vd.wallet
        -- Im Cache speichern
        if cache then
          local ttl = verified and 86400 or 300
          vd.cached_at = os.date("!%Y-%m-%dT%H:%M:%SZ")
          cache:set("v1:" .. soul_id, cjson.encode(vd), ttl)
        end
      end
    end
  end

  if not verified then
    ngx.status = 403
    ngx.say(cjson.encode({
      error   = "verification_required",
      message = "Amortisation nur für Polygon-verifizierte Souls aktivierbar. Bitte erst auf der Blockchain verankern.",
    }))
    return
  end

  amort.enabled         = true
  amort.activated_at    = os.date("!%Y-%m-%dT%H:%M:%SZ")
  amort.verified_wallet = wallet
end

if incoming.enabled == false then
  amort.enabled      = false
  amort.activated_at = cjson.null
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

-- free_tools: Array von Strings
if type(incoming.free_tools) == "table" then
  local clean = {}
  for _, t in ipairs(incoming.free_tools) do
    if type(t) == "string" and #t <= 64 then
      clean[#clean + 1] = t
    end
  end
  amort.free_tools = clean
end

ctx.amortization = amort
ctx.updated_at   = ngx.now()

if not write_ctx(ctx) then
  ngx.status = 500
  ngx.say('{"error":"Storage error"}')
  return
end

ngx.say(cjson.encode({ ok = true, amortization = amort }))
