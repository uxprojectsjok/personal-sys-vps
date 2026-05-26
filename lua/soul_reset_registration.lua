-- /etc/openresty/lua/soul_reset_registration.lua
-- POST /api/soul/reset-registration
-- Auth: sys_gate Cookie (kein soul_cert — das ist der Sinn dieses Endpunkts)
-- Body: { "soul_id": "uuid" }
--
-- Löscht soul_admin.json + api_context.json einer Soul.
-- Ermöglicht Neu-Registrierung ohne SSH wenn der Admin-Token verloren ging
-- oder die sys.md einen veralteten Cert enthält (invalid_proof Deadlock).
-- Vault-Daten, config.json und sys.md bleiben vollständig erhalten.

local cjson = require("cjson.safe")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"method_not_allowed"}')
  return
end

-- ── Gate-Cookie validieren ────────────────────────────────────────────────────
local gate_token = ngx.var.cookie_sys_gate or ""
if gate_token == "" then
  local cookie_hdr = ngx.req.get_headers()["cookie"] or ""
  gate_token = cookie_hdr:match("sys_gate=([a-fA-F0-9]+)") or ""
end

if #gate_token ~= 64 or not gate_token:match("^[a-fA-F0-9]+$") then
  ngx.status = 401
  ngx.say('{"error":"gate_required"}')
  return
end

local sessions = ngx.shared.gate_sessions
if sessions then
  local stored = sessions:get("g:" .. gate_token)
  if not stored then
    ngx.status = 401
    ngx.say('{"error":"gate_required"}')
    return
  end
  local expires_at = tonumber(stored)
  if expires_at and ngx.now() >= expires_at then
    sessions:delete("g:" .. gate_token)
    ngx.status = 401
    ngx.say('{"error":"gate_required"}')
    return
  end
end

-- ── Body parsen ───────────────────────────────────────────────────────────────
ngx.req.read_body()
local raw = ngx.req.get_body_data()
local ok, body = pcall(cjson.decode, raw or "")
if not ok or type(body) ~= "table" then
  ngx.status = 400
  ngx.say('{"error":"invalid_json"}')
  return
end

local soul_id = body.soul_id or ""
local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
if not soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.say('{"error":"invalid_soul_id"}')
  return
end

local base = "/var/lib/sys/souls/" .. soul_id

-- soul_admin.json löschen → per-soul Key entfernt → nächste Registrierung generiert neuen
local sa_path = base .. "/soul_admin.json"
local sa_f = io.open(sa_path, "r")
if sa_f then sa_f:close(); os.remove(sa_path) end

-- api_context.json löschen → proof nicht mehr gefordert bei nächstem soul-cert Aufruf
local ctx_path = base .. "/api_context.json"
local ctx_f = io.open(ctx_path, "r")
if ctx_f then ctx_f:close(); os.remove(ctx_path) end

-- Optional: node_soul_id Lock freigeben (Single-Hoster Import-Flow)
-- Nur wenn clear_lock=true UND master.json.node_soul_id == soul_id
if body.clear_lock == true then
  local cfg      = require("config_reader")
  local mpath    = cfg.get_master_path and cfg.get_master_path() or "/var/lib/sys/config/master.json"
  local mf       = io.open(mpath, "r")
  if mf then
    local mr = mf:read("*a"); mf:close()
    local cjson2 = require("cjson.safe")
    local mok, mdata = pcall(cjson2.decode, mr)
    if mok and type(mdata) == "table" and mdata.node_soul_id == soul_id then
      mdata.node_soul_id = nil
      local wf = io.open(mpath, "w")
      if wf then
        wf:write(cjson2.encode(mdata)); wf:close()
        cfg.invalidate_master_cache()
        ngx.log(ngx.INFO, "[soul_reset_registration] node_soul_id Lock freigegeben")
      end
    end
  end
end

ngx.log(ngx.INFO, "[soul_reset_registration] soul_id=", soul_id, " — Neuregistrierung freigegeben")

ngx.say('{"ok":true}')
