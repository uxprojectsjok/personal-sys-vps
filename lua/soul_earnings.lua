-- /etc/openresty/lua/soul_earnings.lua
-- GET /api/soul/earnings  → earnings.json lesen, Fallback: vault/context/earnings.md
-- Auth: vault_auth.lua (soul_cert)

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unauthorized"}')
  return
end

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Method not allowed"}')
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local SOULS_DIR    = "/var/lib/sys/souls/"
local earnings_file = SOULS_DIR .. soul_id .. "/earnings.json"
-- earnings.md (neu), income.md (legacy-Fallback)
local earnings_md  = SOULS_DIR .. soul_id .. "/vault/context/earnings.md"
local income_md    = SOULS_DIR .. soul_id .. "/vault/context/income.md"

-- ── Entschlüsselung (CBC, gleiches Format wie überall im Vault) ──────────────
local MAGIC = "SYS\x01"
local function hex_to_bin(hex)
  return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
end
local function try_decrypt(data)
  if not data or data == "" then return data end
  if data:sub(1, 4) ~= MAGIC then return data end
  local vault_key = ngx.ctx.vault_key
  if not vault_key or #vault_key ~= 64 then return nil end
  local resty_aes  = require("resty.aes")
  local iv         = data:sub(5, 20)
  local ciphertext = data:sub(21)
  local key        = hex_to_bin(vault_key)
  local aes_ctx    = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return nil end
  return aes_ctx:decrypt(ciphertext)
end

-- ── Hilfsfunktion: earnings.md / income.md → earnings-Struktur rekonstruieren ─
local function rebuild_from_income_md()
  local f = io.open(earnings_md, "rb") or io.open(income_md, "rb")
  if not f then return nil end
  local raw_enc = f:read("*a"); f:close()
  local raw = try_decrypt(raw_enc)
  if not raw then return nil end

  local entries   = {}
  local total_pol = 0.0

  -- <!-- @income redeemed:{ts} tx:{hash} from:{wallet} pol:{amount} confirmed:{ts} -->
  for line in raw:gmatch("[^\n]+") do
    local redeemed, tx, from, pol, confirmed = line:match(
      "<!%-%- @income redeemed:(%S+) tx:(%S+) from:(%S+) pol:(%S+) confirmed:(%S+) %-%->"
    )
    if redeemed and tx then
      table.insert(entries, {
        tx_hash      = tx,
        from         = from ~= "unknown" and from or nil,
        pol_amount   = pol,
        confirmed_at = confirmed ~= "unknown" and confirmed or nil,
        redeemed_at  = redeemed,
      })
      total_pol = total_pol + (tonumber(pol) or 0)
    end
  end

  if #entries == 0 then return nil end

  return {
    total_pol      = string.format("%.6f", total_pol),
    total_requests = #entries,
    entries        = entries,
    restored_from  = "earnings.md",
  }
end

-- ── earnings.json lesen ───────────────────────────────────────────────────────
local ef = io.open(earnings_file, "r")
local data

if ef then
  local raw = ef:read("*a"); ef:close()
  local ok, parsed = pcall(cjson.decode, raw)
  if ok and type(parsed) == "table" and type(parsed.entries) == "table" and #parsed.entries > 0 then
    data = parsed
  end
end

-- ── Fallback: income.md wenn earnings.json fehlt oder leer ist ───────────────
if not data then
  local rebuilt = rebuild_from_income_md()
  if rebuilt then
    data = rebuilt
    -- earnings.json neu schreiben damit nächste Anfrage direkt liest
    local wf = io.open(earnings_file, "w")
    if wf then
      wf:write(cjson.encode({
        total_pol      = rebuilt.total_pol,
        total_requests = rebuilt.total_requests,
        entries        = rebuilt.entries,
      }))
      wf:close()
    end
  end
end

if not data then
  ngx.say(cjson.encode({
    ok             = true,
    total_pol      = "0.000000",
    total_requests = 0,
    entries        = cjson.empty_array,
  }))
  return
end

data.ok             = true
data.total_pol      = data.total_pol or "0.000000"
data.total_requests = data.total_requests or 0
if type(data.entries) ~= "table" then data.entries = cjson.empty_array end

ngx.say(cjson.encode(data))
