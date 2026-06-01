-- /etc/openresty/lua/connect_hello.lua
-- GET /api/connect/hello?s=TOKEN  (kein Auth, CORS)
-- Prüft Token + gibt Soul-Greeting zurück. Markiert Token als "used".

local cjson       = require("cjson.safe")
local CONNECT_DIR = "/var/lib/sys/connect/"
local SOULS_DIR   = "/var/lib/sys/souls/"

ngx.header["Content-Type"]                 = "application/json"
ngx.header["Cache-Control"]               = "no-store"
ngx.header["Access-Control-Allow-Origin"] = "*"
ngx.header["Access-Control-Allow-Methods"] = "GET, OPTIONS"

if ngx.req.get_method() == "OPTIONS" then
  ngx.status = 204; return
end
if ngx.req.get_method() ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"Method not allowed"}'); return
end

local args  = ngx.req.get_uri_args()
local token = args.s

if type(token) ~= "string" or #token ~= 48 or not token:match("^[a-f0-9]+$") then
  ngx.status = 400; ngx.say('{"error":"Token fehlt oder ungültig"}'); return
end

local path = CONNECT_DIR .. token .. ".json"
local f = io.open(path, "r")
if not f then
  ngx.status = 404; ngx.say('{"error":"Token nicht gefunden"}'); return
end
local raw = f:read("*a"); f:close()
local ok, d = pcall(cjson.decode, raw)
if not ok or type(d) ~= "table" then
  ngx.status = 500; ngx.say('{"error":"Token-Daten korrupt"}'); return
end

if d.status == "used" then
  ngx.status = 410; ngx.say('{"error":"Token bereits verwendet"}'); return
end
if d.status ~= "approved" then
  ngx.status = 403; ngx.say('{"error":"Verbindung nicht freigegeben"}'); return
end

-- Ablaufzeit prüfen
if d.expires_at then
  local y,mo,dy,h,mi,s = d.expires_at:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
  if y then
    local t = os.time({ year=tonumber(y), month=tonumber(mo), day=tonumber(dy),
                         hour=tonumber(h), min=tonumber(mi), sec=tonumber(s) })
    if os.time() >= t then
      ngx.status = 410; ngx.say('{"error":"Token abgelaufen"}'); return
    end
  end
end

-- Soul-Name aus sys.md Frontmatter lesen
local soul_name = ""
local sf = io.open(SOULS_DIR .. d.soul_id .. "/sys.md", "rb")
if sf then
  local content = sf:read("*a"); sf:close()
  local name_raw = content:match("name:%s*(.-)%s*\n") or ""
  soul_name = name_raw:gsub('"', ''):gsub("'", ""):gsub("%s+$", ""):sub(1, 64)
end
if soul_name == "" then soul_name = "Unknown" end

-- Token als "used" markieren (einmalige Nutzung)
d.status  = "used"
d.used_at = os.date("%Y-%m-%dT%H:%M:%S")
local wf = io.open(path, "w")
if wf then wf:write(cjson.encode(d)); wf:close() end

ngx.say(cjson.encode({
  message    = "Hello from " .. soul_name .. "!",
  soul_name  = soul_name,
  verified   = true,
}))
