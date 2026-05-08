-- /etc/openresty/lua/pol_token_check.lua
-- Shared helper: pol_access_token validieren.
-- 1. Shared dict (hot path, respects TTL)
-- 2. File fallback (Wiederherstellung nach OpenResty-Neustart)
--    Prüft expires_at manuell, füllt dict nach.

local cjson = require("cjson.safe")
local M     = {}

local TOKEN_DIR = "/var/lib/sys/pol_tokens/"
local UUID_PAT  = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"

-- Parst "YYYY-MM-DDTHH:MM:SS" (mit oder ohne abschließendes Z) → Unix-Timestamp.
-- Gibt nil zurück wenn Format nicht erkannt.
local function parse_iso(s)
  if type(s) ~= "string" then return nil end
  local y,mo,d,h,mi,sec = s:match("^(%d%d%d%d)-(%d%d)-(%d%d)T(%d%d):(%d%d):(%d%d)")
  if not y then return nil end
  return os.time({
    year  = tonumber(y),
    month = tonumber(mo),
    day   = tonumber(d),
    hour  = tonumber(h),
    min   = tonumber(mi),
    sec   = tonumber(sec),
  })
end

---@return table|nil  token_data (soul_id, tx_hash, expires_at, …) or nil wenn ungültig/abgelaufen
function M.check(token)
  if type(token) ~= "string" or not token:match("^%x+$") or #token < 32 then
    return nil
  end
  local tok_lower = token:lower()

  -- ── 1. Shared dict ───────────────────────────────────────────────────────────
  local access_cache = ngx.shared.pol_access
  if access_cache then
    local raw = access_cache:get("tok:" .. tok_lower)
    if raw then
      local ok, data = pcall(cjson.decode, raw)
      if ok and type(data) == "table"
         and type(data.soul_id) == "string"
         and data.soul_id:match(UUID_PAT) then
        return data
      end
    end
  end

  -- ── 2. File fallback (nach Neustart) ─────────────────────────────────────────
  local tf = io.open(TOKEN_DIR .. tok_lower .. ".json", "r")
  if not tf then return nil end
  local raw_file = tf:read("*a"); tf:close()

  local ok_f, data = pcall(cjson.decode, raw_file)
  if not ok_f or type(data) ~= "table" then return nil end

  -- Ablaufzeit prüfen
  local exp_ts = parse_iso(data.expires_at)
  local now    = os.time()
  if exp_ts and exp_ts < now then
    -- Abgelaufen → Datei entfernen, nil zurückgeben
    os.remove(TOKEN_DIR .. tok_lower .. ".json")
    return nil
  end

  -- soul_id validieren (Path-Traversal-Schutz + Korruptionscheck)
  if type(data.soul_id) ~= "string" or not data.soul_id:match(UUID_PAT) then
    return nil
  end

  -- exp_ts muss bekannt sein; bei unbekanntem Format Token ablehnen (kein Fallback-Default)
  if not exp_ts then return nil end

  -- Gültig → Shared dict mit verbleibender TTL neu befüllen (Restart-Recovery)
  if access_cache then
    local remaining = exp_ts - now
    if remaining > 0 then
      access_cache:set("tok:" .. tok_lower, raw_file, remaining)
    end
  end

  return data
end

return M
