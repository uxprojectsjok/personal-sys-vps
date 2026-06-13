-- /etc/openresty/lua/verify_complete.lua
-- POST /api/verify/complete  (soul_cert auth)
-- App sendet biometrisches Ergebnis → Challenge wird abgeschlossen.
-- Body: { challenge_id, method, verified }
-- Response: { ok, challenge_id, verified, method, verified_at }

local cjson      = require("cjson.safe")
local soul_id    = ngx.ctx.soul_id
local VERIFY_DIR = "/var/lib/sys/verify/"
os.execute("mkdir -p " .. VERIFY_DIR)

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

ngx.req.read_body()
local body_raw = ngx.req.get_body_data() or ngx.req.get_body_file() and "" or ""
if body_raw == "" then
  local tmp = ngx.req.get_body_file()
  if tmp then local fh=io.open(tmp,"r"); if fh then body_raw=fh:read("*a"); fh:close() end end
end

local ok_b, body = pcall(cjson.decode, body_raw)
if not ok_b or type(body) ~= "table" then
  ngx.status = 400; ngx.say('{"error":"invalid_body"}'); return
end

local challenge_id = body.challenge_id
local verified     = body.verified == true
local method       = body.method or "fingerprint"

if type(challenge_id) ~= "string" or #challenge_id ~= 32 then
  ngx.status = 400; ngx.say('{"error":"invalid_challenge_id"}'); return
end

local fpath = VERIFY_DIR .. soul_id .. "_" .. challenge_id .. ".json"
local f = io.open(fpath, "r")
if not f then
  ngx.status = 404; ngx.say('{"error":"challenge_not_found"}'); return
end
local raw = f:read("*a"); f:close()

local ok_d, d = pcall(cjson.decode, raw)
if not ok_d or type(d) ~= "table" then
  ngx.status = 500; ngx.say('{"error":"corrupt_challenge"}'); return
end
if d.soul_id ~= soul_id then
  ngx.status = 403; ngx.say('{"error":"forbidden"}'); return
end
if d.status ~= "pending" then
  ngx.status = 409; ngx.say('{"error":"already_completed","status":' .. cjson.encode(d.status) .. '}'); return
end

local verified_at = os.date("!%Y-%m-%dT%TZ", math.floor(ngx.now()))
d.status      = verified and "verified" or "failed"
d.verified_at = verified_at
d.method      = method

local ok_e, updated = pcall(cjson.encode, d)
if not ok_e then
  ngx.status = 500; ngx.say('{"error":"encode_failed"}'); return
end
local fw = io.open(fpath, "w")
if not fw then
  ngx.status = 500; ngx.say('{"error":"write_failed"}'); return
end
fw:write(updated); fw:close()

ngx.say(cjson.encode({
  ok           = true,
  challenge_id = challenge_id,
  verified     = verified,
  method       = method,
  verified_at  = verified_at,
}))
