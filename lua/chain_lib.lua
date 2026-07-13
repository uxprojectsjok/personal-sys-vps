-- /etc/openresty/lua/chain_lib.lua
-- Kontinuitäts-Kette: Speicherung, Anhängen, Stufen-Prüfung.
-- Volle Herleitung: verify-identity-hq-plan.md (Vault-Kontext dieser Soul).
--
-- Bewusst vereinfacht gegenüber der Papier-Architektur, nach der "am Ende
-- einfach"-Leitplanke aus dem Plan-Dokument:
--  - Kette liegt als Klartext-JSON neben anchor_history.json/chain_anchor.json
--    im Soul-Verzeichnis, NICHT Vault-verschlüsselt. Konsistent mit dem
--    bestehenden Muster dieses Projekts: Metadaten (Hashes, Zeitstempel,
--    Glied-Typen) liegen plaintext, nur die Rohdaten selbst (Fotos, Audio)
--    sind Vault-verschlüsselt und werden nie in die Kette kopiert — nur per
--    evidence_ref referenziert.
--  - Nur Server-Signatur (HMAC via SOUL_MASTER_KEY, gleiches Muster wie
--    soul_cert in hmac_helper.lua). Die im Plan skizzierte Wallet-Co-Signatur
--    für Anchor-Glieder kommt erst, wenn ein echter Anchor-Typ (z.B. IDV)
--    gebaut wird — für face_hq/voice_hq (beides Continuity) unnötig.
--  - On-Chain-Checkpointing (Kettenspitzen-Hash huckepack auf regulären
--    Anchor-Events) ist noch NICHT angebunden — dieses Modul verwaltet nur
--    die lokale Kette. Folgt in einem späteren Schritt.

local cjson   = require("cjson.safe")
local hmac    = require("hmac_helper")
local cfg     = require("config_reader")
local sha256  = require("resty.sha256")
local rstr    = require("resty.string")
local random  = require("resty.random")

local M = {}
local SOULS_DIR = "/var/lib/sys/souls/"

local function chain_path(soul_id)
  return SOULS_DIR .. soul_id .. "/chain.json"
end

local function active_key(soul_id)
  local per_soul_key = cfg.get_soul_master_key(soul_id)
  local master_key   = cfg.get_master_key()
  return (per_soul_key and per_soul_key ~= "") and per_soul_key or master_key
end

local function plain_hash(s)
  local h = sha256:new(); h:update(s)
  return rstr.to_hex(h:final())
end

function M.load(soul_id)
  local f = io.open(chain_path(soul_id), "r")
  if not f then return {} end
  local raw = f:read("*a"); f:close()
  local ok, data = pcall(cjson.decode, raw)
  if ok and type(data) == "table" then return data end
  return {}
end

local function save(soul_id, chain)
  local ok, encoded = pcall(cjson.encode, chain)
  if not ok then return false end
  local f = io.open(chain_path(soul_id), "w")
  if not f then return false end
  f:write(encoded); f:close()
  return true
end

-- Deterministische Feldreihenfolge für Hash/Signatur.
local function canonical(link)
  return table.concat({
    link.link_id, link.prev_link_hash or "", link.category,
    link.attestation_type, link.timestamp, link.confidence or "",
    link.evidence_ref or "",
  }, "|")
end

