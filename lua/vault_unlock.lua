-- /etc/openresty/lua/vault_unlock.lua
-- POST /api/vault/unlock  → Vault entsperren, Dauer wählen
-- POST /api/vault/lock    → Vault sofort sperren
-- GET  /api/vault/session → Aktuellen Session-Status abfragen
--
-- Auth: soul-cert only (via soul_auth.lua access phase)
-- Shared Dict: vault_sessions (in nginx.conf: lua_shared_dict vault_sessions 10m)
--
-- Session-Format: JSON { expires_at: number, vault_key: "64-hex-string" }
--   expires_at == 0 → unbegrenzt
--   vault_key == "" → kein Schlüssel (plaintext-Modus)

local cjson    = require("cjson.safe")
local sessions = ngx.shared.vault_sessions
local soul_id  = ngx.ctx.soul_id
local method   = ngx.req.get_method()
local uri      = ngx.var.uri

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local durations = {
  ["1h"]        = 3600,
  ["12h"]       = 43200,
  ["1d"]        = 86400,
  ["30d"]       = 2592000,
  ["182d"]      = 15724800,
  ["365d"]      = 31536000,
  ["unlimited"] = 0
}

-- Hilfsfunktion: Session-Wert parsen (JSON oder altes plain-number Format)
local function parse_session(val)
  if not val then return nil end
  local ok, sess = pcall(cjson.decode, val)
  if ok and type(sess) == "table" then
    return sess.expires_at or 0, sess.vault_key or ""
  end
  -- Rückwärtskompatibilität: alter Wert war plain tostring(expires_at)
  return tonumber(val) or 0, ""
end

