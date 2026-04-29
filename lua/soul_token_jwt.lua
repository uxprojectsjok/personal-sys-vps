-- /etc/openresty/lua/soul_token_jwt.lua
-- Ersetzt server/api/soul/v1/token.post.js in Production (OpenResty).
-- POST /api/soul/v1/token  Authorization: Bearer soul_id.cert
-- → {"token":"<JWT>","expires_in":2592000,"soul_id":"..."}
-- JWT: HS256, 30 Tage, signiert mit API_SIGNING_KEY
-- soul_cert-Validierung übernimmt soul_auth.lua (access_by_lua_file)

local signing_key = os.getenv("API_SIGNING_KEY")
if not signing_key or signing_key == "" then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"API_SIGNING_KEY nicht gesetzt"}')
  return
end

-- soul_id aus ngx.ctx (von soul_auth.lua im access-Phase gesetzt)
local soul_id = ngx.ctx.soul_id or ""

if soul_id == "" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"soul_id nicht lesbar"}')
  return
end

-- base64url: Standard-base64 → URL-safe, kein Padding
local function b64url(s)
  return ngx.encode_base64(s):gsub("+", "-"):gsub("/", "_"):gsub("=+$", "")
end

-- HMAC-SHA256 (inline, gleiche Logik wie soul_cert.lua)
local function hmac_sha256(key, message)
  local sha256 = require("resty.sha256")
  local BLOCK  = 64
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
  return ho:final()
end

-- JWT bauen
local TTL    = 60 * 60 * 24 * 30  -- 30 Tage
local now    = ngx.time()
local header  = b64url('{"alg":"HS256","typ":"JWT"}')
local payload = b64url('{"soul_id":"' .. soul_id .. '","iat":' .. now .. ',"exp":' .. (now + TTL) .. '}')
local signing_input = header .. "." .. payload
local sig    = b64url(hmac_sha256(signing_key, signing_input))
local jwt    = signing_input .. "." .. sig

ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say('{"token":"' .. jwt .. '","expires_in":' .. TTL .. ',"soul_id":"' .. soul_id .. '"}')
