-- /etc/openresty/lua/soul_pay_manual.lua
-- POST /api/soul/pay/manual  (soul_cert auth via soul_auth.lua — owner-only)
-- Stellt manuell ein Zugriffs-Token aus, nachdem der Soul-Inhaber eine Zahlung
-- außerhalb des Systems (PayPal, Überweisung, ...) selbst geprüft hat. Kein
-- automatischer Zahlungsnachweis — bewusst identisch zum POL-Token-Format,
-- damit registerPaidTools/pol_token_check unverändert greifen.
--
-- Der Token-Ausstellungsblock ist absichtlich aus soul_pay.lua dupliziert statt
-- extrahiert, damit der bestehende, funktionierende POL-Zahlungsweg beim Bau
-- dieses Features nicht angefasst werden muss.

local cjson   = require("cjson.safe")
local random  = require("resty.random")
local str     = require("resty.string")
local soul_id = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"Method not allowed"}')
  return
end

ngx.req.read_body()
local body = ngx.req.get_body_data()
local ok_b, incoming = pcall(cjson.decode, body or "")
if not ok_b or type(incoming) ~= "table" then
  ngx.status = 400
  ngx.say('{"error":"Invalid JSON"}')
  return
end

local note = type(incoming.note) == "string" and incoming.note:match("^%s*(.-)%s*$"):sub(1, 200) or ""

-- ── EU-Widerrufsrecht: Referenz-ID technisch erzwingen ───────────────────────
-- Ohne existierenden Consent-Beleg (aus accept_digital_content_terms) kein Token —
-- verhindert, dass der EU-Pflichtschritt einfach übersprungen wird.
local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
local reference_id = type(incoming.reference_id) == "string" and incoming.reference_id:match("^%s*(.-)%s*$") or nil

if not reference_id or not reference_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.say(cjson.encode({
    error   = "reference_id_required",
    message = "Referenz-ID aus accept_digital_content_terms erforderlich — der Käufer muss zuerst der Widerrufsbelehrung zustimmen.",
  }))
  return
end

local consent_path = "/var/lib/sys/souls/" .. soul_id .. "/consent_docs/" .. reference_id .. ".pdf"
local cf = io.open(consent_path, "r")
if not cf then
  ngx.status = 404
  ngx.say(cjson.encode({
    error   = "consent_not_found",
    message = "Keine Einwilligung mit dieser Referenz-ID gefunden — accept_digital_content_terms wurde für sie nicht aufgerufen.",
  }))
  return
end
cf:close()

-- ── Zugriffs-Token ausstellen (dupliziert aus soul_pay.lua) ──────────────────
local days      = math.max(1, math.min(30, tonumber(incoming.token_duration_days) or 1))
local TOKEN_TTL = days * 86400
local token_bytes = random.bytes(24, true)
local access_token = str.to_hex(token_bytes)
local expires_at   = ngx.now() + TOKEN_TTL
local expires_iso  = os.date("!%Y-%m-%dT%H:%M:%SZ", math.floor(expires_at))

local token_data = cjson.encode({
  soul_id        = soul_id,
  tx_hash        = "manual:" .. os.time() .. "-" .. str.to_hex(random.bytes(4, true)),
  pol_amount     = cjson.null,
  from           = (note ~= "" and note) or "manual",
  payment_method = "manual",
  reference_id   = reference_id,
  issued_at      = os.date("!%Y-%m-%dT%H:%M:%SZ"),
  expires_at     = expires_iso,
})

local access_cache = ngx.shared.pol_access
access_cache:set("tok:" .. access_token, token_data, TOKEN_TTL)

-- Token auch als Datei speichern (damit soul-mcp Node.js direkt lesen kann)
os.execute("mkdir -p /var/lib/sys/pol_tokens")
local tf = io.open("/var/lib/sys/pol_tokens/" .. access_token .. ".json", "w")
if tf then tf:write(token_data); tf:close() end
-- Abgelaufene Token-Dateien aufräumen (async, Fehler ignorieren)
os.execute("find /var/lib/sys/pol_tokens/ -name '*.json' -mmin +" .. math.ceil(TOKEN_TTL/60) .. " -delete 2>/dev/null &")

ngx.say(cjson.encode({ ok = true, access_token = access_token, expires_at = expires_iso }))
