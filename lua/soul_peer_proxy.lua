-- /etc/openresty/lua/soul_peer_proxy.lua
-- GET /api/soul/peer-social-read?endpoint=<peer_base_url>&soul_id=<peer_soul_id>&raw=1&stage=1
-- Authorization: Bearer <own_soul_id>.<own_cert>
-- Proxies a cross-domain peer social-read server-side so the browser never
-- makes a cross-origin request (avoids CSP connect-src issues).

local http = require("resty.http")
local cfg  = require("config_reader")
local hmac = require("hmac_helper")
local cjson = require("cjson.safe")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"

-- ── Auth: own soul_cert ───────────────────────────────────────────
local auth   = ngx.req.get_headers()["Authorization"] or ""
local bearer = auth:match("^[Bb]earer%s+(.+)$")
if not bearer then
  ngx.status = 401; ngx.say('{"error":"bearer_required"}'); return
end
local own_soul_id, own_cert = bearer:match("^([^.]+)%.(.+)$")
if not own_soul_id or not own_cert or not own_soul_id:match(UUID_PAT) then
  ngx.status = 401; ngx.say('{"error":"invalid_bearer"}'); return
end

-- Verify own cert locally
local SOULS_DIR = "/var/lib/sys/souls/"
local global_key  = cfg.get_master_key()
local per_soul_key = cfg.get_soul_master_key(own_soul_id)
local active_key  = (per_soul_key and per_soul_key ~= "") and per_soul_key or global_key
if not active_key or active_key == "" then
  ngx.status = 500; ngx.say('{"error":"no_master_key"}'); return
end

local cv = 0
local cv_f = io.open(SOULS_DIR .. own_soul_id .. "/api_context.json", "r")
if cv_f then
  local raw = cv_f:read("*a"); cv_f:close()
  local ok, data = pcall(cjson.decode, raw)
  if ok and type(data) == "table" and type(data.cert_version) == "number" then cv = data.cert_version end
end

local cert_ok = false
for _, v in ipairs({ cv, cv - 1, cv + 1 }) do
  if v >= 0 and hmac.cert_for_soul(active_key, own_soul_id, v) == own_cert then
    cert_ok = true; break
  end
end
if not cert_ok then
  ngx.status = 401; ngx.say('{"error":"invalid_cert"}'); return
end

-- ── Params ────────────────────────────────────────────────────────
local args         = ngx.req.get_uri_args()
local peer_endpoint = args.endpoint or ""
local peer_soul_id  = args.soul_id  or ""
local raw_flag      = args.raw      or ""
local stage         = args.stage    or "1"

if peer_endpoint == "" or not peer_soul_id:match(UUID_PAT) then
  ngx.status = 400; ngx.say('{"error":"missing_params"}'); return
end

-- Sanitize endpoint: must be https://
peer_endpoint = peer_endpoint:match("^(https://[%w%.%-]+[^%s]*)$")
if not peer_endpoint then
  ngx.status = 400; ngx.say('{"error":"invalid_endpoint"}'); return
end

-- ── Upstream request ──────────────────────────────────────────────
local upstream_url = peer_endpoint:gsub("/+$", "")
  .. "/api/soul/social-read?soul_id=" .. ngx.escape_uri(peer_soul_id)
  .. "&raw=" .. (raw_flag ~= "" and raw_flag or "1")
  .. "&stage=" .. stage

local httpc = http.new()
httpc:set_timeout(10000)

local res, err = httpc:request_uri(upstream_url, {
  method  = "GET",
  headers = {
    ["Authorization"] = "Bearer " .. own_soul_id .. "." .. own_cert,
    ["Accept"]        = "text/plain",
  },
  ssl_verify = true,
})

if not res then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"upstream_unreachable","detail":' .. cjson.encode(tostring(err)) .. '}')
  return
end

-- Pass through status, content-type and body verbatim
ngx.status = res.status
ngx.header["Content-Type"]  = res.headers["Content-Type"] or "text/plain"
ngx.header["X-Msg-Count"]   = res.headers["X-Msg-Count"]  or nil
ngx.header["X-Msg-Stage"]   = res.headers["X-Msg-Stage"]  or nil
ngx.header["Cache-Control"] = "no-store"
ngx.print(res.body or "")
