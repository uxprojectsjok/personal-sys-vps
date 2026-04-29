-- /etc/openresty/lua/api_serve.lua
-- Bedient GET-Anfragen für:
--   /api/soul              → sys.md (Text, ggf. entschlüsselt)
--   /api/vault/manifest    → Liste freigegebener Ressourcen
--   /api/vault/audio       → Liste Audio-Dateien (MP3)
--   /api/vault/audio/{f}   → Audio-Datei
--   /api/vault/video       → Liste Video-Dateien (MP4)
--   /api/vault/video/{f}   → Video-Datei
--   /api/vault/images      → Liste Bild-Dateien
--   /api/vault/images/{f}  → Bild-Datei
--   /api/vault/context     → Liste Text-Kontext-Dateien
--   /api/vault/context/{f} → Text-Datei
-- Auth: vault_auth.lua (soul-cert ODER webhook-token)
--
-- Verschlüsselung: AES-256-CBC
--   Dateiformat: "SYS\x01" (4 Bytes Magic) + IV (16 Bytes) + Ciphertext
--   vault_key aus ngx.ctx.vault_key (64-Hex-String, von vault_auth gesetzt)

local cjson     = require("cjson.safe")
local resty_aes = require("resty.aes")
local soul_id   = ngx.ctx.soul_id
local base_dir  = "/var/lib/sys/souls/" .. soul_id
local uri       = ngx.var.uri

-- CORS für externe Dienste (ElevenLabs, etc.)
ngx.header["Access-Control-Allow-Origin"]  = "*"
ngx.header["Access-Control-Allow-Methods"] = "GET, DELETE, OPTIONS"
ngx.header["Access-Control-Allow-Headers"] = "Authorization, X-Webhook-Token"

if ngx.req.get_method() == "OPTIONS" then
  ngx.status = 204; return
end

-- ── Verschlüsselung ─────────────────────────────────────────────────────────

local MAGIC = "SYS\x01"  -- 4 Magic-Bytes zur Erkennung verschlüsselter Dateien

local function hex_to_bin(hex)
  return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
end

-- Gibt entschlüsselten Inhalt zurück oder nil bei Fehler
local function try_decrypt(data, vault_key_hex)
  if #data < 4 + 16 + 16 then return nil end  -- zu kurz: magic(4) + iv(16) + min. 1 Block(16)
  if data:sub(1, 4) ~= MAGIC then return nil end  -- nicht verschlüsselt
  if not vault_key_hex or vault_key_hex == "" then return nil end

  local iv         = data:sub(5, 20)  -- 16 Bytes IV
  local ciphertext = data:sub(21)

  local key = hex_to_bin(vault_key_hex)

  local aes_ctx, err = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then
    ngx.log(ngx.ERR, "[api_serve] AES init failed: ", err)
    return nil
  end

  local decrypted = aes_ctx:decrypt(ciphertext)
  return decrypted
end

-- ── Kontext laden ──────────────────────────────────────────────────────────

local ctx_file = base_dir .. "/api_context.json"
local cf = io.open(ctx_file, "r")
if not cf then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"No API context configured for this soul"}')
  return
end
local raw = cf:read("*a"); cf:close()
local ok, ctx = pcall(cjson.decode, raw)
if not ok then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Invalid API context"}')
  return
end

-- DELETE und OPTIONS sind immer erlaubt (eigenes Datei-Management, kein ext. API-Zugriff)
-- Soul-Cert (Owner, via_webhook=false/nil) bypassed den enabled-Check immer —
-- nur externe Dienste (service token, via_webhook=true) werden durch enabled geblockt.
local method = ngx.req.get_method()
if method ~= "DELETE" and method ~= "OPTIONS" and not ctx.enabled and ngx.ctx.via_webhook then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"API access not enabled"}')
  return
end

local perm    = ctx.permissions  or {}
local synced  = ctx.synced_files or {}
local actives = ctx.active_files or {}

-- ── /api/soul ──────────────────────────────────────────────────────────────

