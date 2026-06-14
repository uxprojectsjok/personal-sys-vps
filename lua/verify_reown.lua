-- /etc/openresty/lua/verify_reown.lua
-- GET /api/verify/reown  — vt-Auth (kein soul_cert nötig)
-- Gibt reown_project_id zurück damit verify.vue AppKit initialisieren kann.

local cjson      = require("cjson.safe")
local VERIFY_DIR = "/var/lib/sys/verify/"

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

-- vt aus Authorization-Header lesen (Bearer vt:<hex>)
local auth = ngx.req.get_headers()["authorization"] or ""
local vt = auth:match("^[Bb]earer%s+vt:([a-f0-9]+)$")
if not vt or #vt ~= 48 then
  ngx.status = 401; ngx.say('{"error":"invalid_vt"}'); return
end

-- soul_id aus vt-Cache oder Datei
local soul_id
local vc = ngx.shared.verify_cache
if vc then soul_id = vc:get("vt:" .. vt) end
if not soul_id then
  local f = io.open(VERIFY_DIR .. "vt_" .. vt, "r")
  if f then soul_id = f:read("*a"); f:close() end
end

if not soul_id or soul_id == "" then
  ngx.status = 401; ngx.say('{"error":"vt_expired"}'); return
end

soul_id = soul_id:gsub("%s+", "")

-- Soul-Config laden
local config_path = "/var/lib/sys/souls/" .. soul_id .. "/config.json"
local cf = io.open(config_path, "r")
if not cf then
  ngx.say(cjson.encode({ project_id = cjson.null })); return
end
local raw = cf:read("*a"); cf:close()
local ok, cfg = pcall(cjson.decode, raw)
if not ok or type(cfg) ~= "table" then
  ngx.say(cjson.encode({ project_id = cjson.null })); return
end

local pid = type(cfg.reown_project_id) == "string" and cfg.reown_project_id ~= "" and cfg.reown_project_id or nil
ngx.say(cjson.encode({ project_id = pid or cjson.null }))
