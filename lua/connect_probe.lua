-- /etc/openresty/lua/connect_probe.lua
-- POST /api/connect/probe        → Fremder meldet sich (kein Auth, CORS)
-- GET  /api/connect/probe-status → Fremder pollt Status (kein Auth, CORS)

local cjson       = require("cjson.safe")
local CONNECT_DIR = "/var/lib/sys/connect/"

ngx.header["Content-Type"]                 = "application/json"
ngx.header["Cache-Control"]               = "no-store"
ngx.header["Access-Control-Allow-Origin"] = "*"
ngx.header["Access-Control-Allow-Headers"] = "Content-Type"
ngx.header["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"

if ngx.req.get_method() == "OPTIONS" then
  ngx.status = 204; return
end

local method = ngx.req.get_method()
local uri    = ngx.var.uri

-- ── Helpers ───────────────────────────────────────────────────────────────────

local function valid_token(t)
  return type(t) == "string" and #t == 48 and t:match("^[a-f0-9]+$")
end

local function load_token(token)
  local f = io.open(CONNECT_DIR .. token .. ".json", "r")
  if not f then return nil end
  local raw = f:read("*a"); f:close()
  local ok, d = pcall(cjson.decode, raw)
  return (ok and type(d) == "table") and d or nil
end

local function save_token(token, d)
  local f = io.open(CONNECT_DIR .. token .. ".json", "w")
  if not f then return false end
  f:write(cjson.encode(d)); f:close()
  return true
end

local function is_expired(d)
  if not d.expires_at then return false end
  local y,mo,dy,h,mi,s = d.expires_at:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
  if not y then return false end
  local t = os.time({ year=tonumber(y), month=tonumber(mo), day=tonumber(dy),
                       hour=tonumber(h), min=tonumber(mi), sec=tonumber(s) })
  return os.time() >= t
end

-- ── POST /api/connect/probe ───────────────────────────────────────────────────

if method == "POST" and (uri == "/api/connect/probe" or not uri:find("status")) then
  ngx.req.read_body()
  local body = ngx.req.get_body_data() or "{}"
  local ok, payload = pcall(cjson.decode, body)
  if not ok or type(payload) ~= "table" then
    ngx.status = 400; ngx.say('{"error":"Ungültiges JSON"}'); return
  end

  local token = payload.token
  if not valid_token(token) then
    ngx.status = 400; ngx.say('{"error":"Token ungültig"}'); return
  end

  local d = load_token(token)
  if not d then
    ngx.status = 404; ngx.say('{"error":"Token nicht gefunden"}'); return
  end
  if is_expired(d) then
    ngx.status = 410; ngx.say('{"error":"Token abgelaufen"}'); return
  end
  if d.status ~= "waiting" then
    ngx.status = 409; ngx.say('{"error":"Token bereits verwendet"}'); return
  end

  d.status    = "probed"
  d.probed_at = os.date("%Y-%m-%dT%H:%M:%S")
  save_token(token, d)

  ngx.say(cjson.encode({ status = "pending" }))
  return
end

-- ── GET /api/connect/probe-status ────────────────────────────────────────────

if method == "GET" then
  local args = ngx.req.get_uri_args()
  local token = args.s
  if not valid_token(token) then
    ngx.status = 400; ngx.say('{"error":"Token fehlt"}'); return
  end

  local d = load_token(token)
  if not d then
    ngx.status = 404; ngx.say('{"error":"Token nicht gefunden"}'); return
  end
  if is_expired(d) then
    ngx.say(cjson.encode({ status = "expired" })); return
  end

  ngx.say(cjson.encode({ status = d.status }))
  return
end

ngx.status = 405; ngx.say('{"error":"Method not allowed"}')
