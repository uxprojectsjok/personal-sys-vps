-- /etc/openresty/lua/soul_paid_read.lua
-- GET /api/soul/paid-read
-- Bearer = pol_access_token. Liefert sys.md für zahlende externe Agenten.
-- Prüft: Token gültig + Amortisierung aktiv für diese Soul.

local cjson     = require("cjson.safe")
local resty_aes = require("resty.aes")
local pol_check = require("pol_token_check")
local lfs_ok, lfs = pcall(require, "lfs")

ngx.header["Content-Type"]  = "text/plain; charset=utf-8"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Method not allowed"}')
  return
end

-- Token extrahieren
local auth = ngx.req.get_headers()["Authorization"] or ""
local token = auth:match("^[Bb]earer%s+(.+)$")

if not token or not token:match("^[0-9a-fA-F]+$") or #token < 32 then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.header["WWW-Authenticate"] = 'Bearer realm="soul-paid"'
  ngx.say('{"error":"Bearer pol_access_token erforderlich"}')
  return
end

local tdata = pol_check.check(token)
if not tdata then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"token_expired_or_invalid","message":"pol_access_token ungültig oder abgelaufen. Neue Zahlung erforderlich."}')
  return
end
if not tdata.soul_id then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"token_data_corrupt"}')
  return
end

local soul_id = tdata.soul_id

-- soul_id auf UUID-Format prüfen (Path Traversal verhindern)
local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
if not soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_soul_id"}')
  return
end

-- api_context.json lesen → Amortisierung aktiv?
local SOULS_DIR = "/var/lib/sys/souls/"
local ctx_file  = SOULS_DIR .. soul_id .. "/api_context.json"
local cf = io.open(ctx_file, "r")
if not cf then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Soul nicht gefunden"}')
  return
end
local raw_ctx = cf:read("*a"); cf:close()
local ok_c, ctx = pcall(cjson.decode, raw_ctx)
if not ok_c or type(ctx) ~= "table" then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"api_context corrupt"}')
  return
end

local amort = ctx.amortization
if type(amort) == "table" and amort.private == true then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"soul_private","message":"Diese Soul ist nicht öffentlich zugänglich."}')
  return
end
if type(amort) ~= "table" or amort.enabled ~= true then
  ngx.status = 402
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"payment_not_required","message":"Diese Soul ist im Frei-Modus — normaler MCP-OAuth-Zugang genügt."}')
  return
end

-- sys.md lesen
local soul_file = SOULS_DIR .. soul_id .. "/sys.md"
local sf = io.open(soul_file, "r")
if not sf then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"sys.md nicht gefunden"}')
  return
end
local content = sf:read("*a"); sf:close()

-- Verschlüsselte sys.md on-the-fly entschlüsseln (Magic: "SYS\x01")
if content:sub(1, 4) == "SYS\x01" then
  local vault_key_hex = ctx.vault_key_hex or ""
  if vault_key_hex == "" then
    ngx.status = 403
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"vault_key_missing","message":"Vault-Schlüssel nicht verfügbar — Soul muss einmal entsperrt werden."}')
    return
  end

  local function hex_to_bin(hex)
    return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
  end

  local iv         = content:sub(5, 20)
  local ciphertext = content:sub(21)
  local key        = hex_to_bin(vault_key_hex)
  local aes_ctx    = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })

  if not aes_ctx then
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"decrypt_init_failed"}')
    return
  end

  local decrypted = aes_ctx:decrypt(ciphertext)
  if not decrypted then
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"decrypt_failed","message":"Entschlüsselung fehlgeschlagen."}')
    return
  end

  content = decrypted
end

-- ── Deliver Agent Sandbox block ──────────────────────────────────────────────
-- Security rule: never send the full sys.md to paid agents.
-- Only the explicitly marked <!-- AGENT:START --> … <!-- AGENT:END --> block leaves the server.
local AGENT_START = "<!-- AGENT:START -->"
local AGENT_END   = "<!-- AGENT:END -->"
local s = content:find(AGENT_START, 1, true)
local e = content:find(AGENT_END,   1, true)

if not s or not e or e <= s then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"no_agent_content","message":"No Agent Sandbox block defined. Add <!-- AGENT:START --> ... <!-- AGENT:END --> to sys.md."}')
  return
end

local block_content = content:sub(s + #AGENT_START, e - 1):match("^%s*(.-)%s*$")
if not block_content or #block_content == 0 then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"agent_content_empty","message":"Agent Sandbox block is empty."}')
  return
end

-- ── Stage-based message filtering ────────────────────────────────────────────
local stage = tonumber(ngx.req.get_uri_args().stage) or 1
if stage ~= 2 then stage = 1 end
local DAY = 86400

local function parse_iso(ts)
  local y, mo, d, h, mi, sec = ts:match("(%d%d%d%d)-(%d%d)-(%d%d)T(%d%d):(%d%d):(%d%d)")
  if not y then return 0 end
  return os.time({ year=tonumber(y), month=tonumber(mo), day=tonumber(d),
                   hour=tonumber(h), min=tonumber(mi), sec=tonumber(sec), isdst=false })
end

-- Parse <!-- @msg TS FROM TO CONTENT --> single-line entries
local messages = {}
for ts, from, to, msg_content in block_content:gmatch(
    "<!%-%-@msg%s+([^%s]+)%s+([^%s]+)%s+([^%s]+)%s+(.-)%s*%-%->") do
  table.insert(messages, { ts=ts, from=from, to=to, content=msg_content, epoch=parse_iso(ts) })
end

if #messages == 0 then
  -- Legacy static content: return as-is
  ngx.header["Content-Type"] = "text/plain; charset=utf-8"
  ngx.say(block_content)
  return
end

-- Filter by stage
local now = ngx.time()
local filtered = {}
if stage == 1 then
  for _, m in ipairs(messages) do
    if (now - m.epoch) < DAY then table.insert(filtered, m) end
  end
else
  -- stage 2: last 48h; 24–48h range sampled every other
  local recent, older = {}, {}
  for _, m in ipairs(messages) do
    local age = now - m.epoch
    if age < DAY then
      table.insert(recent, m)
    elseif age < 2 * DAY then
      table.insert(older, m)
    end
  end
  for i, m in ipairs(older) do
    if i % 2 == 1 then table.insert(filtered, m) end
  end
  for _, m in ipairs(recent) do table.insert(filtered, m) end
end

if #filtered == 0 then ngx.status = 204; return end

-- Format output
local lines = {}
for _, m in ipairs(filtered) do
  local from_label = m.from == "me" and "You" or m.from:sub(1, 8)
  local to_label   = m.to == "peer" and "@peers" or m.to == "agent" and "@agents" or "@community"
  local date_str   = m.ts:sub(1, 10) .. " " .. m.ts:sub(12, 16) .. " UTC"
  local hdr        = m.from == "me"
    and ("[" .. date_str .. "] " .. from_label .. " → " .. to_label)
    or  ("[" .. date_str .. "] " .. from_label)
  table.insert(lines, hdr .. "\n" .. m.content)
end

ngx.header["Content-Type"] = "text/plain; charset=utf-8"
ngx.header["X-Msg-Count"]  = tostring(#filtered)
ngx.header["X-Msg-Stage"]  = tostring(stage)
ngx.say(table.concat(lines, "\n\n"))