if uri == "/api/soul" then
  if not perm.soul then
    ngx.status = 403
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"Soul access not permitted"}')
    return
  end
  local sf = io.open(base_dir .. "/sys.md", "rb")
  if not sf then
    ngx.status = 404
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"No soul content synced yet"}')
    return
  end
  local soul_content = sf:read("*a"); sf:close()

  -- ?raw=1: verschlüsselte Bytes direkt zurückgeben (für Cloud-Backup)
  -- Nur für verschlüsselte Souls erlaubt – offene Souls dürfen nicht als "Backup" rausgehen
  if ngx.var.arg_raw == "1" then
    if soul_content:sub(1, 4) ~= MAGIC then
      ngx.status = 400
      ngx.header["Content-Type"] = "application/json"
      ngx.say('{"error":"not_encrypted","message":"Soul ist nicht verschlüsselt. Cloud-Backup nur für verschlüsselte Souls erlaubt."}')
      return
    end
    ngx.header["Content-Type"]   = "application/octet-stream"
    ngx.header["Cache-Control"]  = "no-store"
    ngx.header["Content-Length"] = #soul_content
    ngx.print(soul_content)
    return
  end

  -- Entschlüsseln falls Magic-Bytes vorhanden
  if soul_content:sub(1, 4) == MAGIC then
    local vault_key = ngx.ctx.vault_key or ""
    if vault_key == "" then
      ngx.status = 403
      ngx.header["Content-Type"] = "application/json"
      ngx.say('{"error":"encrypted","message":"Soul ist verschlüsselt. Vault mit Schlüsselwörtern entsperren."}')
      return
    end
    local decrypted = try_decrypt(soul_content, vault_key)
    if not decrypted then
      ngx.log(ngx.WARN, "[api_serve] Entschlüsselung fehlgeschlagen für soul_id=", soul_id,
              " – vault_key stimmt nicht mit sys.md überein. Bitte Vault mit korrektem Schlüssel öffnen und erneut synchronisieren.")
      ngx.status = 403
      ngx.header["Content-Type"] = "application/json"
      ngx.say('{"error":"decryption_failed","message":"Entschlüsselung fehlgeschlagen. Vault mit korrektem Schlüssel öffnen und sys.md erneut synchronisieren."}')
      return
    end
    soul_content = decrypted
  end

  if not perm.calendar then
    local cal_start = soul_content:find("\n## Kalender")
    if cal_start then
      local heading_end = soul_content:find("\n", cal_start + 1, true)
      local next_sec = heading_end and soul_content:find("\n## ", heading_end, true)
      soul_content = soul_content:sub(1, cal_start - 1) ..
                     (next_sec and soul_content:sub(next_sec) or "")
    end
  end

  ngx.header["Content-Type"]  = "text/markdown; charset=utf-8"
  ngx.header["Cache-Control"] = "no-store"
  ngx.say(soul_content)
  return
end

-- ── /api/vault/manifest ────────────────────────────────────────────────────

if uri == "/api/vault/manifest" then
  local manifest = {
    soul_id      = soul_id,
    enabled      = ctx.enabled,
    cipher_mode  = ctx.cipher_mode or "ciphered",
    permissions  = perm,
    synced_files = synced,
    active_files = actives,
    endpoints    = {
      soul    = "/api/soul",
      audio   = "/api/vault/audio",
      video   = "/api/vault/video",
      images  = "/api/vault/images",
      context = "/api/vault/context",
      webhook = "/api/webhook"
    }
  }
  ngx.header["Content-Type"]  = "application/json"
  ngx.header["Cache-Control"] = "no-store"
  ngx.say(cjson.encode(manifest))
  return
end

-- ── /api/vault/{type}[/{file}] ─────────────────────────────────────────────

local TYPE_DIRS = {
  audio   = "vault/audio",
  video   = "vault/video",
  images  = "vault/images",
  context = "vault/context"
}
local PERM_KEYS = {
  audio   = "audio",
  video   = "video",
  images  = "images",
  context = "context_files"
}
local MIME_MAP = {
  -- Audio
  mp3  = "audio/mpeg",  wav  = "audio/wav",  ogg  = "audio/ogg",
  oga  = "audio/ogg",   m4a  = "audio/mp4",  flac = "audio/flac",
  aac  = "audio/aac",   opus = "audio/ogg",
  -- Video
  mp4  = "video/mp4",   webm = "video/webm", mov  = "video/quicktime",
  avi  = "video/x-msvideo", mkv = "video/x-matroska",
  -- Bilder
  jpg  = "image/jpeg",  jpeg = "image/jpeg", png  = "image/png",
  webp = "image/webp",  gif  = "image/gif",  avif = "image/avif",
  -- Text / Dokument
  md   = "text/plain; charset=utf-8",
  txt  = "text/plain; charset=utf-8",
  pdf  = "application/pdf"
}

-- ── DELETE /api/vault/{type}/{filename} ────────────────────────────────────
-- Nur Soul-Cert-Auth (über vault_auth.lua bereits geprüft)

