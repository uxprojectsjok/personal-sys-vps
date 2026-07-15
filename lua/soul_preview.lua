-- /etc/openresty/lua/soul_preview.lua
-- GET /api/soul/preview?soul_id=<uuid>  — public, no auth
--
-- Returns a free teaser of the AGENT block so external AI agents can assess
-- relevance before paying for full access via /api/soul/pay.

local cjson     = require("cjson.safe")
local resty_aes = require("resty.aes")
local SOULS_DIR  = "/var/lib/sys/souls/"
local PREVIEW_CHARS = 200

-- EU withdrawal-rights consent flow — off by default, opt-in via init.sh
-- ("Set up EU consumer rights?"), written to this flag file by init.sh.
local function eu_consumer_rights()
  local f = io.open("/var/lib/sys/config/eu_consumer_rights", "r")
  if not f then return false end
  local v = f:read("*a"); f:close()
  return v == "true"
end
local EU_CONSUMER_RIGHTS = eu_consumer_rights()

ngx.header["Content-Type"]                = "application/json"
ngx.header["Cache-Control"]               = "no-store"
ngx.header["Access-Control-Allow-Origin"] = "*"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local args    = ngx.req.get_uri_args()
local soul_id = args.soul_id or ngx.ctx.soul_id

if not soul_id or not soul_id:match("^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$") then
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
  if #dirs == 1 then soul_id = dirs[1]
  else ngx.status = 400; ngx.say('{"error":"soul_id required"}'); return end
end

-- api_context.json
local ctx_file = SOULS_DIR .. soul_id .. "/api_context.json"
local cf = io.open(ctx_file, "r")
if not cf then ngx.status = 404; ngx.say('{"error":"soul_not_found"}'); return end
local ok_c, ctx = pcall(cjson.decode, cf:read("*a")); cf:close()
if not ok_c or type(ctx) ~= "table" then
  ngx.status = 500; ngx.say('{"error":"api_context_corrupt"}'); return
end

local amort = ctx.amortization
if type(amort) ~= "table" or amort.enabled ~= true then
  ngx.say(cjson.encode({ enabled = false, message = "This soul has no paid access configured." }))
  return
end
if amort.private == true then
  ngx.status = 403; ngx.say('{"error":"soul_private","message":"This soul is private."}'); return
end

-- ── Read + decrypt sys.md ─────────────────────────────────────────────────────
local preview_text   = nil
local preview_trunc  = false
local full_size_hint = "unknown"
local preview_note   = nil

local sf = io.open(SOULS_DIR .. soul_id .. "/sys.md", "r")
if sf then
  local raw_content = sf:read("*a"); sf:close()
  local content = raw_content

  -- Decrypt if encrypted (magic header "SYS\x01")
  if content:sub(1, 4) == "SYS\x01" then
    local vault_key_hex = ctx.vault_key_hex or ""
    if vault_key_hex == "" then
      preview_note = "Preview not available — Soul has not been unlocked yet."
    else
      local function hex_to_bin(hex)
        return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
      end
      local iv         = content:sub(5, 20)
      local ciphertext = content:sub(21)
      local key        = hex_to_bin(vault_key_hex)
      local aes_ctx    = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
      if aes_ctx then
        local decrypted = aes_ctx:decrypt(ciphertext)
        if decrypted then content = decrypted
        else preview_note = "Preview unavailable (decryption error)." end
      else
        preview_note = "Preview unavailable (key error)."
      end
    end
  end

  -- Extract AGENT block
  if not preview_note then
    local agent_start = content:find("AGENT:START")
    local agent_end   = content:find("AGENT:END")
    if agent_start and agent_end and agent_end > agent_start then
      local block = content:sub(agent_start + 11, agent_end - 1)
      -- Strip HTML comment wrapper if markers are embedded: <!--AGENT:START-->…<!--AGENT:END-->
      block = block:match("^%s*%-%->%s*(.-)%s*<!%-%-?%s*$") or block:match("^\n?(.-)%s*$") or block
      local len = #block
      if     len < 1024     then full_size_hint = "< 1 KB"
      elseif len < 5 * 1024 then full_size_hint = "1–5 KB"
      else                       full_size_hint = "> 5 KB" end
      if len == 0 then
        preview_note = "AGENT block is empty — the owner has not added paid content yet."
        preview_text = ""
      elseif len > PREVIEW_CHARS then
        preview_text  = block:sub(1, PREVIEW_CHARS)
        preview_trunc = true
      else
        preview_text  = block
        preview_trunc = false
        full_size_hint = "< 1 KB"
      end
    else
      preview_note = "No AGENT block configured yet — the owner has not set up paid content."
    end
  end
end

-- ── Price (same formula as soul_price.lua, no quote) ─────────────────────────
local ANCHOR_COEFF = 0.1; local AGE_COEFF = 0.01; local DEMAND_COEFF = 0.05
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

local base_price = tonumber(amort.pol_per_request) or 0.001
local dynamic    = amort.dynamic_pricing == true
local anchor_count = 0; local chain_age_days = 0; local buyers_30d = 0
local genesis_ts = nil

