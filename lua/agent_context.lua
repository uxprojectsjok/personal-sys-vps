-- /etc/openresty/lua/agent_context.lua
-- GET /api/agent/context  (vault_auth)
-- Liest soul_read + mind_read via MCP und gibt kombinierten Kontext zurück.

local cjson   = require("cjson.safe")
local http    = require("resty.http")
local soul_id = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.header["Access-Control-Allow-Origin"]  = "*"
ngx.header["Access-Control-Allow-Methods"] = "GET, OPTIONS"
ngx.header["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Webhook-Token"

if ngx.req.get_method() == "OPTIONS" then ngx.status = 204; return end
if ngx.req.get_method() ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local function mcp_call(tool, input)
  local httpc = http.new()
  httpc:set_timeout(15000)
  local payload_ok, payload = pcall(cjson.encode, { tool = tool, input = input })
  if not payload_ok then return nil, "encode_failed" end
  local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/run-tool", {
    method  = "POST",
    headers = { ["Content-Type"] = "application/json", ["x-soul-id"] = soul_id or "" },
    body    = payload,
  })
  if not res then return nil, err end
  local ok, data = pcall(cjson.decode, res.body or "")
  if not ok then return nil, "parse_failed" end
  return data, nil
end

local soul, soul_err = mcp_call("soul_read", { section = "all" })
local mind, mind_err = mcp_call("mind_read", {})

ngx.say(cjson.encode({
  ok   = true,
  soul = soul,
  mind = mind,
  _errors = ((soul_err or mind_err) and { soul = soul_err, mind = mind_err }) or cjson.null,
}))
