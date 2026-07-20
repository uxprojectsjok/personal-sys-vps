-- /etc/openresty/lua/soul_pay_x402.lua
-- POST /api/soul/pay/x402
-- Öffentlich (kein soul-cert nötig — zahlender Agent kennt den soul_cert nicht).
--
-- Zweite, zusätzliche Zahlungsschiene neben soul_pay.lua (direkte POL-Überweisung).
-- Bewusst eine eigene Datei statt soul_pay.lua zu erweitern — gleiches Prinzip
-- wie soul_pay_manual.lua (siehe dortiger Kopfkommentar): der bestehende,
-- funktionierende POL-Weg soll beim Bau eines neuen Zahlungswegs nicht
-- angefasst werden. Token-Ausstellung/EU-Consent-Logik ist entsprechend
-- dupliziert, nicht extrahiert.
--
-- Echter x402-402-Handshake (nicht nur POL-Semantik mit anderem Vorzeichen):
--   Aufruf ohne x402_payment_header  → 402 + PAYMENT-REQUIRED-Header (USDC-Preis)
--   Aufruf MIT  x402_payment_header  → verifizieren+settlen, Zugriffs-Token wie gewohnt
--
-- Facilitator: Polygons eigener, produktionsreifer x402-Facilitator (kein
-- Account/API-Key nötig) — SYS hält nie einen ausgabefähigen Private Key,
-- Verify+Settle laufen komplett über /internal/verify-x402 (siehe server.mjs).

local cjson  = require("cjson.safe")
local http   = require("resty.http")
local random = require("resty.random")
local str    = require("resty.string")
local sha256 = require("resty.sha256")

