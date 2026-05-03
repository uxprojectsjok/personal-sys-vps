-- /etc/openresty/lua/vault_delete.lua
-- DELETE /api/vault  → Löscht den kompletten Soul-Ordner + gibt Node frei
--
-- Auth: soul-cert only (via soul_auth.lua access phase)
-- Unwiderruflich: alle Dateien unter /var/lib/sys/souls/{soul_id}/ werden gelöscht
-- und node_soul_id / admin_token werden aus master.json entfernt (Node ist danach frei)

local cjson    = require("cjson.safe")
local cfg      = require("config_reader")
local soul_id  = ngx.ctx.soul_id

local MASTER_PATH_GLOBAL = "/var/lib/sys/config/master.json"

local function get_master_path()
  if type(cfg.get_master_path) == "function" then return cfg.get_master_path() end
  return MASTER_PATH_GLOBAL
end

local function clear_node_lock()
  local paths = { get_master_path() }
  if paths[1] ~= MASTER_PATH_GLOBAL then
    paths[#paths + 1] = MASTER_PATH_GLOBAL
  end
  for _, path in ipairs(paths) do
    local f = io.open(path, "r")
    if f then
      local raw = f:read("*a"); f:close()
      local ok, data = pcall(cjson.decode, raw or "")
      if ok and type(data) == "table" then
        data.node_soul_id = nil
        data.admin_token  = nil
        local wf = io.open(path, "w")
        if wf then wf:write(cjson.encode(data)); wf:close() end
      end
    end
  end
  if type(cfg.invalidate_master_cache) == "function" then
    cfg.invalidate_master_cache()
  end
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "DELETE" then
  ngx.status = 405
  ngx.say(cjson.encode({ error = "Method not allowed. Use DELETE." }))
  return
end

local soul_dir = "/var/lib/sys/souls/" .. soul_id

-- Whitelist: soul_id nur alphanumerisch + Bindestrich, max. 64 Zeichen
-- Blacklist-Ansatz (früherer Code) erlaubte ;|&$ → Shell-Injection möglich
if not soul_id or not soul_id:match("^[a-zA-Z0-9%-]+$") or #soul_id > 64 then
  ngx.status = 403
  ngx.say(cjson.encode({ error = "Invalid soul identity" }))
  return
end

-- Ordner existiert nicht → bereits gelöscht, idempotent OK
local f = io.open(soul_dir, "r")
if not f then
  ngx.say(cjson.encode({ ok = true, deleted = soul_id }))
  return
end
io.close(f)

-- Vault-Session invalidieren
local sessions = ngx.shared.vault_sessions
if sessions then
  sessions:delete(soul_id)
end

-- Löschen
local ret = os.execute("rm -rf " .. soul_dir)
if ret ~= 0 and ret ~= true then
  ngx.status = 500
  ngx.say(cjson.encode({ error = "Delete failed" }))
  return
end

-- Node-Lock aufheben: node_soul_id + admin_token aus master.json entfernen
clear_node_lock()

-- Gate-Sessions leeren (shared dict)
local gate_sessions = ngx.shared.gate_sessions
if gate_sessions then gate_sessions:flush_all() end

ngx.log(ngx.WARN, "[vault_delete] Soul-Daten gelöscht + Node freigegeben: soul_id=", soul_id)
ngx.say(cjson.encode({ ok = true, deleted = soul_id, node_reset = true }))
