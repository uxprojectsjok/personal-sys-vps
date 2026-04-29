-- /etc/openresty/lua/vault_public.lua
--
-- Endpunkte für den Public Vault – geteilte Dateien mit per-Datei Cipher-Modus.
--
-- Owner-Endpunkte (soul_auth.lua geschützt – ngx.ctx.soul_id gesetzt):
--   GET  /api/vault/public/config          → eigene Konfiguration lesen
--   PUT  /api/vault/public/config          → Konfiguration speichern
--   POST /api/vault/public/sync            → Datei in Public Vault hochladen
--
-- Externe Endpunkte (eigen-auth in diesem Skript):
--   GET    /api/vault/public/{soul_id}          → Public-Manifest (keine Auth)
--   GET    /api/vault/public/{soul_id}/{file}   → Datei (API-Grant-Token oder Soul-Cert)
--   DELETE /api/vault/public/{file}             → Owner löscht eigene Datei (Soul-Cert in Header)

local cjson      = require("cjson.safe")
local hmac       = require("hmac_helper")
local rnd        = require("resty.random")
local rstr       = require("resty.string")
local uri        = ngx.var.uri
local method     = ngx.req.get_method()
local SOULS_DIR  = "/var/lib/sys/souls/"
local master_key = os.getenv("SOUL_MASTER_KEY") or ""

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

-- CORS für externe Lesezugriffe
ngx.header["Access-Control-Allow-Origin"]  = "*"
ngx.header["Access-Control-Allow-Headers"] = "Authorization, X-Soul-Cert"
ngx.header["Access-Control-Allow-Methods"] = "GET, OPTIONS"

if method == "OPTIONS" then
  ngx.status = 204
  return
end

