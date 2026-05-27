-- /etc/openresty/lua/mcp_tools.lua
-- GET /api/mcp-tools
-- Holt Tool-Definitionen vom konfigurierten externen MCP-Server (z.B. Zapier).
-- Auth: soul_cert Bearer (soul_auth.lua)
-- Gibt Anthropic-kompatibles Format zurück: { tools: [{ name, description, input_schema }] }

local cjson   = require("cjson.safe")
local http    = require("resty.http")
local soul_id = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.say('{"error":"method_not_allowed"}')
  return
end

-- ── mcp_url aus config.json ────────────────────────────────────────────────────
local mcp_url = ""
local f = io.open("/var/lib/sys/souls/" .. soul_id .. "/config.json", "r")
if f then
  local raw = f:read("*a"); f:close()
  local ok, cfg = pcall(cjson.decode, raw)
  if ok and type(cfg) == "table" and type(cfg.mcp_url) == "string" then
    mcp_url = cfg.mcp_url
  end
end

if mcp_url == "" then
  ngx.say('{"tools":[]}')
  return
end

-- ── MCP tools/list aufrufen ────────────────────────────────────────────────────
local httpc = http.new()
httpc:set_timeout(15000)

local res, err = httpc:request_uri(mcp_url, {
  method  = "POST",
  headers = {
    ["Content-Type"] = "application/json",
    ["Accept"]       = "application/json, text/event-stream",
  },
  body       = cjson.encode({ jsonrpc = "2.0", id = "1", method = "tools/list", params = {} }),
  ssl_verify = true,
})

if not res then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "mcp_unreachable", detail = tostring(err) }))
  return
end

-- ── Antwort parsen (JSON oder SSE) ────────────────────────────────────────────
local function parse_mcp_body(body, content_type)
  if content_type and content_type:find("text/event-stream", 1, true) then
    for line in body:gmatch("[^\n]+") do
      if line:sub(1, 6) == "data: " then
        local d = line:sub(7):match("^%s*(.-)%s*$")
        if d ~= "" and d ~= "[DONE]" then
          local ok2, parsed = pcall(cjson.decode, d)
          if ok2 then return parsed end
        end
      end
    end
    return nil
  end
  local ok2, parsed = pcall(cjson.decode, body)
  return ok2 and parsed or nil
end

local ct     = res.headers["Content-Type"] or res.headers["content-type"] or ""
local parsed = parse_mcp_body(res.body or "", ct)

if not parsed then
  ngx.status = 502
  ngx.say('{"error":"mcp_parse_error","tools":[]}')
  return
end

-- ── MCP inputSchema → Anthropic input_schema ──────────────────────────────────
local raw_tools = (parsed.result and parsed.result.tools) or {}
local tools     = {}

for _, t in ipairs(raw_tools) do
  if type(t) == "table" and type(t.name) == "string" then
    table.insert(tools, {
      name         = t.name,
      description  = t.description or "",
      input_schema = t.inputSchema or { type = "object", properties = {}, required = {} },
    })
  end
end

ngx.say(cjson.encode({ tools = tools }))
