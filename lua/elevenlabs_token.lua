-- /etc/openresty/lua/elevenlabs_token.lua
-- POST /api/elevenlabs-token
-- Erstellt ElevenLabs Conversation Token für den Soul-Agenten.
-- Liest elevenlabs_key aus config.json und elevenlabs_agent_id aus sys.md-Frontmatter.

local cjson   = require("cjson.safe")
local http    = require("resty.http")
local soul_id = ngx.ctx.soul_id

local BASE_DIR = "/var/lib/sys/souls/" .. soul_id
local ELEVEN   = "https://api.elevenlabs.io/v1"

local function read_file(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local c = f:read("*a"); f:close()
  return c
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

-- agent_id aus sys.md Frontmatter lesen
local agent_id = nil
local sys_raw  = read_file(BASE_DIR .. "/sys.md")
if sys_raw then
  local m = sys_raw:match("elevenlabs_agent_id:%s*(%S+)")
  if m and m ~= '""' and m ~= "" then agent_id = m end
end

if not agent_id then
  ngx.status = 503
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"elevenlabs_agent_missing","message":"Kein ElevenLabs Agent in sys.md — zuerst @create-agent ausführen"}')
  return
end

-- Conversation Token bei ElevenLabs anfordern
local hc = http.new()
hc:set_timeout(10000)
local res, err = hc:request_uri(ELEVEN .. "/convai/conversations/create-conversation-token", {
  method  = "POST",
  headers = {
    ["Content-Type"] = "application/json",
    ["xi-api-key"]   = elabs_key,
  },
  body = cjson.encode({ agent_id = agent_id }),
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
    message = "ElevenLabs " .. res.status }))
  return
end

local ok, data = pcall(cjson.decode, res.body or "")
if not ok or type(data) ~= "table" or not data.token then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_response"}')
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode({ conversation_token = data.token, agent_id = agent_id }))
