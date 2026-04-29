-- /etc/openresty/lua/set_config.lua
-- POST /api/set-config
-- Auth: soul_cert (via soul_auth.lua access phase → ngx.ctx.soul_id)
-- Body: { "anthropic_key": "sk-ant-...", "model": "claude-sonnet-4-6" }
-- Schreibt /var/lib/sys/souls/{soul_id}/config.json (merge, kein Ersetzen)
-- Leere anthropic_key → eigenen Key entfernen (zurück auf Master-Key)

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"unauthorized"}')
  return
end

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

ngx.req.read_body()
local raw = ngx.req.get_body_data()
local ok, body = pcall(cjson.decode, raw or "")
if not ok or type(body) ~= "table" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_json"}')
  return
end

-- ── Validierung ────────────────────────────────────────────────────────────────
local anthropic_key = body.anthropic_key
local model         = body.model

if anthropic_key ~= nil then
  if type(anthropic_key) ~= "string" then
    ngx.status = 400
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"invalid_anthropic_key"}')
    return
  end
  -- Leer = Entfernen erlaubt; nicht leer = muss sk-ant- beginnen
  if anthropic_key ~= "" and anthropic_key:sub(1, 7) ~= "sk-ant-" then
    ngx.status = 400
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"invalid_anthropic_key","message":"Key muss mit sk-ant- beginnen oder leer sein (zum Entfernen)"}')
    return
  end
end

local ALLOWED_MODELS = {
  ["claude-opus-4-6"]          = true,
  ["claude-sonnet-4-6"]        = true,
  ["claude-haiku-4-5-20251001"] = true,
  ["claude-sonnet-4-5"]        = true,
}

if model ~= nil and type(model) ~= "string" then model = nil end
if model ~= nil and not ALLOWED_MODELS[model] then model = nil end

-- ── Bestehende config.json lesen (merge) ──────────────────────────────────────
local config_path = "/var/lib/sys/souls/" .. soul_id .. "/config.json"
local existing = {}
local ef = io.open(config_path, "r")
if ef then
  local er = ef:read("*a"); ef:close()
  local eok, edata = pcall(cjson.decode, er)
  if eok and type(edata) == "table" then existing = edata end
end

-- ── Felder aktualisieren ───────────────────────────────────────────────────────
if anthropic_key ~= nil then
  if anthropic_key == "" then
    existing.anthropic_key = nil  -- cjson encodiert nil als Weglassen
  else
    existing.anthropic_key = anthropic_key
  end
end
if model ~= nil then
  existing.model = model
end

-- ── Schreiben ──────────────────────────────────────────────────────────────────
os.execute("mkdir -p /var/lib/sys/souls/" .. soul_id)
local wf, werr = io.open(config_path, "w")
if not wf then
  ngx.log(ngx.ERR, "[set_config] Schreibfehler: ", werr)
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"write_failed"}')
  return
end

local encoded = cjson.encode(existing)
wf:write(encoded); wf:close()
os.execute("chmod 600 " .. config_path)

-- ── Antwort ────────────────────────────────────────────────────────────────────
ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode({
  ok            = true,
  has_own_key   = (anthropic_key ~= nil and anthropic_key ~= "") or
                  (existing.anthropic_key ~= nil and existing.anthropic_key ~= ""),
  model         = existing.model or cjson.null,
}))
