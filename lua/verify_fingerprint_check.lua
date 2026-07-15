-- /etc/openresty/lua/verify_fingerprint_check.lua
-- POST /api/verify/fingerprint-check  (soul_cert auth)
-- Prüft eine WebAuthn-Assertion serverseitig gegen den bei der Passkey-Registrierung
-- hinterlegten Public Key (siehe verify_passkey_register.lua) UND gegen die
-- server-ausgestellte Challenge aus der Verify-Challenge-Datei (siehe
-- verify_challenge.lua) — ohne diese beiden Prüfungen könnte ein Client
-- einfach "verified: true" für method=fingerprint an /api/verify/complete posten,
-- ohne dass je ein echter Fingerabdruck/Face-ID-Scan stattfand (siehe Sicherheitsfix
-- von heute, gleiches Muster wie voice_hq_digits_verified und face_check_verified).
--
-- Body: { challenge_id, credential_id, client_data_json, authenticator_data, signature }
--   (credential_id/client_data_json/authenticator_data/signature sind base64url,
--    exakt wie vom Browser über useSoulPasskey.js/authenticatePasskey() geliefert)
-- Returns: { match: bool, reason?: string }

local cjson  = require("cjson.safe")
local pkey   = require("resty.openssl.pkey")
local digest = require("resty.openssl.digest")
local soul_id = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local function b64url_decode(s)
  if type(s) ~= "string" then return nil end
  local padded = s:gsub("-", "+"):gsub("_", "/")
  local rem = #padded % 4
  if rem == 2 then padded = padded .. "==" elseif rem == 3 then padded = padded .. "=" end
  return ngx.decode_base64(padded)
end

ngx.req.read_body()
local body_raw = ngx.req.get_body_data() or ""
local ok_b, body = pcall(cjson.decode, body_raw)
if not ok_b or type(body) ~= "table"
  or type(body.challenge_id) ~= "string"
  or type(body.credential_id) ~= "string"
  or type(body.client_data_json) ~= "string"
  or type(body.authenticator_data) ~= "string"
  or type(body.signature) ~= "string" then
  ngx.status = 400; ngx.say('{"error":"invalid_body"}'); return
end

-- ── Challenge laden ───────────────────────────────────────────────────────────
local VERIFY_DIR = "/var/lib/sys/verify/"
local cpath = VERIFY_DIR .. soul_id .. "_" .. body.challenge_id .. ".json"
local cf = io.open(cpath, "r")
if not cf then
  ngx.status = 404; ngx.say(cjson.encode({ match = false, reason = "challenge_not_found" })); return
end
local craw = cf:read("*a"); cf:close()
local ok_c, cdata = pcall(cjson.decode, craw)
if not ok_c or type(cdata) ~= "table" or cdata.soul_id ~= soul_id then
  ngx.status = 403; ngx.say(cjson.encode({ match = false, reason = "forbidden" })); return
end
if type(cdata.webauthn_challenge) ~= "string" or cdata.webauthn_challenge == "" then
  ngx.status = 500; ngx.say(cjson.encode({ match = false, reason = "no_challenge_on_record" })); return
end

-- ── Public Key laden ──────────────────────────────────────────────────────────
local ppath = "/var/lib/sys/souls/" .. soul_id .. "/passkeys.json"
local pf = io.open(ppath, "r")
if not pf then
  ngx.say(cjson.encode({ match = false, reason = "no_passkey_registered" })); return
end
local praw = pf:read("*a"); pf:close()
local ok_p, passkeys = pcall(cjson.decode, praw)
if not ok_p or type(passkeys) ~= "table" then
  ngx.status = 500; ngx.say(cjson.encode({ match = false, reason = "passkey_store_corrupt" })); return
end
local entry = passkeys[body.credential_id]
if not entry or type(entry.public_key) ~= "string" then
  ngx.say(cjson.encode({ match = false, reason = "unknown_credential" })); return
end

local pub_der = b64url_decode(entry.public_key)
if not pub_der then
  ngx.status = 500; ngx.say(cjson.encode({ match = false, reason = "public_key_decode_failed" })); return
end
local pub, pkey_err = pkey.new(pub_der)
if not pub then
  ngx.log(ngx.ERR, "[verify_fingerprint_check] pkey.new failed: ", tostring(pkey_err))
  ngx.status = 500; ngx.say(cjson.encode({ match = false, reason = "public_key_load_failed" })); return
end

-- ── clientDataJSON prüfen: Typ, Challenge, Origin ────────────────────────────
local client_data_raw = b64url_decode(body.client_data_json)
local auth_data_raw   = b64url_decode(body.authenticator_data)
local sig_raw          = b64url_decode(body.signature)
if not client_data_raw or not auth_data_raw or not sig_raw then
  ngx.status = 400; ngx.say(cjson.encode({ match = false, reason = "decode_failed" })); return
end

local ok_cd, client_data = pcall(cjson.decode, client_data_raw)
if not ok_cd or type(client_data) ~= "table" then
  ngx.say(cjson.encode({ match = false, reason = "invalid_client_data" })); return
end

if client_data.type ~= "webauthn.get" then
  ngx.say(cjson.encode({ match = false, reason = "wrong_ceremony_type" })); return
end

-- Challenge im clientDataJSON ist selbst base64url-kodiert (WebAuthn-Spec) —
-- direkter String-Vergleich reicht, beide Seiten nutzen dieselbe Kodierung.
if client_data.challenge ~= cdata.webauthn_challenge then
  ngx.say(cjson.encode({ match = false, reason = "challenge_mismatch" })); return
end

local expected_origin = "https://" .. (ngx.var.host or "")
if client_data.origin ~= expected_origin then
  ngx.say(cjson.encode({ match = false, reason = "origin_mismatch" })); return
end

-- ── Signatur verifizieren ─────────────────────────────────────────────────────
-- WebAuthn-Signatur läuft über authenticatorData || SHA256(clientDataJSON).
local d = digest.new("sha256")
d:update(client_data_raw)
local client_data_hash = d:final()
local signed_message = auth_data_raw .. client_data_hash

local verify_ok, verify_err = pub:verify(sig_raw, signed_message, "sha256")
if not verify_ok then
  if verify_err then ngx.log(ngx.ERR, "[verify_fingerprint_check] verify error: ", tostring(verify_err)) end
  ngx.say(cjson.encode({ match = false, reason = "signature_invalid" })); return
end

-- ── Serverbeweis in die Challenge-Datei schreiben (Gegencheck in verify_complete.lua) ──
cdata.fingerprint_verified = true
local ok_e, enc = pcall(cjson.encode, cdata)
if ok_e then
  local wf = io.open(cpath, "w")
  if wf then wf:write(enc); wf:close() end
end

ngx.say(cjson.encode({ match = true }))