-- Fügt ein neues Glied an. category: "anchor" | "continuity" | "ownership_transfer" | "revocation".
-- evidence_ref: Zeiger auf den Beleg (z.B. challenge_id) — nie Rohdaten selbst.
-- Gibt das neue Glied zurück, oder nil + Fehlergrund.
function M.append(soul_id, category, attestation_type, confidence, evidence_ref)
  local key = active_key(soul_id)
  if key == "" then return nil, "no_master_key" end

  local chain = M.load(soul_id)
  local prev  = chain[#chain]
  local id_bytes = random.bytes(16, true)

  -- "" statt cjson.null für fehlende Werte: cjson.null ist Userdata (ein
  -- Sentinel für "im JSON explizit null"), kein echtes Lua-nil — `x or ""`
  -- würde nie greifen, weil Userdata truthy ist. table.concat in canonical()
  -- verlangt aber echte Strings.
  local link = {
    link_id           = rstr.to_hex(id_bytes),
    prev_link_hash    = (prev and prev.link_hash) or "",
    category          = category,
    attestation_type  = attestation_type,
    timestamp         = os.date("!%Y-%m-%dT%TZ", math.floor(ngx.now())),
    confidence        = confidence or "medium",
    evidence_ref      = evidence_ref or "",
  }
  link.server_signature = hmac.sign(key, canonical(link))
  link.link_hash         = plain_hash(canonical(link) .. "|" .. link.server_signature)

  table.insert(chain, link)
  if not save(soul_id, chain) then return nil, "save_failed" end
  return link
end

-- Erklärt ein Glied für ungültig, ohne es zu löschen — neues revocation-Glied,
-- dessen evidence_ref auf die link_id des kompromittierten Glieds zeigt.
function M.revoke(soul_id, link_id, reason)
  return M.append(soul_id, "revocation", "revocation", "high", link_id .. (reason and (":" .. reason) or ""))
end

-- ── Anchor-PoC: Selbst-Zahlung als Anker (siehe verify-identity-hq-plan.md) ────
-- Grundidee: der Soul-Owner zahlt sich selbst einen kleinen, eindeutigen Betrag
-- (z.B. via PayPal) — der Wert des Ankers kommt nicht aus einer "Identitäts-
-- Entdeckung" (der Owner kennt seinen eigenen Namen ja schon), sondern aus einer
-- echten, KYC-geprüften Transaktion, die Sybil-Angriffe verteuert. Bewusst
-- generisch gehalten: "kind" (z.B. "paypal_transfer", später "sepa_transfer")
-- ist der einzige anbieterspezifische Teil, der Rest des Flows ist identisch.
local PENDING_TTL = 2 * 3600  -- 2h — reicht für den KI-gesteuerten Bezahl-und-Bestätigen-Flow

local function pending_path(soul_id)
  return SOULS_DIR .. soul_id .. "/pending_anchor.json"
end

local function random_reference_code()
  local bytes = random.bytes(4, true)
  return rstr.to_hex(bytes):upper():sub(1, 6)
end

-- Erzeugt eine offene Anker-Anfrage: Referenzcode + leicht variierter Betrag
-- (Basis + Zufalls-Cent-Betrag), damit mehrere gleichzeitige Anfragen anhand
-- des überwiesenen Betrags allein schon unterscheidbar sind.
function M.createPendingAnchor(soul_id, kind, base_amount)
  local cents  = random.bytes(1, true):byte(1) % 100
  local amount = math.floor((base_amount + cents / 100) * 100 + 0.5) / 100
  local pending = {
    reference_code = random_reference_code(),
    kind           = kind,
    amount         = amount,
    created_at     = ngx.time(),
    expires_at     = ngx.time() + PENDING_TTL,
  }
  local ok, encoded = pcall(cjson.encode, pending)
  if not ok then return nil, "encode_failed" end
  local f = io.open(pending_path(soul_id), "w")
  if not f then return nil, "write_failed" end
  f:write(encoded); f:close()
  return pending
end

function M.loadPendingAnchor(soul_id)
  local f = io.open(pending_path(soul_id), "r")
  if not f then return nil end
  local raw = f:read("*a"); f:close()
  local ok, data = pcall(cjson.decode, raw)
  if ok and type(data) == "table" then return data end
  return nil
end

-- Bestätigt eine offene Anker-Anfrage anhand des Referenzcodes und hängt bei
-- Erfolg ein "anchor"-Kettenglied an. evidence_ref bewusst NUR der Referenzcode
-- (kein Klartext-Zahlername/Transaktions-ID in der Kette — die liegen, falls
-- gebraucht, außerhalb der Kette, analog zu Fotos/Audio bei face_hq/voice_hq).
--
-- Confidence-Stufen (bewusst niedriger als IDV/SEPA — Selbstzahlung ist ein
-- leichtgewichtiger PoC-Anker, kein unabhängig geprüfter Ausweis/Bankbeleg):
--   "medium" — normale automatisierte Bestätigung, Betrag stimmt mit Toleranz
--   "low"    — human_override: der Mensch bestätigt trotz gescheitertem/
--              übersprungenem automatischem Abgleich manuell im Chat. Bewusst
--              schwächer vertraut als der automatisierte Weg (evidence_ref
--              trägt ":override"-Marker für Nachvollziehbarkeit).
function M.confirmPendingAnchor(soul_id, reference_code, amount, opts)
  opts = opts or {}
  local pending = M.loadPendingAnchor(soul_id)
  if not pending then return nil, "no_pending_anchor" end
  if pending.reference_code ~= reference_code then return nil, "reference_mismatch" end
  if ngx.time() > pending.expires_at then return nil, "expired" end

  local confidence = "medium"
  local evidence    = pending.reference_code

  if opts.human_override then
    confidence = "low"
    evidence   = evidence .. ":override"
  else
    -- Toleranz von 1 Cent für Rundungsdifferenzen beim Zahlungsanbieter.
    if amount and math.abs(amount - pending.amount) > 0.01 then return nil, "amount_mismatch" end
  end

  local link, err = M.append(soul_id, "anchor", pending.kind, confidence, evidence)
  if not link then return nil, err end

  os.remove(pending_path(soul_id))
  return link
end

-- ── Stufen-Prüfung ────────────────────────────────────────────────────────────
local ANCHOR_TYPES = {
  idv_document = true, sim_verification = true, sepa_transfer = true,
  eudi_wallet = true, eid_chip = true, paypal_transfer = true,
}
local CONTINUITY_TYPES = {
  face_hq = true, voice_hq = true, face = true, voice = true, fingerprint = true,
  longmem_interview = true, peer_vouch = true, passkey_wallet = true,
}

-- Gleiches Zeit-Umrechnungsmuster wie soul_price.lua (chain_age_days).
local function daysAgo(iso_ts)
  local y, mo, d, h, mi, s = iso_ts:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
  if not y then return math.huge end
  local ref     = ngx.time()
  local utc_t   = os.date("!*t", ref)
  local tz_off  = ref - os.time(utc_t)
  local link_ts = os.time({
    year=tonumber(y), month=tonumber(mo), day=tonumber(d),
    hour=tonumber(h), min=tonumber(mi), sec=tonumber(s), isdst=false,
  }) + tz_off
  return (ngx.time() - link_ts) / 86400
end

local function isRevoked(chain, link_id)
  for _, l in ipairs(chain) do
    if l.category == "revocation" and type(l.evidence_ref) == "string"
       and l.evidence_ref:sub(1, #link_id) == link_id then
      return true
    end
  end
  return false
end

-- Fasst die Kette zusammen: frischestes Kontinuitäts-Glied (Tage), ob/wie
-- frisch ein Anker existiert, Anzahl unabhängiger Anker-Typen.
function M.summarize(soul_id)
  local chain = M.load(soul_id)
  local freshestContinuity, freshestAnchor = math.huge, math.huge
  local anyAnchor, anchorTypes = false, {}

  for _, l in ipairs(chain) do
    if not isRevoked(chain, l.link_id) then
      local age = daysAgo(l.timestamp)
      if CONTINUITY_TYPES[l.attestation_type] and age < freshestContinuity then
        freshestContinuity = age
      end
      -- "low"-Confidence-Anker (human_override, siehe confirmPendingAnchor)
      -- zählen bewusst NICHT für die Stufen-Berechnung — ein per Override
      -- unbestätigter Anker darf die Sicherheit der Kette nicht heben.
      if ANCHOR_TYPES[l.attestation_type] and l.confidence ~= "low" then
        anyAnchor = true
        if age < freshestAnchor then freshestAnchor = age end
        anchorTypes[l.attestation_type] = true
      end
    end
  end

  local anchorTypeCount = 0
  for _ in pairs(anchorTypes) do anchorTypeCount = anchorTypeCount + 1 end

  return {
    chain_length          = #chain,
    freshest_continuity_days = freshestContinuity,
    any_anchor             = anyAnchor,
    freshest_anchor_days    = freshestAnchor,
    independent_anchor_types = anchorTypeCount,
  }
end

-- tier: "low" | "medium" | "high" — siehe Plan-Dokument, Abschnitt
-- "Bewertung: benannte Stufen statt Gewichtungs-Formel".
function M.gateCheck(soul_id, tier)
  local s = M.summarize(soul_id)
  if tier == "low" then
    return s.freshest_continuity_days < 30
  elseif tier == "medium" then
    return s.freshest_continuity_days < 7 and s.any_anchor
  elseif tier == "high" then
    return s.freshest_continuity_days < 1 and s.freshest_anchor_days < 365
           and s.independent_anchor_types >= 2
  end
  return false
end

return M
