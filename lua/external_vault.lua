-- /etc/openresty/lua/external_vault.lua
-- GET /api/vault/external/soul
--
-- Holt die Soul-Datei von einer extern gespeicherten, öffentlich fetchbaren URL.
-- Unterstützt beliebige Speicherorte (ArDrive, IPFS, S3, GitHub, Dropbox, …)
-- Entschlüsselt on-the-fly wenn SYS\x01 Magic-Header vorhanden (AES-256-CBC).
-- Auth: vault_auth.lua (soul_cert ODER service_token)

local cjson   = require("cjson.safe")
local http    = require("resty.http")
local aes     = require("resty.aes")
local soul_id = ngx.ctx.soul_id
local base_dir = "/var/lib/sys/souls/" .. soul_id
local ctx_file = base_dir .. "/api_context.json"

-- Nur GET
if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Method not allowed"}')
  return
end

-- api_context.json lesen
local f = io.open(ctx_file, "r")
if not f then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"No context configured"}')
  return
end
local raw = f:read("*a"); f:close()
local ok, ctx = pcall(cjson.decode, raw)
if not ok or type(ctx) ~= "table" then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Context parse error"}')
  return
end

local url = ctx.external_soul_url
if not url or url == "" then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"no_external_url","message":"Keine externe Soul-URL konfiguriert."}')
  return
end

-- Sicherheit: nur HTTPS-URLs
if not url:match("^https://") then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_url","message":"Nur HTTPS-URLs werden unterstützt."}')
  return
end

-- SSRF-Schutz: private IPs / Loopback / Link-Local blockieren
local blocked_hosts = {
  "localhost", "127%.", "10%.", "192%.168%.", "172%.1[6-9]%.",
  "172%.2[0-9]%.", "172%.3[01]%.", "169%.254%.", "%[::1%]", "0%.0%.0%.0"
}
local url_host = url:match("^https://([^/]+)")
if url_host then
  for _, pattern in ipairs(blocked_hosts) do
    if url_host:lower():find(pattern) then
      ngx.status = 400
      ngx.header["Content-Type"] = "application/json"
      ngx.say('{"error":"ssrf_blocked","message":"Interne Adressen sind nicht erlaubt."}')
      return
    end
  end
end

-- URL-Länge begrenzen
if #url > 2048 then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"url_too_long"}')
  return
end

-- Externe URL fetchen
local httpc = http.new()
httpc:set_timeout(15000)
local res, err = httpc:request_uri(url, {
  method     = "GET",
  ssl_verify = true,
  headers    = { ["User-Agent"] = "SYS-ExternalVault/1.0" }
})

if not res then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"fetch_failed","message":"' .. (err or "Verbindung fehlgeschlagen") .. '"}')
  return
end

if res.status ~= 200 then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"upstream_error","message":"Externe Quelle antwortete mit ' .. res.status .. '"}')
  return
end

local body = res.body
if not body or #body == 0 then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"empty_response","message":"Leere Antwort von externer Quelle."}')
  return
end

-- Response-Size-Limit: max. 25 MB (verhindert Memory-Exhaustion)
if #body > 25 * 1024 * 1024 then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"response_too_large","message":"Externe Quelle überschreitet 25 MB Limit."}')
  return
end

-- SYS\x01 Magic-Header: AES-256-CBC verschlüsselt (Format: 4B Magic + 16B IV + Ciphertext)
local MAGIC = "\x53\x59\x53\x01"
if #body > 20 and body:sub(1, 4) == MAGIC then
  local vault_key = ngx.ctx.vault_key
  -- Hex-Format validieren: genau 64 Zeichen [0-9a-f] (= 32 Bytes AES-256-Key)
  local key_valid = vault_key and #vault_key == 64 and vault_key:match("^[0-9a-f]+$")
  if not key_valid then
    ngx.status = 403
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"vault_locked","message":"Vault gesperrt – Entschlüsselung nicht möglich."}')
    return
  end

  -- 64-Hex-String → 32 Bytes
  local key_bytes = vault_key:gsub("%x%x", function(h)
    return string.char(tonumber(h, 16))
  end)
  if #key_bytes ~= 32 then
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"key_error","message":"Vault-Schlüssel ungültig."}')
    return
  end

  local iv     = body:sub(5, 20)
  local cipher = body:sub(21)

  local aes_obj = aes:new(key_bytes, nil, aes.cipher(256, "cbc"), { iv = iv }, nil, 1)
  if not aes_obj then
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"aes_init","message":"AES-Initialisierung fehlgeschlagen."}')
    return
  end

  local decrypted = aes_obj:decrypt(cipher)
  if not decrypted then
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"decrypt_failed","message":"Entschlüsselung fehlgeschlagen – falscher Schlüssel?"}')
    return
  end

  ngx.header["Content-Type"]  = "text/plain; charset=utf-8"
  ngx.header["Cache-Control"] = "no-store"
  ngx.say(decrypted)
else
  -- Kein Magic-Header → Plaintext direkt servieren
  ngx.header["Content-Type"]  = "text/plain; charset=utf-8"
  ngx.header["Cache-Control"] = "no-store"
  ngx.say(body)
end
