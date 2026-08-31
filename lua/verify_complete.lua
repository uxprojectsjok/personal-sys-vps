-- /etc/openresty/lua/verify_complete.lua
-- POST /api/verify/complete  (soul_cert auth)
-- App sendet biometrisches Ergebnis → Challenge wird aktualisiert.
-- Multi-Method: jede Methode wird einzeln abgeschlossen, Score = #completed_methods
-- Body: { challenge_id, method, verified, is_2fa }

local cjson      = require("cjson.safe")
local soul_id    = ngx.ctx.soul_id
local VERIFY_DIR = "/var/lib/sys/verify/"
os.execute("mkdir -p " .. VERIFY_DIR)

-- Markiert den Service-Token, der diese Challenge ausgelöst hat (falls vorhanden),
-- als verifiziert — schaltet damit den vollen Tool-Zugriff frei (siehe vault_auth.lua).
local function mark_token_verified(sid, tok)
  if type(tok) ~= "string" or tok == "" then return end
  local svc_path = "/var/lib/sys/souls/" .. sid .. "/authorized_services.json"
  local f = io.open(svc_path, "r")
  if not f then return end
  local raw = f:read("*a"); f:close()
  local ok, svcs = pcall(cjson.decode, raw)
  if not ok or type(svcs) ~= "table" or type(svcs[tok]) ~= "table" then return end
  if svcs[tok].verified == true then return end  -- schon markiert, nichts zu tun
  svcs[tok].verified = true
  local wf = io.open(svc_path, "w")
  if wf then wf:write(cjson.encode(svcs)); wf:close() end
end

-- ── V2: Verify-Policy des auslösenden Service-Tokens gegen den purpose prüfen ──
-- Rückgabe: ok(bool), shortfall(string|nil), checked(bool).
--   checked = true  → es lief eine echte Tier-Bewertung (enforce an + Token hat
--                     eine passende verify_policy). ok sagt dann bestanden/nicht.
--   checked = false → nichts bewertet (enforce aus / kein purpose/Token/Policy/
--                     Tier). ok ist dann immer true (kein Block).
-- Onboarding (mark_token_verified) bleibt unberührt — eigener Layer.
local STRONG_METHODS = { fingerprint = true, face_hq = true, voice_hq = true }
local function verify_policy_ok(sid, tok, purpose, d, completed)
  local ok_cfg, cfg = pcall(require, "config_reader")
  if not ok_cfg or not cfg.get_verify_enforce() then return true, nil, false end
  if type(purpose) ~= "string" or purpose == "" then return true, nil, false end
  if type(tok) ~= "string" or tok == "" then return true, nil, false end

  local f = io.open("/var/lib/sys/souls/" .. sid .. "/authorized_services.json", "r")
  if not f then return true, nil, false end
  local raw = f:read("*a"); f:close()
  local okj, svcs = pcall(cjson.decode, raw)
  if not okj or type(svcs) ~= "table" or type(svcs[tok]) ~= "table" then return true, nil, false end
  local policy = svcs[tok].verify_policy
  if type(policy) ~= "table" then return true, nil, false end

  local tier = (type(policy.purposes) == "table" and policy.purposes[purpose]) or policy.default
  if type(tier) ~= "table" then return true, nil, false end   -- kein Tier → kein Block

  -- ab hier: echte Bewertung
  if type(tier.min_score) == "number" and (tonumber(d.score) or 0) < tier.min_score then
    return false, "min_score<" .. tier.min_score, true
  end
  if type(tier.methods) == "table" then
    for _, req in ipairs(tier.methods) do
      local found = false
      for _, c in ipairs(completed) do if c == req then found = true; break end end
      if not found then return false, "method:" .. tostring(req), true end
    end
  end
  if tier.require_strong == true then
    local has_strong = false
    for _, c in ipairs(completed) do if STRONG_METHODS[c] then has_strong = true; break end end
    if not has_strong then return false, "require_strong", true end
  end
  return true, nil, true
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

ngx.req.read_body()
local body_raw = ngx.req.get_body_data() or ""
if body_raw == "" then
  local tmp = ngx.req.get_body_file()
  if tmp then local fh=io.open(tmp,"r"); if fh then body_raw=fh:read("*a"); fh:close() end end
end

local ok_b, body = pcall(cjson.decode, body_raw)
if not ok_b or type(body) ~= "table" then
  ngx.status = 400; ngx.say('{"error":"invalid_body"}'); return
