-- /etc/openresty/lua/verify_claim.lua
-- POST /api/verify/claim — vault_auth.lua setzt ngx.ctx.soul_id
-- Markiert Challenge als "in Bearbeitung" durch dieses Gerät (client_id).
-- Andere UIs sehen claimed_by beim Status-Poll und schließen sich.

local cjson      = require("cjson.safe")
local soul_id    = ngx.ctx.soul_id
local VERIFY_DIR = "/var/lib/sys/verify/"

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

ngx.req.read_body()
local body_str = ngx.req.get_body_data() or ""
local ok_b, body = pcall(cjson.decode, body_str)
if not ok_b or type(body) ~= "table" then
  ngx.status = 400; ngx.say('{"error":"invalid_body"}'); return
end

local challenge_id = body.challenge_id
local client_id    = body.client_id

if type(challenge_id) ~= "string" or #challenge_id ~= 32 then
  ngx.status = 400; ngx.say('{"error":"invalid_challenge_id"}'); return
end
if type(client_id) ~= "string" or #client_id < 8 then
  ngx.status = 400; ngx.say('{"error":"invalid_client_id"}'); return
end

local fpath = VERIFY_DIR .. soul_id .. "_" .. challenge_id .. ".json"
local f = io.open(fpath, "r")
if not f then ngx.status = 404; ngx.say('{"error":"not_found"}'); return end
local raw = f:read("*a"); f:close()

local ok_d, d = pcall(cjson.decode, raw)
if not ok_d or type(d) ~= "table" then
  ngx.status = 500; ngx.say('{"error":"corrupt"}'); return
end
if d.soul_id ~= soul_id then ngx.status = 403; ngx.say('{"error":"forbidden"}'); return end

-- Bereits von anderem Gerät beansprucht → ablehnen
if type(d.claimed_by) == "string" and d.claimed_by ~= client_id then
  ngx.say(cjson.encode({ ok = false })); return
end

-- Claim setzen (idempotent bei gleichem client_id)
d.claimed_by = client_id
d.claimed_at = os.date("!%Y-%m-%dT%H:%M:%SZ")

local fw = io.open(fpath, "w")
if not fw then ngx.status = 500; ngx.say('{"error":"write_failed"}'); return end
fw:write(cjson.encode(d)); fw:close()

ngx.say(cjson.encode({ ok = true }))
