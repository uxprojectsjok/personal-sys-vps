-- /etc/openresty/lua/soul_chain_metrics.lua
-- GET /api/soul/chain-metrics[?soul_id=<uuid>]
-- Öffentlich (kein Auth) — Daten liegen ohnehin on-chain auf Polygon.
-- soul_id: aus Query-Param oder Single-Hoster-Fallback (wie soul_price.lua).

local cjson      = require("cjson.safe")
local SOULS_DIR  = "/var/lib/sys/souls/"
local NODE_BIN   = "/usr/bin/node"
local CLI_SCRIPT = "/opt/sys/soul-mcp/soul_chain_metrics_cli.mjs"

ngx.header["Content-Type"]                = "application/json"
ngx.header["Cache-Control"]               = "no-store"
ngx.header["Access-Control-Allow-Origin"] = "*"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local args    = ngx.req.get_uri_args()
local soul_id = args.soul_id or ngx.ctx.soul_id

if not soul_id or not soul_id:match("^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$") then
  -- Single-Hoster: soul_id aus Verzeichnis ableiten
  local p = io.popen("ls " .. SOULS_DIR .. " 2>/dev/null")
  if p then
    for d in p:lines() do
      if d:match("^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$") then
        soul_id = d; break
      end
    end
    p:close()
  end
end

if not soul_id then
  ngx.status = 400; ngx.say('{"error":"soul_id required"}'); return
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
