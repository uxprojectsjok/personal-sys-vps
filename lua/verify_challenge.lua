-- /etc/openresty/lua/verify_challenge.lua
-- POST /api/verify/challenge  (soul_cert auth)
-- Erstellt eine biometrische Verifikations-Challenge (MCP → App).
-- Body: { methods: ["fingerprint","face","voice"] }  oder  { method: "fingerprint" }
-- Response: { challenge_id, methods, required_methods, expires_at, verify_url, status }

local cjson  = require("cjson.safe")
local random = require("resty.random")
local str    = require("resty.string")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local soul_id    = ngx.ctx.soul_id
local VERIFY_DIR = "/var/lib/sys/verify/"
local TTL        = 300   -- 5 Minuten

ngx.req.read_body()
local body_raw = ngx.req.get_body_data() or ""

-- "voice" (ohne HQ) bewusst NICHT mehr erlaubt — reiner Client-FFT-Vergleich ohne
-- jeden Serverbeweis, trivial über POST /api/verify/complete spoofbar (siehe
-- Sicherheitsfix von heute). voice_hq bietet dieselbe FFT-Prüfung PLUS
-- serverseitig verifizierten Anti-Replay-Zifferncode — kein Sicherheitsverlust,
-- nur der unsichere Pfad fällt weg.
local VALID = { fingerprint = true, face = true, face_hq = true, voice_hq = true }
local methods = {}

if body_raw ~= "" then
  local ok, b = pcall(cjson.decode, body_raw)
  if ok and type(b) == "table" then
    if type(b.methods) == "table" then
      -- Neues Format: methods[]
      for _, m in ipairs(b.methods) do
        local v = type(m) == "string" and m:lower() or ""
        if VALID[v] then
          local dup = false
          for _, e in ipairs(methods) do if e == v then dup = true; break end end
          if not dup then table.insert(methods, v) end
        end
      end
    elseif type(b.method) == "string" then
      -- Altes Format: method (einzeln) — "all" → leeres Array → Auswahl im UI
      local m = b.method:lower()
      if VALID[m] then table.insert(methods, m) end
    end
  end
end

-- Leeres Array = Benutzer wählt Methode(n) selbst im UI
local methods_url = #methods > 0 and table.concat(methods, ",") or "all"

local id_bytes     = random.bytes(16, true)
local challenge_id = str.to_hex(id_bytes)
local vt_bytes     = random.bytes(24, true)
local verify_token = str.to_hex(vt_bytes)
local now          = math.floor(ngx.now())
local expires_at   = os.date("!%Y-%m-%dT%TZ", now + TTL)
local created_at   = os.date("!%Y-%m-%dT%TZ", now)

os.execute("mkdir -p " .. VERIFY_DIR)

-- verify_token im shared dict + als Datei
local vc = ngx.shared.verify_cache
if vc then vc:set("vt:" .. verify_token, soul_id, TTL) end
local vt_file = io.open(VERIFY_DIR .. "vt_" .. verify_token, "w")
if vt_file then vt_file:write(soul_id); vt_file:close() end

local req_methods_encoded = #methods > 0 and methods or cjson.empty_array

-- Falls diese Challenge von einem Service-Token (OAuth-Client) ausgelöst wurde:
-- Token merken, damit verify_complete.lua ihn bei Erfolg als verifiziert markieren kann.
local triggering_token = ngx.ctx.service_token

-- voice_hq: zufälligen 6-stelligen Anti-Replay-Code generieren, den der Nutzer
-- vorlesen muss (siehe verify_voice_hq_check.lua). Muss server-seitig entstehen,
-- sonst könnte eine alte Aufnahme einfach wiederverwendet werden.
local voice_code = nil
for _, m in ipairs(methods) do
  if m == "voice_hq" then
    local digit_bytes = random.bytes(6, true)
    local digits = {}
    for i = 1, 6 do digits[i] = tostring(digit_bytes:byte(i) % 10) end
    voice_code = table.concat(digits)
    break
  end
end

-- WebAuthn-Challenge für fingerprint — MUSS server-seitig entstehen (nicht
-- client-generiert wie vorher), sonst ist die spätere Signaturprüfung in
-- verify_fingerprint_check.lua wirkungslos (Replay wäre trivial möglich).
-- Immer erzeugen, unabhängig von den gewählten Methoden — leere methods[]
-- bedeutet "Nutzer wählt im UI", da könnte fingerprint jederzeit dazukommen.
local webauthn_bytes     = random.bytes(32, true)
local webauthn_challenge = ngx.encode_base64(webauthn_bytes):gsub("+", "-"):gsub("/", "_"):gsub("=+$", "")

local data = cjson.encode({
  soul_id           = soul_id,
  challenge_id      = challenge_id,
  method            = methods[1] or "all",   -- backward compat
  required_methods  = req_methods_encoded,
  completed_methods = cjson.empty_array,
  status            = "pending",
  score             = 0,
  created_at        = created_at,
  expires_at        = expires_at,
  verified_at       = cjson.null,
  verify_token      = verify_token,
  triggering_token  = triggering_token or cjson.null,
  voice_code        = voice_code or cjson.null,
  webauthn_challenge = webauthn_challenge,
})

local f = io.open(VERIFY_DIR .. soul_id .. "_" .. challenge_id .. ".json", "w")
if not f then
  ngx.status = 500; ngx.say('{"error":"storage_failed"}'); return
end
f:write(data); f:close()

local host     = ngx.var.host or "localhost"
local base_url = "https://" .. host

ngx.say(cjson.encode({
  challenge_id     = challenge_id,
  methods          = req_methods_encoded,
  required_methods = req_methods_encoded,
  status           = "pending",
  expires_at       = expires_at,
  verify_token     = verify_token,
  verify_url       = base_url .. "/verify?id=" .. challenge_id .. "&m=" .. methods_url .. "&vt=" .. verify_token,
}))
