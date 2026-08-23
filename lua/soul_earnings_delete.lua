-- /etc/openresty/lua/soul_earnings_delete.lua
-- DELETE /api/soul/earnings/<tx_hash> → { ok }
-- Auth: vault_auth.lua (soul_cert)
--
-- Entfernt einen einzelnen TX-Eintrag aus der Earnings-Tabelle (earnings.vue).
-- tx_hash ist die on-chain eindeutige Kennung -- dieselbe, die die Tabelle
-- schon als Zeilen-Schlüssel nutzt (siehe soul_earnings.lua). Sucht in
-- beiden Dateien (aktuelle USDC-Verkäufe + historische POL-Direktüberweisungen),
-- da beide dieselbe Tabelle speisen und der Client nicht wissen muss, in
-- welcher Datei ein Eintrag tatsächlich liegt.

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unauthorized"}')
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local tx_hash = ngx.var.uri:match("^/api/soul/earnings/([^/]+)$")
if not tx_hash or tx_hash == "" then
  ngx.status = 400
  ngx.say('{"error":"tx_hash_required"}')
  return
end

local SOULS_DIR = "/var/lib/sys/souls/"

-- Entfernt tx_hash aus file.entries (falls vorhanden), rechnet total_usdc/
-- total_pol + total_requests neu, schreibt die Datei zurück. amount_field
-- ist "usdc_amount" (usdc_earnings.json) oder "pol_amount" (earnings.json),
-- total_field entsprechend "total_usdc"/"total_pol".
local function remove_from(path, amount_field, total_field)
  local f = io.open(path, "r")
  if not f then return false end
  local raw = f:read("*a"); f:close()
  local ok, data = pcall(cjson.decode, raw)
  if not ok or type(data) ~= "table" or type(data.entries) ~= "table" then return false end

  local kept  = {}
  local found = false
  local total = 0.0
  for _, e in ipairs(data.entries) do
    if type(e) == "table" and e.tx_hash == tx_hash then
      found = true
    else
      table.insert(kept, e)
      if type(e) == "table" then
        total = total + (tonumber(e[amount_field]) or 0)
      end
    end
  end
  if not found then return false end

  data.entries        = kept
  data.total_requests  = #kept
  data[total_field]    = string.format("%.6f", total)

  local wf = io.open(path, "w")
  if not wf then return false end
  wf:write(cjson.encode(data)); wf:close()
  return true
end

local usdc_removed = remove_from(SOULS_DIR .. soul_id .. "/usdc_earnings.json", "usdc_amount", "total_usdc")
local pol_removed  = not usdc_removed and remove_from(SOULS_DIR .. soul_id .. "/earnings.json", "pol_amount", "total_pol")

if not usdc_removed and not pol_removed then
  ngx.status = 404
  ngx.say('{"error":"not_found"}')
  return
end

ngx.say('{"ok":true}')
