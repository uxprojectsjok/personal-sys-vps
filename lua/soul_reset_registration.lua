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

-- Gate-Soul-Binding: WENN die Gate-Session an eine soul_id gebunden ist, muss
-- sie zu GENAU dieser soul_id gehören. Ohne diesen Check konnte auf einem
-- Multi-Hoster-Node JEDE eingeloggte Soul die soul_admin.json (per-Soul
-- Master-Key + Admin-Token) und api_context.json (Vault-Key, Permissions)
-- JEDER ANDEREN Soul auf demselben Node löschen — der Body-Parameter soul_id
-- wurde bis hierhin gegen nichts geprüft. gate_auth.lua speichert die Bindung
-- bereits unter "gs:<token>" (dieselbe, die vault_auth.lua für den Single-
-- Hoster-Fall nutzt) — hier bisher komplett ignoriert. Nach dem Reset könnte
-- ein Angreifer sich zudem selbst einen Cert für die soul_id ausstellen lassen
-- (soul_cert.lua verlangt ohne api_context.json keinen proof mehr) —
-- praktisch ein Account-Takeover-Weg für eine fremde Soul.
--
-- KEINE Bindung (bound == nil) ist der legitime, unveränderte Ursprungsfall:
-- gate_auth.lua setzt "gs:<token>" bewusst NICHT beim Invite-Token-Login
-- (Neuzugang/Import auf einem Multi-Hoster-Node, noch keine lokale Soul
-- gebunden — siehe dortiger Kommentar "kein gs:-Eintrag, Neuzugang kann Soul
-- registrieren"). Genau dieser Pfad ist index.vue's "Login with Soul" ->
-- invalid_proof -> Recovery-Button-Flow (handleResetRegistration), den es
-- weiterhin geben muss. Nur ein VORHANDENER, aber ABWEICHENDER Bindungswert
-- ist der eigentliche Missbrauchsfall und wird abgelehnt.
if sessions then
  local bound = sessions:get("gs:" .. gate_token)
  if bound and bound ~= soul_id then
    ngx.status = 403
    ngx.say('{"error":"soul_mismatch","message":"Die Gate-Session gehört nicht zu dieser soul_id."}')
    return
  end
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
