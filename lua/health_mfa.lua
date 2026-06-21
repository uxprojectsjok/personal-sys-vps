-- POST /api/health/mfa  { code: "123456" }
-- Schreibt MFA-Code in die Warte-Datei für garmin_login.py
-- Auth: vault_auth.lua (soul_cert)

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if not soul_id then
  ngx.status = 401; ngx.say('{"error":"unauthorized"}'); return
end

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

ngx.req.read_body()
local ok_b, body = pcall(cjson.decode, ngx.req.get_body_data() or "")
if not ok_b or type(body) ~= "table" then
  ngx.status = 400; ngx.say('{"error":"invalid_json"}'); return
end

local code = tostring(body.code or ""):match("^%s*(.-)%s*$")
if not code or #code < 4 then
  ngx.status = 400; ngx.say('{"error":"code_required (min 4 chars)"}'); return
end

local mfa_file    = "/tmp/garmin_mfa_code_" .. soul_id
local status_file = "/tmp/garmin_login_status_" .. soul_id

-- Prüfen ob Login-Prozess überhaupt wartet
local sf = io.open(status_file, "r")
local status = sf and sf:read("*a"):match("^%s*(.-)%s*$") or ""
if sf then sf:close() end

if status ~= "waiting_mfa" and status ~= "mfa_received" and status ~= "" then
  ngx.status = 409
  ngx.say(cjson.encode({ error = "Kein aktiver Garmin-Login-Prozess wartet auf MFA." }))
  return
end

local mf = io.open(mfa_file, "w")
if not mf then
  ngx.status = 500; ngx.say('{"error":"Konnte MFA-Datei nicht schreiben"}'); return
end
mf:write(code); mf:close()

-- Kurz warten und Status prüfen
ngx.sleep(3)
local sf2 = io.open(status_file, "r")
local new_status = sf2 and sf2:read("*a"):match("^%s*(.-)%s*$") or "pending"
if sf2 then sf2:close() end

if new_status == "ok" then
  ngx.say('{"ok":true,"message":"Login erfolgreich. Tokens gespeichert."}')
elseif new_status:sub(1, 6) == "error:" then
  ngx.status = 422
  ngx.say(cjson.encode({ error = new_status:sub(7) }))
else
  -- Prozess läuft noch (Login dauert)
  ngx.say('{"ok":true,"pending":true,"message":"Code übermittelt — Login läuft…"}')
end
