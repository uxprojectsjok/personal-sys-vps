-- /etc/openresty/lua/soul_register.lua
-- POST /api/soul/register
-- Auth: vault_auth.lua (soul_cert)
-- Pinnt soul_meta JSON zu IPFS via Pinata (ERC-8004 Agent-Discovery).
-- Speichert CID in api_context.json als agent_registry_cid.
-- Voraussetzung: Amortisation aktiviert (soul ist polygon-verifiziert).

local cjson = require("cjson.safe")
local http  = require("resty.http")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local soul_id = ngx.ctx.soul_id
if not soul_id then
  ngx.status = 401
  ngx.say('{"error":"Unauthorized"}')
  return
end

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"Method not allowed"}')
  return
end

-- Optionaler Body: name_override, description
ngx.req.read_body()
local body_raw = ngx.req.get_body_data() or "{}"
local ok_b, body_in = pcall(cjson.decode, body_raw)
if not ok_b then body_in = {} end
local name_override = (type(body_in.name_override) == "string" and #body_in.name_override > 0)
  and body_in.name_override or nil
local description = (type(body_in.description) == "string" and #body_in.description > 0)
  and body_in.description or nil

local SOULS_DIR = "/var/lib/sys/souls/"
local ctx_file  = SOULS_DIR .. soul_id .. "/api_context.json"

-- api_context.json lesen
local cf = io.open(ctx_file, "r")
if not cf then
  ngx.status = 404
  ngx.say('{"error":"Soul nicht gefunden"}')
  return
end
local raw_ctx = cf:read("*a"); cf:close()
local ok_c, ctx = pcall(cjson.decode, raw_ctx)
if not ok_c or type(ctx) ~= "table" then
  ngx.status = 500
  ngx.say('{"error":"api_context corrupt"}')
  return
end

-- Voraussetzung: Polygon-verifiziert (amortization.verified_wallet gesetzt)
local amort = ctx.amortization
local is_verified = type(amort) == "table"
  and type(amort.verified_wallet) == "string"
  and #amort.verified_wallet > 0

if not is_verified then
  -- Fallback: verify_cache prüfen
  local cache   = ngx.shared.verify_cache
  local cached  = cache and cache:get("v1:" .. soul_id)
  if cached then
    local ok_v, cd = pcall(cjson.decode, cached)
    if ok_v and type(cd) == "table" then
      is_verified = cd.verified == true
    end
  end
end

if not is_verified then
  ngx.status = 403
  ngx.say(cjson.encode({
    error   = "verification_required",
    message = "Nur Polygon-verifizierte Souls können registriert werden. Bitte erst auf der Blockchain verankern.",
  }))
  return
end

-- soul_meta direkt hier zusammenbauen (wie soul_meta.lua)
local sys_path = SOULS_DIR .. soul_id .. "/sys.md"
local sf = io.open(sys_path, "r")
local name, created_at, version, maturity

if sf then
  local raw = sf:read("*a"); sf:close()
  if raw:sub(1, 4) ~= "SYS\x01" then
    local front = raw:match("^%-%-%-\n(.-)%-%-%-")
    if front then
      name       = front:match("soul_name:%s*(.-)%s*\n")
      created_at = front:match("created_at:%s*(.-)%s*\n")
      version    = front:match("version:%s*(.-)%s*\n")
      maturity   = tonumber(front:match("maturity:%s*(.-)%s*\n"))
    end
  end
end

-- Erlaubte Tools (muss mit AgentMarketplacePanel.AVAILABLE_TOOLS übereinstimmen)
local ALLOWED_TOOLS = {
  soul_read=true, soul_maturity=true, soul_skills=true, soul_discover=true, soul_earnings=true,
  audio_get=true, audio_list=true, image_get=true, image_list=true,
  video_get=true, video_list=true, context_get=true, context_list=true,
  profile_get=true, calendar_read=true, soul_write=true,
}
local function filter_tools(tbl)
  if type(tbl) ~= "table" then return setmetatable({}, cjson.array_mt) end
  local out = setmetatable({}, cjson.array_mt)
  for _, v in ipairs(tbl) do
    if ALLOWED_TOOLS[v] then out[#out+1] = v end
  end
  return out
end

local base_url = "https://sys.uxprojects-jok.com"
local meta = {
  soul_id        = soul_id,
  name           = name_override or name or "Unknown",
  schema         = "saveyoursoul/soul/1.0",
  encrypted      = (name == nil),
  api_enabled    = ctx.enabled == true,
  public_vault   = false,
  mcp_endpoint   = base_url .. "/mcp?soul_id=" .. soul_id,
  soul_endpoint  = base_url .. "/api/soul/meta?soul_id=" .. soul_id,
  verify_endpoint = base_url .. "/api/soul/verify?soul_id=" .. soul_id,
  pay_endpoint   = base_url .. "/api/soul/pay",
  earnings_endpoint = base_url .. "/api/soul/earnings",
}
if created_at   then meta.created_at   = created_at   end
if version      then meta.version      = version      end
if maturity     then meta.maturity     = maturity     end
if description  then meta.description  = description  end
if type(amort) == "table" then
  local no_tools = setmetatable({}, cjson.array_mt)
  meta.amortization = {
    enabled         = amort.enabled == true,
    private         = amort.private == true,
    pol_per_request = amort.pol_per_request,
    wallet          = amort.wallet,
    -- agent_tools nur im Bezahlt-Modus relevant (gefiltert auf erlaubte Tools)
    agent_tools     = (amort.enabled == true)
                      and filter_tools(amort.free_tools) or no_tools,
    token_duration  = amort.token_duration or "1d",
  }
end

-- Pinata-Pinning via MCP-internem Endpoint
local httpc = http.new()
httpc:set_timeout(20000)

local pin_body = cjson.encode({ soul_id = soul_id, meta = meta })
local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/pin-json", {
  method  = "POST",
  body    = pin_body,
  headers = { ["Content-Type"] = "application/json", ["Accept"] = "application/json" },
})

if not res or err then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "IPFS-Pinning fehlgeschlagen", detail = tostring(err) }))
  return
end

local ok_p, pdata = pcall(cjson.decode, res.body or "")
if not ok_p or type(pdata) ~= "table" then
  ngx.status = 502
  ngx.say('{"error":"Ungültige Antwort vom Pinning-Dienst"}')
  return
end

if res.status ~= 200 or pdata.ok ~= true then
  ngx.status = res.status
  ngx.say(cjson.encode({
    error   = pdata.error or "pinning_failed",
    message = pdata.message or "IPFS-Pinning nicht möglich",
    detail  = pdata,
  }))
  return
end

-- CID in api_context.json persistieren
ctx.agent_registry_cid    = pdata.cid
ctx.agent_registry_url    = pdata.gateway_url
ctx.agent_registered_at   = pdata.pinned_at
ctx.updated_at            = ngx.now()

local wf = io.open(ctx_file, "w")
if wf then wf:write(cjson.encode(ctx)); wf:close() end

ngx.say(cjson.encode({
  ok             = true,
  cid            = pdata.cid,
  ipfs_uri       = pdata.ipfs_uri,
  gateway_url    = pdata.gateway_url,
  pinned_at      = pdata.pinned_at,
  soul_id        = soul_id,
  note           = "Soul ist jetzt via IPFS für KI-Agenten auffindbar. CID in api_context.json gespeichert.",
}))
