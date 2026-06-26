-- /etc/openresty/lua/agent_tool_proxy.lua
-- POST /api/agent/tool/<tool_name>  (vault_auth)
-- Generischer Proxy: leitet alle MCP-Tool-Aufrufe an /internal/run-tool weiter.
-- tool_name kommt aus ngx.var.agent_tool (gesetzt per set in nginx).

local cjson   = require("cjson.safe")
local http    = require("resty.http")
local soul_id = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.header["Access-Control-Allow-Origin"]  = "*"
ngx.header["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
ngx.header["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Webhook-Token"

local method = ngx.req.get_method()
if method == "OPTIONS" then ngx.status = 204; return end
if method ~= "POST" and method ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local tool_name = ngx.var.agent_tool or ""

-- Whitelist: nur alphanumerisch + Underscore, max 60 Zeichen
if not tool_name:match("^[a-z_][a-z0-9_]+$") or #tool_name > 60 then
  ngx.status = 400; ngx.say('{"error":"invalid_tool_name"}'); return
end

-- Permission-Check für bezahlte Agenten (pol_access_token)
if ngx.ctx.is_paid_agent then
  local PAID_AGENT_TOOLS = { soul_maturity = true }
  if not PAID_AGENT_TOOLS[tool_name] then
    ngx.status = 403
    ngx.say('{"error":"permission_denied","required":"paid_agent_whitelist"}')
    return
  end
end

-- Permission-Check für Service-Token-Requests (soul-cert bypassed)
if ngx.ctx.via_webhook then
  local perms = ngx.ctx.service_permissions or {}
  local TOOL_PERMS = {
    soul_read       = "soul", soul_write      = "soul",
    soul_maturity   = "soul", soul_skills     = "soul",
    soul_earnings   = "soul", soul_cloud_push = "soul",
    vault_manifest  = "soul", mind_read       = "soul",
    mind_write      = "soul", profile_get     = "soul",
    profile_save    = "soul",
    calendar_read   = "calendar", calendar_write  = "calendar",
    calendar_delete = "calendar",
    audio_get       = "audio",         audio_list      = "audio",
    video_get       = "video",         video_list      = "video",
    image_get       = "images",        image_list      = "images",
    context_get     = "context_files", context_list    = "context_files",
    context_write   = "context_files",
  }
  local req_perm = TOOL_PERMS[tool_name]
  if req_perm and not perms[req_perm] then
    ngx.status = 403
    ngx.say('{"error":"permission_denied","required":"' .. req_perm .. '"}')
    return
  end
end

local input = {}
if method == "POST" then
  ngx.req.read_body()
  local raw = ngx.req.get_body_data()
  if not raw then
    local tmp = ngx.req.get_body_file()
    if tmp then local f = io.open(tmp,"r"); if f then raw=f:read("*a"); f:close() end end
  end
  if raw and raw ~= "" and raw ~= "{}" then
    local ok, parsed = pcall(cjson.decode, raw)
    if ok and type(parsed) == "table" then input = parsed end
  end
end

local httpc = http.new()
httpc:set_timeout(30000)

local payload_ok, payload = pcall(cjson.encode, { tool = tool_name, input = input })
if not payload_ok then
  ngx.status = 500; ngx.say('{"error":"encode_failed"}'); return
end

local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/run-tool", {
  method  = "POST",
  headers = {
    ["Content-Type"] = "application/json",
    ["x-soul-id"]    = soul_id or "",
  },
  body = payload,
})

if not res then
  ngx.status = 502
  local msg = (err or "timeout"):gsub('"', '\\"')
  ngx.say('{"error":"mcp_unreachable","message":"' .. msg .. '"}')
  return
end

ngx.status = res.status
ngx.say(res.body or '{"ok":true}')
