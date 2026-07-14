-- GET /api/health/check — liest health.md, gibt Tips für alle Metriken zurück

local cjson        = require("cjson.safe")
local resty_aes    = require("resty.aes")
local soul_id      = ngx.ctx.soul_id
if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unauthorized"}')
  return
end

local HEALTH_MD = "/var/lib/sys/souls/" .. soul_id .. "/vault/context/health.md"
local SCRIPT    = "/opt/sys/health-sync/health-check-api.mjs"
local NODE      = "/usr/bin/node"

ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-store"

local MAGIC = "SYS\x01"  -- 4 Magic-Bytes, kompatibel mit api_serve.lua / api_context.lua
local function hex_to_bin(hex)
  return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
end
local function decrypt_content(data, vault_key_hex)
  if not data or data == "" then return data end
  if data:sub(1, 4) ~= MAGIC then return data end
  if not vault_key_hex or #vault_key_hex ~= 64 then return nil end
  local iv = data:sub(5, 20)
  local ciphertext = data:sub(21)
  local key = hex_to_bin(vault_key_hex)
  local aes_ctx = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return nil end
  return aes_ctx:decrypt(ciphertext)
end

local fh = io.open(HEALTH_MD, "rb")
if not fh then
  ngx.say(cjson.encode({ tips = {} }))
  return
end
local raw = fh:read("*a")
fh:close()

local content = decrypt_content(raw, ngx.ctx.vault_key)
if content == nil then
  -- verschlüsselt, aber kein Vault-Key verfügbar
  ngx.say(cjson.encode({ tips = {} }))
  return
end

-- Entschlüsselten Klartext in /dev/shm (tmpfs, RAM-basiert, keine Platte)
-- ablegen, damit das Node-Skript unverändert per Dateipfad aufgerufen werden
-- kann; Tempfile wird sofort danach gelöscht.
local tmp_path = "/dev/shm/health_check_" .. soul_id .. "_" .. ngx.now() .. ".md"
local tf = io.open(tmp_path, "w")
if not tf then
  ngx.say(cjson.encode({ tips = {} }))
  return
end
tf:write(content)
tf:close()
os.execute("chmod 600 " .. tmp_path)

local pipe = io.popen(NODE .. " " .. SCRIPT .. ' "' .. tmp_path:gsub('"', '\\"') .. '"')
local out  = pipe and pipe:read("*a") or ""
if pipe then pipe:close() end
os.remove(tmp_path)

local data = cjson.decode(out)
if not data then
  ngx.say(cjson.encode({ tips = {} }))
  return
end

ngx.say(cjson.encode(data))