-- eip712_name/eip712_version: EIP-712-Domain des USDC-Kontrakts, PFLICHT damit
-- ein x402-Client die Zahlung überhaupt signieren kann (live gegen den echten
-- Mainnet-Kontrakt per name()/version() abgefragt und bestätigt: "USD Coin"/"2"
-- — NICHT "USDC"/"2" wie eine erste Web-Recherche vermuten ließ. Für Amoy-
-- Testnet unverändert übernommen (unverifiziert, RPC beim Testen nicht
-- erreichbar) — vor echtem Testnet-Einsatz gegenprüfen.
local X402_NETWORKS = {
  amoy = { chain = "eip155:80002", usdc = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", eip712_name = "USD Coin", eip712_version = "2" },
  main = { chain = "eip155:137",   usdc = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", eip712_name = "USD Coin", eip712_version = "2" },
}

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local method = ngx.req.get_method()
if method ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"Method not allowed"}')
  return
end

ngx.req.read_body()
local body = ngx.req.get_body_data()
local ok_b, incoming = pcall(cjson.decode, body or "{}")
if not ok_b or type(incoming) ~= "table" then
  ngx.status = 400
  ngx.say('{"error":"Invalid JSON"}')
  return
end

local soul_id = incoming.soul_id

-- Realer x402-Header, nicht nur ein JSON-Body-Feld: Standard-Clients (z.B.
-- @x402/fetch, polygon-agent x402-pay) schicken den Zahlungsnachweis als
-- HTTP-Request-Header PAYMENT-SIGNATURE (v2) bzw. X-PAYMENT (v1), genau
-- spiegelbildlich zu unserem eigenen PAYMENT-REQUIRED-Response-Header weiter
-- unten. Live gefunden: bis hierher wurde NUR incoming.x402_payment_header
-- (Body-Feld) geprüft — ein echter x402-Client, der den Standard-Header
-- schickt, wäre also nie durchgekommen, selbst mit gültiger Signatur und
-- ausreichend Guthaben. Body-Feld bleibt als Fallback (kostet nichts, falls
-- doch irgendwo genutzt), Header hat Vorrang.
local req_headers = ngx.req.get_headers()
local x402_payment_header = req_headers["PAYMENT-SIGNATURE"] or req_headers["X-PAYMENT"] or incoming.x402_payment_header

if not soul_id or not soul_id:match("^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$") then
  ngx.status = 400
  ngx.say('{"error":"soul_id required (UUID format)"}')
  return
end

-- Private Node: gleicher Schutz wie beim POL-Weg.
do
  local pf = io.open("/var/lib/sys/config/public_node", "r")
  if pf then
    local pv = pf:read("*a"); pf:close()
    if pv == "false" then
      ngx.status = 403
      ngx.say('{"error":"private_node","message":"Dieser Node akzeptiert keine zahlenden Agenten (Private Node)."}')
      return
    end
  end
end

local SOULS_DIR = "/var/lib/sys/souls/"

-- Pricing-Protokoll-Konstanten (v1) — dieselben wie soul_pay.lua/soul_price.lua,
-- bewusst hier erneut gelesen statt importiert (Datei-Isolationsprinzip dieses
-- Zahlungswegs, siehe Kopfkommentar). amort.dynamic_pricing ist EIN gemeinsamer
-- Schalter für POL und USDC — Anker/Alter/Nachfrage sind Eigenschaften der Soul,
-- nicht der Zahlungswährung, ein zweiter Schalter wäre nur Redundanz.
local ANCHOR_COEFF = 0.1
local AGE_COEFF    = 0.01
local DEMAND_COEFF = 0.05
do
  local pf = io.open("/var/lib/sys/config/pricing_params.json", "r")
  if pf then
    local ok_p, p = pcall(cjson.decode, pf:read("*a")); pf:close()
    if ok_p and type(p) == "table" then
      ANCHOR_COEFF = tonumber(p.anchor_coeff)  or ANCHOR_COEFF
      AGE_COEFF    = tonumber(p.age_coeff)     or AGE_COEFF
      DEMAND_COEFF = tonumber(p.demand_coeff)  or DEMAND_COEFF
    end
  end
end

-- Gleiche Formel wie soul_pay.lua (Zeile ~223): base × (1 + anchors×A + age_days×G + buyers_30d×D).
-- Frisch aus anchor_history.json/demand_log.json berechnet statt über einen
-- x402-eigenen Quote-Mechanismus — das 402-maxTimeoutSeconds-Fenster (60s) ist
-- kurz genug, dass sich diese Metriken zwischen Challenge und Zahlung praktisch
-- nie ändern (gleiches Fallback-Prinzip wie soul_pay.lua ohne quote_id).
local function dynamic_usdc_price(soul_id_, base_price)
  local ah_file = SOULS_DIR .. soul_id_ .. "/anchor_history.json"
  local ah = io.open(ah_file, "r")
  if not ah then return base_price end
  local ok_a, hist = pcall(cjson.decode, ah:read("*a")); ah:close()
  if not ok_a or type(hist) ~= "table" or #hist == 0 then return base_price end

  local anchor_count   = #hist
  local chain_age_days = 0
  if type(hist[1].ts) == "string" then
    local y,mo,d,h,mi,s = hist[1].ts:match("^(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
    if y then
      local ref    = ngx.time()
      local tz_off = ref - os.time(os.date("!*t", ref))
      local genesis = os.time({
        year=tonumber(y),month=tonumber(mo),day=tonumber(d),
        hour=tonumber(h),min=tonumber(mi),sec=tonumber(s),isdst=false
      }) + tz_off
      chain_age_days = (ref - genesis) / 86400
    end
  end

  local buyers_30d = 0
  local dfl = io.open(SOULS_DIR .. soul_id_ .. "/demand_log.json", "r")
  if dfl then
    local ok_dl, dlog = pcall(cjson.decode, dfl:read("*a")); dfl:close()
    if ok_dl and type(dlog) == "table" then
      local cutoff = ngx.time() - 30 * 86400
      for _, e in ipairs(dlog) do
        if type(e) == "table" and (tonumber(e.ts) or 0) > cutoff then buyers_30d = buyers_30d + 1 end
      end
    end
  end

  local multiplier = 1 + (anchor_count * ANCHOR_COEFF) + (chain_age_days * AGE_COEFF) + (buyers_30d * DEMAND_COEFF)
  return math.max(base_price, math.floor(base_price * multiplier * 1000000 + 0.5) / 1000000)
end

local ctx_file  = SOULS_DIR .. soul_id .. "/api_context.json"

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

local amort = ctx.amortization
if type(amort) ~= "table" or amort.private == true or amort.enabled ~= true then
  ngx.status = 402
  ngx.say('{"error":"payment_not_required","message":"Diese Soul hat Amortisation nicht aktiviert."}')
  return
end

local wallet = amort.wallet or ""
if not wallet:match("^0x[0-9a-fA-F]+$") then
  ngx.status = 503
  ngx.say('{"error":"Soul-Wallet nicht konfiguriert"}')
  return
end

local price_usdc = tonumber(amort.price_usdc)
if not price_usdc or price_usdc <= 0 then
  ngx.status = 402
  ngx.say(cjson.encode({
    error   = "x402_not_configured",
    message = "Diese Soul hat keinen USDC-Preis konfiguriert (amortization.price_usdc fehlt).",
  }))
  return
end
if amort.dynamic_pricing == true then
  price_usdc = dynamic_usdc_price(soul_id, price_usdc)
end

local net = X402_NETWORKS[os.getenv("POLYGON_NETWORK") or ""] or X402_NETWORKS.main

-- ── Kein Zahlungsnachweis: echter x402-402-Handshake ─────────────────────────
if type(x402_payment_header) ~= "string" or #x402_payment_header < 1 then
  local amount_atomic = tostring(math.floor(price_usdc * 1e6 + 0.5))
  local payment_required = {
    x402Version = 2,
    resource    = { url = ngx.var.scheme .. "://" .. ngx.var.host .. "/api/soul/pay/x402" },
    accepts     = {{
      scheme            = "exact",
      network           = net.chain,
      asset             = net.usdc,
      amount            = amount_atomic,
      payTo             = wallet,
      maxTimeoutSeconds = 60,
      extra             = { name = net.eip712_name, version = net.eip712_version },
    }},
  }
  ngx.status = 402
  ngx.header["PAYMENT-REQUIRED"] = ngx.encode_base64(cjson.encode(payment_required))
  ngx.say(cjson.encode({
    error   = "payment_required",
    message = "USDC-Zahlung erforderlich (x402). Siehe PAYMENT-REQUIRED-Header oder amount/payTo/asset/network unten.",
    accepts = payment_required.accepts,
  }))
  return
end

-- reference_id ist immer ein optionales Feld (Notiz zur Zuordnung des Tokens).
local reference_id = type(incoming.reference_id) == "string" and incoming.reference_id:match("^%s*(.-)%s*$") or nil
if reference_id == "" then reference_id = nil end

-- ── EU-Widerrufsrecht: Referenz-ID technisch erzwingen (gleicher Schutz wie
-- beim POL-Weg — bewusst dupliziert, siehe Datei-Kopfkommentar). ─────────────
local eu_flag = io.open("/var/lib/sys/config/eu_consumer_rights", "r")
local eu_consumer_rights = false
if eu_flag then
  eu_consumer_rights = eu_flag:read("*a") == "true"
  eu_flag:close()
end

if eu_consumer_rights then
  local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
  if not reference_id or not reference_id:match(UUID_PAT) then
    ngx.status = 400
    ngx.say(cjson.encode({
      error   = "reference_id_required",
      message = "Referenz-ID aus accept_digital_content_terms erforderlich — der Käufer muss zuerst der Widerrufsbelehrung zustimmen.",
    }))
    return
  end
  local consent_path = "/var/lib/sys/souls/" .. soul_id .. "/consent_docs/" .. reference_id .. ".pdf"
  local cf2 = io.open(consent_path, "r")
  if not cf2 then
    ngx.status = 404
    ngx.say(cjson.encode({
      error   = "consent_not_found",
      message = "Keine Einwilligung mit dieser Referenz-ID gefunden — accept_digital_content_terms wurde für sie nicht aufgerufen.",
    }))
    return
  end
  cf2:close()
end

-- ── Replay-Schutz: eigener Namensraum, eigene Datei — rührt pol_used_tx.json
-- nicht an. Schlüssel = sha256 des rohen Payment-Headers (die zugrundeliegende
-- EIP-3009-Nonce ist bereits On-Chain einmalig durchsetzbar; diese zusätzliche
-- Prüfung verhindert nur, dass derselbe Header mehrfach GEGEN DIESEN Endpunkt
-- einen Token auslöst, unabhängig vom Facilitator-Verhalten bei wiederholten
-- /settle-Aufrufen auf dieselbe, bereits verbrauchte Nonce).
local sha = sha256:new()
sha:update(x402_payment_header)
local replay_key = "x402:" .. str.to_hex(sha:final())

local tx_cache = ngx.shared.pol_tx_used
if tx_cache:get(replay_key) then
  ngx.status = 409
  ngx.say('{"error":"payment_already_used","message":"Dieser Zahlungsnachweis wurde bereits eingelöst."}')
  return
end

local used_file = SOULS_DIR .. soul_id .. "/x402_used_payments.json"
local uf = io.open(used_file, "r")
if uf then
  local used_raw = uf:read("*a"); uf:close()
  local ok_u, used = pcall(cjson.decode, used_raw)
  if ok_u and type(used) == "table" then
    for _, h in ipairs(used) do
      if type(h) == "string" and h == replay_key then
        tx_cache:set(replay_key, "1", 172800)
        ngx.status = 409
        ngx.say('{"error":"payment_already_used","message":"Dieser Zahlungsnachweis wurde bereits eingelöst."}')
        return
      end
    end
  end
end

-- ── x402-Zahlung verifizieren + settlen ───────────────────────────────────────
local httpc = http.new()
httpc:set_timeout(20000)

local verify_body = cjson.encode({
  payment_header        = x402_payment_header,
  expected_to           = wallet,
  expected_amount_usdc  = string.format("%.6f", price_usdc),
})

local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/verify-x402", {
  method  = "POST",
  body    = verify_body,
  headers = {
    ["Content-Type"] = "application/json",
    ["Accept"]       = "application/json",
  },
})

if not res or err then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "x402-Verifikation fehlgeschlagen", detail = tostring(err) }))
  return
