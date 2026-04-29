-- /etc/openresty/lua/hmac_helper.lua
-- Geteilter HMAC-SHA256 Helper – wird von soul_auth.lua und vault_auth.lua genutzt
-- Usage: local hmac = require("hmac_helper")
--        local hex  = hmac.sign(key_string, message_string)
--        local cert = hmac.cert_for_soul(master_key, soul_id, cert_version)
--        local ver  = hmac.read_cert_version(soul_id)

local sha256 = require("resty.sha256")
local rstr   = require("resty.string")
local BLOCK  = 64

local M = {}

function M.sign(key, msg)
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

  local hi = sha256:new(); hi:update(table.concat(ipad) .. msg)
  local ho = sha256:new(); ho:update(table.concat(opad) .. hi:final())
  return rstr.to_hex(ho:final())
end

-- Berechnet den soul_cert für eine gegebene soul_id und cert_version.
-- cert_version == 0 (oder nil): altes Format HMAC(key, soul_id) – rückwärtskompatibel
-- cert_version > 0:             HMAC(key, soul_id + ":" + cert_version)
function M.cert_for_soul(master_key, soul_id, cert_version)
  local msg = (cert_version and cert_version > 0)
    and (soul_id .. ":" .. tostring(cert_version))
    or soul_id
  return M.sign(master_key, msg):sub(1, 32)
end

-- Liest cert_version aus api_context.json (immer plaintext, nie verschlüsselt).
-- sys.md kann AES-verschlüsselt sein und ist daher nicht zuverlässig lesbar.
function M.read_cert_version(soul_id)
  if not soul_id:match("^[a-zA-Z0-9%-]+$") then return 0 end
  local path = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
  local f = io.open(path, "r")
  if not f then return 0 end
  local raw = f:read("*a"); f:close()
  local ok, data = pcall(require("cjson.safe").decode, raw)
  if ok and type(data) == "table" and type(data.cert_version) == "number" then
    return data.cert_version
  end
  return 0
end

return M
