-- /etc/openresty/lua/vault_connections_peer.lua
-- GET /api/vault/connections/peer-files?soul_id={id}
--     → Manifest + Kontext-Dateien einer verbundenen Soul (inline)
-- GET /api/vault/connections/peer-files?soul_id={id}&file={name}
--     → Einzelne Datei als { name, content } JSON
--
-- Auth: vault_auth.lua (Service-Token oder Soul-Cert)
-- Prüft: connection in eigener soul_connections.json +
--         soul_grant in vault_public/config.json der Ziel-Soul

local cjson   = require "cjson.safe"
local soul_id = ngx.ctx.soul_id

if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "Unauthorized" }))
  return
end

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "Method not allowed" }))
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local SOULS_DIR = "/var/lib/sys/souls/"
local args      = ngx.req.get_uri_args()
local target_id = args and args.soul_id
local req_file  = args and args.file

-- soul_id validieren
if not target_id or not target_id:match("^[a-zA-Z0-9_%-]+$") or #target_id > 128 then
  ngx.status = 400
  ngx.say(cjson.encode({ error = "soul_id erforderlich" }))
  return
end

if target_id == soul_id then
  ngx.status = 400
  ngx.say(cjson.encode({ error = "Eigene Soul-ID" }))
  return
end

-- ── Helpers ───────────────────────────────────────────────────────────────────

local function safe_filename(s)
  if type(s) ~= "string" then return nil end
  local m = s:match("^([%w%-%._]+)$")
  if not m or #m < 1 or #m > 120 then return nil end
  return m
end

local function file_type_of(name)
  local ext = (name:match("%.([^%.]+)$") or ""):lower()
  if ext == "mp3" or ext == "wav" or ext == "ogg" or ext == "webm" or
     ext == "m4a" or ext == "opus" or ext == "flac" or ext == "aac" then return "audio" end
  if ext == "mp4" or ext == "mov" or ext == "avi" or ext == "mkv" then return "video" end
  if ext == "jpg" or ext == "jpeg" or ext == "png" or ext == "webp" or
     ext == "gif" or ext == "avif" then return "images" end
  if ext == "md" or ext == "txt" or ext == "pdf" then return "context_files" end
  return "other"
end

-- ── Verbindung prüfen ─────────────────────────────────────────────────────────

local conn_path = SOULS_DIR .. soul_id .. "/soul_connections.json"
local cf = io.open(conn_path, "r")
local connection = nil
if cf then
  local raw = cf:read("*a"); cf:close()
  local ok, data = pcall(cjson.decode, raw)
  if ok and type(data) == "table" then
    local conns = data.connections or (data[1] and data or {})
    for _, c in ipairs(conns) do
      if c.soul_id == target_id then
        connection = c
        break
      end
    end
  end
end

if not connection then
  ngx.status = 403
  ngx.say(cjson.encode({ error = "Keine Verbindung mit dieser Soul" }))
  return
end

-- ── Public-Vault-Config der Ziel-Soul laden ───────────────────────────────────

local pub_cfg_path = SOULS_DIR .. target_id .. "/vault_public/config.json"
local pub_config = { enabled = false, public_files = {}, soul_grants = {} }
local pf = io.open(pub_cfg_path, "r")
if pf then
  local raw = pf:read("*a"); pf:close()
  local ok, data = pcall(cjson.decode, raw)
  if ok and type(data) == "table" then
    pub_config.enabled      = data.enabled or false
    pub_config.public_files = type(data.public_files) == "table" and data.public_files or {}
    pub_config.soul_grants  = type(data.soul_grants)  == "table" and data.soul_grants  or {}
  end
end

-- Scopes ermitteln: soul_grant > Connection-Permissions als Fallback
local granted_scopes = {}
for _, g in ipairs(pub_config.soul_grants) do
  if g.soul_id == soul_id then
    if type(g.scope) == "table" then
      for _, s in ipairs(g.scope) do granted_scopes[s] = true end
    end
    break
  end
end
-- Fallback: Connection-Permissions wenn kein soul_grant vorhanden
if not next(granted_scopes) and type(connection.permissions) == "table" then
  for _, p in ipairs(connection.permissions) do granted_scopes[p] = true end
end

local function has_scope(scope)
  return granted_scopes[scope] == true or granted_scopes["all"] == true
