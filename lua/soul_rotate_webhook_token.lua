-- /etc/openresty/lua/soul_rotate_webhook_token.lua
-- POST /api/soul/rotate-webhook-token
-- Auth: soul_auth.lua (Bearer {soul_id}.{cert})
--
-- Generiert neuen webhook_token, aktualisiert api_context.json und
-- authorized_services.json. Patcht optional den ElevenLabs-Agent.

local cjson   = require("cjson.safe")
local http    = require("resty.http")
local soul_id = ngx.ctx.soul_id

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"unauthenticated"}')
  return
end

local BASE_DIR = "/var/lib/sys/souls/" .. soul_id

local function read_file(path)
  local fh = io.open(path, "r")
  if not fh then return nil end
  local s = fh:read("*a"); fh:close()
  return s
end

local function write_file(path, content)
  local fh = io.open(path, "w")
  if not fh then return false end
  fh:write(content); fh:close()
  return true
end

-- ── Neuen Token aus /dev/urandom erzeugen (32 Bytes = 64 hex) ─────────────────
local new_token
do
  local f = io.open("/dev/urandom", "rb")
  if f then
    local raw = f:read(32); f:close()
    local t = {}
    for i = 1, #raw do t[i] = string.format("%02x", raw:byte(i)) end
    new_token = table.concat(t)
  else
    -- Fallback: md5-basiert
    local ts  = tostring(math.floor(ngx.now() * 1000))
    local rnd = tostring(math.random(100000000, 999999999))
    new_token = ngx.md5(soul_id .. ts .. rnd) .. ngx.md5(rnd .. ts .. soul_id)
  end
end

-- ── api_context.json: alten Token merken, neuen speichern ─────────────────────
local ctx_path = BASE_DIR .. "/api_context.json"
local ctx      = {}
local old_token = ""
do
  local raw = read_file(ctx_path)
  if raw then
    local ok, d = pcall(cjson.decode, raw)
    if ok and type(d) == "table" then ctx = d end
  end
  old_token         = ctx.webhook_token or ""
  ctx.webhook_token = new_token
  local ok_e, js = pcall(cjson.encode, ctx)
  if not ok_e then
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"encode_failed"}')
    return
  end
  write_file(ctx_path, js)
end

-- ── authorized_services.json: alten Eintrag entfernen, neuen anlegen ──────────
local svc_path = BASE_DIR .. "/authorized_services.json"
do
  local svc = {}
  local raw = read_file(svc_path)
  if raw then
    local ok, d = pcall(cjson.decode, raw)
    if ok and type(d) == "table" then svc = d end
  end
  -- Alten Token entfernen (exakter Key-Match)
  if old_token ~= "" then svc[old_token] = nil end
  -- Neuen Token registrieren
  svc[new_token] = {
    name        = "ElevenLabs Agent",
    permissions = { soul = true, context_files = true },
    expires_at  = 0,
    created_at  = math.floor(ngx.now()),
  }
  local ok_e, js = pcall(cjson.encode, svc)
  if ok_e and js then write_file(svc_path, js) end
end

-- ── ElevenLabs Agent-Webhooks patchen (best-effort) ───────────────────────────
local agent_patched = false
local agent_err     = nil
do
  local cfg_raw = read_file(BASE_DIR .. "/config.json")
  if cfg_raw then
    local ok_c, cfg = pcall(cjson.decode, cfg_raw)
    if ok_c and type(cfg) == "table" then
      local eleven_key = cfg.elevenlabs_key or ""
      local agent_id   = cfg.elevenlabs_agent_id or ""
      if eleven_key ~= "" and agent_id ~= "" then
        local host     = ngx.var.host or "localhost"
        local base_url = "https://" .. host
        local soul_url   = base_url .. "/api/soul?token="                   .. new_token
        local write_url  = base_url .. "/api/elevenlabs-soul-write?token="  .. new_token
        local search_url = base_url .. "/api/elevenlabs-web-search?token="  .. new_token

        local patch_body_ok, patch_body = pcall(cjson.encode, {
          conversation_config = {
            agent = {
              prompt = {
                tools = {
                  {
                    type        = "webhook",
                    name        = "soul_tool",
                    description = "Laedt aktuelle Soul-Daten. Zu Beginn des Gespraeches aufrufen wenn Kontext benoetigt wird.",
                    api_schema  = { url = soul_url, method = "GET" },
                  },
                  {
                    type        = "webhook",
                    name        = "soul_write",
                    description = "Schreibt eine Sektion in die sys.md. Nach bedeutsamen Aufgaben oder Erkenntnissen: section='Selbstreflexion', mode='append', content='YYYY-MM-DD: [ein Satz]'.",
                    api_schema  = {
                      url    = write_url,
                      method = "POST",
                      request_body_schema = {
                        type       = "object",
                        properties = {
                          section = { type = "string", description = "Sektionsname ohne ##" },
                          content = { type = "string", description = "Inhalt" },
                          mode    = { type = "string", description = "append | replace | prepend" },
                        },
                        required = { "section", "content" },
                      },
                    },
                  },
                  {
                    type        = "webhook",
                    name        = "web_search",
                    description = "Sucht im Web nach aktuellen Informationen.",
                    api_schema  = {
                      url    = search_url,
                      method = "POST",
                      request_body_schema = {
                        type       = "object",
                        properties = { query = { type = "string", description = "Suchanfrage" } },
                        required   = { "query" },
                      },
                    },
                  },
                },
              },
            },
          },
        })

        if patch_body_ok and patch_body then
          local hc = http.new()
          hc:set_timeout(10000)
          local pres, perr = hc:request_uri(
            "https://api.elevenlabs.io/v1/convai/agents/" .. agent_id,
            {
              method     = "PATCH",
              ssl_verify = true,
              headers    = {
                ["Content-Type"] = "application/json",
                ["xi-api-key"]   = eleven_key,
              },
              body = patch_body,
            }
          )
          if pres and pres.status == 200 then
            agent_patched = true
          else
            agent_err = pres and ("HTTP " .. pres.status) or (perr or "timeout")
            ngx.log(ngx.WARN, "[rotate_webhook_token] ElevenLabs patch failed: ", agent_err,
              pres and (" body=" .. (pres.body or ""):sub(1, 200)) or "")
          end
        end
      end
    end
  end
end

-- ── Antwort ────────────────────────────────────────────────────────────────────
ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
local resp = {
  ok            = true,
  token_preview = new_token:sub(1, 8) .. "…",
  agent_patched = agent_patched,
}
if agent_err then resp.agent_err = agent_err end
local ok_r, js_r = pcall(cjson.encode, resp)
ngx.say(ok_r and js_r or '{"ok":true}')
