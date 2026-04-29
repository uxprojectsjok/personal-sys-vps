-- /etc/openresty/lua/soul_pay.lua
-- POST /api/soul/pay
-- Öffentlich (kein soul-cert nötig — zahlender Agent kennt den soul_cert nicht).
-- Body: { soul_id, tx_hash }
-- Prüft TX auf Polygon, stellt Zugriffs-Token aus (1h gültig).
-- Verhindert Replay-Attacks via pol_tx_used shared dict + persistenter Datei.

local cjson  = require("cjson.safe")
local http   = require("resty.http")
local random = require("resty.random")
local str    = require("resty.string")

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

local soul_id = incoming.soul_id
local tx_hash = incoming.tx_hash

-- Validierung
if not soul_id or not soul_id:match("^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$") then
  ngx.status = 400
  ngx.say('{"error":"soul_id required (UUID format)"}')
  return
end
if not tx_hash or not tx_hash:match("^0x[0-9a-fA-F]+$") or #tx_hash ~= 66 then
  ngx.status = 400
  ngx.say('{"error":"tx_hash required (0x + 64 hex chars)"}')
  return
end

local SOULS_DIR = "/var/lib/sys/souls/"
local ctx_file  = SOULS_DIR .. soul_id .. "/api_context.json"

-- api_context.json lesen
local cf = io.open(ctx_file, "r")
if not cf then
  ngx.status = 404
  ngx.say('{"error":"Soul nicht gefunden"}')
  return
end
local raw_ctx = cf:read("*a"); cf:close()
local ok_c, ctx = pcall(cjson.decode, raw_ctx)
if not ok_c or type(ctx) ~= "table" then
  ngx.status = 500
  ngx.say('{"error":"api_context corrupt"}')
  return
end

-- Amortisation aktiv?
local amort = ctx.amortization
if type(amort) ~= "table" then
  ngx.status = 402
  ngx.say('{"error":"payment_not_required","message":"Diese Soul hat Amortisation nicht aktiviert."}')
  return
end
if amort.private == true then
  ngx.status = 403
  ngx.say('{"error":"soul_private","message":"Diese Soul ist nicht öffentlich zugänglich."}')
  return
end
if amort.enabled ~= true then
  ngx.status = 402
  ngx.say('{"error":"payment_not_required","message":"Diese Soul hat Amortisation nicht aktiviert."}')
  return
end

local wallet      = amort.wallet or ""
local pol_per_req = amort.pol_per_request or "0.001"

if not wallet:match("^0x[0-9a-fA-F]+$") then
  ngx.status = 503
  ngx.say('{"error":"Soul-Wallet nicht konfiguriert"}')
  return
end

-- ── Replay-Schutz ─────────────────────────────────────────────────────────────
local tx_cache = ngx.shared.pol_tx_used
local tx_key   = "tx:" .. tx_hash:lower()

if tx_cache:get(tx_key) then
  ngx.status = 409
  ngx.say('{"error":"tx_already_used","message":"Dieser TX-Hash wurde bereits eingelöst."}')
  return
end

-- Persistenter Replay-Schutz (überdauert OpenResty-Neustarts)
local used_file = SOULS_DIR .. soul_id .. "/pol_used_tx.json"
local uf = io.open(used_file, "r")
if uf then
  local used_raw = uf:read("*a"); uf:close()
  local ok_u, used = pcall(cjson.decode, used_raw)
  if ok_u and type(used) == "table" then
    for _, h in ipairs(used) do
      if type(h) == "string" and h:lower() == tx_hash:lower() then
        -- auch im shared dict cachen damit nächster Check schneller ist
        tx_cache:set(tx_key, "1", 172800)
        ngx.status = 409
        ngx.say('{"error":"tx_already_used","message":"Dieser TX-Hash wurde bereits eingelöst."}')
        return
      end
    end
  end
end

-- ── TX auf Polygon verifizieren ───────────────────────────────────────────────
local httpc = http.new()
httpc:set_timeout(15000)

local verify_body = cjson.encode({
  tx_hash     = tx_hash,
  expected_to = wallet,
  min_pol     = pol_per_req,
})

local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/verify-tx", {
  method  = "POST",
  body    = verify_body,
  headers = {
    ["Content-Type"] = "application/json",
    ["Accept"]       = "application/json",
  },
})

if not res or err then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "Blockchain-Verifikation fehlgeschlagen", detail = tostring(err) }))
  return
end

local ok_v, vdata = pcall(cjson.decode, res.body or "")
if not ok_v or type(vdata) ~= "table" then
  ngx.status = 502
  ngx.say('{"error":"Ungültige Antwort vom Verifikationsdienst"}')
  return
end

if res.status ~= 200 or vdata.ok ~= true then
  ngx.status = res.status == 404 and 404 or 422
  ngx.say(cjson.encode({
    error   = vdata.reason or "payment_invalid",
    message = vdata.error or "TX-Verifikation fehlgeschlagen",
    detail  = vdata,
  }))
  return
