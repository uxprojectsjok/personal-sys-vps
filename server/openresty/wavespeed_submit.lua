-- /etc/openresty/lua/wavespeed_submit.lua
-- POST /api/wavespeed-submit
-- Reicht einen Generierungs-Auftrag bei WaveSpeed AI ein.
-- Modelle:
--   text-to-image  → google/nano-banana/text-to-image
--   edit-multi     → google/nano-banana-pro/edit-multi
--   image-to-video → kwaivgi/kling-v3.0-pro/image-to-video
-- Gibt { taskId, model } zurück – Client pollt /api/wavespeed-result.

local cjson = require("cjson.safe")
local http  = require("resty.http")

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

local api_key = os.getenv("WAVESPEED_KEY") or ""
if api_key == "" then
  ngx.status = 503
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"service_unavailable","message":"WAVESPEED_KEY nicht konfiguriert"}')
  return
end

ngx.req.read_body()
local raw = ngx.req.get_body_data()
if not raw or #raw == 0 then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"empty_body"}')
  return
end

local ok, body = pcall(cjson.decode, raw)
if not ok or type(body) ~= "table" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_json"}')
  return
end

local output_mode  = body.outputMode or "text-to-image"
local prompt       = body.prompt or "cinematic artistic reinterpretation, high quality"
local image_base64 = body.imageBase64  -- optional, für edit-multi und image-to-video

local MODELS = {
  ["text-to-image"]  = "google/nano-banana/text-to-image",
  ["edit-multi"]     = "google/nano-banana-pro/edit-multi",
  ["image-to-video"] = "kwaivgi/kling-v3.0-pro/image-to-video",
}

local model_path = MODELS[output_mode] or MODELS["text-to-image"]
local endpoint   = "https://api.wavespeed.ai/api/v3/" .. model_path

local payload_table

if output_mode == "image-to-video" then
  if not image_base64 or image_base64 == "" then
    ngx.status = 400
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"imageBase64_required_for_video"}')
    return
  end
  payload_table = {
    prompt          = prompt,
    image           = "data:image/jpeg;base64," .. image_base64,
    duration        = 5,
    cfg_scale       = 0.5,
    negative_prompt = "blurry, shaky, low quality, distorted",
  }

elseif output_mode == "edit-multi" then
  if not image_base64 or image_base64 == "" then
    ngx.status = 400
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"imageBase64_required_for_edit"}')
    return
  end
  payload_table = {
    prompt        = prompt,
    images        = { "data:image/jpeg;base64," .. image_base64 },
    num_images    = 2,
    output_format = "jpeg",
    aspect_ratio  = "4:3",
  }

else
  -- text-to-image
  payload_table = {
    prompt        = prompt,
    output_format = "jpeg",
    aspect_ratio  = "1:1",
  }
end

local ok2, payload = pcall(cjson.encode, payload_table)
if not ok2 then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"encode_failed"}')
  return
end

local httpc = http.new()
httpc:set_timeout(20000)

local res, err = httpc:request_uri(endpoint, {
  method     = "POST",
  ssl_verify = true,
  headers    = {
    ["Content-Type"]  = "application/json",
    ["Authorization"] = "Bearer " .. api_key,
  },
  body = payload,
})

if not res then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  local msg = (err or "connection failed"):gsub('"', '\\"')
  ngx.say('{"error":"upstream_error","message":"' .. msg .. '"}')
  return
end

if res.status ~= 200 then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  local detail = (res.body or ""):sub(1, 200):gsub('["%\\]', function(c)
    return c == '"' and '\\"' or '\\\\'
  end)
  ngx.say('{"error":"wavespeed_error","status":' .. res.status .. ',"detail":"' .. detail .. '"}')
  return
end

local ok3, response = pcall(cjson.decode, res.body)
if not ok3 or type(response) ~= "table" then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"parse_error"}')
  return
end

local task_id = (response.data and response.data.id) or response.id
if not task_id then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  local raw_excerpt = (res.body or ""):sub(1, 100):gsub('"', '\\"')
  ngx.say('{"error":"no_task_id","raw":"' .. raw_excerpt .. '"}')
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say('{"taskId":"' .. tostring(task_id) .. '","model":"' .. model_path .. '"}')