end

local challenge_id = body.challenge_id
local verified     = body.verified == true
local method       = body.method or "fingerprint"
local is_2fa       = body.is_2fa == true

if type(challenge_id) ~= "string" or #challenge_id ~= 32 or not challenge_id:match("^%x+$") then
  ngx.status = 400; ngx.say('{"error":"invalid_challenge_id"}'); return
end

-- Frühzeitig abschließen (Nutzer bricht sequenziellen Flow ab)
if body.finalize == true then
  local fpath2 = VERIFY_DIR .. soul_id .. "_" .. challenge_id .. ".json"
  local f2 = io.open(fpath2, "r")
  if not f2 then ngx.status = 404; ngx.say('{"error":"not_found"}'); return end
  local raw2 = f2:read("*a"); f2:close()
  local ok2, d2 = pcall(cjson.decode, raw2)
  if not ok2 or type(d2) ~= "table" then ngx.status = 500; ngx.say('{"error":"corrupt"}'); return end
  if d2.soul_id ~= soul_id then ngx.status = 403; ngx.say('{"error":"forbidden"}'); return end
  local comp2 = type(d2.completed_methods) == "table" and d2.completed_methods or {}
  if #comp2 == 0 then ngx.status = 400; ngx.say('{"error":"no_methods_completed"}'); return end
  if d2.status == "verified" then
    ngx.say(cjson.encode({ ok=true, challenge_id=challenge_id, score=d2.score, status="verified", completed_methods=comp2 })); return
  end
  local vat = os.date("!%Y-%m-%dT%TZ", math.floor(ngx.now()))
  d2.verified_at = vat
  mark_token_verified(soul_id, d2.triggering_token)
  local fpol_ok, fpol_short, fpol_checked = verify_policy_ok(soul_id, d2.triggering_token, d2.purpose, d2, comp2)
  d2.policy_checked = fpol_checked
  if fpol_ok then
    d2.status = "verified"
  else
    d2.status = "policy_not_met"; d2.policy_shortfall = fpol_short
  end
  local ok3, upd = pcall(cjson.encode, d2)
  if ok3 then local fw2=io.open(fpath2,"w"); if fw2 then fw2:write(upd); fw2:close() end end
  ngx.say(cjson.encode({ ok=true, challenge_id=challenge_id, score=d2.score, status=d2.status, policy_checked=d2.policy_checked, policy_shortfall=d2.policy_shortfall, completed_methods=comp2, is_2fa=d2.is_2fa }))
  return
end

-- "voice" (ohne HQ) bewusst nicht mehr akzeptiert — siehe verify_challenge.lua.
local VALID = { fingerprint = true, face = true, face_hq = true, voice_hq = true }
if not VALID[method] then
  ngx.status = 400; ngx.say('{"error":"invalid_method"}'); return
end

-- HQ-Methoden zählen höher als Standard-Methoden (schärferer Prompt +
-- explizite Liveness-Prüfung, siehe verify_face_check.lua)
local METHOD_WEIGHT = { fingerprint = 1, face = 1, face_hq = 2, voice_hq = 2 }
local function scoreOf(methodList)
  local sum = 0
  for _, m in ipairs(methodList) do sum = sum + (METHOD_WEIGHT[m] or 1) end
  return sum
end
-- Score MUSS die Boni aus verify_human_check.lua (+1) und dem Wallet-2FA-Signing
-- (+1) mit einrechnen — sonst überschreibt jede weitere abgeschlossene Methode
-- diese Boni stillschweigend mit dem reinen Methoden-Score (scoreOf allein).
local function totalScore(d, methodList)
  local sum = scoreOf(methodList)
  if d.human_verified == true then sum = sum + 1 end
  if type(d.wallet_2fa) == "table" then sum = sum + 1 end
  return sum
end

local fpath = VERIFY_DIR .. soul_id .. "_" .. challenge_id .. ".json"
local f = io.open(fpath, "r")
if not f then
  ngx.status = 404; ngx.say('{"error":"challenge_not_found"}'); return
end
local raw = f:read("*a"); f:close()

local ok_d, d = pcall(cjson.decode, raw)
if not ok_d or type(d) ~= "table" then
  ngx.status = 500; ngx.say('{"error":"corrupt_challenge"}'); return
