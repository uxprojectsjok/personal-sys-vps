-- /etc/openresty/lua/vault_consent_serve.lua
-- GET /api/vault/consent/{soul_id}/{reference_id}/{doc_type}.pdf
-- GET /api/vault/consent/{soul_id}/{reference_id}/{doc_type}.txt  (maschinenlesbares Pendant)
--
-- Liefert EU-Widerrufsbestätigungs-Dokumente aus consent_docs/{reference_id}/ aus —
-- bewusst OHNE vault_auth (kein Zahlungs-Token existiert an dieser Stelle im
-- Kaufprozess noch). Sicherheit beruht auf der Unratbarkeit der reference_id im
-- Pfad (analog Freigabe-Links bei Dropbox/Google Docs) — NICHT auf einer
-- Session/einem Token. consent_docs/ ist bewusst getrennt von vault_shared/,
-- damit diese personenbezogenen Dokumente nicht über vault_shared_list/-get für
-- andere zahlende Agenten oder Peers sichtbar werden.
--
-- Ein Ordner pro Kauf (reference_id = terms_token aus show_withdrawal_terms.mjs),
-- mit festen, sprechenden Dateinamen statt weiterer Zufalls-UUIDs pro Dokument —
-- die reference_id ist bereits unratbar, ein zusätzlicher Token pro Dokument
-- brachte keinen Sicherheitsgewinn (siehe eu_withdrawal_terms.mjs, DOC_TYPES).
--
-- Nur GET, nie POST/PUT/DELETE — dieser unauthentifizierte Endpunkt darf unter
-- keinen Umständen etwas verändern oder löschen können (das übernehmen
-- ausschließlich die owner-only Routen vault_consent_list.lua/-delete.lua
-- bzw. der Best-effort-Sweep in eu_withdrawal_terms.mjs).

local SOULS_DIR = "/var/lib/sys/souls/"
local UUID_PAT  = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"

-- Muss mit DOC_TYPES in soul-mcp/lib/eu_withdrawal_terms.mjs übereinstimmen.
local DOC_TYPES = {
  vorabinformation = true,
  rechnung = true,
  widerrufsbelehrung = true,
  verzichtserklaerung = true,
}

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

-- Lua-Patterns kennen kein Regex-"|" für Alternation (anders als PCRE) — erst
-- die Extension generisch fangen, dann gegen die Whitelist prüfen.
local soul_id, reference_id, doc_type, ext = ngx.var.uri:match("^/api/vault/consent/([^/]+)/([^/]+)/([^/]+)%.(%a+)$")

if ext ~= "pdf" and ext ~= "txt" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_extension"}')
  return
end

if not soul_id or not soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_soul_id"}')
  return
end

if not reference_id or not reference_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_reference_id"}')
  return
end

if not doc_type or not DOC_TYPES[doc_type] then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_doc_type"}')
  return
end

local fpath = SOULS_DIR .. soul_id .. "/consent_docs/" .. reference_id .. "/" .. doc_type .. "." .. ext
local f = io.open(fpath, "rb")
if not f then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"not_found"}')
  return
end

local size = f:seek("end")
f:seek("set", 0)

if ext == "txt" then
  -- inline statt attachment: für einen zahlenden Agenten, der die URL direkt
  -- fetcht und einliest, nicht für einen Browser-Download gedacht.
  ngx.header["Content-Type"] = "text/plain; charset=utf-8"
else
  ngx.header["Content-Type"]        = "application/pdf"
  ngx.header["Content-Disposition"] = 'attachment; filename="' .. doc_type .. '.pdf"'
end
ngx.header["Content-Length"]      = tostring(size)
-- Kein Caching: dieselbe URL liefert erst die Vorschau (show_withdrawal_terms),
-- dann nach Zustimmung den aktualisierten, bestätigten Beleg (accept_digital_content_terms)
-- aus — ein gecachter Browser würde sonst die veraltete Vorschau weiterzeigen.
ngx.header["Cache-Control"]       = "no-store"

local CHUNK = 65536
while true do
  local chunk = f:read(CHUNK)
  if not chunk then break end
  ngx.print(chunk)
end
f:close()
