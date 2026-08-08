-- /etc/openresty/lua/vault_consent_list.lua
-- GET /api/vault/consent-list
-- Listet alle EU-Widerrufsbestätigungs-PDFs des authentifizierten Souls auf.
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

local dir = "/var/lib/sys/souls/" .. soul_id .. "/consent_docs/"

local handle = io.popen('ls -1 "' .. dir .. '" 2>/dev/null')
if not handle then
  ngx.say(cjson.encode({ ok = true, soul_id = soul_id, files = {} })); return
end

local files = {}
for line in handle:lines() do
  local name = line:gsub("^%s+", ""):gsub("%s+$", "")
  if name ~= "" and name:match("%.pdf$") then
    local fpath = dir .. name
    local f = io.open(fpath, "rb")
    local size = 0
    if f then
      size = f:seek("end") or 0
      f:close()
    end
    local safe_fpath = fpath:gsub('"', '\\"')
    local sh = io.popen('stat -c "%Y" "' .. safe_fpath .. '" 2>/dev/null')
    local mtime = 0
    if sh then
      local s = sh:read("*l"); sh:close()
      mtime = tonumber(s) or 0
    end
    -- Referenz-ID = Dateiname ohne .pdf-Endung
    local reference_id = name:gsub("%.pdf$", "")

    -- Dokumenttyp-Sidecar (von show_withdrawal_terms.mjs/accept_digital_content_terms.mjs
    -- geschrieben, siehe dortiger Kommentar) — rein informativ fürs Frontend, damit der
    -- Vault-Explorer "Rechnung"/"Widerrufsbelehrung"/... statt nur der UUID zeigen kann.
    -- Fehlt sie (ältere, vor dieser Änderung erzeugte Dokumente), bleibt doc_type/
    -- invoice_number einfach nil — das Frontend fällt dann auf die reine Referenz-ID zurück.
    local doc_type, invoice_number
    local tf = io.open(dir .. reference_id .. ".doctype.json", "r")
    if tf then
      local ok_t, meta = pcall(cjson.decode, tf:read("*a")); tf:close()
      if ok_t and type(meta) == "table" then
        doc_type       = meta.type
        invoice_number = meta.invoice_number
      end
    end

    files[#files + 1] = {
      name = name, reference_id = reference_id, size = size, mtime = mtime,
      doc_type = doc_type, invoice_number = invoice_number,
    }
  end
end
handle:close()

table.sort(files, function(a, b) return a.mtime > b.mtime end)

ngx.say(cjson.encode({ ok = true, soul_id = soul_id, files = files }))
