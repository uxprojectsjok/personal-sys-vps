-- /etc/openresty/lua/soul_price.lua
-- GET /api/soul/price?soul_id=<uuid>  — öffentlich, kein Auth
-- Gibt den aktuellen POL-Preis zurück (statisch oder dynamisch).
-- Dynamisch: base × (1 + anchor_count × 0.1 + chain_age_days × 0.01)

local cjson     = require("cjson.safe")
local SOULS_DIR = "/var/lib/sys/souls/"

-- Pricing-Protokoll-Konstanten (v1) — aus shared/constants/pricing_params.json
-- Fallback: hardcodierte Werte falls Datei fehlt
local ANCHOR_COEFF = 0.1
local AGE_COEFF    = 0.01
local QUOTE_TTL    = 300
do
  local pf = io.open("/var/lib/sys/config/pricing_params.json", "r")
  if pf then
    local ok_p, p = pcall(cjson.decode, pf:read("*a")); pf:close()
    if ok_p and type(p) == "table" then
      ANCHOR_COEFF = tonumber(p.anchor_coeff)  or ANCHOR_COEFF
      AGE_COEFF    = tonumber(p.age_coeff)     or AGE_COEFF
      QUOTE_TTL    = tonumber(p.quote_ttl_sec) or QUOTE_TTL
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
    enabled       = false,
    message       = "Diese Soul hat keine Bezahlschranke aktiviert.",
    pol_required  = "0",
    dynamic       = false,
  }))
  return
end

if amort.private == true then
  ngx.status = 403
  ngx.say('{"error":"soul_private","message":"Diese Soul ist privat."}')
  return
end

local base_price    = tonumber(amort.pol_per_request) or 0.001
local dynamic       = amort.dynamic_pricing == true
local anchor_count  = 0
local chain_age_days = 0
local genesis_ts    = nil

if dynamic then
  -- anchor_history.json lesen
  local ah_file = SOULS_DIR .. soul_id .. "/anchor_history.json"
  local ah = io.open(ah_file, "r")
  if ah then
    local ok_a, hist = pcall(cjson.decode, ah:read("*a")); ah:close()
    if ok_a and type(hist) == "table" then
      anchor_count = #hist
      -- Genesis-Zeitstempel aus erstem Eintrag
      if hist[1] and type(hist[1].ts) == "string" then
        genesis_ts = hist[1].ts
        -- ISO8601 → epoch (UTC)
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
end

-- Dynamischer Preis: base × (1 + anchor_count × 0.1 + chain_age_days × 0.01)
local multiplier = 1.0
local price = base_price
if dynamic and anchor_count > 0 then
  multiplier = 1 + (anchor_count * ANCHOR_COEFF) + (chain_age_days * AGE_COEFF)
  price = base_price * multiplier
end
-- Auf 4 Dezimalstellen runden, Minimum: base_price
price = math.max(base_price, math.floor(price * 10000 + 0.5) / 10000)

-- ── Price Quote (5 Min TTL) ───────────────────────────────────────────────────
local QUOTES_FILE = SOULS_DIR .. soul_id .. "/price_quotes.json"

-- Bestehende Quotes laden, abgelaufene bereinigen
local quotes = {}
local qf = io.open(QUOTES_FILE, "r")
if qf then
  local ok_q, stored = pcall(cjson.decode, qf:read("*a")); qf:close()
  if ok_q and type(stored) == "table" then
    local now = ngx.time()
    for qid, q in pairs(stored) do
      if type(q) == "table" and (q.valid_until or 0) > now then
        quotes[qid] = q
      end
    end
  end
end

-- Quote ID: 16-Hex aus Zeit + Zufall
local quote_id    = ngx.md5(tostring(ngx.now()) .. tostring(math.random(100000, 999999)) .. soul_id):sub(1, 16)
local valid_until = ngx.time() + QUOTE_TTL
quotes[quote_id]  = { price = string.format("%.4f", price), valid_until = valid_until }

local qf2 = io.open(QUOTES_FILE, "w")
if qf2 then qf2:write(cjson.encode(quotes)); qf2:close() end

ngx.say(cjson.encode({
  enabled          = true,
  pol_required     = string.format("%.4f", price),
  dynamic          = dynamic,
  base_price       = string.format("%.4f", base_price),
  multiplier       = math.floor(multiplier * 100 + 0.5) / 100,
  wallet           = amort.wallet or "",
  token_duration   = amort.token_duration or "1d",
  anchor_count     = anchor_count,
  chain_age_days   = math.floor(chain_age_days * 10 + 0.5) / 10,
  genesis_ts       = genesis_ts,
  soul_id          = soul_id,
  quote_id         = quote_id,
  valid_until      = valid_until,
  quote_ttl_sec    = QUOTE_TTL,
}))