-- Prüft, ob vault_key eine bestimmte Datei tatsächlich entschlüsseln kann.
-- @return is_encrypted (bool), matches (bool|nil — nil wenn is_encrypted=false, d.h. n/a)
local function file_matches_key(path, vault_key)
  local sf = io.open(path, "rb")
  if not sf then return false, nil end
  local content = sf:read("*a"); sf:close()
  if #content < 4 + 16 + 16 or content:sub(1, 4) ~= "SYS\1" then
    return false, nil  -- nicht (mehr) verschlüsselt, kein Mismatch möglich
  end
  if not vault_key or vault_key == "" then return true, false end

  local iv        = content:sub(5, 20)
  local ct         = content:sub(21)
  local key_bin    = vault_key:gsub("..", function(h) return string.char(tonumber(h, 16)) end)
  local resty_aes  = require("resty.aes")
  local aes_ctx    = resty_aes:new(key_bin, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  local decrypted  = aes_ctx and aes_ctx:decrypt(ct)
  -- resty.aes strips PKCS7 padding internally and returns nil/false when the
  -- padding doesn't validate (i.e. wrong key) — same behavior api_serve.lua's
  -- proven-correct try_decrypt() already relies on. An earlier version of this
  -- function re-validated padding manually on top of that, which inspected the
  -- last byte of the already-unpadded plaintext as if it were still a padding
  -- byte — a false mismatch for the objectively correct key, caught by testing
  -- this endpoint end-to-end against real data instead of trusting it blind.
  -- A later version required #decrypted > 0 on top of that, which broke on a
  -- genuinely empty but validly-encrypted file (activity.md right after being
  -- reset to empty) — a valid decrypt of empty plaintext IS a 0-length string,
  -- not a failure. Trust resty.aes's type alone: string = success, nil/false = failure.
  return true, (type(decrypted) == "string")
end

-- vault/context/-Dateien, die bewusst NIE verschlüsselt werden (siehe README
-- "Encrypted at rest, server-managed") — shopping.md/prompts.md sind technische
-- Dateien, die auch ohne Vault-Zugriff funktionieren müssen; ownagent.md ist
-- die ElevenLabs-Agent-Identität (Klartext by design, siehe create_agent.lua).
local CONTEXT_EXCLUDE = { ["shopping.md"] = true, ["prompts.md"] = true, ["ownagent.md"] = true }
local MEDIA_DIRS = { "images", "audio", "video", "profile" }

local function list_dir(dir)
  local out = {}
  local h = io.popen("ls -- '" .. dir:gsub("'", "'\\''") .. "' 2>/dev/null")
  if h then
    for fname in h:lines() do
      if type(fname) == "string" and #fname > 0 and not fname:find("%.%.") and not fname:find("/") then
        out[#out + 1] = fname
      end
    end
    h:close()
  end
  return out
end

-- Iteriert über alle Dateien, die potenziell server-verwaltet verschlüsselt
-- sind: sys.md + JEDE Datei in vault/context/ außer CONTEXT_EXCLUDE (nicht nur
-- eine feste Namensliste — deckt auch beliebig benannte, über context_write
-- angelegte Dateien ab, analog zum bewährten migrate_encrypt_generic_context.lua)
-- + alle Vault-Media. Ruft callback(rel_path, abs_path) für jede gefundene Datei.
local function each_vault_file(sid, callback)
  local base = "/var/lib/sys/souls/" .. sid
  callback("sys.md", base .. "/sys.md")
  local context_dir = base .. "/vault/context"
  for _, fname in ipairs(list_dir(context_dir)) do
    if not CONTEXT_EXCLUDE[fname:lower()] then
      callback("vault/context/" .. fname, context_dir .. "/" .. fname)
    end
  end
  for _, dname in ipairs(MEDIA_DIRS) do
    local dir = base .. "/vault/" .. dname
    for _, fname in ipairs(list_dir(dir)) do
      callback("vault/" .. dname .. "/" .. fname, dir .. "/" .. fname)
    end
  end
end

-- Prüft ALLE potenziell verschlüsselten Dateien einer Soul gegen einen Schlüssel.
-- @return checked (Anzahl tatsächlich verschlüsselter Dateien), mismatched (Array relativer Pfade)
local function scan_vault_for_mismatches(sid, vault_key)
  local checked, mismatched = 0, {}
  each_vault_file(sid, function(rel_path, abs_path)
    local is_enc, matches = file_matches_key(abs_path, vault_key)
    if is_enc then
      checked = checked + 1
      if not matches then mismatched[#mismatched + 1] = rel_path end
    end
  end)
  return checked, mismatched
end

-- Verschlüsselt eine Datei in-place, falls sie noch Klartext ist (kein SYS\x01-
-- Magic-Header). Rührt bereits verschlüsselte Dateien nicht an (dafür ist der
-- Mismatch-Guard oben zuständig, nicht diese Funktion). Gleiche Kernlogik wie
-- das bewährte migrate_encrypt_generic_context.lua (dort als eigenständiges,
-- manuell auszuführendes CLI-Migrationsscript für den Alt-Datenbestand) — hier
-- automatisch bei jedem Unlock/Lock statt einmalig von Hand angestoßen.
-- @return true wenn tatsächlich neu verschlüsselt wurde
local function encrypt_file_if_plaintext(path, vault_key)
  if not vault_key or vault_key == "" then return false end
  local sf = io.open(path, "rb")
  if not sf then return false end
  local content = sf:read("*a"); sf:close()
  if content == "" then return false end  -- nichts zu verschlüsseln
  if content:sub(1, 4) == "SYS\1" then return false end  -- schon verschlüsselt

  local key_bin   = vault_key:gsub("..", function(h) return string.char(tonumber(h, 16)) end)
  local resty_aes = require("resty.aes")
  local iv        = require("resty.random").bytes(16, true)
  if not iv then return false end
  local aes_ctx   = resty_aes:new(key_bin, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return false end
  local encrypted = aes_ctx:encrypt(content)
  if not encrypted then return false end

  local wf = io.open(path, "wb")
  if not wf then return false end
  wf:write("SYS\1" .. iv .. encrypted)
  wf:close()
  return true
end

-- Verschlüsselt alle noch-Klartext-Dateien einer Soul, für die cipher_mode das
-- vorsieht — läuft NACH dem Mismatch-Guard (nie parallel zu einer bereits
-- verschlüsselten-aber-falschen Datei). Existiert, weil "Vault locked" bisher
-- nur bedeutete "Server-Schlüssel entfernt" — Dateien, die nie verschlüsselt
-- wurden (z.B. vor der ersten Passkey-Einrichtung angelegte Context-Dateien),
-- blieben dabei einfach offen lesbar, Locking bot ihnen keinen Schutz.
-- sys.md bewusst ausgenommen: dessen Verschlüsselung ist client-getrieben
-- (WebCrypto im Browser, siehe README) — dort automatisch server-seitig
-- einzugreifen wäre ein eigenständiger Verhaltenswechsel, nicht Teil dieser
-- Anfrage (die explizit von "Kontextdateien" sprach).
local function sweep_encrypt_plaintext(sid, vault_key)
  local encrypted_now = {}
  if not vault_key or vault_key == "" then return encrypted_now end
  each_vault_file(sid, function(rel_path, abs_path)
    if rel_path ~= "sys.md" and encrypt_file_if_plaintext(abs_path, vault_key) then
      encrypted_now[#encrypted_now + 1] = rel_path
    end
  end)
  return encrypted_now
end

-- ── GET /api/vault/key-status ─────────────────────────────────────────────────
-- Health-Check für die Settings-UI: entschlüsselt der aktuell in api_context.json
-- persistierte vault_key_hex (das ist der Schlüssel, den MCP/Hintergrund-Zugriffe
-- wie soul_read tatsächlich verwenden — nicht die evtl. abweichende Browser-Session
-- aus ngx.shared.vault_sessions) ALLE verschlüsselten Dateien der Soul, nicht nur
-- sys.md? (siehe scan_vault_for_mismatches — erweitert nach genau diesem Vorfall.)

if method == "GET" and uri == "/api/vault/key-status" then
  local ctx_path = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
  local persisted_key = ""
  local cf = io.open(ctx_path, "r")
  if cf then
    local raw = cf:read("*a"); cf:close()
    local ok_j, ctx = pcall(cjson.decode, raw)
    if ok_j and type(ctx) == "table" and type(ctx.vault_key_hex) == "string"
       and #ctx.vault_key_hex == 64 then
      persisted_key = ctx.vault_key_hex
    end
  end
  local checked, mismatched = scan_vault_for_mismatches(soul_id, persisted_key)
  -- vault_key_hex wird hier bewusst mit ausgeliefert (analog zum Soul-Cert, der
  -- an anderer Stelle in Settings genauso im Klartext angezeigt wird) — beide
  -- Endpunkte verlangen ohnehin schon vollen Owner-Zugriff (soul_cert-Auth), ein
  -- Leak-Level über dem des Bearer-Tokens selbst besteht dadurch nicht.
  local key_json = cjson.null
  if persisted_key ~= "" then key_json = persisted_key end
  ngx.say(cjson.encode({
    has_key       = (persisted_key ~= ""),
    vault_key_hex = key_json,
    checked       = checked,
    mismatched    = mismatched,
    all_ok        = (#mismatched == 0),
  }))
  return
end

-- ── GET /api/vault/session ────────────────────────────────────────────────────

if method == "GET" then
  if not sessions then
    ngx.say(cjson.encode({ unlocked = false, error = "shared dict not configured" }))
    return
  end
  local val = sessions:get(soul_id)
  if not val then
    ngx.say(cjson.encode({ unlocked = false }))
    return
  end
  local expires_at, vault_key = parse_session(val)
  if expires_at and expires_at > 0 and ngx.now() >= expires_at then
    sessions:delete(soul_id)
    ngx.say(cjson.encode({ unlocked = false }))
    return
  end
  ngx.say(cjson.encode({
    unlocked    = true,
    expires_at  = (expires_at == 0) and cjson.null or expires_at,
    unlimited   = (expires_at == 0),
    has_key     = (vault_key ~= "")
  }))
  return
end

-- ── POST /api/vault/lock ──────────────────────────────────────────────────────

if method == "POST" and uri == "/api/vault/lock" then
  if sessions then sessions:delete(soul_id) end

  -- vault_key_hex aus api_context.json löschen → Webhook-Token-Auth kann nicht mehr entschlüsseln
  local ctx_path = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
  local cf = io.open(ctx_path, "r")
  if cf then
    local raw = cf:read("*a"); cf:close()
    local ok_j, ctx = pcall(cjson.decode, raw)
    if ok_j and type(ctx) == "table" then
      -- Bevor der Schlüssel entfernt wird: alle noch-Klartext-Dateien damit
      -- verschlüsseln. "Locked" bedeutete bisher nur "Server hat keinen
      -- Zugriff mehr auf verschlüsselte Dateien" — Dateien, die nie
      -- verschlüsselt wurden, blieben dabei einfach offen lesbar, Locking bot
      -- ihnen keinen Schutz. Spätestens jetzt sollen alle Dateien verschlüsselt
      -- sein, bevor der Schlüssel selbst nicht mehr verfügbar ist.
      if type(ctx.vault_key_hex) == "string" and #ctx.vault_key_hex == 64
         and (ctx.cipher_mode or "ciphered") == "ciphered" then
        sweep_encrypt_plaintext(soul_id, ctx.vault_key_hex)
      end
      ctx.vault_key_hex = nil
      local wf = io.open(ctx_path, "w")
      if wf then wf:write(cjson.encode(ctx)); wf:close() end
    end
  end

  ngx.say(cjson.encode({ ok = true, unlocked = false }))
  return
end

-- ── POST /api/vault/unlock ────────────────────────────────────────────────────

if method == "POST" and uri == "/api/vault/unlock" then
  if not sessions then
    ngx.status = 500
    ngx.say(cjson.encode({ error = "vault_sessions shared dict not configured in nginx.conf" }))
    return
  end

  ngx.req.read_body()
  local body = ngx.req.get_body_data() or "{}"
  local _, payload = pcall(cjson.decode, body)
  if type(payload) ~= "table" then payload = {} end

  local duration = payload.duration or "1h"
  local ttl = durations[duration]
  if ttl == nil then
    ngx.status = 400
    ngx.say(cjson.encode({
      error = "Invalid duration. Allowed: 1h, 12h, 1d, 30d, 182d, 365d, unlimited"
    }))
    return
  end

  -- vault_key: optionaler 64-Zeichen Hex-String (32 Byte AES-256-Schlüssel)
  local vault_key = ""
  if type(payload.vault_key) == "string" and payload.vault_key:match("^[0-9a-f]+$") and #payload.vault_key == 64 then
    vault_key = payload.vault_key
  end

  -- Neuer Schlüssel muss ALLE vorhandenen verschlüsselten Dateien tatsächlich
  -- entschlüsseln können (sys.md + Context-Dateien + Vault-Media, nicht nur
  -- sys.md — siehe scan_vault_for_mismatches) — sonst überschreibt
  -- "vault_key_hex immer schreiben" weiter unten stillschweigend den Schlüssel,
  -- mit dem der Inhalt wirklich verschlüsselt wurde, und macht ihn dauerhaft
  -- unlesbar (kein Backup/keine Historie von vault_key_hex). Passiert z.B. wenn
  -- zwischen zwei Unlocks ein anderer Passkey/anderes Credential verwendet
  -- wurde — jedes liefert einen eigenen, deterministischen aber
  -- UNTERSCHIEDLICHEN Schlüssel. Ursprünglich prüfte das nur sys.md — ein
  -- gezielter Nachfrage-Test deckte auf, dass Vault-Media (profile.png, eine
  -- Audio-Datei) und activity.md mit einem abweichenden Schlüssel verschlüsselt
  -- waren, unbemerkt vom ursprünglichen sys.md-only-Check.
  if vault_key ~= "" then
    local checked, mismatched = scan_vault_for_mismatches(soul_id, vault_key)
    if #mismatched > 0 then
      ngx.status = 409
      ngx.say(cjson.encode({
        error      = "key_mismatch",
        mismatched = mismatched,
        message    = "Dieser Schlüssel kann " .. #mismatched .. " von " .. checked .. " verschlüsselten Dateien nicht entschlüsseln — vermutlich wurde mit einem anderen Passkey/Credential entsperrt als dem, mit dem zuletzt gespeichert wurde. Vault-Sperre wurde NICHT überschrieben, um bestehenden Inhalt nicht dauerhaft unlesbar zu machen.",
      }))
      return
    end
  end

  -- Nach bestandenem Mismatch-Guard: alle noch-Klartext-Dateien (z.B. Context-
  -- Dateien von vor der ersten Passkey-Einrichtung) jetzt mit dem frisch
  -- bestätigten Schlüssel verschlüsseln, statt zu warten bis irgendwann gelockt
  -- wird. Läuft nur bei cipher_mode=ciphered — ein bewusst offener/plaintext
  -- betriebener Vault wird nicht gegen seinen Willen umgestellt.
  local newly_encrypted = {}
  if vault_key ~= "" then
    local ctx_path_check = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
    local cfc = io.open(ctx_path_check, "r")
    local cipher_mode = "ciphered"
    if cfc then
      local rawc = cfc:read("*a"); cfc:close()
      local ok_jc, ctxc = pcall(cjson.decode, rawc)
      if ok_jc and type(ctxc) == "table" and ctxc.cipher_mode then cipher_mode = ctxc.cipher_mode end
    end
    if cipher_mode == "ciphered" then
      newly_encrypted = sweep_encrypt_plaintext(soul_id, vault_key)
    end
  end

  local expires_at = (ttl == 0) and 0 or (math.floor(ngx.now()) + ttl)

  local session_data = cjson.encode({ expires_at = expires_at, vault_key = vault_key })
  -- ttl=0 in ngx.shared.dict → never expires
  local ok, err = sessions:set(soul_id, session_data, ttl)
  if not ok then
    ngx.status = 500
    ngx.say(cjson.encode({ error = "Session store failed: " .. (err or "unknown") }))
    return
  end

  -- ── webhook_token automatisch setzen ─────────────────────────────────────
  -- HMAC-SHA256(vault_key_bin, soul_id) → in api_context.json speichern
  -- Damit ist /api/webhook/mnemonic nach jedem Unlock sofort nutzbar,
  -- auch nach Vault-Löschung (api_context wird neu angelegt + token gesetzt).
  if vault_key ~= "" then
    local vault_key_bin = vault_key:gsub("..", function(h)
      return string.char(tonumber(h, 16))
    end)

    local token_hex

    -- Versuch 1: resty.openssl.hmac (falls installiert)
    local ok_lib, openssl_hmac = pcall(require, "resty.openssl.hmac")
    if ok_lib then
      local hmac_obj = openssl_hmac.new(vault_key_bin, "sha256")
      if hmac_obj then
        local sig = hmac_obj:final(soul_id)
        if sig then
          token_hex = sig:gsub(".", function(c)
            return string.format("%02x", string.byte(c))
          end)
        end
      end
    end

    -- Versuch 2: Python3 via Tempfiles (immer verfügbar)
    if not token_hex or #token_hex ~= 64 then
      local ts   = tostring(ngx.now()):gsub("%.", "_")
      local t_k  = "/tmp/sys_k_" .. ts
      local t_s  = "/tmp/sys_s_" .. ts
      local t_o  = "/tmp/sys_o_" .. ts
      local fk = io.open(t_k, "w"); if fk then fk:write(vault_key); fk:close() end
      local fs = io.open(t_s, "w"); if fs then fs:write(soul_id);   fs:close() end
      os.execute(string.format(
        "python3 -c \"import hmac,binascii;"
        .. "vk=binascii.unhexlify(open('%s').read().strip());"
        .. "s=open('%s').read().strip();"
        .. "print(hmac.new(vk,s.encode(),'sha256').hexdigest())"
        .. "\" > %s 2>/dev/null", t_k, t_s, t_o))
      os.remove(t_k); os.remove(t_s)
      local rf = io.open(t_o, "r")
      if rf then token_hex = (rf:read("*a") or ""):gsub("%s+$", ""); rf:close() end
      os.remove(t_o)
    end

    -- In api_context.json persistieren
    -- vault_key_hex immer schreiben (ermöglicht MCP/Service-Token-Zugriff ohne aktive Session)
    -- Datei anlegen falls sie noch nicht existiert (Vault-Unlock vor erstem Sync)
    local ctx_path = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
    os.execute("mkdir -p /var/lib/sys/souls/" .. soul_id)
    local ctx = {
      enabled      = false,
      cipher_mode  = "ciphered",
      permissions  = { soul = false, audio = false, video = false, images = false, context_files = false },
      synced_files = {},
      active_files = {}
    }
    local cf = io.open(ctx_path, "r")
    if cf then
      local raw = cf:read("*a"); cf:close()
      local ok_j, existing = pcall(cjson.decode, raw)
      if ok_j and type(existing) == "table" then ctx = existing end
    end
    ctx.vault_key_hex = vault_key   -- für vault_auth: Token-Auth ohne Session
    ctx.cipher_mode   = "ciphered"
    if token_hex and #token_hex == 64 then
      ctx.webhook_token = token_hex
    end
    local wf = io.open(ctx_path, "w")
    if wf then wf:write(cjson.encode(ctx)); wf:close() end
  end

  ngx.say(cjson.encode({
    ok              = true,
    unlocked        = true,
    duration        = duration,
    expires_at      = (expires_at == 0) and cjson.null or expires_at,
    unlimited       = (expires_at == 0),
    has_key         = (vault_key ~= ""),
    newly_encrypted = newly_encrypted,
  }))
  return
end

ngx.status = 405
ngx.say(cjson.encode({ error = "Method not allowed" }))
