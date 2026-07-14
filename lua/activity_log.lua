-- /etc/openresty/lua/activity_log.lua
-- 14-Tage-Rolling-Log für Schreibzugriffe verbundener Service-Tokens
-- (ChatGPT, Mistral, Claude, ...). Liegt in vault/context/, also automatisch
-- über context_get/context_list für jede KI abfragbar — kein eigenes Tool nötig.
-- Ergänzt die freiwillige Selbstauskunft aus mind.md ("## Signature"): dort
-- signiert die KI ihre Einträge selbst, hier läuft unabhängig davon ein
-- serverseitiger Fallback mit, der nicht von der KI-Mitarbeit abhängt.
--
-- Kein Langzeit-Log: Einträge älter als RETENTION_DAYS werden bei jedem
-- Schreibvorgang verworfen, die Datei überschreibt sich also selbst.

local M = {}
local RETENTION_DAYS = 14
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

local function load_vault_meta(soul_id)
  local cjson = require("cjson.safe")
  local cf = io.open("/var/lib/sys/souls/" .. soul_id .. "/api_context.json", "r")
  if not cf then return nil, "ciphered" end
  local raw = cf:read("*a"); cf:close()
  local ok, ctx = pcall(cjson.decode, raw)
  if not ok or type(ctx) ~= "table" then return nil, "ciphered" end
  local key = type(ctx.vault_key_hex) == "string" and #ctx.vault_key_hex == 64 and ctx.vault_key_hex or nil
  return key, ctx.cipher_mode or "ciphered"
end

function M.record(soul_id, actor, method, uri)
  if type(soul_id) ~= "string" or soul_id == "" then return end

  local dir  = "/var/lib/sys/souls/" .. soul_id .. "/vault/context"
  local path = dir .. "/activity.md"

  local now_ts   = math.floor(ngx.now())
  local ts_str   = os.date("!%Y-%m-%dT%H:%MZ", now_ts)
  local new_line = "- " .. ts_str .. " | " .. (actor or "?") .. " | " .. method .. " " .. uri

  local vault_key, cipher_mode = load_vault_meta(soul_id)

  local lines = {}
  local f = io.open(path, "rb")
  if f then
    local raw_existing = f:read("*a"); f:close()
    local existing = decrypt_content(raw_existing, vault_key)
    if existing == nil then
      -- Verschlüsselt, aber kein/ungültiger Vault-Key: nicht schreiben, sonst
      -- würde die vorhandene Historie durch eine fast-leere Klartextdatei ersetzt.
      return
    end
    if existing ~= "" then
      local stripped = existing:gsub("\n$", "")
      for line in (stripped .. "\n"):gmatch("([^\n]*)\n") do lines[#lines + 1] = line end
    end
  end

  -- Grobes 14-Tage-Fenster (UTC vs. lokale os.time()-Interpretation wird
  -- bewusst ignoriert — ein paar Stunden Abweichung sind für dieses
  -- Kontextsignal irrelevant, kein forensisches Audit-Log).
  local cutoff = now_ts - (RETENTION_DAYS * 86400)
  local kept   = { new_line }
  for _, line in ipairs(lines) do
    local y, mo, d, h, mi = line:match("^%- (%d%d%d%d)%-(%d%d)%-(%d%d)T(%d%d):(%d%d)Z")
    if y then
      local line_ts = os.time({ year = tonumber(y), month = tonumber(mo), day = tonumber(d),
                                 hour = tonumber(h), min = tonumber(mi) })
      if line_ts >= cutoff then kept[#kept + 1] = line end
    else
      kept[#kept + 1] = line  -- unbekanntes Format (z.B. eine Kopfzeile) behalten
    end
  end

  local updated = table.concat(kept, "\n") .. "\n"
  local to_write = updated
  if cipher_mode == "ciphered" then
    local encrypted = encrypt_content(updated, vault_key)
    if encrypted then to_write = encrypted end
  end

  os.execute("mkdir -p " .. dir)
  local wf = io.open(path, "wb")
  if wf then
    wf:write(to_write)
    wf:close()
    os.execute("chown www-data:www-data " .. path .. " 2>/dev/null || true")
  end
end

return M
