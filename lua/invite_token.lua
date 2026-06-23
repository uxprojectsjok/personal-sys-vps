-- /etc/openresty/lua/invite_token.lua
-- GET  /api/invite-token → gibt aktuellen Invite-Token zurück (Auth erforderlich)
-- POST /api/invite-token → rotiert Invite-Token manuell (Auth erforderlich)
-- Nur im Multi-Hoster-Modus verfügbar.

local cjson = require("cjson.safe")
local cfg   = require("config_reader")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

-- vault_auth.lua hat bereits soul_id geprüft
local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401; ngx.say('{"error":"unauthorized"}'); return
end

local MASTER_PATH_GLOBAL = "/var/lib/sys/config/master.json"

local function get_master_path()
  return (type(cfg.get_master_path) == "function") and cfg.get_master_path() or MASTER_PATH_GLOBAL
end

local function read_master_fresh()
  local path = get_master_path()
  local f = io.open(path, "r")
  if not f and path ~= MASTER_PATH_GLOBAL then f = io.open(MASTER_PATH_GLOBAL, "r") end
  if not f then return nil end
  local raw = f:read("*a"); f:close()
  local ok, d = pcall(cjson.decode, raw)
  return (ok and type(d) == "table") and d or nil
end

local master = read_master_fresh()
if not master then
  ngx.status = 503; ngx.say('{"error":"config_unavailable"}'); return
end
if master.multi_hoster ~= true then
  ngx.status = 403; ngx.say('{"error":"single_hoster","message":"Invite-Tokens nur im Multi-Hoster-Modus."}'); return
end

local method = ngx.req.get_method()

if method == "GET" then
  local tok = type(master.invite_token) == "string" and master.invite_token or ""
  ngx.status = 200
  ngx.say(cjson.encode({ invite_token = tok }))

elseif method == "POST" then
  -- Neuen Token generieren
  local rnd = io.open("/dev/urandom", "rb")
  if not rnd then ngx.status = 500; ngx.say('{"error":"entropy"}'); return end
  local bytes = rnd:read(16); rnd:close()
  if not bytes or #bytes < 16 then ngx.status = 500; ngx.say('{"error":"entropy_read"}'); return end
  local new_tok = "inv_"
  for i = 1, 16 do new_tok = new_tok .. string.format("%02x", bytes:byte(i)) end

  -- Domain-spezifische master.json aktualisieren
  master.invite_token = new_tok
  local mpath = get_master_path()
  local wf = io.open(mpath, "w")
  if wf then
    wf:write(cjson.encode(master)); wf:close()
    os.execute("chmod 600 " .. mpath)
    os.execute("chown www-data:www-data " .. mpath .. " 2>/dev/null || true")
    cfg.invalidate_master_cache()
  end
  -- Globale master.json synchronisieren
  if mpath ~= MASTER_PATH_GLOBAL then
    local gf_r = io.open(MASTER_PATH_GLOBAL, "r")
    local gdata = {}
    if gf_r then
      local gr = gf_r:read("*a"); gf_r:close()
      local ok2, d2 = pcall(cjson.decode, gr)
      if ok2 and type(d2) == "table" then gdata = d2 end
    end
    gdata.invite_token = new_tok
    local gf = io.open(MASTER_PATH_GLOBAL, "w")
    if gf then
      gf:write(cjson.encode(gdata)); gf:close()
      os.execute("chmod 600 " .. MASTER_PATH_GLOBAL)
      os.execute("chown www-data:www-data " .. MASTER_PATH_GLOBAL .. " 2>/dev/null || true")
    end
  end

  ngx.status = 200
  ngx.say(cjson.encode({ invite_token = new_tok }))
else
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}')
end