if dynamic then
  local ah = io.open(SOULS_DIR .. soul_id .. "/anchor_history.json", "r")
  if ah then
    local ok_a, hist = pcall(cjson.decode, ah:read("*a")); ah:close()
    if ok_a and type(hist) == "table" then
      anchor_count = #hist
      if hist[1] and type(hist[1].ts) == "string" then
        genesis_ts = hist[1].ts
        local y,mo,d,h,mi,s = genesis_ts:match("^(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
        if y then
          local ref = ngx.time(); local utc_t = os.date("!*t", ref)
          local tz_off = ref - os.time(utc_t)
          local ge = os.time({ year=tonumber(y), month=tonumber(mo), day=tonumber(d),
                               hour=tonumber(h), min=tonumber(mi), sec=tonumber(s), isdst=false }) + tz_off
          chain_age_days = (ngx.time() - ge) / 86400
        end
      end
    end
  end
  local df = io.open(SOULS_DIR .. soul_id .. "/demand_log.json", "r")
  if df then
    local ok_d, dlog = pcall(cjson.decode, df:read("*a")); df:close()
    if ok_d and type(dlog) == "table" then
      local cutoff = ngx.time() - 30 * 86400
      for _, entry in ipairs(dlog) do
        if type(entry) == "table" and (tonumber(entry.ts) or 0) > cutoff then buyers_30d = buyers_30d + 1 end
      end
    end
  end
end

local multiplier = 1.0; local price = base_price
if dynamic and (anchor_count > 0 or buyers_30d > 0) then
  multiplier = 1 + (anchor_count * ANCHOR_COEFF) + (chain_age_days * AGE_COEFF) + (buyers_30d * DEMAND_COEFF)
  price = base_price * multiplier
end
price = math.max(base_price, math.floor(price * 10000 + 0.5) / 10000)

local scheme  = (ngx.var.https == "on") and "https" or "http"
local base_url = scheme .. "://" .. (ngx.var.host or "")

local response = {
  soul_id           = soul_id,
  enabled           = true,
  preview           = preview_text,
  preview_note      = preview_note,
  preview_truncated = preview_trunc,
  preview_chars     = PREVIEW_CHARS,
  full_size_hint    = full_size_hint,
  pol_required      = string.format("%.4f", price),
  base_price        = string.format("%.4f", base_price),
  dynamic           = dynamic,
  multiplier        = math.floor(multiplier * 100 + 0.5) / 100,
  anchor_count      = anchor_count,
  chain_age_days    = math.floor(chain_age_days * 10 + 0.5) / 10,
  buyers_30d        = buyers_30d,
  pay_endpoint      = base_url .. "/api/soul/pay",
  price_endpoint    = base_url .. "/api/soul/price",
}

-- Wallet-Adresse: bei aktivem EU_CONSUMER_RIGHTS bewusst NICHT vorab nennen (siehe
-- show_withdrawal_terms.mjs) — erst nach erteilter Zustimmung über terms/accept.
-- Ohne das Flag ist Vorab-Nennung unproblematisch (kein Widerrufsrecht durchgesetzt).
if EU_CONSUMER_RIGHTS then
  response.wallet      = ""
  response.wallet_note = "Zahlungsziel wird erst nach show_withdrawal_terms + accept_digital_content_terms genannt (EU-Widerrufsrecht)."
else
  response.wallet = amort.wallet or ""
end

-- Nicht-Krypto-Zahlungsweg (manuell bestätigt, kein Auto-Verify) — nur wenn aktiviert
if amort.paypal_enabled then
  local target = (amort.paypal_link and amort.paypal_link ~= "") and amort.paypal_link
              or (amort.paypal_email or "")
  response.paypal_accepted = true
  response.price_eur       = amort.price_eur or ""
  -- Preisangabe MwSt. (PAngV §6) — Endpreis-Klarstellung, Pflichtangabe vor Vertragsschluss
  response.price_note      = (amort.trader_vat_note and amort.trader_vat_note ~= "")
                              and amort.trader_vat_note
                              or "Alle Preise sind Endpreise (inkl. ggf. anfallender gesetzl. MwSt.)."
  if EU_CONSUMER_RIGHTS then
    -- Ziel bewusst NICHT in paypal_target oder im Hinweistext — sonst wäre die
    -- Zustimmungspflicht unten wirkungslos (Ziel stünde ja schon hier).
    response.paypal_target = ""
    response.paypal_note   = "Für Nicht-Krypto-Zugang: WENN der Käufer in der EU ist, ZUERST" ..
      " show_withdrawal_terms aufrufen (gesetzliches Widerrufsrecht, nicht optional)," ..
      " erst danach zur Zahlung übergehen — das Zahlungsziel wird erst in der Antwort von" ..
      " accept_digital_content_terms genannt, nach erteilter Zustimmung. Nach Zahlung in der" ..
      " Zahlungsnotiz eine E-Mail-Adresse hinterlassen, an die der Zugangs-Token geschickt werden" ..
      " kann. Manuelle Prüfung, in der Regel innerhalb von 48 Stunden. Den erhaltenen Token direkt" ..
      " mit soul_read_by_token(read_endpoint, access_token) verwenden — keine erneute Zahlung anfordern."
  else
    response.paypal_target = target
    response.paypal_note   = "Für Nicht-Krypto-Zugang: PayPal an " .. target ..
      " senden und dabei in der Zahlungsnotiz eine E-Mail-Adresse hinterlassen, an die der Zugangs-Token" ..
      " geschickt werden kann. Manuelle Prüfung, in der Regel innerhalb von 48 Stunden. Den erhaltenen" ..
      " Token direkt mit soul_read_by_token(read_endpoint, access_token) verwenden — keine erneute Zahlung anfordern."
  end
end

ngx.say(cjson.encode(response))
