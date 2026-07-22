-- GET  /api/agent/queue  → { content: "..." }
-- PUT  /api/agent/queue  → { content: "..." }  →  { ok: true }

local cjson = require("cjson.safe")

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.say('{"error":"unauthorized"}')
  return
end

local QUEUE_PATH = "/var/lib/sys/souls/" .. soul_id .. "/vault/context/agent.md"

ngx.header["Content-Type"] = "application/json"

-- ── Verschlüsselung (vault_auth.lua setzt ngx.ctx.vault_key; cipher_mode wird
-- eigenständig aus api_context.json gelesen, wie an anderen Stellen auch) ──
local MAGIC = "SYS\x01"
local function hex_to_bin(hex)
  return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
end

local function decrypt_content(data, vault_key_hex)
  if not data or data == "" then return data end
  if data:sub(1, 4) ~= MAGIC then return data end
  if not vault_key_hex or #vault_key_hex ~= 64 then return nil end
  local resty_aes  = require("resty.aes")
  local iv         = data:sub(5, 20)
  local ciphertext = data:sub(21)
  local key        = hex_to_bin(vault_key_hex)
  local aes_ctx    = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return nil end
  return aes_ctx:decrypt(ciphertext)
end

local function encrypt_content(plaintext, vault_key_hex)
  if not vault_key_hex or #vault_key_hex ~= 64 then return nil end
  local resty_aes    = require("resty.aes")
  local resty_random = require("resty.random")
  local iv = resty_random.bytes(16, true)
  if not iv then return nil end
  local key = hex_to_bin(vault_key_hex)
  local aes_ctx = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return nil end
  local ciphertext = aes_ctx:encrypt(plaintext)
  if not ciphertext then return nil end
  return MAGIC .. iv .. ciphertext
end

local function load_cipher_mode()
  local cf = io.open("/var/lib/sys/souls/" .. soul_id .. "/api_context.json", "r")
  if not cf then return "ciphered" end
  local raw = cf:read("*a"); cf:close()
  local ok, ctx = pcall(cjson.decode, raw)
  if not ok or type(ctx) ~= "table" then return "ciphered" end
  return ctx.cipher_mode or "ciphered"
end

-- Format matches soul-mcp/prompts/index.mjs's documented agent.md structure exactly —
-- previously this template used a different "## Pending" / "## Done" shape the agent
-- runner (shared/sys-agent-run.sh) never actually looked for, so every freshly created
-- soul got an agent.md the runner's own prompt described as having different sections.
local DEFAULT_TEMPLATE = [[# SYS Agent Tasks
<!-- Tasks are added here by Claude AI via MCP (context_write). -->
<!-- Format: see soul-mcp/prompts/index.mjs "Agent Tasks (agent.md)" -->

## Standing Tasks (always active)
*(empty)*

## Open Tasks
*(empty)*

## Completed Tasks
*(empty)*
]]

local vault_key   = ngx.ctx.vault_key
local cipher_mode = load_cipher_mode()

local function write_queue(plaintext)
  local to_write = plaintext
  if cipher_mode == "ciphered" then
    local encrypted = encrypt_content(plaintext, vault_key)
    if encrypted then to_write = encrypted end
  end
  os.execute("mkdir -p /var/lib/sys/souls/" .. soul_id .. "/vault/context")
  local wf = io.open(QUEUE_PATH, "wb")
  if wf then wf:write(to_write); wf:close() end
  return wf ~= nil
end

-- ── GET ───────────────────────────────────────────────────────────────────────
if ngx.req.get_method() == "GET" then
  local f = io.open(QUEUE_PATH, "rb")
  if not f then
    -- Datei nicht vorhanden → mit Template anlegen
    write_queue(DEFAULT_TEMPLATE)
    os.execute("chmod 660 " .. QUEUE_PATH .. " && chown www-data:www-data " .. QUEUE_PATH)
    ngx.say(cjson.encode({ content = DEFAULT_TEMPLATE }))
    return
  end
  local raw = f:read("*a"); f:close()
  local content = decrypt_content(raw, vault_key)
  if content == nil then
    ngx.status = 403
    ngx.say(cjson.encode({ error = "agent.md ist verschlüsselt – Vault entsperren." }))
    return
  end
  -- Leerdatei nachträglich mit Template befüllen
  if content:match("^%s*$") then
    write_queue(DEFAULT_TEMPLATE)
    content = DEFAULT_TEMPLATE
  end
  ngx.say(cjson.encode({ content = content }))
  return
end

-- ── PUT ───────────────────────────────────────────────────────────────────────
if ngx.req.get_method() == "PUT" then
  ngx.req.read_body()
  local body = cjson.decode(ngx.req.get_body_data() or "{}") or {}
  local content = body.content or ""

  if not write_queue(content) then
    ngx.status = 500
    ngx.say('{"error":"write failed"}')
    return
  end
  os.execute("chmod 640 " .. QUEUE_PATH)
  ngx.say('{"ok":true}')
  return
end

ngx.status = 405
ngx.say('{"error":"method not allowed"}')
