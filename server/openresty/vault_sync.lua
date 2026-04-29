-- /etc/openresty/lua/vault_sync.lua
-- POST /api/vault/sync  → Datei in VPS-Vault speichern
-- Body: { type: "audio"|"image"|"context", name: "filename", data: "<base64>", encrypted: bool }
-- Auth: vault_auth.lua (soul-cert, KEIN Webhook-Token)

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

-- ── Audit-Log ──────────────────────────────────────────────────────────────
local LOG_FILE = "/var/log/sys/security.log"
local function audit(event, detail)
  local f = io.open(LOG_FILE, "a")
  if not f then return end
  f:write(string.format('[%s] soul=%s event=%s %s\n',
    os.date("!%Y-%m-%dT%H:%M:%SZ"), tostring(soul_id), event, tostring(detail or "")))
  f:close()
end

-- ── ClamAV-Scan via clamd INSTREAM-Protokoll ───────────────────────────────
-- clamd muss auf 127.0.0.1:3310 lauschen (clamav-daemon, /etc/clamav/clamd.conf)
-- Fail-Open: wenn clamd nicht erreichbar → Upload wird nicht blockiert (geloggt)
local function clamd_scan(content)
  local sock = ngx.socket.tcp()
  sock:settimeout(8000)
  local ok, err = sock:connect("127.0.0.1", 3310)
  if not ok then
    audit("CLAMD_UNAVAILABLE", err)
    return true, nil  -- fail open
  end
  -- INSTREAM: n-Präfix → newline-terminierter Befehl + newline-terminierte Antwort
  sock:send("nINSTREAM\n")
  -- Chunk-Header: 4 Byte Big-Endian Länge + Daten
  local size = #content
  local hdr  = string.char(
    math.floor(size / 16777216) % 256,
    math.floor(size /    65536) % 256,
    math.floor(size /      256) % 256,
    size % 256
  )
  sock:send(hdr .. content)
  sock:send("\0\0\0\0")  -- End-of-Stream
  local resp = sock:receive("*l")
  sock:close()
  if not resp then
    audit("CLAMD_NO_RESPONSE", "")
    return true, nil
  end
  if resp:find("FOUND", 1, true) then
    return false, resp
  end
  return true, nil
end

-- Webhook darf nicht hochladen (nur lesen)
if ngx.ctx.via_webhook then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Webhook token cannot upload files"}')
  return
end

-- soul_id darf nur alphanumerisch + Bindestrich sein (verhindert Shell-Injection in os.execute)
if not soul_id or not soul_id:match("^[a-zA-Z0-9%-]+$") or #soul_id > 64 then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Invalid soul identity"}')
  return
end

local base_dir = "/var/lib/sys/souls/" .. soul_id

-- ── Sicherheitskonstanten ──────────────────────────────────────────────────

-- Erlaubte Dateiendungen pro Typ
local ALLOWED_EXT = {
  audio   = { mp3=true, wav=true, ogg=true, webm=true, m4a=true, opus=true, flac=true, aac=true },
  video   = { mp4=true, mov=true, avi=true, mkv=true, webm=true },
  image   = { jpg=true, jpeg=true, png=true, webp=true, gif=true, avif=true },
  context = { md=true, txt=true, pdf=true }
}

-- Magic-Bytes (erste Bytes) pro Typ – genügt ein Treffer
local MAGIC = {
  audio = {
    { "\xff\xfb" }, { "\xff\xf3" }, { "\xff\xf2" },           -- MP3
    { "\x49\x44\x33" },                                         -- MP3 ID3
    { "\x1a\x45\xdf\xa3" },                                     -- WebM/MKV
    { "\x52\x49\x46\x46" },                                     -- WAV (RIFF)
    { "\x4f\x67\x67\x53" },                                     -- OGG
    { "\x66\x4c\x61\x43" },                                     -- FLAC
  },
  video = {
    { "\x1a\x45\xdf\xa3" },                                     -- WebM/MKV
    { "\x00\x00\x00", nil, "\x66\x74\x79\x70" },               -- MP4/MOV (ftyp @ offset 4)
    { "\x52\x49\x46\x46" },                                     -- AVI
  },
  image = {
    { "\xff\xd8\xff" },                                          -- JPEG
    { "\x89\x50\x4e\x47\x0d\x0a\x1a\x0a" },                   -- PNG
    { "\x52\x49\x46\x46" },                                     -- WebP (RIFF)
    { "\x47\x49\x46\x38" },                                     -- GIF
  },
  context = nil  -- Plaintext: kein Magic-Byte nötig
}

-- Max. Dateigröße nach Base64-Dekodierung (Bytes)
local MAX_SIZE = {
  audio   = 50 * 1024 * 1024,   -- 50 MB
  video   = 100 * 1024 * 1024,  -- 100 MB
  image   = 10 * 1024 * 1024,   -- 10 MB
  context = 10 * 1024 * 1024     -- 10 MB (PDF-Unterstützung)
}

local function ext_of(name)
  return (name:match("%.([^%.]+)$") or ""):lower()
end

