-- /etc/openresty/lua/soul_sign_session.lua
-- Ersetzt server/api/soul-sign-session.post.js in Production (OpenResty).
-- POST /api/soul-sign-session  {"soul_id":"...","content_hash":"...","date":"YYYY-MM-DD"}
-- → {"signature":"<32 hex chars>"}
-- HMAC-SHA256(SOUL_MASTER_KEY, soul_id:date:content_hash).hex().slice(0, 32)

local master_key = os.getenv("SOUL_MASTER_KEY")
if not master_key or master_key == "" then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"SOUL_MASTER_KEY nicht gesetzt"}')
  return
end

ngx.req.read_body()
local body = ngx.req.get_body_data()

if not body or body == "" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"soul_id, content_hash und date sind erforderlich"}')
  return
end

local ok, data = pcall(require("cjson").decode, body)
if not ok or type(data) ~= "table" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Ungültiger JSON-Body"}')
  return
end

local soul_id      = data.soul_id
local content_hash = data.content_hash
local date         = data.date

if type(soul_id) ~= "string" or #soul_id < 1
or type(content_hash) ~= "string" or #content_hash < 1
or type(date) ~= "string" or #date < 1 then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"soul_id, content_hash und date sind erforderlich"}')
  return
end

-- HMAC-SHA256: Nachricht = soul_id:date:content_hash (Reihenfolge unveränderlich)
local message = soul_id .. ":" .. date .. ":" .. content_hash

local sha256 = require("resty.sha256")
local rstr   = require("resty.string")
local BLOCK  = 64
local key    = master_key

if #key > BLOCK then
  local h = sha256:new(); h:update(key); key = h:final()
end
key = key .. string.rep("\0", BLOCK - #key)

local ipad, opad = {}, {}
for i = 1, BLOCK do
  local b = key:byte(i)
  ipad[i] = string.char(bit.bxor(b, 0x36))
  opad[i] = string.char(bit.bxor(b, 0x5c))
end

local hi = sha256:new(); hi:update(table.concat(ipad) .. message)
local ho = sha256:new(); ho:update(table.concat(opad) .. hi:final())
local hex       = rstr.to_hex(ho:final())
local signature = hex:sub(1, 32)

ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say('{"signature":"' .. signature .. '"}')