end

local ok_v, vdata = pcall(cjson.decode, res.body or "")
if not ok_v or type(vdata) ~= "table" then
  ngx.status = 502
  ngx.say('{"error":"Ungültige Antwort vom x402-Verifikationsdienst"}')
  return
end

if res.status ~= 200 or vdata.ok ~= true then
  local status = res.status
  if status ~= 400 and status ~= 409 and status ~= 422 then status = 422 end
  ngx.status = status
  ngx.say(cjson.encode({
    error   = vdata.reason or "payment_invalid",
    message = vdata.message or "x402-Zahlung ungültig",
    detail  = vdata,
  }))
  return
end

-- ── Zahlungsnachweis als verwendet markieren ──────────────────────────────────
tx_cache:set(replay_key, "1", 172800)
local used_list = {}
local uf2 = io.open(used_file, "r")
if uf2 then
  local ur = uf2:read("*a"); uf2:close()
  local ok_u2, ul = pcall(cjson.decode, ur)
  if ok_u2 and type(ul) == "table" then used_list = ul end
end
table.insert(used_list, replay_key)
if #used_list > 10000 then
  local trimmed = {}
  for i = #used_list - 9999, #used_list do trimmed[#trimmed+1] = used_list[i] end
  used_list = trimmed
end
local wf = io.open(used_file, "w")
if wf then wf:write(cjson.encode(used_list)); wf:close() end