local function magic_matches(bytes, patterns)
  if not patterns then return true end  -- context: immer erlaubt
  for _, pat in ipairs(patterns) do
    local ok = true
    local offset = 1
    for _, b in ipairs(pat) do
      if b ~= nil then
        -- b kann ein mehrbytiger String sein (z.B. "\xff\xd8\xff")
        if bytes:sub(offset, offset + #b - 1) ~= b then ok = false; break end
        offset = offset + #b
      else
        offset = offset + 1  -- nil = beliebiges Byte überspringen
      end
    end
    if ok then return true end
  end
  return false
end

ngx.req.read_body()
local body = ngx.req.get_body_data()
-- Bei großen Bodies buffert nginx auf Disk → get_body_data() == nil
if not body then
  local get_filepath = ngx.req.get_body_filepath
  if type(get_filepath) == "function" then
    local fpath = get_filepath()
    if fpath then
      local fh = io.open(fpath, "rb")
      if fh then body = fh:read("*a"); fh:close() end
    end
  end
end
if not body or body == "" then
  ngx.status = 413
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Body too large for buffer or empty – reduce file size"}')
  return
end

local ok, data = pcall(cjson.decode, body)
if not ok or type(data) ~= "table" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Invalid JSON"}')
  return
end

-- Typ + Dateiname validieren
local TYPE_DIRS = {
  audio   = "vault/audio",
  image   = "vault/images",
  video   = "vault/video",
  context = "vault/context"
}
local sub_dir = TYPE_DIRS[data.type]
if not sub_dir then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Invalid type (audio|image|video|context)"}')
  return
end

local raw_name = tostring(data.name or "")
local safe_name = raw_name:match("^([%w%-%._]+)$")
if not safe_name or #safe_name < 1 or #safe_name > 120 then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Invalid filename"}')
  return
end

-- Base64 dekodieren
if type(data.data) ~= "string" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Missing data field"}')
  return
end

local decoded = ngx.decode_base64(data.data)
if not decoded then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Invalid base64"}')
  return
end

-- ── Sicherheitsprüfungen ───────────────────────────────────────────────────

-- 1. Dateigröße (post-decode)
local file_size = #decoded
local max_size  = MAX_SIZE[data.type] or (10 * 1024 * 1024)
if file_size > max_size then
  audit("UPLOAD_TOO_LARGE", safe_name .. " size=" .. file_size)
  ngx.status = 413
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"File too large","max_mb":' .. math.floor(max_size / 1024 / 1024) .. '}')
  return
end

-- 2. Vault-Quota: max. 200 Dateien + 500 MB Gesamt pro Soul
local QUOTA_FILES = 200
local QUOTA_BYTES = 500 * 1024 * 1024
local du_handle = io.popen("du -sb " .. base_dir .. "/vault 2>/dev/null | awk '{print $1}'")
local vault_bytes = tonumber(du_handle and du_handle:read("*l") or "0") or 0
if du_handle then du_handle:close() end

if vault_bytes + file_size > QUOTA_BYTES then
  audit("QUOTA_EXCEEDED_BYTES", "vault_bytes=" .. vault_bytes)
  ngx.status = 507
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Vault storage quota exceeded (500 MB)"}')
  return
end

-- 3. Extension-Whitelist (verschlüsselte Dateien: jede Endung erlaubt)
local ext = ext_of(safe_name)
if not data.encrypted then
  local allowed = ALLOWED_EXT[data.type] or {}
  if not allowed[ext] then
    audit("BLOCKED_EXTENSION", safe_name .. " type=" .. data.type)
    ngx.status = 415
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"File extension not allowed for type ' .. data.type .. '"}')
    return
  end

  -- 4. Magic-Byte-Prüfung
  local patterns = MAGIC[data.type]
  if patterns and #decoded >= 8 and not magic_matches(decoded, patterns) then
    audit("MAGIC_MISMATCH", safe_name .. " type=" .. data.type)
    ngx.status = 415
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"File content does not match declared type"}')
    return
  end

  -- 5. ClamAV-Malware-Scan
  local clean, threat = clamd_scan(decoded)
  if not clean then
    -- Interne Threat-Details nur ins Audit-Log, nie zum Client (verhindert Signature-Leaks)
    audit("MALWARE_DETECTED", safe_name .. " threat=" .. tostring(threat))
    ngx.status = 422
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"File rejected by security scan"}')
    return
  end
end

audit("UPLOAD_OK", safe_name .. " type=" .. data.type .. " size=" .. file_size)

-- Verzeichnis anlegen + Datei schreiben
local dir_path  = base_dir .. "/" .. sub_dir
-- Single-Quotes im Dateinamen escapen (ffmpeg-Shell-Schutz: ' → '\'' )
local shell_safe_name = safe_name:gsub("'", "'\\''")
local file_path = dir_path .. "/" .. safe_name
os.execute("mkdir -p '" .. dir_path .. "'")

local f = io.open(file_path, "wb")
if not f then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Storage error"}')
  return
end
f:write(decoded); f:close()

-- ── ffmpeg: Audio → MP3, Video → MP4 ─────────────────────────────────────
-- Verschlüsselte Dateien nicht konvertieren (kein valider Stream)
local registered_name = safe_name

