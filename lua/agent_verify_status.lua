-- /etc/openresty/lua/agent_verify_status.lua
-- GET /api/agent/verify/status?id=<challenge_id>  (vault_auth)
-- Agent pollt nach Verifikations-Status.

local cjson      = require("cjson.safe")
local soul_id    = ngx.ctx.soul_id
local VERIFY_DIR = "/var/lib/sys/verify/"

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.header["Access-Control-Allow-Origin"]  = "*"
ngx.header["Access-Control-Allow-Methods"] = "POST, OPTIONS"
ngx.header["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Webhook-Token"

if ngx.req.get_method() == "OPTIONS" then ngx.status = 204; return end
if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

ngx.req.read_body()
local raw = ngx.req.get_body_data()
if not raw then
  local tmp = ngx.req.get_body_file()
  if tmp then local f = io.open(tmp,"r"); if f then raw=f:read("*a"); f:close() end end
end
local ok_b, body = pcall(require("cjson.safe").decode, raw or "")
local challenge_id = (ok_b and type(body) == "table") and (body.id or body.challenge_id) or ngx.var.arg_id
if type(challenge_id) ~= "string" or #challenge_id ~= 32 then
  ngx.status = 400; ngx.say('{"error":"invalid_id"}'); return
end

local fpath = VERIFY_DIR .. soul_id .. "_" .. challenge_id .. ".json"
local f = io.open(fpath, "r")
if not f then ngx.status = 404; ngx.say('{"error":"not_found"}'); return end
local raw = f:read("*a"); f:close()

local ok, d = pcall(cjson.decode, raw)
if not ok or type(d) ~= "table" then
  ngx.status = 500; ngx.say('{"error":"corrupt"}'); return
end
if d.soul_id ~= soul_id then
  ngx.status = 403; ngx.say('{"error":"forbidden"}'); return
end

ngx.say(cjson.encode({
  ok       = true,
  status   = d.status or "pending",
  verified = (d.status == "verified"),
  score    = d.score or 0,
}))