-- ── Verdienst festhalten: eigene usdc_earnings.json, rührt earnings.json (und
-- damit dessen bestehende POL-spezifische Konsumenten — earnings.vue,
-- soul_earnings.mjs, soul_tokens.lua — die alle pol_amount als String
-- voraussetzen) nicht an. ─────────────────────────────────────────────────────
local usdc_earnings_file = SOULS_DIR .. soul_id .. "/usdc_earnings.json"
local usdc_earnings = { total_usdc = "0", total_requests = 0, entries = {} }
local uef = io.open(usdc_earnings_file, "r")
if uef then
  local uer = uef:read("*a"); uef:close()
  local ok_ue, ued = pcall(cjson.decode, uer)
  if ok_ue and type(ued) == "table" then usdc_earnings = ued end
  if type(usdc_earnings.entries) ~= "table" then usdc_earnings.entries = {} end
end
local new_entry = {
  tx_hash      = vdata.tx_hash,
  from         = vdata.from,
  usdc_amount  = vdata.usdc_amount,
  confirmed_at = vdata.confirmed_at,
  redeemed_at  = os.date("!%Y-%m-%dT%H:%M:%SZ"),
}
table.insert(usdc_earnings.entries, new_entry)
usdc_earnings.total_requests = (usdc_earnings.total_requests or 0) + 1
local prev_usdc = tonumber(usdc_earnings.total_usdc) or 0
usdc_earnings.total_usdc = string.format("%.6f", prev_usdc + (tonumber(vdata.usdc_amount) or 0))
if #usdc_earnings.entries > 10000 then
  local trimmed = {}
  for i = #usdc_earnings.entries - 9999, #usdc_earnings.entries do trimmed[#trimmed+1] = usdc_earnings.entries[i] end
  usdc_earnings.entries = trimmed
