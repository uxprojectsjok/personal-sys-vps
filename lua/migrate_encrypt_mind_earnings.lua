-- migrate_encrypt_mind_earnings.lua
-- One-time migration: encrypts existing plaintext mind.md/earnings.md/income.md
-- for every soul with cipher_mode=ciphered + a vault_key.
-- Idempotent — files already starting with the SYS\x01 magic are skipped.
-- Not wired into any nginx location; run manually:
--   resty lua/migrate_encrypt_mind_earnings.lua

local cjson        = require("cjson.safe")
local resty_aes    = require("resty.aes")
local resty_random = require("resty.random")

local MAGIC     = "SYS\x01"
local SOULS_DIR = "/var/lib/sys/souls/"

local function hex_to_bin(hex)
  return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
end

local function encrypt(plaintext, vault_key_hex)
  local key = hex_to_bin(vault_key_hex)
  local iv  = resty_random.bytes(16, true)
  if not iv then return nil end
  local aes_ctx = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return nil end
  local ciphertext = aes_ctx:encrypt(plaintext)
  if not ciphertext then return nil end
  return MAGIC .. iv .. ciphertext
end

local function encrypt_file_if_plaintext(path, vault_key_hex)
  local f = io.open(path, "rb")
  if not f then return "missing" end
  local content = f:read("*a")
  f:close()
  if content:sub(1, 4) == MAGIC then return "already-encrypted" end
  local encrypted = encrypt(content, vault_key_hex)
  if not encrypted then return "encrypt-failed" end
  local wf = io.open(path, "wb")
  if not wf then return "write-failed" end
  wf:write(encrypted)
  wf:close()
  return "encrypted"
end

local function list_dir(path)
  local out = {}
  local handle = io.popen("ls -- '" .. path:gsub("'", "'\\''") .. "' 2>/dev/null")
  if handle then
    for name in handle:lines() do out[#out + 1] = name end
    handle:close()
  end
  return out
end

local function migrate_soul(soul_id)
  local base_dir = SOULS_DIR .. soul_id
  local cf = io.open(base_dir .. "/api_context.json", "r")
  if not cf then return end
  local raw = cf:read("*a"); cf:close()
  local ok, ctx = pcall(cjson.decode, raw)
  if not ok or type(ctx) ~= "table" then return end

  local vault_key_hex = ctx.vault_key_hex
  local cipher_mode    = ctx.cipher_mode or "ciphered"
  if type(vault_key_hex) ~= "string" or #vault_key_hex ~= 64 or cipher_mode ~= "ciphered" then
    print("  [skip] " .. soul_id:sub(1, 8) .. "… (kein vault_key / cipher_mode=open)")
    return
  end

  local files = {
    "vault/context/mind.md", "vault/context/earnings.md", "vault/context/income.md",
  }
  local results = {}
  for _, rel in ipairs(files) do
    local path = base_dir .. "/" .. rel
    local status = encrypt_file_if_plaintext(path, vault_key_hex)
    if status ~= "missing" then
      results[#results + 1] = rel .. ": " .. status
    end
  end

  print("  " .. soul_id:sub(1, 8) .. "…:")
  for _, r in ipairs(results) do print("    " .. r) end
  if #results == 0 then print("    (keine Dateien gefunden)") end
end

local souls = list_dir(SOULS_DIR)
print("Migriere mind.md/earnings.md/income.md für " .. #souls .. " Soul(s)…")
for _, soul_id in ipairs(souls) do
  migrate_soul(soul_id)
end
print("Fertig.")
