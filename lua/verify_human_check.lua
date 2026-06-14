-- /etc/openresty/lua/verify_human_check.lua
-- POST /api/verify/human-check  (vault_auth)
-- Ruft verifyHuman(soul_id) via blockchain.mjs auf → +1 Score wenn on-chain verifiziert.
-- Body: { challenge_id }

local cjson    = require("cjson.safe")
local soul_id  = ngx.ctx.soul_id
local VERIFY_DIR = "/var/lib/sys/verify/"
local NODE_BIN   = "/usr/bin/node"
local CHECK_SCRIPT = "/opt/sys/soul-mcp/check_human.mjs"

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

ngx.req.read_body()
local body_raw = ngx.req.get_body_data() or ""
local ok_b, body = pcall(cjson.decode, body_raw)
if not ok_b or type(body) ~= "table" then
  ngx.status = 400; ngx.say('{"error":"invalid_body"}'); return
end

local challenge_id = body.challenge_id
if type(challenge_id) ~= "string" or #challenge_id ~= 32 then
  ngx.status = 400; ngx.say('{"error":"invalid_challenge_id"}'); return
end

-- Challenge laden
local fpath = VERIFY_DIR .. soul_id .. "_" .. challenge_id .. ".json"
local f = io.open(fpath, "r")
if not f then ngx.status = 404; ngx.say('{"error":"not_found"}'); return end
local raw = f:read("*a"); f:close()

local ok_d, d = pcall(cjson.decode, raw)
if not ok_d or type(d) ~= "table" then
  ngx.status = 500; ngx.say('{"error":"corrupt"}'); return
end
if d.soul_id ~= soul_id then ngx.status = 403; ngx.say('{"error":"forbidden"}'); return end

-- Bereits human-verified? → gecachte Antwort
if d.human_verified == true then
  ngx.say(cjson.encode({ ok=true, cached=true, verified=true, anchor_count=d.human_anchor_count, score=d.score })); return
end

-- Blockchain-Verifikation via bestehendem check_human.mjs
local cmd = NODE_BIN .. " " .. CHECK_SCRIPT .. " " .. soul_id .. " 2>/dev/null"
local pipe = io.popen(cmd, "r")
if not pipe then
  ngx.status = 500; ngx.say('{"error":"node_unavailable"}'); return
end
local result_raw = pipe:read("*a"); pipe:close()

local ok_r, result = pcall(cjson.decode, result_raw)
if not ok_r or type(result) ~= "table" then
  ngx.status = 500; ngx.say('{"error":"blockchain_parse_failed"}'); return
end

if not result.verified then
  ngx.say(cjson.encode({ ok=false, verified=false, reason="no_blockchain_anchor", detail=result.error })); return
end

-- Score +1 schreiben
d.human_verified    = true
d.human_verified_at = os.date("!%Y-%m-%dT%TZ", math.floor(ngx.now()))
d.human_anchor_count = result.anchor_count or 0
d.human_wallet      = result.wallet
d.score             = (type(d.score) == "number" and d.score or 0) + 1

local ok_e, updated = pcall(cjson.encode, d)
if not ok_e then ngx.status = 500; ngx.say('{"error":"encode_failed"}'); return end
local fw = io.open(fpath, "w"); if fw then fw:write(updated); fw:close() end

ngx.say(cjson.encode({
  ok           = true,
  verified     = true,
  anchor_count = result.anchor_count,
  first_anchor = result.first_anchor,
  latest_anchor = result.latest_anchor,
  total_sessions = result.total_sessions,
  wallet       = result.wallet,
  score        = d.score,
}))
