-- /etc/openresty/lua/soul_longmem_status.lua
-- GET /api/soul/longmem-status — LONGMEM-Status der Soul zurückgeben
-- Auth: soul_auth.lua (soul_cert)

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unauthorized"}')
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local base_dir = "/var/lib/sys/souls/" .. soul_id

-- Bootstrap-Flag prüfen
local bootstrap_pending = false
local bf = io.open(base_dir .. "/.longmem_bootstrap_pending", "r")
if bf then bf:close(); bootstrap_pending = true end

-- sys.md lesen
local sf = io.open(base_dir .. "/sys.md", "rb")
if not sf then
  ngx.say(cjson.encode({ facts = 0, updated = "", bootstrap_pending = bootstrap_pending,
    size_bytes = 0, log_entries = 0, days_since_cleanup = 0 }))
  return
end
local raw = sf:read("*a"); sf:close()
local size_bytes = #raw

-- Entschlüsseln falls nötig
local MAGIC = "\x53\x59\x53\x01"
local soul_text = raw
if raw:sub(1, 4) == MAGIC then
  local cf = io.open(base_dir .. "/api_context.json", "r")
  if cf then
    local ctx_raw = cf:read("*a"); cf:close()
    local ok, ctx = pcall(cjson.decode, ctx_raw)
    if ok and type(ctx) == "table" and ctx.vault_key_hex and #ctx.vault_key_hex == 64 then
      local resty_aes = require("resty.aes")
      local key = ctx.vault_key_hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end)
      local iv  = raw:sub(5, 20)
      local enc = raw:sub(21)
      local aes_ctx = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
      if aes_ctx then
        local dec = aes_ctx:decrypt(enc)
        if dec then soul_text = dec end
      end
    end
  end
end

-- LONGMEM-Block parsen
local lm_content = soul_text:match("<!%-%- SYS:LONGMEM:START %-%->%s*(.-)\n?<!%-%- SYS:LONGMEM:END %-%->")
local facts_count = 0
local updated     = ""

if lm_content then
  local ok, lm = pcall(cjson.decode, lm_content:match("{.*}") or "")
  if ok and type(lm) == "table" then
    if type(lm.facts) == "table" then facts_count = #lm.facts end
    if type(lm.updated) == "string" then updated = lm.updated end
  end
end

-- Session-Log Einträge zählen (Chaos-Indikator)
local log_entries = 0
local in_log = false
for line in soul_text:gmatch("[^\n]+") do
  if line:match("^## Session%-Log") then
    in_log = true
  elseif in_log and line:match("^## ") then
    in_log = false
  elseif in_log and line:match("^%- ") then
    log_entries = log_entries + 1
  end
end

-- Tage seit letztem Aufräumen
local days_since_cleanup = 0
if updated ~= "" then
  local uy, um, ud = updated:match("(%d%d%d%d)-(%d%d)-(%d%d)")
  if uy then
    local then_ts = os.time({ year = tonumber(uy), month = tonumber(um), day = tonumber(ud), hour = 0, min = 0, sec = 0 })
    days_since_cleanup = math.floor((os.time() - then_ts) / 86400)
  end
end

ngx.say(cjson.encode({
  facts              = facts_count,
  updated            = updated,
  bootstrap_pending  = bootstrap_pending,
  size_bytes         = size_bytes,
  log_entries        = log_entries,
  days_since_cleanup = days_since_cleanup,
}))
