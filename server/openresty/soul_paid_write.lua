-- /etc/openresty/lua/soul_paid_write.lua
-- POST /api/soul/paid-write
-- Bearer = pol_access_token. Schreibt in den Agent-Kontext-Block der sys.md.
-- Sicherheitsregel: Nur der Bereich zwischen <!-- AGENT:START --> und <!-- AGENT:END -->
-- darf von zahlenden Agenten verändert werden. Alle anderen Bereiche sind gesperrt.

local cjson     = require("cjson.safe")
local resty_aes = require("resty.aes")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"Method not allowed"}')
  return
end

-- Token extrahieren
local auth  = ngx.req.get_headers()["Authorization"] or ""
local token = auth:match("^[Bb]earer%s+(.+)$")

if not token or not token:match("^[0-9a-fA-F]+$") or #token < 32 then
  ngx.status = 401
  ngx.header["WWW-Authenticate"] = 'Bearer realm="soul-paid"'
  ngx.say('{"error":"Bearer pol_access_token erforderlich"}')
  return
end

-- pol_access shared dict prüfen
local access_cache = ngx.shared.pol_access
local raw = access_cache:get("tok:" .. token:lower())

if not raw then
  ngx.status = 401
  ngx.say('{"error":"token_expired_or_invalid","message":"pol_access_token ungültig oder abgelaufen. Neue Zahlung erforderlich."}')
  return
end

local ok_t, tdata = pcall(cjson.decode, raw)
if not ok_t or type(tdata) ~= "table" or not tdata.soul_id then
  ngx.status = 500
  ngx.say('{"error":"token_data_corrupt"}')
  return
end

local soul_id = tdata.soul_id

-- soul_id auf UUID-Format prüfen (Path Traversal verhindern)
local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
if not soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.say('{"error":"invalid_soul_id"}')
  return
end

-- Body lesen
ngx.req.read_body()
local body_raw = ngx.req.get_body_data() or ""
local ok_b, body = pcall(cjson.decode, body_raw)
if not ok_b or type(body) ~= "table" then
  ngx.status = 400
  ngx.say('{"error":"Invalid JSON body"}')
  return
end

local content = body.content
local mode    = body.mode or "append"

-- Sicherheit: Agent darf keine AGENT-Marker injizieren (würde Block-Struktur korrumpieren)
if type(content) == "string" then
  content = content:gsub("<!%-%- AGENT:START %-%->", ""):gsub("<!%-%- AGENT:END %-%->", "")
end

if type(content) ~= "string" or #content == 0 then
  ngx.status = 400
  ngx.say('{"error":"content erforderlich"}')
  return
end
if #content > 50000 then
  ngx.status = 413
  ngx.say('{"error":"content zu lang (max 50000 Zeichen)"}')
  return
end
if mode ~= "replace" and mode ~= "append" and mode ~= "prepend" then
  ngx.status = 400
  ngx.say('{"error":"mode muss replace | append | prepend sein"}')
  return
end

-- api_context.json lesen
local SOULS_DIR = "/var/lib/sys/souls/"
local ctx_file  = SOULS_DIR .. soul_id .. "/api_context.json"
local cf = io.open(ctx_file, "r")
if not cf then
  ngx.status = 404
  ngx.say('{"error":"Soul nicht gefunden"}')
  return
end
local raw_ctx = cf:read("*a"); cf:close()
local ok_c, ctx = pcall(cjson.decode, raw_ctx)
if not ok_c or type(ctx) ~= "table" then
  ngx.status = 500
  ngx.say('{"error":"api_context corrupt"}')
  return
end

-- Amortisierung aktiv?
local amort = ctx.amortization
if type(amort) ~= "table" or amort.enabled ~= true then
  ngx.status = 402
  ngx.say('{"error":"amortization_not_active"}')
  return
end

-- soul_write in free_tools erlaubt?
local write_allowed = false
if type(amort.free_tools) == "table" then
  for _, t in ipairs(amort.free_tools) do
    if t == "soul_write" then write_allowed = true; break end
  end
end
if not write_allowed then
  ngx.status = 403
  ngx.say('{"error":"soul_write nicht freigegeben","message":"Soul-Besitzer hat soul_write nicht für externe Agenten aktiviert."}')
  return
