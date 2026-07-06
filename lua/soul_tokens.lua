-- /etc/openresty/lua/soul_tokens.lua
-- GET  /api/soul/tokens          — listet aktive ausgestellte Tokens
-- DELETE /api/soul/tokens?token= — widerruft einen Token
-- Auth: soul_auth.lua (Inhaber-only)

local cjson     = require("cjson.safe")
local TOKEN_DIR = "/var/lib/sys/pol_tokens/"

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local soul_id = ngx.ctx.soul_id
if not soul_id then
  ngx.status = 401; ngx.say('{"error":"unauthorized"}'); return
end

local method = ngx.req.get_method()

-- ── DELETE: Token widerrufen ───────────────────────────────────────────────────
if method == "DELETE" then
  local args  = ngx.req.get_uri_args()
  local token = args.token
  if not token or not token:match("^%x+$") or #token < 32 then
    ngx.status = 400; ngx.say('{"error":"token required"}'); return
  end
  local tok_lower = token:lower()

  -- Nur Tokens dieser Soul widerrufen
  local tf = io.open(TOKEN_DIR .. tok_lower .. ".json", "r")
  if not tf then
    ngx.status = 404; ngx.say('{"error":"token_not_found"}'); return
  end
  local ok_t, tdata = pcall(cjson.decode, tf:read("*a")); tf:close()
  if not ok_t or type(tdata) ~= "table" or tdata.soul_id ~= soul_id then
    ngx.status = 403; ngx.say('{"error":"token_belongs_to_different_soul"}'); return
  end

  os.remove(TOKEN_DIR .. tok_lower .. ".json")
  local cache = ngx.shared.pol_access
  if cache then cache:delete("tok:" .. tok_lower) end

  ngx.say('{"ok":true,"revoked":"' .. tok_lower .. '"}')
  return
end

-- ── GET: aktive Tokens auflisten ───────────────────────────────────────────────
if method ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local p = io.popen("ls " .. TOKEN_DIR .. " 2>/dev/null")
if not p then
  ngx.say(cjson.encode({ tokens = {}, count = 0 })); return
end

local tokens = {}
local now    = ngx.time()

for fname in p:lines() do
  local tok = fname:match("^(%x+)%.json$")
  if tok then
    local tf = io.open(TOKEN_DIR .. fname, "r")
    if tf then
      local ok_t, tdata = pcall(cjson.decode, tf:read("*a")); tf:close()
      if ok_t and type(tdata) == "table" and tdata.soul_id == soul_id then
        -- Ablauf prüfen
        local exp_ts = nil
        if type(tdata.expires_at) == "string" then
          local y,mo,d,h,mi,s = tdata.expires_at:match("^(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
          if y then
            local ref    = now
            local utc_t  = os.date("!*t", ref)
            local tz_off = ref - os.time(utc_t)
            exp_ts = os.time({
              year=tonumber(y), month=tonumber(mo), day=tonumber(d),
              hour=tonumber(h), min=tonumber(mi), sec=tonumber(s), isdst=false
            }) + tz_off
          end
        end
        if exp_ts and exp_ts < now then
          -- Abgelaufen → Datei löschen, nicht listen
          os.remove(TOKEN_DIR .. fname)
        else
          table.insert(tokens, {
            token          = tok,
            from           = tdata.from or "unknown",
            pol_amount     = tdata.pol_amount or "0",
            issued_at      = tdata.issued_at or "",
            expires_at     = tdata.expires_at or "",
            tx_hash        = tdata.tx_hash or "",
            payment_method = tdata.payment_method or "pol",
            reference_id   = tdata.reference_id or cjson.null,
          })
        end
      end
    end
  end
end
p:close()

-- Nach issued_at sortieren (neueste zuerst)
table.sort(tokens, function(a, b) return (a.issued_at or "") > (b.issued_at or "") end)

ngx.say(cjson.encode({ tokens = tokens, count = #tokens }))