end
if d.soul_id ~= soul_id then
  ngx.status = 403; ngx.say('{"error":"forbidden"}'); return
end

-- Abgelaufene Challenge nicht mehr abschließen. verify_challenge.lua setzt
-- expires_at = now + 300s (gleiches ISO-UTC-Format wie os.date("!%Y-%m-%dT%TZ"),
-- lexikografisch = chronologisch). Ohne diesen Check bliebe eine Challenge nach
-- Ablauf der TTL abschließbar, bis der Cron die Datei löscht.
if type(d.expires_at) == "string" and d.status ~= "verified" then
  if os.date("!%Y-%m-%dT%TZ", math.floor(ngx.now())) > d.expires_at then
    ngx.status = 410; ngx.say('{"error":"challenge_expired"}'); return
  end
end

-- voice_hq: der Client meldet nur das (kostenlose, unveränderte) FFT-Ergebnis
-- selbst — der Anti-Replay-Ziffern-Check muss server-seitig aus der Challenge-
-- Datei stammen (von verify_voice_hq_check.lua gesetzt), sonst könnte ein
-- Client einfach "verified: true" ohne echten Ziffern-Match behaupten.
if method == "voice_hq" and verified and d.voice_hq_digits_verified ~= true then
  verified = false
end

-- face/face_hq: derselbe Grund — der Client meldet sein eigenes Ergebnis, der
-- echte Claude-Vision-Vergleich lief in verify_face_check.lua, das bei einem
-- echten Match d.face_check_verified (bzw. zusätzlich d.face_hq_check_verified
-- für den strengeren HQ-Prompt) gesetzt hat. Ohne diesen Beweis könnte ein
-- Client /api/verify/face-check komplett überspringen und "verified: true"
-- ohne jeden Bildvergleich posten.
if method == "face" and verified and d.face_check_verified ~= true then
  verified = false
end
if method == "face_hq" and verified and d.face_hq_check_verified ~= true then
  verified = false
end

-- fingerprint: gleicher Grund — der Client meldet sein eigenes Ergebnis, die echte
-- WebAuthn-Signaturprüfung lief in verify_fingerprint_check.lua, das bei Erfolg
-- d.fingerprint_verified gesetzt hat. Ohne diesen Beweis könnte ein Client
-- navigator.credentials.get() komplett überspringen und "verified: true" posten.
if method == "fingerprint" and verified and d.fingerprint_verified ~= true then
  verified = false
end

local verified_at = os.date("!%Y-%m-%dT%TZ", math.floor(ngx.now()))
local required    = type(d.required_methods) == "table" and d.required_methods or {}
local completed   = type(d.completed_methods) == "table" and d.completed_methods or {}

-- Frontend sendet selected_methods wenn Nutzer mehrere Methoden im UI gewählt hat.
-- Nötig weil cjson []→{} Round-Trip required_methods als leeres Objekt speichert.
if #required == 0 and type(body.selected_methods) == "table" and #body.selected_methods > 1 then
  required = body.selected_methods
  d.required_methods = required   -- in Datei speichern für Folgecalls
end

local has_multi = #required > 0

-- Duplikat-Prüfung (ersetzt alte "already_verified"-Sperre im Multi-Method-Modus)
for _, m in ipairs(completed) do
  if m == method then
    ngx.status = 409; ngx.say('{"error":"method_already_completed"}'); return
  end
end

if has_multi then
  -- ── Multi-Method-Flow ────────────────────────────────────────────────────────
  local in_required = false
  for _, m in ipairs(required) do if m == method then in_required = true; break end end
  if not in_required then
    ngx.status = 400; ngx.say('{"error":"method_not_required"}'); return
  end

  if verified then
    table.insert(completed, method)
    d.completed_methods = completed
    d.score  = totalScore(d, completed)
    d.is_2fa = d.is_2fa or is_2fa
    d.method = method
    -- Konsensus-Layer: pro-Methode Ergebnis tracken
    local results = type(d.method_results) == "table" and d.method_results or {}
    table.insert(results, { method = method, verified = true, timestamp = verified_at })
    d.method_results = results

    -- Alle required_methods abgeschlossen → Challenge verifiziert
    local all_done = true
    for _, req in ipairs(required) do
      local found = false
      for _, comp in ipairs(completed) do if comp == req then found = true; break end end
      if not found then all_done = false; break end
    end
    if all_done then
      d.verified_at = verified_at
      mark_token_verified(soul_id, d.triggering_token)
      local pol_ok, pol_short, pol_checked = verify_policy_ok(soul_id, d.triggering_token, d.purpose, d, completed)
      d.policy_checked = pol_checked
      if pol_ok then
        d.status = "verified"
      else
        d.status          = "policy_not_met"
        d.policy_shortfall = pol_short
      end
    end
  end
  -- Fehlgeschlagen: nichts speichern, Phase bleibt pending → retry möglich

