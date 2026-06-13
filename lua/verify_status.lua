-- /etc/openresty/lua/verify_status.lua
-- GET /api/verify/status?id=<challenge_id>  (soul_cert auth)
-- Gibt vollständige Challenge zurück (für MCP ethers.js 2FA-Verifikation).

local cjson      = require("cjson.safe")
local soul_id    = ngx.ctx.soul_id
local VERIFY_DIR = "/var/lib/sys/verify/"

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local challenge_id = ngx.var.arg_id
if type(challenge_id) ~= "string" or #challenge_id ~= 32 then
  ngx.status = 400; ngx.say('{"error":"invalid_id"}'); return
end

local fpath = VERIFY_DIR .. soul_id .. "_" .. challenge_id .. ".json"
local f = io.open(fpath, "r")
if not f then ngx.status=404; ngx.say('{"error":"not_found"}'); return end
local raw = f:read("*a"); f:close()

local ok_d, d = pcall(cjson.decode, raw)
if not ok_d or type(d) ~= "table" then
  ngx.status = 500; ngx.say('{"error":"corrupt"}'); return
end
if d.soul_id ~= soul_id then ngx.status=403; ngx.say('{"error":"forbidden"}'); return end

-- Registered wallet aus api_context.json anhängen (für MCP-Verifikation)
local ctx_path = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
local cf = io.open(ctx_path, "r")
if cf then
  local craw = cf:read("*a"); cf:close()
  local ok_c, ctx = pcall(cjson.decode, craw)
  if ok_c and type(ctx) == "table" and type(ctx.verified_wallet) == "string" then
    d.registered_wallet = ctx.verified_wallet
  end
end

ngx.say(cjson.encode(d))
