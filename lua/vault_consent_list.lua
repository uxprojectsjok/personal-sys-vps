-- /etc/openresty/lua/vault_consent_list.lua
-- GET /api/vault/consent-list
-- Listet alle Kaufbeleg-Ordner (ein Ordner pro Kauf/Referenz-ID) des
-- authentifizierten Souls auf.
-- Auth: soul_auth.lua → ngx.ctx.soul_id (owner-only, wie vault_shared_list.lua)

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if not soul_id or not soul_id:match("^[a-zA-Z0-9%-]+$") then
  ngx.status = 403; ngx.say('{"error":"invalid_soul"}'); return
end

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

-- Muss mit DOC_TYPES in soul-mcp/lib/eu_withdrawal_terms.mjs übereinstimmen.
local DOC_TYPES = { "vorabinformation", "rechnung", "widerrufsbelehrung", "verzichtserklaerung" }

local dir = "/var/lib/sys/souls/" .. soul_id .. "/consent_docs/"

local handle = io.popen('ls -1 "' .. dir .. '" 2>/dev/null')
if not handle then
  ngx.say(cjson.encode({ ok = true, soul_id = soul_id, purchases = setmetatable({}, cjson.array_mt) })); return
end

-- array_mt erzwingt JSON-Array-Serialisierung auch bei 0 Einträgen — cjson kann
-- bei einer leeren Lua-Tabelle sonst nicht zwischen Array und Objekt
-- unterscheiden und kodiert sie als "{}" statt "[]" (Frontend prüft
-- consentPurchases.length === 0, was bei einem Objekt "undefined" statt 0 ist).
local purchases = setmetatable({}, cjson.array_mt)
for line in handle:lines() do
  local reference_id = line:gsub("^%s+", ""):gsub("%s+$", "")
  -- Nur Kaufordner (reference_id = UUID) berücksichtigen — überspringt stillschweigend
  -- vereinzelte Alt-Dateien aus der vorherigen Flat-File-Struktur, falls noch vorhanden.
  if reference_id ~= "" and reference_id:match("^[%a%d%-]+$") then
    local folderPath = dir .. reference_id .. "/"
    local safe_folder = folderPath:gsub('"', '\\"')

    -- Ist es überhaupt ein Ordner? (test -d, günstiger als ein zweites io.popen)
    local dh = io.open(folderPath .. "meta.json", "r")
    local is_folder = dh ~= nil
    if dh then dh:close() end

    if is_folder then
      -- meta.json: created_at/payment_method (von show_withdrawal_terms), ergänzt um
      -- invoice_number/accepted_at (von accept_digital_content_terms) — rein informativ
      -- fürs Frontend, siehe eu_withdrawal_terms.mjs.
      local invoice_number, created_at, accepted_at
      local mf = io.open(folderPath .. "meta.json", "r")
      if mf then
        local ok_m, meta = pcall(cjson.decode, mf:read("*a")); mf:close()
        if ok_m and type(meta) == "table" then
          invoice_number = meta.invoice_number
          created_at     = meta.created_at
          accepted_at    = meta.accepted_at
        end
      end

      -- Welche der vier Dokumente existieren bereits (Vorabinformation immer,
      -- die anderen drei erst nach erteilter Zustimmung)?
      local docs = setmetatable({}, cjson.array_mt)
      local mtime = 0
      for _, doc_type in ipairs(DOC_TYPES) do
        local fpath = folderPath .. doc_type .. ".pdf"
        local f = io.open(fpath, "rb")
        if f then
          f:close()
          docs[#docs + 1] = doc_type
          local sh = io.popen('stat -c "%Y" "' .. safe_folder .. doc_type .. '.pdf" 2>/dev/null')
          if sh then
            local s = sh:read("*l"); sh:close()
            local t = tonumber(s) or 0
            if t > mtime then mtime = t end
          end
        end
      end

      purchases[#purchases + 1] = {
        reference_id   = reference_id,
        invoice_number = invoice_number,
        created_at     = created_at,
        accepted_at    = accepted_at,
        docs           = docs,
        mtime          = mtime,
      }
    end
  end
end
handle:close()

table.sort(purchases, function(a, b) return a.mtime > b.mtime end)

ngx.say(cjson.encode({ ok = true, soul_id = soul_id, purchases = purchases }))
