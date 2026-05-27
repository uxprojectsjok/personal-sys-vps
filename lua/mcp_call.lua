-- /etc/openresty/lua/mcp_call.lua
-- POST /api/mcp-call
-- Ruft ein Tool auf dem konfigurierten externen MCP-Server auf (z.B. Zapier).
-- Auth: soul_cert Bearer (soul_auth.lua)
-- Body:   { "name": "tool_name", "input": { ... } }
-- Antwort: { "content": [{ "type": "text", "text": "..." }], "isError": false }

local cjson   = require("cjson.safe")
local http    = require("resty.http")
local soul_id = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
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
  ngx.status = 400
  ngx.say('{"error":"mcp_url_not_configured"}')
  return
end

-- ── Request-Body lesen ────────────────────────────────────────────────────────
ngx.req.read_body()
local raw = ngx.req.get_body_data() or "{}"
local ok, body = pcall(cjson.decode, raw)
if not ok or type(body) ~= "table" then
  ngx.status = 400
  ngx.say('{"error":"invalid_json"}')
  return
end

local tool_name = body.name
local input     = body.input or {}

if type(tool_name) ~= "string" or tool_name == "" then
  ngx.status = 400
  ngx.say('{"error":"name_missing"}')
  return
end

-- ── MCP tools/call aufrufen ────────────────────────────────────────────────────
local httpc = http.new()
httpc:set_timeout(30000)

local req_body = cjson.encode({
  jsonrpc = "2.0",
  id      = tostring(ngx.now()):gsub("%.", ""),
  method  = "tools/call",
  params  = { name = tool_name, arguments = input },
})

local res, err = httpc:request_uri(mcp_url, {
  method  = "POST",
  headers = {
    ["Content-Type"] = "application/json",
    ["Accept"]       = "application/json, text/event-stream",
  },
  body       = req_body,
  ssl_verify = true,
})

if not res then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "mcp_unreachable", detail = tostring(err) }))
  return
end

-- ── Antwort parsen (JSON oder SSE) ────────────────────────────────────────────
local function parse_mcp_body(body_str, content_type)
  if content_type and content_type:find("text/event-stream", 1, true) then
    for line in body_str:gmatch("[^\n]+") do
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
  local ok2, parsed = pcall(cjson.decode, body_str)
  return ok2 and parsed or nil
end

local ct     = res.headers["Content-Type"] or res.headers["content-type"] or ""
local parsed = parse_mcp_body(res.body or "", ct)

if not parsed then
  ngx.status = 502
  ngx.say('{"error":"mcp_parse_error","content":[{"type":"text","text":"MCP parse error"}],"isError":true}')
  return
end

-- ── Ergebnis extrahieren ──────────────────────────────────────────────────────
local result   = (parsed.result) or {}
local is_error = result.isError == true

local parts = type(result.content) == "table" and result.content or {}
local texts  = {}
for _, p in ipairs(parts) do
  if type(p) == "table" and p.type == "text" and type(p.text) == "string" then
    table.insert(texts, p.text)
  end
end

local text = #texts > 0 and table.concat(texts, "\n") or cjson.encode(result)

ngx.say(cjson.encode({
  content  = { { type = "text", text = text } },
  isError  = is_error,
}))
