-- /etc/openresty/lua/vault_shared_upload.lua
-- POST /api/vault/shared
-- Protected by access_by_lua_file soul_auth.lua → ngx.ctx.soul_id
-- Body: { name: str, data: base64, mime?: str }
-- Saves to /var/lib/sys/souls/{soul_id}/vault_shared/{ts}_{name}
-- WebM audio → ffmpeg → M4A (sync, files are small)
-- WebM video → ffmpeg → MP4 if ≤ 20 MB (sync), else keeps WebM
-- Returns: { ok: true, filename: str }

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"POST required"}'); return
end

if not soul_id or not soul_id:match("^[a-zA-Z0-9%-]+$") then
  ngx.status = 403; ngx.say('{"error":"invalid_soul"}'); return
end

ngx.req.read_body()
local body = ngx.req.get_body_data()
if not body then
  local tmp = ngx.req.get_body_file()
  if tmp then
    local f = io.open(tmp, "r")
    if f then body = f:read("*a"); f:close() end
  end
end
body = body or "{}"
local ok, data = pcall(cjson.decode, body)
if not ok or type(data) ~= "table" then
  ngx.status = 400; ngx.say('{"error":"invalid_json"}'); return
end

-- Explicit char class avoids LuaJIT %w-in-set interpretation issues
local safe_name = tostring(data.name or "")
if safe_name == "" or #safe_name > 120 or safe_name:find("[^A-Za-z0-9%.%-%_]") then
  ngx.status = 400; ngx.say('{"error":"invalid_filename"}'); return
end

local b64 = tostring(data.data or "")
if b64 == "" then
  ngx.status = 400; ngx.say('{"error":"missing_data"}'); return
end

local content = ngx.decode_base64(b64)
if not content then
  ngx.status = 400; ngx.say('{"error":"invalid_base64"}'); return
end

if #content > 50 * 1024 * 1024 then
  ngx.status = 413; ngx.say('{"error":"file_too_large_max_50mb"}'); return
end

local dir = "/var/lib/sys/souls/" .. soul_id .. "/vault_shared"
os.execute("mkdir -p " .. dir .. " && chmod 750 " .. dir .. " && chown www-data:www-data " .. dir)

local ts       = math.floor(ngx.now() * 1000)
local filename = ts .. "_" .. safe_name

local f = io.open(dir .. "/" .. filename, "wb")
if not f then
  ngx.status = 500; ngx.say('{"error":"storage_error"}'); return
end
f:write(content); f:close()

-- WebM → universell kompatibles Format konvertieren (iOS Safari spielt WebM nicht ab)
local ext = (filename:match("%.([^%.]+)$") or ""):lower()
if ext == "webm" then
  local mime_hint = type(data.mime) == "string" and data.mime or ""
  local is_audio  = mime_hint:find("audio") or safe_name:find("^sprachnachricht")
  local is_video  = mime_hint:find("video") or safe_name:find("^video")

  local inpath  = dir .. "/" .. filename
  local outname, cmd

  if is_audio then
    -- Audio: immer sync (Sprachnachrichten sind klein, Konvertierung < 300 ms)
    outname = filename:gsub("%.webm$", ".m4a")
    cmd = string.format(
      '/usr/bin/ffmpeg -i "%s" -c:a aac -b:a 96k -y "%s/%s" 2>/dev/null',
      inpath, dir, outname)
  elseif is_video and #content <= 20 * 1024 * 1024 then
    -- Video ≤ 20 MB: sync konvertieren (kurze Clips < 5 Sek. Wartezeit)
    outname = filename:gsub("%.webm$", ".mp4")
    cmd = string.format(
      '/usr/bin/ffmpeg -i "%s" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart -y "%s/%s" 2>/dev/null',
      inpath, dir, outname)
  end

  if cmd then
    os.execute(cmd)
    -- Prüfe ob Ausgabe existiert; bei Erfolg WebM löschen
    local chk = io.open(dir .. "/" .. outname, "rb")
    if chk then
      chk:close()
      os.remove(inpath)
      filename = outname
    end
    -- Bei Fehler bleibt das ursprüngliche WebM (Fallback)
  end
end

ngx.say(cjson.encode({ ok = true, filename = filename }))
