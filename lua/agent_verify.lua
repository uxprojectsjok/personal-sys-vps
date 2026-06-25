-- /etc/openresty/lua/agent_verify.lua
-- POST /api/agent/verify  (vault_auth: webhook_token)
-- Erstellt eine Verify-Challenge und gibt die URL zurück.
-- Agent sagt dem Nutzer: "Bitte öffne diesen Link und verifiziere dich."

local cjson  = require("cjson.safe")
local random = require("resty.random")
local str    = require("resty.string")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.header["Access-Control-Allow-Origin"]  = "*"
ngx.header["Access-Control-Allow-Methods"] = "POST, OPTIONS"
ngx.header["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Webhook-Token"

if ngx.req.get_method() == "OPTIONS" then ngx.status = 204; return end
if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local soul_id    = ngx.ctx.soul_id
local VERIFY_DIR = "/var/lib/sys/verify/"
local TTL        = 300

os.execute("mkdir -p " .. VERIFY_DIR)

local id_bytes     = random.bytes(16, true)
local challenge_id = str.to_hex(id_bytes)
local vt_bytes     = random.bytes(24, true)
local verify_token = str.to_hex(vt_bytes)
local now          = math.floor(ngx.now())
local expires_at   = os.date("!%Y-%m-%dT%TZ", now + TTL)
local created_at   = os.date("!%Y-%m-%dT%TZ", now)

local vc = ngx.shared.verify_cache
if vc then vc:set("vt:" .. verify_token, soul_id, TTL) end
local vt_file = io.open(VERIFY_DIR .. "vt_" .. verify_token, "w")
if vt_file then vt_file:write(soul_id); vt_file:close() end

local data = cjson.encode({
  soul_id           = soul_id,
  challenge_id      = challenge_id,
  method            = "all",
  required_methods  = cjson.empty_array,
  completed_methods = cjson.empty_array,
  status            = "pending",
  score             = 0,
  created_at        = created_at,
  expires_at        = expires_at,
  expires_unix      = now + TTL,
  verified_at       = cjson.null,
  verify_token      = verify_token,
})

local f = io.open(VERIFY_DIR .. soul_id .. "_" .. challenge_id .. ".json", "w")
if not f then
  ngx.status = 500; ngx.say('{"error":"storage_failed"}'); return
end
f:write(data); f:close()

-- Push-Benachrichtigung (Best-Effort — Challenge läuft auch ohne Push via /verbindung-Polling)
local http = require("resty.http")
do
  local hc = http.new()
  hc:set_timeout(2000)
  local push_res = hc:request_uri("http://127.0.0.1:3098/internal/send-push", {
    method  = "POST",
    headers = { ["Content-Type"] = "application/json" },
    body    = cjson.encode({
      soul_id = soul_id,
      title   = "Verifikationsanfrage",
      body    = "Eine KI-Anwendung möchte deine Identität bestätigen.",
      url     = "/verbindung",
    }),
  })
  -- Push-Fehler werden ignoriert — Challenge ist bereits gespeichert und über /verbindung sichtbar
end

ngx.say(cjson.encode({
  ok           = true,
  challenge_id = challenge_id,
  expires_at   = expires_at,
}))
