-- /etc/openresty/lua/soul_register.lua
-- POST /api/soul/register
-- Auth: vault_auth.lua (soul_cert)
-- Pinnt soul_meta JSON zu IPFS via Pinata (ERC-8004 Agent-Discovery).
-- Speichert CID in api_context.json als agent_registry_cid.
-- Kein Anker erforderlich — Registrierung ist unabhängig vom Blockchain-Status.

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

-- Optionaler Body: name_override, description, tags
ngx.req.read_body()
local body_raw = ngx.req.get_body_data() or "{}"
local ok_b, body_in = pcall(cjson.decode, body_raw)
if not ok_b then body_in = {} end
local name_override = (type(body_in.name_override) == "string" and #body_in.name_override > 0)
  and body_in.name_override or nil
local description = (type(body_in.description) == "string" and #body_in.description > 0)
  and body_in.description or nil
-- Tags aus Body (Priorität) — Fallback auf soul_chain_anchor (wird weiter unten gesetzt)
local body_tags = nil
if type(body_in.tags) == "table" then
  local clean = setmetatable({}, cjson.array_mt)
  for _, t in ipairs(body_in.tags) do
    if type(t) == "string" and #t > 0 and #t <= 60 then clean[#clean + 1] = t end
  end
  if #clean > 0 then body_tags = clean end
end

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

local amort = ctx.amortization

-- soul_meta direkt hier zusammenbauen (wie soul_meta.lua)
local sys_path = SOULS_DIR .. soul_id .. "/sys.md"
local sf = io.open(sys_path, "r")
local name, created_at, version, maturity
local anchor_tags = setmetatable({}, cjson.array_mt)

if sf then
  local raw = sf:read("*a"); sf:close()
  if raw:sub(1, 4) ~= "SYS\x01" then
    local front = raw:match("^%-%-%-\n(.-)%-%-%-")
    if front then
      name       = front:match("soul_name:%s*(.-)%s*\n")
      created_at = front:match("created:%s*(.-)%s*\n") or front:match("created_at:%s*(.-)%s*\n")
      version    = front:match("version:%s*(.-)%s*\n")
      maturity   = tonumber(front:match("maturity:%s*(.-)%s*\n"))
      -- Kanonische Tags aus soul_chain_anchor lesen (gesetzt beim Blockchain-Anker)
      local anchor_raw = front:match("soul_chain_anchor:%s*(.-)%s*\n")
      if anchor_raw then
        local ok_a, anchor_obj = pcall(cjson.decode, anchor_raw)
        if ok_a and type(anchor_obj) == "table" and type(anchor_obj.tags) == "table" then
          for _, t in ipairs(anchor_obj.tags) do
            if type(t) == "string" and #t > 0 then
              anchor_tags[#anchor_tags + 1] = t
            end
          end
        end
      end
    end
  end
end

-- Erlaubte Tools (muss mit AgentMarketplacePanel.AVAILABLE_TOOLS übereinstimmen)
-- soul_discover ist immer verfügbar und nicht konfigurierbar → nicht in dieser Liste
local ALLOWED_TOOLS = {
  soul_read=true, soul_maturity=true, soul_skills=true, soul_earnings=true,
  audio_get=true, audio_list=true, image_get=true, image_list=true,
  video_get=true, video_list=true, context_get=true, context_list=true,
  profile_get=true, calendar_read=true, soul_write=true, verify_human=true,
}
local function filter_tools(tbl)
  if type(tbl) ~= "table" then return setmetatable({}, cjson.array_mt) end
  local out = setmetatable({}, cjson.array_mt)
  for _, v in ipairs(tbl) do
    if ALLOWED_TOOLS[v] then out[#out+1] = v end
  end
  return out
end

local host = ngx.var.host or "unknown"
local base_url = "https://" .. host
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
if created_at   then meta.created      = created_at   end
if version      then meta.version      = version      end
if maturity     then meta.maturity     = maturity     end
if description  then meta.description  = description  end
-- Tags: Body hat Priorität, Fallback auf soul_chain_anchor
local final_tags = body_tags or (#anchor_tags > 0 and anchor_tags or nil)
if final_tags then meta.tags = final_tags end
if type(amort) == "table" then
  local no_tools = setmetatable({}, cjson.array_mt)
  local days     = math.max(1, math.min(30, math.floor(tonumber(amort.token_duration_days) or 1)))
  meta.amortization = {
    enabled              = amort.enabled == true,
    private              = amort.private == true,
    pol_per_request      = amort.pol_per_request,
    wallet               = amort.wallet,
    -- agent_tools nur im Bezahlt-Modus relevant (gefiltert auf erlaubte Tools)
    agent_tools          = (amort.enabled == true)
                           and filter_tools(amort.free_tools) or no_tools,
    token_duration_days  = days,
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
