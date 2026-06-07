-- /etc/openresty/lua/vault_peer_media_proxy.lua
-- GET /api/vault/peer-media?endpoint=...&soul_id=...&file=...
-- Self-contained auth: verifies local soul_cert, then proxies binary to peer's vault_shared_serve.
-- Same pattern as soul_peer_proxy.lua.
-- Same-server optimization: if endpoint == own host, serve file directly from filesystem.

local http  = require("resty.http")
local cjson = require("cjson.safe")
local cfg   = require("config_reader")
local hmac  = require("hmac_helper")

ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local UUID_PAT  = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
local SOULS_DIR = "/var/lib/sys/souls/"

-- ── Auth: own soul_cert ───────────────────────────────────────────────────────
local bearer = (ngx.req.get_headers()["Authorization"] or ""):match("^[Bb]earer%s+(.+)$")
if not bearer then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 401; ngx.say('{"error":"bearer_required"}'); return
end
local own_soul_id, own_cert = bearer:match("^([^.]+)%.(.+)$")
if not own_soul_id or not own_cert or not own_soul_id:match(UUID_PAT) then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 401; ngx.say('{"error":"invalid_bearer"}'); return
end

local global_key  = cfg.get_master_key()
local per_key     = cfg.get_soul_master_key(own_soul_id)
local active_key  = (per_key and per_key ~= "") and per_key or global_key
if not active_key or active_key == "" then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 500; ngx.say('{"error":"no_master_key"}'); return
end

local cv = hmac.read_cert_version(own_soul_id)
local cert_ok = false
for _, v in ipairs({ cv, cv - 1, cv + 1 }) do
  if v >= 0 and hmac.cert_for_soul(active_key, own_soul_id, v) == own_cert then
    cert_ok = true; break
  end
end
if not cert_ok then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 401; ngx.say('{"error":"invalid_cert"}'); return
end

-- ── Params ────────────────────────────────────────────────────────────────────
local args           = ngx.req.get_uri_args()
local target_soul_id = args.soul_id  or ""
local filename       = args.file     or ""
local endpoint       = args.endpoint or ""

if not target_soul_id:match(UUID_PAT) then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 400; ngx.say('{"error":"invalid_soul_id"}'); return
end

filename = filename:match("^([A-Za-z0-9%.%-%_]+)$")
if not filename then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 400; ngx.say('{"error":"invalid_filename"}'); return
end

-- ── Same-Server-Shortcut: Datei direkt aus Filesystem lesen ──────────────────
-- Verhindert HTTPS-Loopback auf Multi-Hostern (ssl_verify würde fehlschlagen).
local own_host = ngx.var.host or ""
local is_same_server = (endpoint == "") or (endpoint ~= "" and endpoint:find(own_host, 1, true) ~= nil)

if is_same_server then
  -- Prüfen ob die Ziel-Soul überhaupt auf diesem Server existiert
  local fpath = SOULS_DIR .. target_soul_id .. "/vault_shared/" .. filename
  local f = io.open(fpath, "rb")
  if not f then
    ngx.header["Content-Type"] = "application/json"
    ngx.status = 404; ngx.say('{"error":"file_not_found"}'); return
  end
  local content = f:read("*a"); f:close()

  -- Verbindung prüfen: own_soul_id muss in Ziel-Soul's connections sein
  local allowed = false
  if own_soul_id == target_soul_id then
    allowed = true  -- eigene Datei
  else
    local conn_path = SOULS_DIR .. target_soul_id .. "/soul_connections.json"
    local cf = io.open(conn_path, "r")
    if cf then
      local raw = cf:read("*a"); cf:close()
      local ok_c, conn_data = pcall(cjson.decode, raw)
      if ok_c and type(conn_data) == "table" then
        local conns = type(conn_data.connections) == "table" and conn_data.connections
                      or (conn_data[1] and conn_data or {})
        for _, c in ipairs(conns) do
          if type(c) == "table" and c.soul_id == own_soul_id then
            allowed = true; break
          end
        end
      end
    end
    -- Fallback: trusted_souls in api_context
    if not allowed then
      local ctx_f = io.open(SOULS_DIR .. target_soul_id .. "/api_context.json", "r")
      if ctx_f then
        local raw_ctx = ctx_f:read("*a"); ctx_f:close()
        local ok_ctx, ctx = pcall(cjson.decode, raw_ctx)
        if ok_ctx and type(ctx) == "table" then
          local ts = type(ctx.amortization) == "table" and ctx.amortization.trusted_souls or {}
          for _, entry in ipairs(type(ts) == "table" and ts or {}) do
            if (type(entry) == "string" and entry == own_soul_id)
               or (type(entry) == "table" and entry.soul_id == own_soul_id) then
              allowed = true; break
            end
          end
        end
      end
    end
  end

  if not allowed then
    ngx.header["Content-Type"] = "application/json"
    ngx.status = 403; ngx.say('{"error":"peer_not_connected"}'); return
  end

  local MIME = {
    jpg="image/jpeg", jpeg="image/jpeg", png="image/png",
    webp="image/webp", gif="image/gif", avif="image/avif",
    pdf="application/pdf", txt="text/plain; charset=utf-8",
    md="text/markdown; charset=utf-8",
  }
  local ext  = (filename:match("%.([^%.]+)$") or ""):lower()
  local mime = MIME[ext] or "application/octet-stream"
  local dispo = (MIME[ext] and ext ~= "pdf") and "inline" or "attachment"
  ngx.header["Content-Type"]        = mime
  ngx.header["Content-Disposition"] = dispo .. '; filename="' .. filename .. '"'
  ngx.print(content)
  return
end

-- ── Cross-Server: Proxy via HTTPS ─────────────────────────────────────────────
local base_url = endpoint:match("^(https://[%w%.%-]+[^%s]*)$")
if not base_url then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 400; ngx.say('{"error":"invalid_endpoint"}'); return
end
base_url = base_url:gsub("/+$", "")

local upstream_url = base_url .. "/api/vault/shared/"
  .. ngx.escape_uri(target_soul_id) .. "/" .. ngx.escape_uri(filename)

local httpc = http.new(); httpc:set_timeout(20000)
local res, err = httpc:request_uri(upstream_url, {
  method     = "GET",
  headers    = { ["Authorization"] = "Bearer " .. bearer, Accept = "*/*" },
  ssl_verify = true,
})

if not res then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 502
  ngx.say('{"error":"upstream_unreachable","detail":' .. cjson.encode(tostring(err or "")) .. '}')
  return
end

ngx.status = res.status
ngx.header["Content-Type"] = res.headers["Content-Type"] or "application/octet-stream"
if res.headers["Content-Disposition"] then
  ngx.header["Content-Disposition"] = res.headers["Content-Disposition"]
end
ngx.print(res.body or "")
