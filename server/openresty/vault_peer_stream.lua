-- /etc/openresty/lua/vault_peer_stream.lua
-- GET /api/vault/peer-stream?soul_id={id}&file={name}&token={service-token}
--
-- Dient als direkt abrufbare Binary-URL für Peer-Vault-Dateien.
-- Auth: vault_auth.lua (akzeptiert Service-Token via ?token=)
-- Prüft: Verbindung in eigener soul_connections.json +
--         soul_grant in vault_public/config.json der Ziel-Soul
-- Gibt die Rohdatei direkt aus (kein JSON-Wrapper).

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

local SOULS_DIR = "/var/lib/sys/souls/"
local args      = ngx.req.get_uri_args()
local target_id = args and args.soul_id
local req_file  = args and args.file

-- Validierung
if not target_id or not target_id:match("^[a-zA-Z0-9_%-]+$") or #target_id > 128 then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "soul_id erforderlich" }))
  return
end

if not req_file or not req_file:match("^[%w%-%._]+$") or #req_file > 120 then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "file erforderlich" }))
  return
end

if target_id == soul_id then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "Eigene Soul-ID" }))
  return
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
      if c.soul_id == target_id then connection = c; break end
    end
  end
end

if not connection then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
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

-- Scopes ermitteln
local granted_scopes = {}
for _, g in ipairs(pub_config.soul_grants) do
  if g.soul_id == soul_id then
    if type(g.scope) == "table" then
      for _, s in ipairs(g.scope) do granted_scopes[s] = true end
    end
    break
  end
end
if not next(granted_scopes) and type(connection.permissions) == "table" then
  for _, p in ipairs(connection.permissions) do granted_scopes[p] = true end
end

local function has_scope(scope)
  return granted_scopes[scope] == true or granted_scopes["all"] == true
end

-- ── Datei-Typ bestimmen ───────────────────────────────────────────────────────

local function file_type_of(name)
  local ext = (name:match("%.([^%.]+)$") or ""):lower()
  if ext == "mp3" or ext == "wav" or ext == "ogg" or ext == "webm" or
     ext == "m4a" or ext == "opus" or ext == "flac" or ext == "aac" then return "audio", "audio/mpeg" end
  if ext == "mp4" or ext == "mov" or ext == "avi" or ext == "mkv" then return "video", "video/mp4" end
  if ext == "jpg" or ext == "jpeg" then return "images", "image/jpeg" end
  if ext == "png"  then return "images", "image/png" end
  if ext == "webp" then return "images", "image/webp" end
  if ext == "gif"  then return "images", "image/gif" end
  if ext == "pdf"  then return "context_files", "application/pdf" end
  if ext == "md"   then return "context_files", "text/plain; charset=utf-8" end
  if ext == "txt"  then return "context_files", "text/plain; charset=utf-8" end
  return "other", "application/octet-stream"
end

local ftype, mime = file_type_of(req_file)

if not has_scope(ftype) then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "Kein Scope für " .. ftype }))
  return
end

-- ── Datei in public_files prüfen ─────────────────────────────────────────────

local file_entry = nil
for _, e in ipairs(pub_config.public_files) do
  local pf_name = type(e) == "table" and e.name or e
  if pf_name == req_file then
    file_entry = type(e) == "table" and e or { name = e, cipher = "open" }
    break
  end
end

if not file_entry then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "Datei nicht in public_files" }))
  return
end

if file_entry.cipher == "ciphered" then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "Datei ist verschlüsselt" }))
  return
end

-- ── Datei direkt ausliefern ───────────────────────────────────────────────────

local fpath = SOULS_DIR .. target_id .. "/vault_public/files/" .. req_file
local fh = io.open(fpath, "rb")
if not fh then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "Datei nicht gefunden" }))
  return
end
local content = fh:read("*a"); fh:close()

ngx.header["Content-Type"]        = mime
ngx.header["Content-Length"]      = #content
ngx.header["Cache-Control"]       = "no-store"
ngx.header["Content-Disposition"] = 'inline; filename="' .. req_file .. '"'
ngx.print(content)
