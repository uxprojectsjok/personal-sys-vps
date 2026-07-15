-- /etc/openresty/lua/verify_passkey_register.lua
-- POST /api/verify/passkey-register  (soul_cert auth)
-- Speichert den bei der Passkey-Erstellung erzeugten Public Key (SPKI-DER,
-- base64url) server-seitig — Voraussetzung dafür, dass verify_fingerprint_check.lua
-- später eine echte Signatur prüfen kann, statt dem Client zu vertrauen.
-- Body: { credential_id, public_key (base64url SPKI-DER), alg }
--
-- Mehrere Passkeys pro Soul möglich (mehrere Geräte) — alle unter credential_id
-- als Key in derselben Datei.

local cjson = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

ngx.req.read_body()
local body_raw = ngx.req.get_body_data() or ""
local ok_b, body = pcall(cjson.decode, body_raw)
if not ok_b or type(body) ~= "table"
  or type(body.credential_id) ~= "string" or body.credential_id == ""
  or type(body.public_key) ~= "string" or body.public_key == "" then
  ngx.status = 400; ngx.say('{"error":"invalid_body"}'); return
end

-- Public Key ist Rohdaten, keine geheime Information — trotzdem knapp validieren,
-- dass es sich um plausible base64url-Zeichen handelt (kein Freitext-Injection-Ziel,
-- landet aber in einer JSON-Datei, die später wieder decodiert wird).
if not body.credential_id:match("^[A-Za-z0-9_-]+$") or not body.public_key:match("^[A-Za-z0-9_-]+$") then
  ngx.status = 400; ngx.say('{"error":"invalid_encoding"}'); return
end

local SOULS_DIR = "/var/lib/sys/souls/"
local dir  = SOULS_DIR .. soul_id
local path = dir .. "/passkeys.json"

os.execute("mkdir -p " .. dir)

local passkeys = {}
local f = io.open(path, "r")
if f then
  local raw = f:read("*a"); f:close()
  local ok_p, parsed = pcall(cjson.decode, raw)
  if ok_p and type(parsed) == "table" then passkeys = parsed end
end

passkeys[body.credential_id] = {
  public_key = body.public_key,
  alg        = body.alg,
  created_at = os.date("!%Y-%m-%dT%TZ"),
}

local ok_e, enc = pcall(cjson.encode, passkeys)
if not ok_e then
  ngx.status = 500; ngx.say('{"error":"encode_failed"}'); return
end
local wf = io.open(path, "w")
if not wf then
  ngx.status = 500; ngx.say('{"error":"write_failed"}'); return
end
wf:write(enc); wf:close()

ngx.say(cjson.encode({ ok = true }))
