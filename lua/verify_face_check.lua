-- /etc/openresty/lua/verify_face_check.lua
-- POST /api/verify/face-check  (soul_cert auth)
-- Vergleicht Live-Kamerabild mit vault/images/profile.png via Claude Vision.
-- Body: { image_base64: "<base64 ohne data-URI-Prefix>", mime: "image/jpeg" }
-- Returns: { match: bool, confidence: "high|medium|low", message: string }

local cjson  = require("cjson.safe")
local http   = require("resty.http")
local cfg    = require("config_reader")
local resty_aes = require("resty.aes")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local soul_id   = ngx.ctx.soul_id
local vault_key = ngx.ctx.vault_key or ""
local api_key   = cfg.get_anthropic_key(soul_id)

if api_key == "" then
  ngx.status = 503; ngx.say('{"error":"anthropic_key_missing"}'); return
end

-- Body lesen
ngx.req.read_body()
local body_raw = ngx.req.get_body_data()
if not body_raw then
  local tmp = ngx.req.get_body_file()
  if tmp then local fh=io.open(tmp,"r"); if fh then body_raw=fh:read("*a"); fh:close() end end
end
local ok_b, body = pcall(cjson.decode, body_raw or "")
if not ok_b or type(body) ~= "table" or type(body.image_base64) ~= "string" then
  ngx.status = 400; ngx.say('{"error":"invalid_body"}'); return
end

local live_b64 = body.image_base64
local live_mime = (type(body.mime) == "string" and body.mime ~= "") and body.mime or "image/jpeg"
-- Strip data-URI prefix if present
live_b64 = live_b64:gsub("^data:[^;]+;base64,", "")

-- Profil-Bild lesen (vault/images/profile.png)
local VAULT_MAGIC = "SYS\1"
local profile_path = "/var/lib/sys/souls/" .. soul_id .. "/vault/images/profile.png"
local fh = io.open(profile_path, "rb")
if not fh then
  ngx.status = 404; ngx.say('{"error":"profile_image_not_found"}'); return
end
local raw = fh:read("*a"); fh:close()

-- Entschlüsseln falls nötig
if raw:sub(1,4) == VAULT_MAGIC then
  if vault_key == "" then
    ngx.status = 403; ngx.say('{"error":"vault_locked","message":"Vault muss entsperrt sein für Gesichtsverifikation"}'); return
  end
  local function hex2bin(h) return (h:gsub("..", function(c) return string.char(tonumber(c,16)) end)) end
  local iv = raw:sub(5,20); local ct = raw:sub(21)
  local aes, aerr = resty_aes:new(hex2bin(vault_key), nil, resty_aes.cipher(256,"cbc"), {iv=iv})
  if not aes then
    ngx.status = 500; ngx.say('{"error":"decrypt_failed","message":"' .. tostring(aerr) .. '"}'); return
  end
  raw = aes:decrypt(ct)
  if not raw then
    ngx.status = 500; ngx.say('{"error":"decrypt_failed"}'); return
  end
end

local profile_b64 = ngx.encode_base64(raw)

-- Claude Vision Anfrage
local payload_ok, payload = pcall(cjson.encode, {
  model      = "claude-haiku-4-5-20251001",
  max_tokens = 30,
  messages   = {{
    role    = "user",
    content = {
      { type="image", source={ type="base64", media_type="image/png",  data=profile_b64 } },
      { type="image", source={ type="base64", media_type=live_mime,    data=live_b64    } },
      { type="text",  text="Do these two photos show the same person? Reply with exactly one word: MATCH or NO_MATCH." },
    }
  }}
})
if not payload_ok then
  ngx.status = 500; ngx.say('{"error":"encode_failed"}'); return
end

local hc = http.new(); hc:set_timeout(15000)
local res, err = hc:request_uri("https://api.anthropic.com/v1/messages", {
  method  = "POST",
  ssl_verify = true,
  headers = {
    ["Content-Type"]      = "application/json",
    ["x-api-key"]         = api_key,
    ["anthropic-version"] = "2023-06-01",
  },
  body = payload,
})

if not res or res.status ~= 200 then
  ngx.status = 502
  ngx.say('{"error":"claude_error","status":' .. (res and res.status or 0) .. '}')
  return
end

local ok_r, resp = pcall(cjson.decode, res.body)
if not ok_r or type(resp) ~= "table" then
  ngx.status = 502; ngx.say('{"error":"parse_error"}'); return
end

local answer = ""
if type(resp.content) == "table" and type(resp.content[1]) == "table" then
  answer = (resp.content[1].text or ""):upper():match("MATCH") or ""
end

local match = answer == "MATCH"
ngx.say(cjson.encode({
  match      = match,
  confidence = match and "high" or "low",
  message    = match and "Gesicht erkannt." or "Gesicht nicht erkannt.",
}))
