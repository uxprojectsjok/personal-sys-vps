-- /etc/openresty/lua/soul_chain_metrics.lua
-- GET /api/soul/chain-metrics
-- Gibt Genesis-Block, Chain-Age-Blocks, Knowledge-Blocks und Anchor-Count zurück.
-- Auth: soul_auth.lua (soul_cert via ngx.ctx.soul_id)

local cjson      = require("cjson.safe")
local soul_id    = ngx.ctx.soul_id
local NODE_BIN   = "/usr/bin/node"
local CLI_SCRIPT = "/opt/sys/soul-mcp/soul_chain_metrics_cli.mjs"

if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unauthorized"}')
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local cmd = NODE_BIN .. " " .. CLI_SCRIPT .. " " .. soul_id .. " 2>/dev/null"
local pipe = io.popen(cmd, "r")
if not pipe then
  ngx.status = 500; ngx.say('{"error":"node_unavailable"}'); return
end
local result_raw = pipe:read("*a"); pipe:close()

local ok_r, result = pcall(cjson.decode, result_raw)
if not ok_r or type(result) ~= "table" then
  ngx.status = 500
  ngx.say(cjson.encode({ error = "parse_failed", raw = (result_raw or ""):sub(1, 120) }))
  return
end

ngx.say(cjson.encode(result))
