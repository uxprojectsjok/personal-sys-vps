-- /etc/openresty/lua/vault_shared_mcp_get.lua
-- GET /api/vault/shared-mcp?soul_id=<id>&filename=<name>
-- Auth: vault_auth.lua (service-token oder soul_cert)
-- Holt eine Datei aus vault_shared — eigene, same-server-Peer oder cross-domain-Peer.
-- Gibt JSON zurück: { ok, data_b64, mime, filename, size_kb }

local cjson  = require("cjson.safe")
local http   = require("resty.http")
local cfg    = require("config_reader")
local hmac   = require("hmac_helper")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.say('{"error":"method_not_allowed"}')
  return
end

local own_soul_id = ngx.ctx.soul_id
local SOULS_DIR   = "/var/lib/sys/souls/"
local UUID_PAT    = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"

if not own_soul_id then
  ngx.status = 401; ngx.say('{"error":"unauthorized"}'); return
end

local args    = ngx.req.get_uri_args()
local soul_id = args.soul_id  or ""
local fname   = args.filename or ""

if not soul_id:match(UUID_PAT) then
  ngx.status = 400; ngx.say('{"error":"invalid_soul_id"}'); return
end

-- Dateinamen sichern: nur alphanumerisch + . - _
local safe_name = fname:match("^([A-Za-z0-9%.%-%_]+)$")
if not safe_name or safe_name:find("%.%.") or #safe_name > 200 then
  ngx.status = 400; ngx.say('{"error":"invalid_filename"}'); return
end

-- ── MIME-Typ aus Dateiendung ──────────────────────────────────────────────────
local MIME_MAP = {
  jpg="image/jpeg", jpeg="image/jpeg", png="image/png",
  webp="image/webp", gif="image/gif", avif="image/avif",
  mp4="video/mp4",  webm="video/webm", mov="video/quicktime",
  mp3="audio/mpeg", wav="audio/wav",   ogg="audio/ogg", m4a="audio/mp4",
  pdf="application/pdf",
  md="text/plain; charset=utf-8", txt="text/plain; charset=utf-8",
  json="application/json", csv="text/csv",
  docx="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip="application/zip",
}
local ext  = safe_name:match("%.([^%.]+)$") or ""
local mime = MIME_MAP[ext:lower()] or "application/octet-stream"

-- ── Datei lesen: eigene oder same-server-Peer ────────────────────────────────
local function read_local(target_soul_id)
  local path = SOULS_DIR .. target_soul_id .. "/vault_shared/" .. safe_name
  local f = io.open(path, "rb")
  if not f then return nil end
  local data = f:read("*a"); f:close()
  return data
end

-- ── Cross-Domain: HTTP mit eigenem HMAC-Cert ─────────────────────────────────
local function fetch_remote(endpoint)
  local global_key   = cfg.get_master_key()
  local per_soul_key = cfg.get_soul_master_key(own_soul_id)
  local active_key   = (per_soul_key and per_soul_key ~= "") and per_soul_key or global_key
  local cv           = hmac.read_cert_version(own_soul_id)
  local own_cert     = hmac.cert_for_soul(active_key, own_soul_id, cv)

  local url = endpoint:gsub("/+$", "")
    .. "/api/vault/shared/" .. soul_id .. "/" .. safe_name

  local httpc = http.new()
  httpc:set_timeout(15000)
  local res, err = httpc:request_uri(url, {
    method  = "GET",
    headers = { ["Authorization"] = "Bearer " .. own_soul_id .. "." .. own_cert },
    ssl_verify = true,
  })
  if not res then return nil, tostring(err) end
  if res.status ~= 200 then return nil, "HTTP " .. res.status end
  return res.body, nil, res.headers["Content-Type"]
end

-- ── Routing-Logik ────────────────────────────────────────────────────────────
local raw_data, fetch_err

if soul_id == own_soul_id then
  -- Eigene Datei
  raw_data = read_local(own_soul_id)
else
  -- Peer: Verbindungen prüfen
  local conn_path = SOULS_DIR .. own_soul_id .. "/soul_connections.json"
  local cf = io.open(conn_path, "r")
  local peer_endpoint = nil
  local is_same_server = false

  local own_host = ngx.var.host or ""
  if cf then
    local raw = cf:read("*a"); cf:close()
    local ok_c, conn_data = pcall(cjson.decode, raw)
    if ok_c and type(conn_data) == "table" then
      local conns = type(conn_data.connections) == "table" and conn_data.connections or {}
      for _, c in ipairs(conns) do
        if c.soul_id == soul_id then
          if type(c.domain) == "string" and c.domain ~= ""
             and not c.domain:find(own_host, 1, true) then
            peer_endpoint = c.domain
          else
            is_same_server = true
          end
          break
        end
      end
    end
  end

  if is_same_server then
    raw_data = read_local(soul_id)
  elseif peer_endpoint then
    local remote_mime
    raw_data, fetch_err, remote_mime = fetch_remote(peer_endpoint)
    if remote_mime then mime = remote_mime end
  else
    ngx.status = 404
    ngx.say(cjson.encode({ error = "peer_not_found", detail = "soul_id nicht in Verbindungen" }))
    return
  end
end

if not raw_data then
  ngx.status = 404
  ngx.say(cjson.encode({
    error  = "file_not_found",
    detail = fetch_err or "Datei nicht im vault_shared gefunden",
  }))
  return
end

-- ── Base64-Encode + Antwort ───────────────────────────────────────────────────
local data_b64 = ngx.encode_base64(raw_data)
local size_kb  = math.ceil(#raw_data / 1024)

ngx.say(cjson.encode({
  ok       = true,
  filename = safe_name,
  mime     = mime,
  size_kb  = size_kb,
  data_b64 = data_b64,
}))
