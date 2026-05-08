-- /etc/openresty/lua/soul_paid_comment.lua
-- POST /api/soul/paid-comment
-- Bearer = pol_access_token. Hängt einen kommentierten Eintrag an den AGENT-Block der Soul.
-- Body: { comment: string, author?: string }

local cjson = require("cjson.safe")

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
local content = sf:read("*a"); sf:close()

-- Verschlüsselte sys.md: Kommentare auf verschlüsselte Souls nicht unterstützt
if content:sub(1, 4) == "SYS\x01" then
  ngx.status = 403
  ngx.say('{"error":"encrypted_soul","message":"Kommentare auf verschlüsselte Souls werden nicht unterstützt."}')
  return
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
local ts = os.date("!%Y-%m-%dT%H:%M:%SZ")

-- Wallet-Adresse aus Token (kryptografisch verifiziert — stammt aus Polygon-TX)
local wallet_short = ""
if type(tdata.from) == "string" and #tdata.from >= 10 then
  wallet_short = " · " .. tdata.from:sub(1,6) .. "…" .. tdata.from:sub(-4)
end

-- TX-Hash (zur Verifikation auf Polygonscan)
local tx_ref = ""
if type(tdata.tx_hash) == "string" and #tdata.tx_hash > 10 then
  tx_ref = " · tx:" .. tdata.tx_hash:sub(1,8) .. "…"
end

local header = "**" .. author:gsub("[%[%]<>]", "") .. "**" .. wallet_short .. tx_ref .. " · " .. ts:sub(1,10)
local entry  = "\n\n---\n" .. header .. "\n" .. comment

-- In den AGENT-Block einfügen (vor dem End-Marker)
local before_end = content:sub(1, e - 1)
local after_end  = content:sub(e)

local new_content = before_end .. entry .. "\n" .. after_end

-- sys.md schreiben
local wf = io.open(soul_file, "w")
if not wf then
  ngx.status = 500
  ngx.say('{"error":"sys.md nicht schreibbar"}')
  return
end
wf:write(new_content)
wf:close()

ngx.say(cjson.encode({
  ok         = true,
  message    = "Kommentar gespeichert",
  author     = author,
  written_at = ts,
}))
