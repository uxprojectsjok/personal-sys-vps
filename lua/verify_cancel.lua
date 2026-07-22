-- /etc/openresty/lua/verify_cancel.lua
-- POST /api/verify/cancel  (soul_cert auth)
-- Bricht eine offene Verifikations-Challenge ab (Nutzer klickt "Abbrechen" auf
-- /connection statt eine ungewollt gestartete Challenge zu Ende zu führen —
-- z.B. wenn ein Voice-Agent verify_identity ausgelöst hat, der Nutzer aber
-- gerade nicht verifizieren will/kann). Ein wartender Poller (verify_identity.mjs
-- pollShort) sieht status="cancelled" beim nächsten Poll und bricht sofort ab,
-- statt bis zum natürlichen TTL-Ablauf zu warten.
-- Body: { challenge_id }

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
local body_raw = ngx.req.get_body_data() or ""
if body_raw == "" then
  local tmp = ngx.req.get_body_file()
  if tmp then local fh=io.open(tmp,"r"); if fh then body_raw=fh:read("*a"); fh:close() end end
end

local ok_b, body = pcall(cjson.decode, body_raw)
if not ok_b or type(body) ~= "table" then
  ngx.status = 400; ngx.say('{"error":"invalid_body"}'); return
end

local challenge_id = body.challenge_id
if type(challenge_id) ~= "string" or #challenge_id ~= 32 then
  ngx.status = 400; ngx.say('{"error":"invalid_challenge_id"}'); return
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

-- Bereits verifiziert/abgelaufen/abgebrochen: idempotent — kein Fehler, einfach
-- den aktuellen Stand zurückgeben, statt eine "verified"-Challenge rückwirkend
-- zu entwerten.
if d.status ~= "pending" then
  ngx.say(cjson.encode({ ok = true, status = d.status, challenge_id = challenge_id }))
  return
end

d.status       = "cancelled"
d.cancelled_at = os.date("!%Y-%m-%dT%TZ")

local ok_e, enc = pcall(cjson.encode, d)
if not ok_e then
  ngx.status = 500; ngx.say('{"error":"encode_failed"}'); return
end
local wf = io.open(fpath, "w")
if not wf then
  ngx.status = 500; ngx.say('{"error":"write_failed"}'); return
end
wf:write(enc); wf:close()

ngx.say(cjson.encode({ ok = true, status = "cancelled", challenge_id = challenge_id }))