if not data.encrypted and data.type == "audio" then
  -- WebM/WAV/M4A → MP3: Rauschen reduzieren + lautstärke normalisieren
  local base     = safe_name:match("^(.+)%.[^%.]+$") or safe_name
  local out_name = base .. ".mp3"
  local out_path = dir_path .. "/" .. out_name
  local shell_file = file_path:gsub("'", "'\\''")
  local shell_out  = out_path:gsub("'", "'\\''")
  local cmd = string.format(
    "ffmpeg -y -i '%s'"
    .. " -af 'highpass=f=80,lowpass=f=8000,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11'"
    .. " -codec:a libmp3lame -q:a 2"
    .. " '%s' >/dev/null 2>&1",
    shell_file, shell_out
  )
  local ret = os.execute(cmd)
  -- LuaJIT: os.execute() gibt true (Lua 5.2) ODER 0 (Lua 5.1) bei Erfolg zurück
  if ret == 0 or ret == true then
    registered_name = out_name
    os.remove(file_path)
  else
    ngx.log(ngx.WARN, "[vault_sync] ffmpeg audio fehlgeschlagen für ", safe_name, " (ret=", tostring(ret), ")")
  end

elseif not data.encrypted and data.type == "video" then
  -- MOV/WebM/AVI → MP4 H.264 + AAC, streaming-optimiert (faststart)
  local base     = safe_name:match("^(.+)%.[^%.]+$") or safe_name
  local out_name = base .. ".mp4"
  local out_path = dir_path .. "/" .. out_name
  local shell_file = file_path:gsub("'", "'\\''")
  local shell_out  = out_path:gsub("'", "'\\''")
  local cmd = string.format(
    "ffmpeg -y -i '%s'"
    .. " -c:v libx264 -crf 23 -preset medium -movflags +faststart"
    .. " -c:a aac -b:a 128k"
    .. " '%s' >/dev/null 2>&1",
    shell_file, shell_out
  )
  local ret = os.execute(cmd)
  if ret == 0 or ret == true then
    registered_name = out_name
    os.remove(file_path)
  else
    ngx.log(ngx.WARN, "[vault_sync] ffmpeg video fehlgeschlagen für ", safe_name, " (ret=", tostring(ret), ")")
  end
end

-- synced_files in api_context.json aktualisieren
local ctx_file = base_dir .. "/api_context.json"
local cf = io.open(ctx_file, "r")
local ctx = nil
if cf then
  local raw = cf:read("*a"); cf:close()
  local cok, cdata = pcall(cjson.decode, raw)
  if cok and type(cdata) == "table" then ctx = cdata end
end
-- Schutz: bei Parse-Fehler NICHT schreiben (würde alle Settings löschen)
if not ctx then
  ngx.log(ngx.WARN, "[vault_sync] api_context.json nicht lesbar – synced_files-Update übersprungen")
  -- Trotzdem Erfolg zurückgeben (Datei wurde hochgeladen)
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ ok = true, name = registered_name, type = data.type, warning = "context_not_updated" }))
  return
end

if not ctx.synced_files then ctx.synced_files = {} end

-- "image" → "images": Frontend und api_serve.lua nutzen "images" (Plural) als Schlüssel
local SYNCED_KEY = { audio = "audio", image = "images", video = "video", context = "context" }
local synced_key = SYNCED_KEY[data.type] or data.type

-- cjson.empty_array ist userdata (kein Lua-Table) → in echtes Table umwandeln
local arr = ctx.synced_files[synced_key]
if type(arr) ~= "table" then arr = {} end

-- Doppelten Eintrag vermeiden (prüfe auf registered_name)
local found = false
for _, n in ipairs(arr) do
  if n == registered_name then found = true; break end
end
if not found then table.insert(arr, registered_name) end
ctx.synced_files[synced_key] = #arr > 0 and arr or cjson.empty_array

-- Normalisieren: cjson decoded [] als leere Lua-Table {} → muss als [] (empty_array) bleiben
-- sonst schreibt cjson beim nächsten Speichern "{}" statt "[]" für leere Kategorien
for _, k in ipairs({"audio", "video", "images", "context"}) do
  if k ~= synced_key then
    local v = ctx.synced_files[k]
    if v == nil or (type(v) == "table" and #v == 0) then
      ctx.synced_files[k] = cjson.empty_array
    end
  end
end

-- active_files: nur setzen wenn noch kein Wert (User-Wahl bleibt erhalten)
if not ctx.active_files then ctx.active_files = {} end
local cur_active = ctx.active_files[synced_key]
local cur_empty  = not cur_active or cur_active == "" or type(cur_active) ~= "string"
if cur_empty then
  ctx.active_files[synced_key] = registered_name
end

local wf = io.open(ctx_file, "w")
if wf then wf:write(cjson.encode(ctx)); wf:close() end

local processed = (registered_name ~= safe_name)
ngx.header["Content-Type"] = "application/json"
ngx.say(cjson.encode({
  ok        = true,
  name      = registered_name,
  original  = safe_name,
  processed = processed,
  type      = data.type,
  size      = #decoded
}))
