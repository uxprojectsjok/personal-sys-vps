-- /etc/openresty/lua/soul_paid_comment.lua
-- POST /api/soul/paid-comment
-- Bearer = pol_access_token. Hängt einen kommentierten Eintrag an den AGENT-Block der Soul.
-- Body: { comment: string, author?: string }

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
  ngx.say('{"error":"token_expired_or_invalid","message":"pol_access_token ungültig oder abgelaufen."}')
  return
end

local ok_t, tdata = pcall(cjson.decode, raw)
if not ok_t or type(tdata) ~= "table" or not tdata.soul_id then
  ngx.status = 500
  ngx.say('{"error":"token_data_corrupt"}')
  return
end

local soul_id = tdata.soul_id
local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
if not soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.say('{"error":"invalid_soul_id"}')
  return
end

-- Body lesen
ngx.req.read_body()
local body     = ngx.req.get_body_data() or ""
local ok_b, bd = pcall(cjson.decode, body)
if not ok_b or type(bd) ~= "table" then
  ngx.status = 400
  ngx.say('{"error":"Invalid JSON body"}')
  return
end

local comment = bd.comment or ""
local author  = bd.author  or "anonymous"

comment = comment:match("^%s*(.-)%s*$")
if #comment == 0 then
  ngx.status = 400
  ngx.say('{"error":"comment darf nicht leer sein"}')
  return
end
if #comment > 2000 then
  ngx.status = 400
  ngx.say('{"error":"comment zu lang (max. 2000 Zeichen)"}')
  return
end

-- api_context prüfen → Amortisierung aktiv?
local SOULS_DIR = "/var/lib/sys/souls/"
local cf = io.open(SOULS_DIR .. soul_id .. "/api_context.json", "r")
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

local amort = ctx.amortization
if type(amort) == "table" and amort.private == true then
  ngx.status = 403
  ngx.say('{"error":"soul_private"}')
  return
end
if type(amort) ~= "table" or amort.enabled ~= true then
  ngx.status = 402
  ngx.say('{"error":"payment_not_required"}')
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
local content

if is_encrypted then
  local vault_key_hex = ctx.vault_key_hex or ""
  if vault_key_hex == "" then
    ngx.status = 403
    ngx.say('{"error":"vault_key_missing","message":"Vault-Schlüssel nicht verfügbar — Soul muss einmal entsperrt werden."}')
    return
  end
  local function hex_to_bin(hex)
    return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
  end
  local iv         = raw_content:sub(5, 20)
  local ciphertext = raw_content:sub(21)
  local key        = hex_to_bin(vault_key_hex)
  local aes_ctx    = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then
    ngx.status = 500
    ngx.say('{"error":"decrypt_init_failed"}')
    return
  end
  content = aes_ctx:decrypt(ciphertext)
  if not content then
    ngx.status = 500
    ngx.say('{"error":"decrypt_failed"}')
    return
  end
else
  content = raw_content
end

-- AGENT-Block suchen
local AGENT_START = "<!-- AGENT:START -->"
local AGENT_END   = "<!-- AGENT:END -->"
local s = content:find(AGENT_START, 1, true)
local e = content:find(AGENT_END,   1, true)

if not s or not e or e <= s then
  ngx.status = 404
  ngx.say('{"error":"no_agent_block","message":"Kein <!-- AGENT:START --> Block definiert."}')
  return
end

-- Kommentar-Eintrag bauen
local ts = os.date("%Y-%m-%dT%H:%M:%S")

-- TX-Hash als einzige Identifikation (Wallet über Polygonscan nachschlagbar)
local tx_ref = ""
if type(tdata.tx_hash) == "string" and #tdata.tx_hash > 10 then
  tx_ref = " · tx:" .. tdata.tx_hash:sub(1,10) .. "…"
end

local header = "**" .. author:gsub("[%[%]<>]", "") .. "**" .. tx_ref .. " · " .. ts:sub(1,10)
local entry  = "\n\n---\n" .. header .. "\n" .. comment

-- In den AGENT-Block einfügen (vor dem End-Marker)
local before_end = content:sub(1, e - 1)
local after_end  = content:sub(e)

local new_md = before_end .. entry .. "\n" .. after_end

-- Re-verschlüsseln falls nötig
local final_bytes
if is_encrypted then
  local function hex_to_bin(hex)
    return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
  end
  local vault_key_hex = ctx.vault_key_hex
  local key     = hex_to_bin(vault_key_hex)
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

-- sys.md schreiben
local wf = io.open(soul_file, "w")
if not wf then
  ngx.status = 500
  ngx.say('{"error":"sys.md nicht schreibbar"}')
  return
end
wf:write(final_bytes)
wf:close()

ngx.say(cjson.encode({
  ok         = true,
  message    = "Kommentar gespeichert",
  author     = author,
  written_at = os.date("%Y-%m-%dT%H:%M:%S"),
}))
