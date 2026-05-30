-- /etc/openresty/lua/get_config.lua
-- GET /api/get-config
-- Auth: soul_cert (via soul_auth.lua access phase)
-- Gibt Konfigurationsstatus zurück — KEIN Key-Klartext, nur Masken & Flags.

local cjson   = require("cjson.safe")
local cfg     = require("config_reader")
local soul_id = ngx.ctx.soul_id

if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"unauthorized"}')
  return
end

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

-- ── Soul-eigene config.json lesen ──────────────────────────────────────────────
local config_path = "/var/lib/sys/souls/" .. soul_id .. "/config.json"
local soul_cfg = {}
local cf = io.open(config_path, "r")
if cf then
  local raw = cf:read("*a"); cf:close()
  local ok, data = pcall(cjson.decode, raw)
  if ok and type(data) == "table" then soul_cfg = data end
end

local has_own_key = type(soul_cfg.anthropic_key) == "string"
                    and soul_cfg.anthropic_key:sub(1, 7) == "sk-ant-"

local key_preview = ""
if has_own_key then
  local k = soul_cfg.anthropic_key
  key_preview = k:sub(1, 12) .. "..." .. k:sub(-4)
end

local has_wavespeed = type(soul_cfg.wavespeed_key) == "string" and soul_cfg.wavespeed_key ~= ""
local wavespeed_preview = ""
if has_wavespeed then
  local k = soul_cfg.wavespeed_key
  wavespeed_preview = k:sub(1, 6) .. "..." .. k:sub(-4)
end

local has_elevenlabs = type(soul_cfg.elevenlabs_key) == "string" and soul_cfg.elevenlabs_key ~= ""
local elevenlabs_preview = ""
if has_elevenlabs then
  local k = soul_cfg.elevenlabs_key
  elevenlabs_preview = k:sub(1, 6) .. "..." .. k:sub(-4)
end

local has_brave = type(soul_cfg.brave_key) == "string" and soul_cfg.brave_key ~= ""
local brave_preview = ""
if has_brave then
  local k = soul_cfg.brave_key
  brave_preview = k:sub(1, 6) .. "..." .. k:sub(-4)
end

local has_mcp = type(soul_cfg.mcp_url) == "string" and soul_cfg.mcp_url ~= ""
local mcp_preview = ""
if has_mcp then
  local u = soul_cfg.mcp_url
  mcp_preview = u:sub(1, 28) .. "…"
end

local has_reown = type(soul_cfg.reown_project_id) == "string" and soul_cfg.reown_project_id ~= ""
local reown_preview = ""
if has_reown then
  local k = soul_cfg.reown_project_id
  reown_preview = k:sub(1, 8) .. "..." .. k:sub(-4)
end

-- ── Aktiver Key-Status (welche Ebene wird genutzt?) ───────────────────────────
local key_source = "env"
if has_own_key then
  key_source = "soul"
else
  local m_key = cfg.get_anthropic_key(nil)  -- nur master + env
  if m_key and m_key:sub(1, 7) == "sk-ant-" then
    -- Master.json oder Env?
    local f = io.open("/var/lib/sys/config/master.json", "r")
    if f then
      local raw = f:read("*a"); f:close()
      local ok, m = pcall(cjson.decode, raw)
      if ok and type(m) == "table" and type(m.anthropic_key) == "string"
         and m.anthropic_key:sub(1, 7) == "sk-ant-" then
        key_source = "master"
      end
    end
  elseif m_key == "" then
    key_source = "none"
  end
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode({
  has_own_key          = has_own_key,
  key_preview          = key_preview,
  key_source           = key_source,
  wavespeed_key_set    = has_wavespeed,
  wavespeed_preview    = wavespeed_preview,
  elevenlabs_key_set   = has_elevenlabs,
  elevenlabs_preview   = elevenlabs_preview,
  brave_key_set          = has_brave,
  brave_preview          = brave_preview,
  elevenlabs_agent_url   = soul_cfg.elevenlabs_agent_url or cjson.null,
  model                  = soul_cfg.model or cjson.null,
  mcp_url_set            = has_mcp,
  mcp_preview            = mcp_preview,
  reown_project_id_set   = has_reown,
  reown_preview          = reown_preview,
}))