if ngx.req.get_method() == "DELETE" then
  local del_type, del_file = uri:match("^/api/vault/([^/]+)/(.+)$")
  if not del_type or not TYPE_DIRS[del_type] then
    ngx.status = 400
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"Unknown vault type"}')
    return
  end
  local safe_del = del_file:match("^([%w%-%._]+)$")
  if not safe_del then
    ngx.status = 400
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"Invalid filename"}')
    return
  end
  -- Datei physisch löschen (kein Fehler wenn nicht vorhanden)
  local fpath = base_dir .. "/" .. TYPE_DIRS[del_type] .. "/" .. safe_del
  os.remove(fpath)
  -- synced_files aktualisieren
  local new_synced = {}
  for _, n in ipairs(type(synced[del_type]) == "table" and synced[del_type] or {}) do
    if n ~= safe_del then table.insert(new_synced, n) end
  end
  synced[del_type] = new_synced
  -- active_files bereinigen
  if type(actives[del_type]) == "string" and actives[del_type] == safe_del then
    actives[del_type] = ""
  elseif type(actives[del_type]) == "table" then
    local new_active = {}
    for _, n in ipairs(actives[del_type]) do
      if n ~= safe_del then table.insert(new_active, n) end
    end
    actives[del_type] = new_active
  end
  -- api_context.json zurückschreiben
  ctx.synced_files = synced
  ctx.active_files = actives
  local wf = io.open(ctx_file, "w")
  if wf then wf:write(cjson.encode(ctx)); wf:close() end
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"ok":true}')
  return
end

-- Nur GET ab hier (DELETE wurde oben behandelt, alle anderen Methoden ablehnen)
if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Method not allowed"}')
  return
end

local type_name, file_name = uri:match("^/api/vault/([^/]+)/?(.-)$")
if not type_name then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Not found"}')
  return
end

local sub_dir = TYPE_DIRS[type_name]
if not sub_dir then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unknown vault type"}')
  return
end

-- Berechtigung prüfen
local perm_key = PERM_KEYS[type_name]
if perm_key and not perm[perm_key] then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Access to ' .. type_name .. ' not permitted"}')
  return
end

if not file_name or file_name == "" then
  -- Dateiliste
  local base_url   = ngx.var.scheme .. "://" .. ngx.var.host
  local raw_files  = synced[type_name] or {}
  local files      = type(raw_files) == "table" and raw_files or {}
  local active_raw  = type(actives) == "table" and (actives[type_name] or "") or ""
  local active_name = type(active_raw) == "string" and active_raw or ""
  local list = {}
  for _, name in ipairs(files) do
    local ext = name:match("%.([^%.]+)$") or ""
    local url = base_url .. "/api/vault/" .. type_name .. "/" .. name
    table.insert(list, {
      name   = name,
      url    = url,
      mime   = MIME_MAP[ext:lower()] or "application/octet-stream",
      active = (name == active_name)
    })
  end
  local active_url = (active_name ~= "") and (base_url .. "/api/vault/" .. type_name .. "/" .. active_name) or cjson.null
  ngx.header["Content-Type"]  = "application/json"
  ngx.header["Cache-Control"] = "no-store"
  ngx.say(cjson.encode({ type = type_name, files = list, active_url = active_url }))
  return
end

-- Einzelne Datei servieren
local safe_name = file_name:match("^([%w%-%._]+)$")
if not safe_name then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Invalid filename"}')
  return
end

local file_path = base_dir .. "/" .. sub_dir .. "/" .. safe_name
local ff = io.open(file_path, "rb")
if not ff then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"File not found"}')
  return
end
local file_data = ff:read("*a"); ff:close()

-- Entschlüsseln falls Magic-Bytes vorhanden
if file_data:sub(1, 4) == MAGIC then
  local vault_key = ngx.ctx.vault_key or ""
  if vault_key == "" then
    ngx.status = 403
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"encrypted","message":"Datei ist verschlüsselt. Vault mit Schlüsselwörtern entsperren."}')
    return
  end
  local decrypted = try_decrypt(file_data, vault_key)
  if not decrypted then
    ngx.log(ngx.WARN, "[api_serve] Entschlüsselung fehlgeschlagen für Datei=", safe_name, " soul_id=", soul_id)
    ngx.status = 403
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"decryption_failed","message":"Entschlüsselung fehlgeschlagen. Vault erneut öffnen und synchronisieren."}')
    return
  end
  file_data = decrypted
end

local ext  = safe_name:match("%.([^%.]+)$") or ""
local mime = MIME_MAP[ext:lower()] or "application/octet-stream"

ngx.header["Content-Type"]   = mime
ngx.header["Content-Length"] = #file_data
ngx.header["Cache-Control"]  = "no-store"
ngx.print(file_data)
