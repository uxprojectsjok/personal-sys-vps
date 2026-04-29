-- vault_profile.lua
-- Speichert und liest strukturierte Analyse-Profile aus dem Vault.
-- Profile werden mit dem Vault-Schlüssel verschlüsselt (AES-256-CBC, gleiche Magic-Bytes wie sys.md).
-- Bei PUT: Eintrag in api_context.json synced_files.profiles für Vault-Manifest + Browser-Sync.
-- Auth: Soul-Cert oder Service-Token (via vault_auth.lua access phase)
--
-- GET    /api/vault/profile/{type}  → Profil lesen (entschlüsselt)
-- PUT    /api/vault/profile/{type}  → Profil schreiben (verschlüsselt falls vault_key vorhanden)
-- DELETE /api/vault/profile/{type}  → Profil löschen + aus Manifest entfernen
--
-- Typen: face | voice | motion | expertise

local cjson        = require "cjson.safe"
local resty_aes    = require "resty.aes"
local resty_random = require "resty.random"

local MAGIC     = "SYS\x01"
local soul_id   = ngx.ctx.soul_id
local vault_key = ngx.ctx.vault_key or ""

if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "Unauthorized" }))
  return
end

local uri   = ngx.var.uri
local ptype = uri:match("/api/vault/profile/([a-z]+)$")

local allowed = { face = true, voice = true, motion = true, expertise = true }
if not ptype or not allowed[ptype] then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "Ungültiger Profiltyp. Erlaubt: face, voice, motion, expertise" }))
  return
end

local base_dir     = "/var/lib/sys/souls/" .. soul_id
local profile_dir  = base_dir .. "/vault/profile/"
local profile_path = profile_dir .. ptype .. ".json"
local ctx_file     = base_dir .. "/api_context.json"
local method       = ngx.req.get_method()

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

-- ── Encryption helpers ────────────────────────────────────────────────────────

local function hex_to_bin(hex)
  return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
end

-- Entschlüsselt wenn Magic-Bytes erkannt. Gibt Klartext zurück oder nil bei Fehler.
-- Wenn keine Magic-Bytes vorhanden: gibt data unverändert zurück (altes Klartextprofil).
local function try_decrypt(data)
  if #data < 36 then return data end
  if data:sub(1, 4) ~= MAGIC then return data end  -- nicht verschlüsselt
  if vault_key == "" then return nil end             -- verschlüsselt, kein Schlüssel
  local iv         = data:sub(5, 20)
  local ciphertext = data:sub(21)
  local key        = hex_to_bin(vault_key)
  local aes_ctx    = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return nil end
  return aes_ctx:decrypt(ciphertext)
end

-- Verschlüsselt mit vault_key (AES-256-CBC + MAGIC). Schlägt fehl wenn kein Schlüssel.
local function encrypt_data(plaintext)
  if vault_key == "" then return nil end  -- kein Schlüssel → kein Klartext
  local key = hex_to_bin(vault_key)
  local iv  = resty_random.bytes(16, true)  -- kryptographisch sicherer IV
  if not iv then return nil end
  local aes_ctx = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return nil end
  local encrypted = aes_ctx:encrypt(plaintext)
  if not encrypted then return nil end
  return MAGIC .. iv .. encrypted
end

-- ── api_context.json helpers ──────────────────────────────────────────────────

-- add=true: ptype in synced_files.profiles eintragen
-- add=false: ptype aus synced_files.profiles entfernen
local function update_profiles_index(add)
  local cf = io.open(ctx_file, "r")
  if not cf then return end
  local raw = cf:read("*a"); cf:close()
  local ok, ctx = pcall(cjson.decode, raw)
  if not ok or type(ctx) ~= "table" then return end

  if not ctx.synced_files then ctx.synced_files = {} end
  local profiles = ctx.synced_files.profiles
  if type(profiles) ~= "table" then profiles = {} end

  if add then
    local found = false
    for _, p in ipairs(profiles) do if p == ptype then found = true; break end end
    if not found then table.insert(profiles, ptype) end
  else
    local new_list = {}
    for _, p in ipairs(profiles) do if p ~= ptype then table.insert(new_list, p) end end
    profiles = new_list
  end
  ctx.synced_files.profiles = profiles

  local wf = io.open(ctx_file, "w")
  if wf then wf:write(cjson.encode(ctx)); wf:close() end
end

-- ── GET ──────────────────────────────────────────────────────────────────────

if method == "GET" then
  local f = io.open(profile_path, "rb")
  if not f then
    ngx.status = 404
    ngx.say(cjson.encode({
      error   = "Kein " .. ptype .. "-Profil gefunden.",
      hint    = "Profil via PUT /api/vault/profile/" .. ptype .. " erstellen.",
      soul_id = soul_id,
      type    = ptype,
    }))
    return
  end
  local content = f:read("*a")
  f:close()

  local decoded = try_decrypt(content)
  if decoded == nil then
    ngx.status = 403
    ngx.say(cjson.encode({ error = "Profil ist verschlüsselt – Vault entsperren." }))
    return
  end
  ngx.say(decoded)

-- ── PUT ──────────────────────────────────────────────────────────────────────

elseif method == "PUT" then
  ngx.req.read_body()
  local body = ngx.req.get_body_data()

  if not body or body == "" then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Leerer Body" }))
    return
  end

  local data, err = cjson.decode(body)
  if not data then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Ungültiges JSON: " .. (err or "?") }))
    return
  end

  -- Metadaten ergänzen
  data.soul_id    = soul_id
  data.type       = ptype
  data.updated_at = os.date("!%Y-%m-%dT%H:%M:%SZ")

  -- Vault-Schlüssel Pflicht: kein Profil im Klartext speichern
  if vault_key == "" then
    ngx.status = 403
    ngx.say(cjson.encode({
      error = "vault_locked",
      message = "Vault-Schlüssel fehlt — Profile werden immer verschlüsselt gespeichert. Vault entsperren."
    }))
    return
  end

  -- Verzeichnis sicherstellen
  os.execute("mkdir -p " .. profile_dir)

  -- Verschlüsseln (immer, vault_key ist oben geprüft)
  local encoded  = cjson.encode(data)
  local to_write = encrypt_data(encoded)

  if not to_write then
    ngx.status = 500
    ngx.say(cjson.encode({ error = "Verschlüsselung fehlgeschlagen. Vault erneut entsperren." }))
    return
  end

  local f, ferr = io.open(profile_path, "wb")
  if not f then
    ngx.status = 500
    ngx.say(cjson.encode({ error = "Schreiben fehlgeschlagen: " .. (ferr or "?") }))
    return
  end
  f:write(to_write)
  f:close()

  -- In synced_files.profiles eintragen (für Vault-Manifest + Browser-Sync)
  update_profiles_index(true)

  ngx.say(cjson.encode({ ok = true, type = ptype, updated_at = data.updated_at, encrypted = true }))

-- ── DELETE ───────────────────────────────────────────────────────────────────

elseif method == "DELETE" then
  local ok = os.remove(profile_path)
  if not ok then
    ngx.status = 404
    ngx.say(cjson.encode({ error = "Kein Profil zum Löschen gefunden." }))
    return
  end
  update_profiles_index(false)
  ngx.say(cjson.encode({ ok = true, type = ptype, deleted = true }))

else
  ngx.status = 405
  ngx.say(cjson.encode({ error = "Method not allowed" }))
end