end

-- sys.md lesen
local soul_file = SOULS_DIR .. soul_id .. "/sys.md"
local sf = io.open(soul_file, "r")
if not sf then
  ngx.status = 404
  ngx.say('{"error":"sys.md nicht gefunden"}')
  return
end
local raw_content = sf:read("*a"); sf:close()

-- Entschlüsseln falls nötig
local is_encrypted = raw_content:sub(1, 4) == "SYS\x01"
local iv_bytes     = nil
local md_text

if is_encrypted then
  local vault_key_hex = ctx.vault_key_hex or ""
  if vault_key_hex == "" then
    ngx.status = 403
    ngx.say('{"error":"vault_key_missing","message":"Vault-Schlüssel nicht verfügbar."}')
    return
  end

  local function hex_to_bin(hex)
    return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
  end

  iv_bytes        = raw_content:sub(5, 20)
  local ciphertext = raw_content:sub(21)
  local key        = hex_to_bin(vault_key_hex)
  local aes_ctx    = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv_bytes })

  if not aes_ctx then
    ngx.status = 500
    ngx.say('{"error":"decrypt_init_failed"}')
    return
  end

  md_text = aes_ctx:decrypt(ciphertext)
  if not md_text then
    ngx.status = 500
    ngx.say('{"error":"decrypt_failed"}')
    return
  end
else
  md_text = raw_content
end

-- Nur den Agent-Block aktualisieren (zwischen <!-- AGENT:START --> und <!-- AGENT:END -->)
local AGENT_START = "<!-- AGENT:START -->"
local AGENT_END   = "<!-- AGENT:END -->"
local s = md_text:find(AGENT_START, 1, true)
local e = md_text:find(AGENT_END,   1, true)

local new_md
if s and e and e > s then
  local before       = md_text:sub(1, s + #AGENT_START - 1)
  local existing_raw = md_text:sub(s + #AGENT_START, e - 1)
  local existing     = existing_raw:match("^%s*(.-)%s*$") or ""
  local after        = md_text:sub(e)

  local new_block
  if mode == "replace" then
    new_block = content
  elseif mode == "prepend" then
    new_block = existing ~= "" and (content .. "\n\n" .. existing) or content
  else -- append
    new_block = existing ~= "" and (existing .. "\n\n" .. content) or content
  end

  new_md = before .. "\n" .. new_block:match("^%s*(.-)%s*$") .. "\n" .. after
else
  -- Keine Marker vorhanden → ans Ende der sys.md anfügen
  new_md = md_text:gsub("%s*$", "") ..
           "\n\n" .. AGENT_START .. "\n" .. content:match("^%s*(.-)%s*$") .. "\n" .. AGENT_END .. "\n"
end

-- Re-verschlüsseln falls nötig
local final_bytes
if is_encrypted then
  local function hex_to_bin(hex)
    return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
  end
  local vault_key_hex = ctx.vault_key_hex
  local key     = hex_to_bin(vault_key_hex)
  -- Neuen zufälligen IV erzeugen (16 Bytes aus ngx.now + soul_id hash)
  local new_iv  = string.sub(ngx.md5(tostring(ngx.now()) .. soul_id), 1, 16)
  local aes_ctx = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = new_iv })
  if not aes_ctx then
    ngx.status = 500
    ngx.say('{"error":"encrypt_init_failed"}')
    return
  end
  local encrypted = aes_ctx:encrypt(new_md)
  if not encrypted then
    ngx.status = 500
    ngx.say('{"error":"encrypt_failed"}')
    return
  end
  final_bytes = "SYS\x01" .. new_iv .. encrypted
else
  final_bytes = new_md
end

-- Zurückschreiben
local wf = io.open(soul_file, "w")
if not wf then
  ngx.status = 500
  ngx.say('{"error":"write_failed","message":"sys.md konnte nicht geschrieben werden."}')
  return
end
wf:write(final_bytes); wf:close()

local verb = mode == "replace" and "ersetzt" or mode == "append" and "erweitert (Ende)" or "erweitert (Anfang)"
ngx.say(cjson.encode({
  ok      = true,
  section = "Agent-Kontext",
  mode    = mode,
  message = "Agent-Kontext " .. verb .. ". Änderung sofort aktiv.",
}))
