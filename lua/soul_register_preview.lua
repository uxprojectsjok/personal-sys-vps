-- /etc/openresty/lua/soul_register_preview.lua
-- GET /api/soul/register-preview
-- Auth: vault_auth.lua (soul_cert)
-- Gibt zurück was bei POST /api/soul/register auf IPFS gepinnt würde — ohne zu pinnen.

local cjson = require("cjson.safe")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local soul_id = ngx.ctx.soul_id
if not soul_id then
  ngx.status = 401
  ngx.say('{"error":"Unauthorized"}')
  return
end

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.say('{"error":"Method not allowed"}')
  return
end

local SOULS_DIR = "/var/lib/sys/souls/"
local ctx_file  = SOULS_DIR .. soul_id .. "/api_context.json"

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

-- Name + Meta aus sys.md lesen
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

local base_url = "https://sys.uxprojects-jok.com"
local amort = ctx.amortization

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

local preview = {
  soul_id           = soul_id,
  name              = name or "Unknown",
  description       = nil,  -- editierbar im UI
  schema            = "saveyoursoul/soul/1.0",
  encrypted         = (name == nil),
  mcp_endpoint      = base_url .. "/mcp?soul_id=" .. soul_id,
  soul_endpoint     = base_url .. "/api/soul/meta?soul_id=" .. soul_id,
  verify_endpoint   = base_url .. "/api/soul/verify?soul_id=" .. soul_id,
  pay_endpoint      = base_url .. "/api/soul/pay",
  earnings_endpoint = base_url .. "/api/soul/earnings",
}
if created_at then preview.created_at = created_at end
if version    then preview.version    = version    end
if maturity   then preview.maturity   = maturity   end
if type(amort) == "table" then
  preview.amortization = {
    enabled         = amort.enabled == true,
    pol_per_request = amort.pol_per_request,
    wallet          = amort.wallet,
    agent_tools     = filter_tools(amort.free_tools),
  }
end

-- Editierbare Felder kennzeichnen
local editable = { "name", "description" }
local readonly  = { "soul_id", "schema", "mcp_endpoint", "soul_endpoint",
                    "verify_endpoint", "pay_endpoint", "earnings_endpoint",
                    "encrypted", "amortization", "created_at", "version", "maturity" }

ngx.say(cjson.encode({
  ok       = true,
  preview  = preview,
  editable = editable,
  readonly = readonly,
}))