end
local uewf = io.open(usdc_earnings_file, "w")
if uewf then uewf:write(cjson.encode(usdc_earnings)); uewf:close() end

-- ── sys.md: Einnahmen-Sektion aktualisieren (non-blocking, via MCP soul_write) ─
local _se = new_entry
ngx.timer.at(0, function()
  local httpc_sw = require("resty.http").new()
  httpc_sw:set_timeout(8000)
  local line = string.format(
    "- %s · **%s USDC** (x402) von `%s` · [TX](https://polygonscan.com/tx/%s)",
    _se.redeemed_at, (_se.usdc_amount or "0"), (_se.from or "unknown"), (_se.tx_hash or "")
  )
  local payload = require("cjson.safe").encode({
    tool  = "soul_write",
    input = { section = "Marketplace-Einnahmen", content = line, mode = "prepend" }
  })
  httpc_sw:request_uri("http://127.0.0.1:3098/internal/run-tool", {
    method  = "POST",
    headers = { ["Content-Type"] = "application/json", ["x-soul-id"] = soul_id },
    body    = payload,
  })
end)

-- Push-Benachrichtigung (Best-Effort — Verkauf ist auch ohne Push in
-- sys.md/earnings.vue sichtbar, siehe oben).
ngx.timer.at(0, function()
  local hc = require("resty.http").new()
  hc:set_timeout(2000)
  hc:request_uri("http://127.0.0.1:3098/internal/send-push", {
    method  = "POST",
    headers = { ["Content-Type"] = "application/json" },
    body    = require("cjson.safe").encode({
      soul_id = soul_id,
      title   = "Neuer Verkauf",
      body    = string.format("%s USDC erhalten von %s (x402)", _se.usdc_amount or "0", _se.from or "unbekannt"),
      url     = "/earnings",
    }),
  })
end)

-- E-Mail an die eingetragene Kontaktadresse via Zapier MCP (Best-Effort,
-- optional — nur wenn sowohl mcp_url (Settings → Services) als auch
-- trader_email (Marketplace-Anbieterkennzeichnung) gesetzt sind). Gleicher
-- JSON-RPC tools/call-Mechanismus wie mcp_call.lua/api/mcp-call, hier direkt
-- serverseitig statt vom Chat aus ausgelöst. Kostet einen Zapier-Task pro
-- Verkauf — daher wirklich optional, kein harter Fehler wenn nicht konfiguriert.
if amort.trader_email and amort.trader_email ~= "" then
  ngx.timer.at(0, function()
    local cjson2 = require("cjson.safe")
    local mcp_url = ""
    local cf2 = io.open("/var/lib/sys/souls/" .. soul_id .. "/config.json", "r")
    if cf2 then
      local craw = cf2:read("*a"); cf2:close()
      local ok_c2, cfg = pcall(cjson2.decode, craw)
      if ok_c2 and type(cfg) == "table" and type(cfg.mcp_url) == "string" and cfg.mcp_url ~= "" then
        mcp_url = cfg.mcp_url
      end
    end
    if mcp_url == "" then return end

    local hc2 = require("resty.http").new()
    hc2:set_timeout(20000)
    hc2:request_uri(mcp_url, {
      method  = "POST",
      headers = { ["Content-Type"] = "application/json", ["Accept"] = "application/json, text/event-stream" },
      body    = cjson2.encode({
        jsonrpc = "2.0",
        id      = tostring(ngx.now()):gsub("%.", ""),
        method  = "tools/call",
        params  = {
          name = "gmail_send_email",
          arguments = {
            to           = { amort.trader_email },
            from_name    = (amort.trader_name and amort.trader_name ~= "") and amort.trader_name or nil,
            subject      = (amort.trader_name and amort.trader_name ~= "")
              and ("Neuer Verkauf für " .. amort.trader_name .. " über x402")
              or "Neuer Verkauf über x402",
            body         = string.format(
              "%s USDC erhalten von %s (x402/Polygon).\n\nTX: https://polygonscan.com/tx/%s\nZeit: %s",
              _se.usdc_amount or "0", _se.from or "unbekannt", _se.tx_hash or "", _se.redeemed_at
            ),
            body_type    = "plain",
            instructions = "Sende diese E-Mail unverändert mit den gegebenen to/subject/body/from_name-Feldern.",
            output_hint  = "Bestätigung, dass die E-Mail verschickt wurde",
          },
        },
      }),
      ssl_verify = true,
    })
  end)