end

-- ── Einzelne Datei ────────────────────────────────────────────────────────────

if req_file then
  local fname = safe_filename(req_file)
  if not fname then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Ungültiger Dateiname" }))
    return
  end

  -- sys.md: direkt über soul-Permission bedienen, kein public_files-Eintrag nötig
  if fname == "sys.md" then
    if not has_scope("soul") then
      ngx.status = 403
      ngx.say(cjson.encode({ error = "soul permission required" }))
      return
    end
    local soul_path = SOULS_DIR .. target_id .. "/sys.md"
    local sf = io.open(soul_path, "rb")
    if not sf then
      ngx.status = 404
      ngx.say(cjson.encode({ error = "sys.md nicht gefunden" }))
      return
    end
    local raw = sf:read("*a"); sf:close()
    local content = nil
    if raw:sub(1, 4) ~= "SYS\x01" then
      content = raw:sub(1, 32768)
    else
      local tctx_path = SOULS_DIR .. target_id .. "/api_context.json"
      local tcf = io.open(tctx_path, "r")
      if tcf then
        local traw = tcf:read("*a"); tcf:close()
        local tok, tctx = pcall(cjson.decode, traw)
        if tok and type(tctx) == "table" and type(tctx.vault_key_hex) == "string"
           and #tctx.vault_key_hex == 64 then
          local key = tctx.vault_key_hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end)
          local iv = raw:sub(5, 20)
          local resty_aes = require("resty.aes")
          local aes_ctx = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
          if aes_ctx then
            local ok_d, pt = pcall(function() return aes_ctx:decrypt(raw:sub(21)) end)
            if ok_d and pt then content = pt:sub(1, 32768) end
          end
        end
      end
    end
    if not content then
      ngx.status = 403
      ngx.say(cjson.encode({ error = "sys.md verschlüsselt – kein Schlüssel verfügbar" }))
      return
    end
    ngx.say(cjson.encode({ ok = true, name = "sys.md", soul_id = target_id, content = content }))
    return
  end

  local file_entry = nil
  for _, e in ipairs(pub_config.public_files) do
    local pf_name = type(e) == "table" and e.name or e
    if pf_name == fname then
      file_entry = type(e) == "table" and e or { name = e, cipher = "open" }
      break
    end
  end

  if not file_entry then
    ngx.status = 404
    ngx.say(cjson.encode({ error = "Datei nicht in public_files" }))
    return
  end

  local ftype = file_type_of(fname)
  if not has_scope(ftype) then
    ngx.status = 403
    ngx.say(cjson.encode({ error = "Kein Scope für " .. ftype }))
    return
  end

  if file_entry.cipher == "ciphered" then
    ngx.status = 403
    ngx.say(cjson.encode({ error = "Datei ist verschlüsselt" }))
    return
  end

  local fpath = SOULS_DIR .. target_id .. "/vault_public/files/" .. fname
  local fh = io.open(fpath, "rb")
  if not fh then
    ngx.status = 404
    ngx.say(cjson.encode({ error = "Datei nicht gefunden" }))
    return
  end
  local content = fh:read("*a"); fh:close()

  -- Text inline; PDF als base64; andere Binärdateien nur Metadaten
  local cf_ext = (fname:match("%.([^%.]+)$") or ""):lower()
  if ftype == "context_files" and (cf_ext == "md" or cf_ext == "txt") then
    ngx.say(cjson.encode({ ok = true, name = fname, soul_id = target_id, content = content }))
  elseif ftype == "context_files" and cf_ext == "pdf" then
    ngx.say(cjson.encode({ ok = true, name = fname, soul_id = target_id, encoding = "base64", content_b64 = ngx.encode_base64(content) }))
  else
    ngx.say(cjson.encode({ ok = true, name = fname, soul_id = target_id, type = ftype, size = #content, note = "Binärdatei – nicht inline verfügbar" }))
  end
  return
end

-- ── Manifest + alle lesbaren Kontext-Dateien ─────────────────────────────────

-- sys.md lesen wenn scope=soul
local soul_content = nil
if has_scope("soul") then
  local soul_path = SOULS_DIR .. target_id .. "/sys.md"
  local sf = io.open(soul_path, "rb")
  if sf then
    local raw = sf:read("*a"); sf:close()
    if raw:sub(1, 4) ~= "SYS\x01" then
      -- Klartext
      soul_content = raw:sub(1, 32768)
    else
      -- Verschlüsselt: vault_key_hex aus api_context.json der Ziel-Soul laden
      local tctx_path = SOULS_DIR .. target_id .. "/api_context.json"
      local tcf = io.open(tctx_path, "r")
      if tcf then
        local traw = tcf:read("*a"); tcf:close()
        local tok, tctx = pcall(cjson.decode, traw)
        if tok and type(tctx) == "table" and type(tctx.vault_key_hex) == "string"
           and #tctx.vault_key_hex == 64 then
          local vkh = tctx.vault_key_hex
          local key = vkh:gsub("..", function(h) return string.char(tonumber(h, 16)) end)
          local iv        = raw:sub(5, 20)
          local ciphertext = raw:sub(21)
          local resty_aes = require("resty.aes")
          local aes_ctx = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
          if aes_ctx then
            local ok_d, plaintext = pcall(function() return aes_ctx:decrypt(ciphertext) end)
            if ok_d and plaintext then
              soul_content = plaintext:sub(1, 32768)
            end
          end
        end
      end
    end
  end
end

-- mutual check
local mutual = false
local target_conn_path = SOULS_DIR .. target_id .. "/soul_connections.json"
local tf = io.open(target_conn_path, "r")
if tf then
  local raw = tf:read("*a"); tf:close()
  local ok, tdata = pcall(cjson.decode, raw)
  if ok and type(tdata) == "table" then
    local tconns = tdata.connections or (tdata[1] and tdata or {})
    for _, tc in ipairs(tconns) do
      if tc.soul_id == soul_id then mutual = true; break end
    end
  end
end

-- Freigegebene Dateien – Manifest + Kontext-Dateien inline
local files         = {}
local context_files = {}

for _, e in ipairs(pub_config.public_files) do
  local fname  = type(e) == "table" and e.name or e
  local cipher = type(e) == "table" and (e.cipher or "open") or "open"

  if safe_filename(fname) then
    local ftype = file_type_of(fname)
    if has_scope(ftype) then
      local fpath = SOULS_DIR .. target_id .. "/vault_public/files/" .. fname
      local fh = io.open(fpath, "r")
      if fh then
        fh:close()
        table.insert(files, { name = fname, type = ftype, cipher = cipher })

        -- Kontext-Dateien direkt inline lesen
        -- Text (md/txt): max 64 KB UTF-8 direkt; PDF: max 5 MB base64-kodiert
        if ftype == "context_files" and cipher ~= "ciphered" then
          local cf_ext2 = (fname:match("%.([^%.]+)$") or ""):lower()
          local rfh = io.open(fpath, "rb")
          if rfh then
            local content = rfh:read("*a"); rfh:close()
            if cf_ext2 == "pdf" then
              local MAX_PDF = 5 * 1024 * 1024  -- 5 MB
              if #content <= MAX_PDF then
                table.insert(context_files, { name = fname, encoding = "base64", content_b64 = ngx.encode_base64(content) })
              else
                table.insert(context_files, { name = fname, encoding = "base64", truncated = true, size = #content,
                  note = "PDF zu groß für inline-Transfer (> 5 MB) – einzeln abrufen mit ?file=" .. fname })
              end
            else
              table.insert(context_files, { name = fname, content = content:sub(1, 65536) })
            end
          end
        end
      end
    end
  end
end

-- Scopes als Array
local scope_list = {}
for k in pairs(granted_scopes) do table.insert(scope_list, k) end

local result = {
  soul_id              = target_id,
  alias                = connection.alias,
  mutual               = mutual,
  permissions          = connection.permissions,
  granted_scopes       = scope_list,
  public_vault_enabled = pub_config.enabled,
  files                = #files > 0 and files or cjson.empty_array,
  context_files        = #context_files > 0 and context_files or cjson.empty_array,
}

if soul_content then
  result.soul_content = soul_content
end

if not pub_config.enabled then
  result.note = "Public Vault dieser Soul ist nicht aktiviert. Verbundene Soul muss Dateien im Vault-Explorer freigeben."
end

ngx.say(cjson.encode(result))
