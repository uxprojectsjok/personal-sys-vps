-- /etc/openresty/lua/elevenlabs_token.lua
-- POST /api/elevenlabs-token
-- Erstellt ElevenLabs Conversation Token für den Soul-Agenten.
-- Liest elevenlabs_key aus config.json und elevenlabs_agent_id aus sys.md-Frontmatter.

local cjson     = require("cjson.safe")
local http      = require("resty.http")
local resty_aes = require("resty.aes")
local soul_id   = ngx.ctx.soul_id

local BASE_DIR = "/var/lib/sys/souls/" .. soul_id
local ELEVEN   = "https://api.elevenlabs.io/v1"
local MAGIC    = "SYS\1"  -- Vault-Verschlüsselungs-Magic (0x53 0x59 0x53 0x01)

local function read_file(path)
  local f = io.open(path, "rb")
  if not f then return nil end
  local c = f:read("*a"); f:close()
  return c
end

local function try_decrypt(data, key_hex)
  if #data < 21 then return nil end
  if data:sub(1, 4) ~= MAGIC then return nil end
  local function hex2bin(h) return (h:gsub("..", function(c) return string.char(tonumber(c, 16)) end)) end
  local iv   = data:sub(5, 20)
  local ciph = data:sub(21)
  local aes  = resty_aes:new(hex2bin(key_hex), nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes then return nil end
  return aes:decrypt(ciph)
end

-- ElevenLabs Key aus config.json
local cfg = {}
local cfg_raw = read_file(BASE_DIR .. "/config.json")
if cfg_raw then
  local ok, d = pcall(cjson.decode, cfg_raw)
  if ok and type(d) == "table" then cfg = d end
end

local elabs_key = cfg.elevenlabs_key or ""
if elabs_key == "" then
  ngx.status = 503
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"elevenlabs_key_missing","message":"Kein ElevenLabs API-Key konfiguriert"}')
  return
end

-- agent_id aus sys.md Frontmatter lesen (entschlüsseln falls nötig)
local agent_id = nil
do
  local sys_raw = read_file(BASE_DIR .. "/sys.md")
  if sys_raw then
    local content = sys_raw
    -- Verschlüsselte sys.md → vault_key_hex aus api_context.json holen und entschlüsseln
    if sys_raw:sub(1, 4) == MAGIC then
      local ctx_raw = read_file(BASE_DIR .. "/api_context.json")
      if ctx_raw then
        local ok_c, ctx = pcall(cjson.decode, ctx_raw)
        if ok_c and type(ctx) == "table" and type(ctx.vault_key_hex) == "string"
           and #ctx.vault_key_hex == 64 then
          content = try_decrypt(sys_raw, ctx.vault_key_hex) or sys_raw
        end
      end
    end
    local m = content:match("elevenlabs_agent_id:%s*(%S+)")
    if m and m ~= '""' and m ~= "" then agent_id = m end
  end
end

if not agent_id then
  ngx.status = 503
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"elevenlabs_agent_missing","message":"Kein ElevenLabs Agent in sys.md — zuerst @create-agent ausführen"}')
  return
end

-- Signed WebSocket URL bei ElevenLabs anfordern
-- GET /v1/convai/conversation/get-signed-url?agent_id=... → { signed_url: "wss://..." }
local hc = http.new()
hc:set_timeout(10000)
local res, err = hc:request_uri(ELEVEN .. "/convai/conversation/get-signed-url?agent_id=" .. agent_id, {
  method  = "GET",
  headers = {
    ["xi-api-key"] = elabs_key,
  },
})

if not res then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "elevenlabs_unreachable", message = err or "timeout" }))
  return
end

if res.status ~= 200 then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "elevenlabs_error", status = res.status,
    message = "ElevenLabs " .. res.status, body = res.body }))
  return
end

local ok, data = pcall(cjson.decode, res.body or "")
if not ok or type(data) ~= "table" or not data.signed_url then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_response"}')
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode({ signed_url = data.signed_url, agent_id = agent_id }))