end

-- ── Zugriffs-Token ausstellen (gleiches Format wie soul_pay.lua/soul_pay_manual.lua
-- — pol_amount = null + payment_method = "x402", matching der bereits etablierten
-- Konvention aus soul_pay_manual.lua für Nicht-POL-Zahlungswege). ─────────────
local days      = math.max(1, math.min(30, tonumber(amort.token_duration_days) or 1))
local TOKEN_TTL = days * 86400
local token_bytes = random.bytes(24, true)
local access_token = str.to_hex(token_bytes)
local expires_at   = ngx.now() + TOKEN_TTL
local expires_iso  = os.date("!%Y-%m-%dT%H:%M:%SZ", math.floor(expires_at))

local token_data = cjson.encode({
  soul_id        = soul_id,
  tx_hash        = vdata.tx_hash,
  pol_amount     = cjson.null,
  usdc_amount    = vdata.usdc_amount,
  from           = vdata.from,
  payment_method = "x402",
  reference_id   = reference_id,
  issued_at      = os.date("!%Y-%m-%dT%H:%M:%SZ"),
  expires_at     = expires_iso,
})

local access_cache = ngx.shared.pol_access
access_cache:set("tok:" .. access_token, token_data, TOKEN_TTL)

os.execute("mkdir -p /var/lib/sys/pol_tokens")
local tf = io.open("/var/lib/sys/pol_tokens/" .. access_token .. ".json", "w")
if tf then tf:write(token_data); tf:close() end
os.execute("find /var/lib/sys/pol_tokens/ -name '*.json' -mmin +" .. math.ceil(TOKEN_TTL/60) .. " -delete 2>/dev/null &")

-- Demand-Log: gemeinsam mit dem POL-Weg genutzt (Verkauf zählt unabhängig von
-- der Zahlungsart in dieselbe Nachfrage-Metrik — treibt bei dynamic_pricing=true
-- sowohl den POL- als auch den USDC-Preis).
local demand_file = SOULS_DIR .. soul_id .. "/demand_log.json"
local dlog = {}
local dlf = io.open(demand_file, "r")
if dlf then
  local ok_dl, stored = pcall(cjson.decode, dlf:read("*a")); dlf:close()
  if ok_dl and type(stored) == "table" then
    local cutoff = ngx.time() - 30 * 86400
    for _, entry in ipairs(stored) do
      if type(entry) == "table" and (tonumber(entry.ts) or 0) > cutoff then dlog[#dlog+1] = entry end
    end
  end
end
dlog[#dlog+1] = { ts = ngx.time(), tx = vdata.tx_hash }
local dlwf = io.open(demand_file, "w")
if dlwf then dlwf:write(cjson.encode(dlog)); dlwf:close() end

ngx.status = 200
ngx.say(cjson.encode({
  ok           = true,
  access_token = access_token,
  expires_at   = expires_iso,
  soul_id      = soul_id,
  tx_hash      = vdata.tx_hash,
  usdc_amount  = vdata.usdc_amount,
  from         = vdata.from,
  confirmed_at = vdata.confirmed_at,
  note         = "Verwende access_token als Bearer-Token für MCP-Zugriff auf diese Soul.",
}))