end

-- ── TX als verwendet markieren ────────────────────────────────────────────────
-- shared dict (TTL 48h)
tx_cache:set(tx_key, "1", 172800)

-- Persistente Datei aktualisieren
local used_list = {}
local uf2 = io.open(used_file, "r")
if uf2 then
  local ur = uf2:read("*a"); uf2:close()
  local ok_u2, ul = pcall(cjson.decode, ur)
  if ok_u2 and type(ul) == "table" then used_list = ul end
end
table.insert(used_list, tx_hash:lower())
-- Max 10.000 Einträge behalten
if #used_list > 10000 then
  local trimmed = {}
  for i = #used_list - 9999, #used_list do trimmed[#trimmed+1] = used_list[i] end
  used_list = trimmed
end
local wf = io.open(used_file, "w")
if wf then wf:write(cjson.encode(used_list)); wf:close() end

-- ── Verdienst in earnings.json festhalten ────────────────────────────────────
local earnings_file = SOULS_DIR .. soul_id .. "/earnings.json"
local earnings = { total_pol = "0", total_requests = 0, entries = {} }

local ef = io.open(earnings_file, "r")
if ef then
  local er = ef:read("*a"); ef:close()
  local ok_e, ed = pcall(cjson.decode, er)
  if ok_e and type(ed) == "table" then earnings = ed end
  if type(earnings.entries) ~= "table" then earnings.entries = {} end
end

-- Neuen Eintrag hinzufügen
local new_entry = {
  tx_hash      = tx_hash:lower(),
  from         = vdata.from,
  pol_amount   = vdata.pol_amount,
  confirmed_at = vdata.confirmed_at,
  redeemed_at  = os.date("!%Y-%m-%dT%H:%M:%SZ"),
}
table.insert(earnings.entries, new_entry)
earnings.total_requests = (earnings.total_requests or 0) + 1

-- total_pol aufsummieren (String-Arithmetik über tonumber)
local prev = tonumber(earnings.total_pol) or 0
local added = tonumber(vdata.pol_amount) or 0
-- Auf 6 Dezimalstellen runden um Floating-Point-Drift zu vermeiden
earnings.total_pol = string.format("%.6f", prev + added)

-- Max. 10.000 Einträge (älteste rausfallen lassen)
if #earnings.entries > 10000 then
  local trimmed = {}
  for i = #earnings.entries - 9999, #earnings.entries do
    trimmed[#trimmed+1] = earnings.entries[i]
  end
  earnings.entries = trimmed
end

local ewf = io.open(earnings_file, "w")
if ewf then ewf:write(cjson.encode(earnings)); ewf:close() end

-- ── Zugriffs-Token ausstellen ─────────────────────────────────────────────────
-- Dauer aus amortization.token_duration lesen (Fallback: 1h)
local dur_map = { ["1h"]=3600, ["12h"]=43200, ["1d"]=86400, ["7d"]=604800, ["30d"]=2592000, ["90d"]=7776000 }
local TOKEN_TTL = dur_map[amort.token_duration or ""] or 3600
local token_bytes = random.bytes(24, true)
local access_token = str.to_hex(token_bytes)
local expires_at   = ngx.now() + TOKEN_TTL
local expires_iso  = os.date("!%Y-%m-%dT%H:%M:%SZ", math.floor(expires_at))

local token_data = cjson.encode({
  soul_id      = soul_id,
  tx_hash      = tx_hash:lower(),
  pol_amount   = vdata.pol_amount,
  from         = vdata.from,
  issued_at    = os.date("!%Y-%m-%dT%H:%M:%SZ"),
  expires_at   = expires_iso,
})

local access_cache = ngx.shared.pol_access
access_cache:set("tok:" .. access_token, token_data, TOKEN_TTL)

-- Token auch als Datei speichern (damit soul-mcp Node.js direkt lesen kann)
os.execute("mkdir -p /var/lib/sys/pol_tokens")
local tf = io.open("/var/lib/sys/pol_tokens/" .. access_token .. ".json", "w")
if tf then tf:write(token_data); tf:close() end
-- Abgelaufene Token-Dateien aufräumen (async, Fehler ignorieren)
os.execute("find /var/lib/sys/pol_tokens/ -name '*.json' -mmin +" .. math.ceil(TOKEN_TTL/60) .. " -delete 2>/dev/null &")

ngx.say(cjson.encode({
  ok           = true,
  access_token = access_token,
  expires_at   = expires_iso,
  soul_id      = soul_id,
  tx_hash      = tx_hash:lower(),
  pol_amount   = vdata.pol_amount,
  from         = vdata.from,
  confirmed_at = vdata.confirmed_at,
  note         = "Verwende access_token als Bearer-Token für MCP-Zugriff auf diese Soul.",
}))
