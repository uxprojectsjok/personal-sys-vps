-- /etc/openresty/lua/vault_shared_view.lua
-- GET /api/vault/shared-view/{soul_id}/{filename}?token={service_token}
-- Auth: vault_auth.lua (ngx.ctx.soul_id gesetzt)
--
-- Liefert vault_shared-Dateien direkt als Binary aus:
--   Eigene + Same-Server-Peer:  X-Accel-Redirect → nginx Range-Support (Videos, große Dateien)
--   Cross-Domain-Peer:          HTTP-Proxy mit HMAC-Cert + Range-Pass-Through
--
-- Unterstützte Typen: Bilder, PDFs, Videos, Audio, Dokumente

local cjson  = require("cjson.safe")
local http   = require("resty.http")
local cfg    = require("config_reader")
local hmac   = require("hmac_helper")

local own_soul_id = ngx.ctx.soul_id
local SOULS_DIR   = "/var/lib/sys/souls/"
local UUID_PAT    = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"

if not own_soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"unauthorized"}')
  return
end

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

-- ── URL parsen: /api/vault/shared-view/{soul_id}/{filename} ──────────────────
local target_soul_id, raw_file = ngx.var.uri:match("^/api/vault/shared%-view/([^/]+)/(.+)$")

if not target_soul_id or not target_soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_url — expected /api/vault/shared-view/{soul_id}/{filename}"}')
  return
end

local safe_name = raw_file and raw_file:match("^([A-Za-z0-9%.%-%_]+)$")
if not safe_name or safe_name:find("%.%.") or #safe_name > 200 then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_filename"}')
  return
end

-- ── MIME-Typ ──────────────────────────────────────────────────────────────────
local MIME_MAP = {
  -- Bilder
  jpg="image/jpeg", jpeg="image/jpeg", png="image/png",
  webp="image/webp", gif="image/gif", avif="image/avif",
  -- Video
  mp4="video/mp4", webm="video/webm", mov="video/quicktime",
  avi="video/x-msvideo", mkv="video/x-matroska", m4v="video/mp4",
  -- Audio
  mp3="audio/mpeg", wav="audio/wav", ogg="audio/ogg",
  m4a="audio/mp4", flac="audio/flac", aac="audio/aac",
  -- Dokumente
  pdf="application/pdf",
  md="text/plain; charset=utf-8", txt="text/plain; charset=utf-8",
  json="application/json", csv="text/csv",
  docx="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip="application/zip",
}
local ext  = safe_name:match("%.([^%.]+)$") or ""
local mime = MIME_MAP[ext:lower()] or "application/octet-stream"

-- Inline-Anzeige für Bilder + Videos + PDFs, Download für den Rest
local INLINE_MIME = {
  ["image/jpeg"]=true, ["image/png"]=true, ["image/webp"]=true,
  ["image/gif"]=true,  ["image/avif"]=true, ["application/pdf"]=true,
  ["video/mp4"]=true,  ["video/webm"]=true, ["video/quicktime"]=true,
  ["video/x-matroska"]=true,
  ["audio/mpeg"]=true, ["audio/wav"]=true,  ["audio/ogg"]=true,
  ["audio/mp4"]=true,  ["audio/flac"]=true,
}
local disposition = INLINE_MIME[mime] and "inline" or "attachment"

-- ── Eigene oder Same-Server-Peer: X-Accel-Redirect ───────────────────────────
local function serve_local(soul_id_val)
  local rel_path = soul_id_val .. "/vault_shared/" .. safe_name
  local check = io.open(SOULS_DIR .. rel_path, "rb")
  if not check then return false end
  check:close()

  ngx.header["Content-Type"]        = mime
  ngx.header["Content-Disposition"] = disposition .. '; filename="' .. safe_name .. '"'
  ngx.header["Cache-Control"]       = "private, max-age=3600"
  ngx.header["X-Accel-Redirect"]    = "/internal/vault-shared/" .. rel_path
  return true
end

-- ── Cross-Domain-Peer: HTTP-Proxy mit Range-Pass-Through ─────────────────────
local function serve_remote(endpoint)
  local global_key   = cfg.get_master_key()
  local per_soul_key = cfg.get_soul_master_key(own_soul_id)
  local active_key   = (per_soul_key and per_soul_key ~= "") and per_soul_key or global_key
  local cv           = hmac.read_cert_version(own_soul_id)
  local own_cert     = hmac.cert_for_soul(active_key, own_soul_id, cv)

  local upstream = endpoint:gsub("/+$", "")
    .. "/api/vault/shared/" .. target_soul_id .. "/" .. safe_name

  local req_headers = {
    ["Authorization"] = "Bearer " .. own_soul_id .. "." .. own_cert,
  }
  -- Range-Header durchreichen (Video-Seeking)
  local range = ngx.req.get_headers()["Range"]
  if range then req_headers["Range"] = range end

  local httpc = http.new()
  httpc:set_timeout(30000)
  local res, err = httpc:request_uri(upstream, {
    method     = "GET",
    headers    = req_headers,
    ssl_verify = true,
  })

  if not res then
    ngx.status = 502
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"upstream_unreachable","detail":' .. cjson.encode(tostring(err)) .. '}')
    return
  end

  ngx.status = res.status
  ngx.header["Content-Type"]        = res.headers["Content-Type"]  or mime
  ngx.header["Content-Length"]      = res.headers["Content-Length"] or nil
  ngx.header["Content-Range"]       = res.headers["Content-Range"]  or nil
  ngx.header["Accept-Ranges"]       = res.headers["Accept-Ranges"]  or "bytes"
  ngx.header["Content-Disposition"] = disposition .. '; filename="' .. safe_name .. '"'
  ngx.header["Cache-Control"]       = "private, max-age=3600"
  ngx.print(res.body or "")
end

-- ── Routing ───────────────────────────────────────────────────────────────────
if target_soul_id == own_soul_id then
  if not serve_local(own_soul_id) then
    ngx.status = 404
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"file_not_found"}')
  end
  return
end

-- Peer nachschlagen
local conn_path = SOULS_DIR .. own_soul_id .. "/soul_connections.json"
local cf = io.open(conn_path, "r")
local peer_endpoint  = nil
local is_same_server = false

if cf then
  local raw = cf:read("*a"); cf:close()
  local ok_c, conn_data = pcall(cjson.decode, raw)
  if ok_c and type(conn_data) == "table" then
    for _, c in ipairs(type(conn_data.connections) == "table" and conn_data.connections or {}) do
      if c.soul_id == target_soul_id then
        if c.endpoint and c.endpoint ~= "" then
          peer_endpoint = c.endpoint
        else
          is_same_server = true
        end
        break
      end
    end
  end
end

if is_same_server then
  if not serve_local(target_soul_id) then
    ngx.status = 404
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"file_not_found"}')
  end
elseif peer_endpoint then
  serve_remote(peer_endpoint)
else
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"peer_not_found"}')
end
