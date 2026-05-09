-- /etc/openresty/lua/soul_social_read.lua
-- GET /api/soul/social-read?soul_id=<target_soul_id>
-- Authorization: Bearer <peer_soul_id>.<peer_cert>
-- v2 2026-05-09 — three-sphere model: HTTP access to <!-- SOCIAL:START/END --> block.
-- Auth: peer_soul_id must be in target soul's trusted_souls list.
-- Same-server peers: cert verified locally via HMAC.
-- Cross-domain peers: cert verified remotely via /api/soul/verify-peer-cert on peer's endpoint.

local cjson     = require("cjson.safe")
local resty_aes = require("resty.aes")
local http      = require("resty.http")
local cfg       = require("config_reader")
local hmac      = require("hmac_helper")

ngx.header["Content-Type"]  = "text/plain; charset=utf-8"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Method not allowed"}')
  return
end

local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"

-- ── Bearer = peer_soul_id.peer_cert ──────────────────────────────────────────
local auth   = ngx.req.get_headers()["Authorization"] or ""
local bearer = auth:match("^[Bb]earer%s+(.+)$")
if not bearer then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.header["WWW-Authenticate"] = 'Bearer realm="soul-social"'
  ngx.say('{"error":"Bearer <peer_soul_id>.<peer_cert> erforderlich"}')
  return
end

local peer_soul_id, peer_cert = bearer:match("^([^.]+)%.(.+)$")
if not peer_soul_id or not peer_cert then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Ungültiges Bearer-Format (erwarte soul_id.cert)"}')
  return
end

if not peer_soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_peer_soul_id"}')
  return
end

-- ── target_soul_id aus Query-Param ────────────────────────────────────────────
local args          = ngx.req.get_uri_args()
local target_soul_id = args.soul_id or ""
if not target_soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_soul_id"}')
  return
end

local SOULS_DIR = "/var/lib/sys/souls/"

-- ── api_context der Ziel-Soul lesen ───────────────────────────────────────────
local cf = io.open(SOULS_DIR .. target_soul_id .. "/api_context.json", "r")
if not cf then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Soul nicht gefunden"}')
  return
end
local raw_ctx = cf:read("*a"); cf:close()
local ok_c, ctx = pcall(cjson.decode, raw_ctx)
if not ok_c or type(ctx) ~= "table" then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"api_context corrupt"}')
  return
end

-- ── Prüfen ob peer_soul_id in trusted_souls ────────────────────────────────────
local amort = ctx.amortization
local trusted_souls = (type(amort) == "table" and type(amort.trusted_souls) == "table")
  and amort.trusted_souls or {}

local found_same_server = false
local found_cross_domain_endpoint = nil

for _, entry in ipairs(trusted_souls) do
  if type(entry) == "string" and entry == peer_soul_id then
    found_same_server = true
    break
  elseif type(entry) == "table" and entry.soul_id == peer_soul_id then
    found_cross_domain_endpoint = entry.endpoint
    break
  end
end

if not found_same_server and not found_cross_domain_endpoint then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"peer_not_trusted","message":"peer_soul_id ist nicht in der trusted_souls-Liste der Ziel-Soul."}')
  return
end

-- ── Cert verifizieren ─────────────────────────────────────────────────────────
local cert_ok = false

if found_same_server then
  -- Same-Server: lokale HMAC-Verifikation
  local master_key = cfg.get_master_key()
  if master_key and master_key ~= "" then
    local cv_ctx = io.open(SOULS_DIR .. peer_soul_id .. "/api_context.json", "r")
    local cv = 0
    if cv_ctx then
      local raw_cv = cv_ctx:read("*a"); cv_ctx:close()
      local ok_v, cv_data = pcall(cjson.decode, raw_cv)
      if ok_v and type(cv_data) == "table" and type(cv_data.cert_version) == "number" then
        cv = cv_data.cert_version
      end
    end
    -- Prüfe cert_version und Fallback ±1
    for _, v in ipairs({ cv, cv - 1, cv + 1 }) do
      if v >= 0 and hmac.cert_for_soul(master_key, peer_soul_id, v) == peer_cert then
        cert_ok = true
        break
      end
    end
  end
else
  -- Cross-Domain: Cert beim Heimat-Server des Peers prüfen
  local verify_url = found_cross_domain_endpoint
    .. "/api/soul/verify-peer-cert?soul_id=" .. peer_soul_id .. "&cert=" .. peer_cert
  local httpc = http.new()
  httpc:set_timeout(8000)
  local res, err = httpc:request_uri(verify_url, { method = "GET", headers = { Accept = "application/json" } })
  if res and res.status == 200 then
    local ok_v, vdata = pcall(cjson.decode, res.body or "")
    if ok_v and type(vdata) == "table" and vdata.ok == true then
      cert_ok = true
    end
  end
end

if not cert_ok then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_peer_cert","message":"Peer-Cert ungültig oder abgelaufen."}')
  return
end

-- ── sys.md lesen ──────────────────────────────────────────────────────────────
local sf = io.open(SOULS_DIR .. target_soul_id .. "/sys.md", "r")
if not sf then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"sys.md nicht gefunden"}')
  return
end
local content = sf:read("*a"); sf:close()

-- ── Entschlüsselung bei Magic SYS\x01 ────────────────────────────────────────
if content:sub(1, 4) == "SYS\x01" then
  local vault_key_hex = ctx.vault_key_hex or ""
  if vault_key_hex == "" then
    ngx.status = 403
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"vault_key_missing","message":"Vault-Schlüssel nicht verfügbar — Soul muss einmal entsperrt werden."}')
    return
  end
  local function hex_to_bin(h) return (h:gsub("..", function(b) return string.char(tonumber(b, 16)) end)) end
  local iv         = content:sub(5, 20)
  local ciphertext = content:sub(21)
  local aes_ctx    = resty_aes:new(hex_to_bin(vault_key_hex), nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"decrypt_init_failed"}')
    return
  end
  local decrypted = aes_ctx:decrypt(ciphertext)
  if not decrypted then
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"decrypt_failed"}')
    return
  end
  content = decrypted
end

-- ── SOCIAL-Block ausliefern ───────────────────────────────────────────────────
-- Sicherheitsregel: nur der SOCIAL-Block verlässt den Server — nie die Intimsphäre.
local SOCIAL_START = "<!-- SOCIAL:START -->"
local SOCIAL_END   = "<!-- SOCIAL:END -->"
local s = content:find(SOCIAL_START, 1, true)
local e = content:find(SOCIAL_END,   1, true)

if not s or not e or e <= s then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"no_social_content","message":"Kein Sozialsphäre-Block definiert (<!-- SOCIAL:START --> fehlt in sys.md v2)."}')
  return
end

local social_content = content:sub(s + #SOCIAL_START, e - 1):match("^%s*(.-)%s*$")
if not social_content or #social_content == 0 then
  ngx.status = 204
  return
end

ngx.header["Content-Type"] = "text/plain; charset=utf-8"
ngx.say(social_content)
