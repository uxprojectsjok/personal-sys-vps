-- /etc/openresty/lua/verify_2fa.lua
-- POST /api/verify/2fa  (soul_cert auth)
-- Speichert Wallet-Signatur als zweiten Faktor für eine bestehende Challenge.
-- Body: { challenge_id, signature, address }
-- Returns: { ok, challenge_id, verified_level: "2fa" }

local cjson      = require("cjson.safe")
local soul_id    = ngx.ctx.soul_id
local VERIFY_DIR = "/var/lib/sys/verify/"

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

ngx.req.read_body()
local body_raw = ngx.req.get_body_data()
if not body_raw then
  local tmp = ngx.req.get_body_file()
  if tmp then local fh=io.open(tmp,"r"); if fh then body_raw=fh:read("*a"); fh:close() end end
end

local ok_b, body = pcall(cjson.decode, body_raw or "")
if not ok_b or type(body) ~= "table" then
  ngx.status = 400; ngx.say('{"error":"invalid_body"}'); return
end

local challenge_id    = body.challenge_id
local identity_proof  = body.identity_proof  -- vollständiger proveIdentity()-Proof
-- Fallback: altes Format { signature, address }
local signature = (type(identity_proof) == "table" and identity_proof.signature) or body.signature
local address   = (type(identity_proof) == "table" and identity_proof.wallet)    or body.address

if type(challenge_id) ~= "string" or #challenge_id ~= 32 then
  ngx.status = 400; ngx.say('{"error":"invalid_challenge_id"}'); return
end
if type(signature) ~= "string" or #signature < 10 then
  ngx.status = 400; ngx.say('{"error":"invalid_signature"}'); return
end
if type(address) ~= "string" or not address:match("^0x[0-9a-fA-F]+$") then
  ngx.status = 400; ngx.say('{"error":"invalid_address"}'); return
end

local fpath = VERIFY_DIR .. soul_id .. "_" .. challenge_id .. ".json"
local f = io.open(fpath, "r")
if not f then
  -- Standalone-2FA (kein biometrisches Challenge): einfach speichern
  os.execute("mkdir -p " .. VERIFY_DIR)
  local now = os.date("!%Y-%m-%dT%TZ", math.floor(ngx.now()))
  local data_new = cjson.encode({
    soul_id        = soul_id,
    challenge_id   = challenge_id,
    method         = "wallet_2fa",
    status         = "verified",
    verified_level = "2fa",
    created_at     = now,
    verified_at    = now,
    identity_proof = identity_proof,
    wallet_2fa     = {
      address      = address,
      signature    = signature,
      signed_at    = now,
      anchor_count = (type(identity_proof)=="table" and identity_proof.anchorCount) or 0,
      schema       = (type(identity_proof)=="table" and identity_proof.schema) or "simple",
    },
  })
  local fw = io.open(fpath, "w"); if fw then fw:write(data_new); fw:close() end
  ngx.say(cjson.encode({ ok=true, challenge_id=challenge_id, verified_level="2fa" }))
  return
end
local raw = f:read("*a"); f:close()

local ok_d, d = pcall(cjson.decode, raw)
if not ok_d or type(d) ~= "table" then
  ngx.status = 500; ngx.say('{"error":"corrupt_challenge"}'); return
end
if d.soul_id ~= soul_id then
  ngx.status = 403; ngx.say('{"error":"forbidden"}'); return
end

local now = os.date("!%Y-%m-%dT%TZ", math.floor(ngx.now()))
d.verified_level  = "2fa"
d.identity_proof  = identity_proof  -- vollständiger Proof inkl. soulId, anchorCount, etc.
d.wallet_2fa = {
  address     = address,
  signature   = signature,
  signed_at   = now,
  anchor_count = (type(identity_proof)=="table" and identity_proof.anchorCount) or 0,
  schema      = (type(identity_proof)=="table" and identity_proof.schema) or "simple",
}

local ok_e, updated = pcall(cjson.encode, d)
if not ok_e then ngx.status=500; ngx.say('{"error":"encode_failed"}'); return end
local fw = io.open(fpath, "w"); if fw then fw:write(updated); fw:close() end

ngx.say(cjson.encode({ ok=true, challenge_id=challenge_id, verified_level="2fa" }))
