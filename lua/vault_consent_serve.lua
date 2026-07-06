-- /etc/openresty/lua/vault_consent_serve.lua
-- GET /api/vault/consent/{soul_id}/{uuid}.pdf
--
-- Liefert EU-Widerrufsbestätigungs-PDFs aus consent_docs/ aus — bewusst OHNE
-- vault_auth (kein Zahlungs-Token existiert an dieser Stelle im Kaufprozess
-- noch). Sicherheit beruht auf der Unratbarkeit der UUID im Pfad (analog
-- Freigabe-Links bei Dropbox/Google Docs) — NICHT auf einer Session/einem
-- Token. consent_docs/ ist bewusst getrennt von vault_shared/, damit diese
-- personenbezogenen Dokumente nicht über vault_shared_list/-get für andere
-- zahlende Agenten oder Peers sichtbar werden.

local SOULS_DIR = "/var/lib/sys/souls/"
local UUID_PAT  = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

local soul_id, file_uuid = ngx.var.uri:match("^/api/vault/consent/([^/]+)/([^/]+)%.pdf$")

if not soul_id or not soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_soul_id"}')
  return
end

if not file_uuid or not file_uuid:match(UUID_PAT) then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_reference_id"}')
  return
end

local fpath = SOULS_DIR .. soul_id .. "/consent_docs/" .. file_uuid .. ".pdf"
local f = io.open(fpath, "rb")
if not f then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"not_found"}')
  return
end

local size = f:seek("end")
f:seek("set", 0)

ngx.header["Content-Type"]        = "application/pdf"
ngx.header["Content-Disposition"] = 'attachment; filename="widerrufsbestaetigung.pdf"'
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