-- ── Array-Helpers (cjson.empty_array ist lightuserdata – nicht iterierbar) ─
-- arr(v) : gibt immer eine echte Lua-Tabelle zurück (sicher für ipairs / #)
-- ea(v)  : kodiert leere Tabellen als [] statt {} im JSON-Output

local function arr(v)
  return type(v) == "table" and v or {}
end

local function ea(v)
  local t = type(v) == "table" and v or {}
  return #t > 0 and t or cjson.empty_array
end

-- ── Helpers ────────────────────────────────────────────────────────────────

local function validate_soul_cert(token)
  if not token or token == "" then return nil end
  local dot = token:find(".", 1, true)
  if not dot then return nil end
  local sid  = token:sub(1, dot - 1)
  local cert = token:sub(dot + 1)
  if sid == "" or cert == "" then return nil end
  -- Sicherheitsprüfung: nur alphanumerisch + Bindestrich
  if not sid:match("^[a-zA-Z0-9%-]+$") or #sid > 64 then return nil end
  if master_key == "" then return sid end
  -- cert_version-aware: liest Version aus api_context.json (identisch zu vault_auth.lua)
  local ver      = hmac.read_cert_version(sid)
  local expected = hmac.cert_for_soul(master_key, sid, ver)
  if cert ~= expected then return nil end
  return sid
end

local function public_dir(soul_id)
  return SOULS_DIR .. soul_id .. "/vault_public"
end

local function load_config(soul_id)
  local path = public_dir(soul_id) .. "/config.json"
  local f = io.open(path, "r")
  if not f then
    return { v = 1, enabled = false, public_files = {}, api_grants = {}, soul_grants = {} }
  end
  local raw = f:read("*a"); f:close()
  local ok, data = pcall(cjson.decode, raw)
  if not ok or type(data) ~= "table" then
    return { v = 1, enabled = false, public_files = {}, api_grants = {}, soul_grants = {} }
  end
  -- Fehlende/ungültige Felder auf echte leere Tabellen normalisieren (nicht cjson.empty_array!)
  if type(data.public_files) ~= "table" then data.public_files = {} end
  if type(data.api_grants)   ~= "table" then data.api_grants   = {} end
  if type(data.soul_grants)  ~= "table" then data.soul_grants  = {} end
  return data
end

local function save_config(soul_id, config)
  local dir = public_dir(soul_id)
  os.execute("mkdir -p " .. dir)
  local f = io.open(dir .. "/config.json", "w")
  if not f then return false end
  -- ea() stellt sicher dass leere Tabellen als [] (nicht {}) kodiert werden
  local out = {
    v            = config.v,
    updated_at   = config.updated_at,
    public_files = ea(config.public_files),
    api_grants   = ea(config.api_grants),
    soul_grants  = ea(config.soul_grants),
  }
  f:write(cjson.encode(out)); f:close()
  return true
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

local MIME = {
  jpg="image/jpeg", jpeg="image/jpeg", png="image/png", webp="image/webp",
  gif="image/gif", avif="image/avif",
  mp3="audio/mpeg", wav="audio/wav", ogg="audio/ogg", m4a="audio/mp4",
  opus="audio/ogg", flac="audio/flac",
  mp4="video/mp4", mov="video/quicktime", avi="video/x-msvideo",
  md="text/markdown; charset=utf-8", txt="text/plain; charset=utf-8",
  pdf="application/pdf",
}

local function safe_filename(s)
  if type(s) ~= "string" then return nil end
  local m = s:match("^([%w%-%._]+)$")
  if not m or #m < 1 or #m > 120 then return nil end
  return m
end

-- ── GET /api/vault/public/config  (soul_auth hat soul_id gesetzt) ──────────

if uri == "/api/vault/public/config" and method == "GET" then
  local soul_id = ngx.ctx.soul_id
  local config  = load_config(soul_id)
  -- Tokens maskieren: nur erste 8 Zeichen anzeigen
  local safe = {}
  safe.v          = config.v
  safe.updated_at = config.updated_at
  -- Leere Arrays korrekt als [] serialisieren (ea = empty_array helper)
  safe.public_files = ea(arr(config.public_files))
  safe.soul_grants  = ea(arr(config.soul_grants))
  local masked_grants = {}
  for _, g in ipairs(arr(config.api_grants)) do
    local sg = {
      id           = g.id,
      label        = g.label,
      scope        = ea(arr(g.scope)),
      created      = g.created,
      token_masked = type(g.token) == "string" and #g.token > 8
                      and (g.token:sub(1, 8) .. "•••") or nil
    }
    table.insert(masked_grants, sg)
  end
  safe.api_grants = ea(masked_grants)
  ngx.say(cjson.encode(safe))
  return
end

-- ── PUT /api/vault/public/config  (soul_auth hat soul_id gesetzt) ──────────

if uri == "/api/vault/public/config" and method == "PUT" then
  local soul_id = ngx.ctx.soul_id
  ngx.req.read_body()
  local body = ngx.req.get_body_data() or "{}"
  local ok, incoming = pcall(cjson.decode, body)
  if not ok or type(incoming) ~= "table" then
    ngx.status = 400; ngx.say('{"error":"Invalid JSON"}'); return
  end

  local current = load_config(soul_id)

  -- public_files: [{ name, cipher }]
  if type(incoming.public_files) == "table" then
    local clean = {}
    for _, pf in ipairs(incoming.public_files) do
      if type(pf) == "table" then
        local n = safe_filename(pf.name)
        local c = (pf.cipher == "ciphered") and "ciphered" or "open"
        if n then table.insert(clean, { name = n, cipher = c }) end
      elseif type(pf) == "string" then
        local n = safe_filename(pf)
        if n then table.insert(clean, { name = n, cipher = "open" }) end
      end
    end
    current.public_files = clean
  end

  -- api_grants: id + label + scope + token (vom Client generiert)
  if type(incoming.api_grants) == "table" then
    -- Bestehende Grants nach ID indizieren (Tokens bewahren)
    local existing_by_id = {}
    for _, g in ipairs(arr(current.api_grants)) do
      if g.id then existing_by_id[g.id] = g end
    end
    local new_grants = {}
    local ALLOWED_SCOPE = { soul=true, audio=true, video=true, images=true, context_files=true }
    for _, g in ipairs(incoming.api_grants) do
      if type(g) == "table" then
        local gid = type(g.id) == "string" and g.id or nil
        local ex  = gid and existing_by_id[gid]
        local scope = {}
        if type(g.scope) == "table" then
          for _, s in ipairs(g.scope) do
            if ALLOWED_SCOPE[s] then table.insert(scope, s) end
          end
        end
        if #scope == 0 then scope = { "images" } end
        local label = type(g.label) == "string" and g.label:gsub("[%c]", ""):sub(1,128) or "API"
        -- Token: Client-seitig generiert → akzeptieren wenn sicher (min. 16 Zeichen, kein Pfad-Traversal)
        local token = (ex and ex.token) or nil
        if type(g.token) == "string" and #g.token >= 16 and #g.token <= 128
           and g.token:match("^[a-zA-Z0-9_%-]+$") then
          token = g.token  -- neu oder Überschreibung durch Client
        end
        if not token or token == "" then
          token = "pub_" .. rstr.to_hex(rnd.bytes(20))
        end
        table.insert(new_grants, {
          id      = gid or ("ag_" .. rstr.to_hex(rnd.bytes(4))),
          label   = label,
          scope   = scope,
          token   = token,
          created = (ex and ex.created) or math.floor(ngx.now())
        })
      end
    end
    current.api_grants = new_grants
  end

  -- soul_grants: id + label + soul_id + scope
  if type(incoming.soul_grants) == "table" then
    local new_sg = {}
    local ALLOWED_SCOPE = { soul=true, audio=true, video=true, images=true, context_files=true }
    for _, g in ipairs(incoming.soul_grants) do
      if type(g) == "table" and type(g.soul_id) == "string"
         and g.soul_id:match("^[a-zA-Z0-9_%-]+$") and #g.soul_id <= 128 then
        local scope = {}
        if type(g.scope) == "table" then
          for _, s in ipairs(g.scope) do
            if ALLOWED_SCOPE[s] then table.insert(scope, s) end
          end
        end
        if #scope == 0 then scope = { "images" } end
        table.insert(new_sg, {
          id       = type(g.id) == "string" and g.id or ("sg_" .. rstr.to_hex(rnd.bytes(4))),
          label    = type(g.label) == "string" and g.label:gsub("[%c]",""):sub(1,64) or g.soul_id,
          soul_id  = g.soul_id,
          scope    = scope,
          created  = math.floor(ngx.now())
        })
      end
    end
    current.soul_grants = new_sg
  end

  current.updated_at = math.floor(ngx.now())

  if not save_config(soul_id, current) then
    ngx.status = 500; ngx.say('{"error":"Storage error"}'); return
  end
  ngx.say('{"ok":true}')
  return
end

-- Ungültige Methode auf /config
if uri == "/api/vault/public/config" then
  ngx.status = 405; ngx.say('{"error":"Method not allowed"}'); return
end

-- ── POST /api/vault/public/sync  (soul_auth hat soul_id gesetzt) ───────────

if uri == "/api/vault/public/sync" then
  if method ~= "POST" then
    ngx.status = 405; ngx.say('{"error":"Method not allowed"}'); return
  end
  local soul_id = ngx.ctx.soul_id
  ngx.req.read_body()
  local body = ngx.req.get_body_data()
  if not body or body == "" then
    ngx.status = 400; ngx.say('{"error":"Empty body"}'); return
  end
  local ok, data = pcall(cjson.decode, body)
  if not ok or type(data) ~= "table" then
    ngx.status = 400; ngx.say('{"error":"Invalid JSON"}'); return
  end
  local fname = safe_filename(tostring(data.name or ""))
  if not fname then
    ngx.status = 400; ngx.say('{"error":"Invalid filename"}'); return
  end
  if type(data.data) ~= "string" then
    ngx.status = 400; ngx.say('{"error":"Missing data field"}'); return
  end
  local decoded = ngx.decode_base64(data.data)
  if not decoded then
    ngx.status = 400; ngx.say('{"error":"Invalid base64"}'); return
  end
  if #decoded > 200 * 1024 * 1024 then
    ngx.status = 413; ngx.say('{"error":"File too large (max 200 MB)"}'); return
  end
  -- Nur Dateien hochladen, die auch in public_files der Konfiguration stehen
  local config   = load_config(soul_id)
  local allowed  = false
  for _, pf in ipairs(arr(config.public_files)) do
    local pf_name = type(pf) == "table" and pf.name or pf
    if pf_name == fname then allowed = true; break end
  end
  if not allowed then
    ngx.status = 403; ngx.say('{"error":"File not listed in public_files config"}'); return
  end
  local dir = public_dir(soul_id) .. "/files"
  os.execute("mkdir -p " .. dir)
  local f = io.open(dir .. "/" .. fname, "wb")
  if not f then
    ngx.status = 500; ngx.say('{"error":"Storage error"}'); return
  end
  f:write(decoded); f:close()
  ngx.say(cjson.encode({ ok=true, name=fname, size=#decoded, encrypted=data.encrypted or false }))
  return
end

-- ── Externe Zugriffe: URL-Parsing ──────────────────────────────────────────
-- Muster: /api/vault/public/{soul_id}
--         /api/vault/public/{soul_id}/{filename}
--         DELETE /api/vault/public/{filename}  (Owner-Auth per Soul-Cert in Header)

local ext_soul_id, ext_filename = uri:match("^/api/vault/public/([^/]+)/(.+)$")
if not ext_soul_id then
  ext_soul_id = uri:match("^/api/vault/public/([^/]+)/?$")
end

-- ── DELETE /api/vault/public/{filename}  (Owner, eigene Auth) ──────────────
-- ext_soul_id enthält hier den Dateinamen (kein separates soul_id-Segment)

if method == "DELETE" then
  local auth_hdr = ngx.req.get_headers()["authorization"] or ""
  local token    = auth_hdr:match("^[Bb]earer%s+(.+)$") or ""
  local owner_id = validate_soul_cert(token)
  if not owner_id then
    ngx.status = 401; ngx.say('{"error":"Unauthorized"}'); return
  end
  local fname = safe_filename(ext_soul_id)  -- ext_soul_id = erste URL-Komponente = Dateiname
  if not fname then
    ngx.status = 400; ngx.say('{"error":"Invalid filename"}'); return
  end
  local fpath = public_dir(owner_id) .. "/files/" .. fname
  local fh = io.open(fpath, "r")
  if not fh then
    ngx.status = 404; ngx.say('{"error":"File not found"}'); return
  end
  fh:close()
  os.remove(fpath)
  -- Aus public_files-Liste entfernen
  local config  = load_config(owner_id)
  local new_pfs = {}
  for _, pf in ipairs(arr(config.public_files)) do
    local pf_name = type(pf) == "table" and pf.name or pf
    if pf_name ~= fname then table.insert(new_pfs, pf) end
  end
  config.public_files = new_pfs
  save_config(owner_id, config)
  ngx.say('{"ok":true}')
  return
end

-- ── GET: soul_id validieren ────────────────────────────────────────────────

if not ext_soul_id or not ext_soul_id:match("^[a-zA-Z0-9_%-]+$")
   or #ext_soul_id < 4 or #ext_soul_id > 128 then
  ngx.status = 400; ngx.say('{"error":"Invalid soul_id"}'); return
end

local config = load_config(ext_soul_id)

-- ── GET /api/vault/public/{soul_id}  → Manifest (keine Auth) ──────────────

if not ext_filename then
  local manifest = { soul_id = ext_soul_id, files = {} }
  for _, pf in ipairs(arr(config.public_files)) do
    local name   = type(pf) == "table" and pf.name or pf
    local cipher = type(pf) == "table" and (pf.cipher or "open") or "open"
    local fname  = safe_filename(name)
    if fname then
      local fpath = public_dir(ext_soul_id) .. "/files/" .. fname
      local fh = io.open(fpath, "r")
      if fh then
        fh:close()
        table.insert(manifest.files, {
          name   = fname,
          cipher = cipher,
          type   = file_type_of(fname)
        })
      end
    end
  end
  ngx.say(cjson.encode(manifest))
  return
end

-- ── GET /api/vault/public/{soul_id}/{filename}  → Datei mit Auth ──────────

local fname = safe_filename(ext_filename)
if not fname then
  ngx.status = 400; ngx.say('{"error":"Invalid filename"}'); return
end

-- Datei in public_files-Liste suchen
local file_entry = nil
for _, pf in ipairs(arr(config.public_files)) do
  local pf_name = type(pf) == "table" and pf.name or pf
  if pf_name == fname then
    file_entry = type(pf) == "table" and pf or { name = pf, cipher = "open" }
    break
  end
end
if not file_entry then
  ngx.status = 404; ngx.say('{"error":"File not in public vault"}'); return
end

-- Auth prüfen: Bearer-Token (Soul-Cert oder API-Grant-Token) oder ?token=...
local auth_hdr  = ngx.req.get_headers()["authorization"] or ""
local x_cert    = ngx.req.get_headers()["x-soul-cert"] or ""
local token     = auth_hdr:match("^[Bb]earer%s+(.+)$") or ngx.var.arg_token or x_cert or ""

local access_ok = false
local ftype     = file_type_of(fname)

if token ~= "" then
  if token:find(".", 1, true) then
    -- Soul-Cert: requester-soul_id gegen soul_grants prüfen
    local req_soul_id = validate_soul_cert(token)
    if req_soul_id then
      for _, g in ipairs(arr(config.soul_grants)) do
        if g.soul_id == req_soul_id then
          if type(g.scope) == "table" then
            for _, s in ipairs(g.scope) do
              if s == ftype or s == "all" then access_ok = true; break end
            end
          end
          if access_ok then break end
        end
      end
    end
  else
    -- API-Grant-Token: gegen api_grants prüfen
    for _, g in ipairs(arr(config.api_grants)) do
      if g.token == token then
        if type(g.scope) == "table" then
          for _, s in ipairs(g.scope) do
            if s == ftype or s == "all" then access_ok = true; break end
          end
        end
        if access_ok then break end
      end
    end
  end
end

if not access_ok then
  ngx.status = 403; ngx.say('{"error":"Access denied"}'); return
end

-- Datei servieren
local fpath = public_dir(ext_soul_id) .. "/files/" .. fname
local f = io.open(fpath, "rb")
if not f then
  ngx.status = 404; ngx.say('{"error":"File not found on server"}'); return
end
local content = f:read("*a"); f:close()

local ext = (fname:match("%.([^%.]+)$") or ""):lower()
if file_entry.cipher == "ciphered" then
  ngx.header["Content-Type"]        = "application/octet-stream"
  ngx.header["X-Vault-Cipher"]      = "aes-256-cbc"
  ngx.header["Content-Disposition"] = 'attachment; filename="' .. fname .. '.enc"'
else
  ngx.header["Content-Type"]        = MIME[ext] or "application/octet-stream"
  ngx.header["Content-Disposition"] = 'inline; filename="' .. fname .. '"'
end

ngx.print(content)
