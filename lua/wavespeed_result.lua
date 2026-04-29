-- /etc/openresty/lua/wavespeed_result.lua
-- GET /api/wavespeed-result?id={taskId}
-- Fragt den Status einer WaveSpeed-Task ab (einmaliger Poll).
-- Gibt { status, url?, error? } zurück.

local cjson = require("cjson.safe")
local http  = require("resty.http")

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

local api_key = os.getenv("WAVESPEED_KEY") or ""
if api_key == "" then
  ngx.status = 503
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"service_unavailable"}')
  return
end

local args    = ngx.req.get_uri_args()
local task_id = args.id

if not task_id or task_id == "" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"id_required"}')
  return
end

-- Einfache ID-Validierung (alphanum + Bindestrich/Unterstrich, max 128 Zeichen)
if not task_id:match("^[a-zA-Z0-9%-_]+$") or #task_id > 128 then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_id"}')
  return
end

local httpc = http.new()
httpc:set_timeout(10000)

local res, err = httpc:request_uri(
  "https://api.wavespeed.ai/api/v3/predictions/" .. task_id .. "/result",
  {
    method     = "GET",
    ssl_verify = true,
    headers    = {
      ["Authorization"] = "Bearer " .. api_key,
    },
  }
)

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
  ngx.say('{"error":"wavespeed_error","status":' .. res.status .. '}')
  return
end

local ok, response = pcall(cjson.decode, res.body)
if not ok or type(response) ~= "table" then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"parse_error"}')
  return
end

local task_data = response.data or response
local status    = tostring(task_data.status or "unknown")
local outputs   = task_data.outputs
local url       = nil
local error_msg = task_data.error

if type(outputs) == "table" and outputs[1] then
  url = outputs[1]
end

local ok2, result = pcall(cjson.encode, {
  status = status,
  url    = url,
  error  = error_msg,
})

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(ok2 and result or '{"status":"unknown"}')
