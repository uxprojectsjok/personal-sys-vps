-- /etc/openresty/lua/soul_price.lua
-- GET /api/soul/price?soul_id=<uuid>  — öffentlich, kein Auth
-- Gibt die dynamischen Preisfaktoren einer Soul zurück (Anker-Anzahl,
-- Chain-Alter, Käufer/30d, daraus abgeleiteter Multiplikator) — currency-
-- agnostisch, für die Live-Vorschau im Marketplace (Base-Betrag × Multiplikator).
--
-- War früher POL-spezifisch (pol_required/base_price/quote_id) — die direkte
-- POL-Überweisung wurde entfernt (siehe CHANGELOG), das Quote-System war
-- ausschließlich dafür da (Preis-Timing-Schutz für /api/soul/pay, das es
-- nicht mehr gibt) und ist mit entfernt. x402 (soul_pay_x402.lua) berechnet
-- seinen eigenen dynamischen Preis serverseitig frisch bei jeder Zahlung
-- (dieselbe Formel, dupliziert statt hier importiert) — dieser Endpunkt
-- dient nur der Anzeige, nicht der Durchsetzung.

local cjson     = require("cjson.safe")
local SOULS_DIR = "/var/lib/sys/souls/"

-- Pricing-Protokoll-Konstanten (v1) — aus shared/constants/pricing_params.json
-- Fallback: hardcodierte Werte falls Datei fehlt
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

ngx.header["Content-Type"]                = "application/json"
ngx.header["Cache-Control"]               = "no-store"
ngx.header["Access-Control-Allow-Origin"] = "*"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local args    = ngx.req.get_uri_args()
local soul_id = args.soul_id or ngx.ctx.soul_id

if not soul_id or not soul_id:match("^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$") then
  -- Single-Hoster: soul_id aus Verzeichnis ableiten
  local dirs = {}
  local p = io.popen("ls " .. SOULS_DIR .. " 2>/dev/null")
  if p then
    for d in p:lines() do
      if d:match("^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$") then
        table.insert(dirs, d)
      end
    end
    p:close()
  end
  if #dirs == 1 then
    soul_id = dirs[1]
  else
    ngx.status = 400
    ngx.say('{"error":"soul_id required"}')
    return
  end
end

-- api_context.json lesen
local ctx_file = SOULS_DIR .. soul_id .. "/api_context.json"
local cf = io.open(ctx_file, "r")
if not cf then
  ngx.status = 404; ngx.say('{"error":"soul_not_found"}'); return
end
local ok_c, ctx = pcall(cjson.decode, cf:read("*a")); cf:close()
if not ok_c or type(ctx) ~= "table" then
  ngx.status = 500; ngx.say('{"error":"api_context_corrupt"}'); return
end

local amort = ctx.amortization
if type(amort) ~= "table" or amort.enabled ~= true then
  ngx.say(cjson.encode({
    enabled = false,
    message = "Diese Soul hat keine Bezahlschranke aktiviert.",
    dynamic = false,
  }))
  return
end

if amort.private == true then
  ngx.status = 403
  ngx.say('{"error":"soul_private","message":"Diese Soul ist privat."}')
  return
end

local dynamic        = amort.dynamic_pricing == true
local anchor_count   = 0
local chain_age_days = 0
local buyers_30d     = 0
local genesis_ts     = nil

if dynamic then
  local ah_file  = SOULS_DIR .. soul_id .. "/anchor_history.json"
  local NODE_BIN = "/usr/bin/node"
  local CLI      = "/opt/sys/soul-mcp/soul_chain_metrics_cli.mjs"

  -- Wenn anchor_history.json fehlt (nach Soul-Import): CLI aufrufen — rekonstruiert
  -- die Datei einmalig on-chain und schreibt sie; danach wird sie lokal gecacht.
  local ah_check = io.open(ah_file, "r")
  if not ah_check then
    local p = io.popen(NODE_BIN .. " " .. CLI .. " " .. soul_id .. " 2>/dev/null", "r")
    if p then p:read("*a"); p:close() end -- Ergebnis ignorieren, Datei wurde geschrieben
  else
    ah_check:close()
  end

  -- anchor_history.json lesen (jetzt vorhanden)
  local ah = io.open(ah_file, "r")
  if ah then
    local ok_a, hist = pcall(cjson.decode, ah:read("*a")); ah:close()
    if ok_a and type(hist) == "table" then
      anchor_count = #hist
      -- Genesis-Zeitstempel aus erstem Eintrag
      if hist[1] and type(hist[1].ts) == "string" then
        genesis_ts = hist[1].ts
        local y,mo,d,h,mi,s = genesis_ts:match("^(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
        if y then
          local ref    = ngx.time()
          local utc_t  = os.date("!*t", ref)
          local tz_off = ref - os.time(utc_t)
          local genesis_epoch = os.time({
            year=tonumber(y), month=tonumber(mo), day=tonumber(d),
            hour=tonumber(h), min=tonumber(mi), sec=tonumber(s), isdst=false
          }) + tz_off
          chain_age_days = (ngx.time() - genesis_epoch) / 86400
        end
      end
    end
  end

  -- demand_log.json: einzigartige Käufer der letzten 30 Tage zählen
  local demand_file = SOULS_DIR .. soul_id .. "/demand_log.json"
  local df = io.open(demand_file, "r")
  if df then
    local ok_d, dlog = pcall(cjson.decode, df:read("*a")); df:close()
    if ok_d and type(dlog) == "table" then
      local cutoff = ngx.time() - 30 * 86400
      for _, entry in ipairs(dlog) do
        if type(entry) == "table" and (tonumber(entry.ts) or 0) > cutoff then
          buyers_30d = buyers_30d + 1
        end
      end
    end
  end
end

-- Multiplikator: 1 + anchor_count × ANCHOR_COEFF + chain_age_days × AGE_COEFF + buyers_30d × DEMAND_COEFF
local multiplier = 1.0
if dynamic and (anchor_count > 0 or buyers_30d > 0) then
  multiplier = 1 + (anchor_count * ANCHOR_COEFF) + (chain_age_days * AGE_COEFF) + (buyers_30d * DEMAND_COEFF)
end

ngx.say(cjson.encode({
  enabled        = true,
  dynamic        = dynamic,
  multiplier     = math.floor(multiplier * 100 + 0.5) / 100,
  wallet         = amort.wallet or "",
  token_duration = amort.token_duration or "1d",
  anchor_count   = anchor_count,
  chain_age_days = math.floor(chain_age_days * 10 + 0.5) / 10,
  buyers_30d     = buyers_30d,
  genesis_ts     = genesis_ts,
  soul_id        = soul_id,
}))