else
  -- ── Einzel-Methoden-Flow ─────────────────────────────────────────────────
  -- War früher "einmalig, dann für immer gesperrt" (status~=pending → 409),
  -- und hat bei jeder Methode completed_methods/score komplett überschrieben
  -- statt akkumuliert. Bug: eine zweite, separat abgeschlossene Methode (z.B.
  -- Face nach Fingerprint, ohne dass beide vorab als required_methods gewählt
  -- wurden) hat den Score der ersten Methode verloren — sichtbar am UI, das
  -- clientseitig beide Methoden als erledigt zeigte, aber der Server nur den
  -- Score der zuletzt eingereichten Methode meldete. Jetzt: jede zusätzlich
  -- verifizierte, noch nicht abgeschlossene Methode akkumuliert auf
  -- completed_methods/score (Duplikate sind durch die Prüfung weiter oben
  -- schon ausgeschlossen) — konsistent mit dem Multi-Method-Flow oben und dem
  -- Datei-Kommentar "Score = #completed_methods".
  if verified then
    table.insert(completed, method)
    d.completed_methods = completed
    d.score       = totalScore(d, completed)
    d.verified_at = verified_at
    d.method      = method
    d.is_2fa      = d.is_2fa or is_2fa
    mark_token_verified(soul_id, d.triggering_token)
    local pol_ok, pol_short, pol_checked = verify_policy_ok(soul_id, d.triggering_token, d.purpose, d, completed)
    d.policy_checked = pol_checked
    if pol_ok then
      d.status = "verified"
    else
      d.status          = "policy_not_met"
      d.policy_shortfall = pol_short
    end
  elseif d.status == "pending" then
    d.status      = "failed"
    d.verified_at = verified_at
    d.method      = method
    d.is_2fa      = is_2fa
  end
end

-- Kontinuitäts-Kette: jede erfolgreiche Verifikation wird als eigenes Glied
-- angehängt (siehe chain_lib.lua + verify-identity-hq-plan.md). Bewusst
-- fire-and-forget — ein Kette-Schreibfehler darf die eigentliche
-- Verifikation nicht blockieren, die läuft über das bestehende
-- completed_methods/score-System unabhängig weiter.
if verified then
  local ok_chain, chain = pcall(require, "chain_lib")
  if not ok_chain then
    ngx.log(ngx.ERR, "[verify_complete] chain_lib require fehlgeschlagen: ", tostring(chain))
  else
    local CONFIDENCE = { face_hq = "high", voice_hq = "high" }
    local ok_append, link_or_err, append_err = pcall(chain.append, soul_id, "continuity", method, CONFIDENCE[method] or "medium", challenge_id)
    if not ok_append then
      ngx.log(ngx.ERR, "[verify_complete] chain.append warf einen Fehler: ", tostring(link_or_err))
    elseif not link_or_err then
      ngx.log(ngx.ERR, "[verify_complete] chain.append fehlgeschlagen: ", tostring(append_err))
    end
  end
end

local ok_e, updated = pcall(cjson.encode, d)
if not ok_e then ngx.status = 500; ngx.say('{"error":"encode_failed"}'); return end
local fw = io.open(fpath, "w")
if not fw then ngx.status = 500; ngx.say('{"error":"write_failed"}'); return end
fw:write(updated); fw:close()

ngx.say(cjson.encode({
  ok                = true,
  challenge_id      = challenge_id,
  verified          = verified,
  method            = method,
  verified_at       = verified_at,
  score             = d.score,
  is_2fa            = d.is_2fa,
  status            = d.status,
  policy_checked    = d.policy_checked,     -- true = eine echte Tier-Bewertung lief
  policy_shortfall  = d.policy_shortfall,   -- gesetzt bei status == "policy_not_met"
  completed_methods = d.completed_methods,
  all_done          = d.status == "verified",
}))
