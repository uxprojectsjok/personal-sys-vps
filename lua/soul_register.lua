-- /etc/openresty/lua/soul_register.lua
-- POST /api/soul/register
-- Auth: vault_auth.lua (soul_cert)
-- Pinnt soul_meta JSON zu IPFS via Pinata (ERC-8004 Agent-Discovery).
-- Speichert CID in api_context.json als agent_registry_cid.
-- Kein Anker erforderlich — Registrierung ist unabhängig vom Blockchain-Status.

local cjson = require("cjson.safe")
local http  = require("resty.http")
local cfg   = require("config_reader")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local soul_id = ngx.ctx.soul_id
if not soul_id then
  ngx.status = 401
  ngx.say('{"error":"Unauthorized"}')
  return
end
local api_key = cfg.get_anthropic_key(soul_id)

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"Method not allowed"}')
  return
end

-- Optionaler Body: name_override, description, tags
ngx.req.read_body()
local body_raw = ngx.req.get_body_data() or "{}"
local ok_b, body_in = pcall(cjson.decode, body_raw)
if not ok_b then body_in = {} end
local name_override = (type(body_in.name_override) == "string" and #body_in.name_override > 0)
  and body_in.name_override or nil
local description = (type(body_in.description) == "string" and #body_in.description > 0)
  and body_in.description or nil
-- Tags aus Body (Priorität) — Fallback auf soul_chain_anchor (wird weiter unten gesetzt)
local body_tags = nil
if type(body_in.tags) == "table" then
  local clean = setmetatable({}, cjson.array_mt)
  for _, t in ipairs(body_in.tags) do
    if type(t) == "string" and #t > 0 and #t <= 60 then clean[#clean + 1] = t end
  end
  if #clean > 0 then body_tags = clean end
end

local SOULS_DIR = "/var/lib/sys/souls/"
local ctx_file  = SOULS_DIR .. soul_id .. "/api_context.json"

-- api_context.json lesen
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

local amort = ctx.amortization

-- soul_meta direkt hier zusammenbauen (wie soul_meta.lua)
local sys_path = SOULS_DIR .. soul_id .. "/sys.md"
local sf = io.open(sys_path, "r")
local name, created_at, version, maturity
local anchor_tags = setmetatable({}, cjson.array_mt)

if sf then
  local raw = sf:read("*a"); sf:close()
  if raw:sub(1, 2) ~= "SY" then  -- fängt SYSCRYPT01 und SYS\x01 gleichermaßen ab
    local front = raw:match("^%-%-%-\n(.-)%-%-%-")
    if front then
      name       = front:match("soul_name:%s*(.-)%s*\n")
      created_at = front:match("created:%s*(.-)%s*\n") or front:match("created_at:%s*(.-)%s*\n")
      version    = front:match("version:%s*(.-)%s*\n")
      maturity   = tonumber(front:match("maturity:%s*(.-)%s*\n"))
      -- Kanonische Tags aus soul_chain_anchor lesen (gesetzt beim Blockchain-Anker)
      local anchor_raw = front:match("soul_chain_anchor:%s*(.-)%s*\n")
      if anchor_raw then
        local ok_a, anchor_obj = pcall(cjson.decode, anchor_raw)
        if ok_a and type(anchor_obj) == "table" and type(anchor_obj.tags) == "table" then
          for _, t in ipairs(anchor_obj.tags) do
            if type(t) == "string" and #t > 0 then
              anchor_tags[#anchor_tags + 1] = t
            end
          end
        end
      end
    end
  end
end

-- Erlaubte Tools (muss mit AgentMarketplacePanel.AVAILABLE_TOOLS und registerPaidTools() übereinstimmen)
-- soul_discover: immer frei. soul_write/soul_earnings: nur für Owner, nicht für externe Agenten.
local ALLOWED_TOOLS = {
  soul_read=true, soul_maturity=true, soul_skills=true,
  audio_get=true, audio_list=true, image_get=true, image_list=true,
  video_get=true, video_list=true, context_get=true, context_list=true,
  profile_get=true, calendar_read=true, verify_human=true,
  health_check_payed=true, shop_write_read=true,
}
local function filter_tools(tbl)
  if type(tbl) ~= "table" then return setmetatable({}, cjson.array_mt) end
  local out = setmetatable({}, cjson.array_mt)
  for _, v in ipairs(tbl) do
    if ALLOWED_TOOLS[v] then out[#out+1] = v end
  end
  return out
end

local host = ngx.var.host or "unknown"
local base_url = "https://" .. host
local meta = {
  soul_id        = soul_id,
  name           = name_override or name or "Unknown",
  schema         = "saveyoursoul/soul/1.0",
  encrypted      = (name == nil),
  api_enabled    = ctx.enabled == true,
  public_vault   = false,
  mcp_endpoint   = base_url .. "/mcp?soul_id=" .. soul_id,
  soul_endpoint  = base_url .. "/api/soul/meta?soul_id=" .. soul_id,
  verify_endpoint = base_url .. "/api/soul/verify?soul_id=" .. soul_id,
  pay_endpoint   = base_url .. "/api/soul/pay",
  price_endpoint = base_url .. "/api/soul/price",
  earnings_endpoint = base_url .. "/api/soul/earnings",
}
if created_at   then meta.created      = created_at   end
if version      then meta.version      = version      end
if maturity     then meta.maturity     = maturity     end

-- Tags: Body hat Priorität, Fallback auf soul_chain_anchor
local final_tags = body_tags or (#anchor_tags > 0 and anchor_tags or nil)

-- ── Übersetzung Description + Tags → Englisch (Claude Haiku) ─────────────────
local translate_desc = description
local translate_tags = final_tags

local has_text = (type(description) == "string" and #description > 0)
  or (type(final_tags) == "table" and #final_tags > 0)

if has_text and api_key ~= "" then
  local tags_str = ""
  if type(final_tags) == "table" and #final_tags > 0 then
    tags_str = table.concat(final_tags, ", ")
  end

-- PROMPT_START: translate_batch
  local TRANSLATE_BATCH_TEMPLATE = [[Translate the following fields to English. Reply ONLY with a JSON object, no explanation.

{"description":"...","tags":"..."}

Rules:
- Keep proper nouns (city names, brand names, person names) as-is
- If already English, return unchanged
- tags: comma-separated, concise English keywords
- Return exactly: {"description":"...","tags":"..."}]]
-- PROMPT_END: translate_batch

  local translate_prompt = 'Translate the following fields to English. Reply ONLY with a JSON object, no explanation.\n\n'
    .. '{"description":"' .. (description or ""):gsub('"', '\\"') .. '","tags":"' .. tags_str:gsub('"', '\\"') .. '"}\n\n'
    .. 'Rules:\n'
    .. '- Keep proper nouns (city names, brand names, person names) as-is\n'
    .. '- If already English, return unchanged\n'
    .. '- tags: comma-separated, concise English keywords\n'
    .. '- Return exactly: {"description":"...","tags":"..."}'

  local ok_tr, tr_body = pcall(cjson.encode, {
    model      = "claude-haiku-4-5",
    max_tokens = 200,
    messages   = {{ role = "user", content = translate_prompt }},
  })

  if ok_tr then
    local tr_httpc = http.new()
    tr_httpc:set_timeout(10000)
    local tr_res = tr_httpc:request_uri("https://api.anthropic.com/v1/messages", {
      method  = "POST",
      ssl_verify = true,
      headers = {
        ["Content-Type"]      = "application/json",
        ["x-api-key"]         = api_key,
        ["anthropic-version"] = "2023-06-01",
      },
      body = tr_body,
    })
    if tr_res and tr_res.status == 200 then
      local ok_r, tr_resp = pcall(cjson.decode, tr_res.body)
      if ok_r and type(tr_resp) == "table" and type(tr_resp.content) == "table" and tr_resp.content[1] then
        local tr_text = tr_resp.content[1].text or ""
        local json_str = tr_text:match("%b{}")
        if json_str then
          local ok_j, tr_data = pcall(cjson.decode, json_str)
          if ok_j and type(tr_data) == "table" then
            if type(tr_data.description) == "string" and #tr_data.description > 0 then
              translate_desc = tr_data.description
            end
            if type(tr_data.tags) == "string" and #tr_data.tags > 0 then
              local translated_tags = setmetatable({}, cjson.array_mt)
              for tag in tr_data.tags:gmatch("[^,]+") do
                local t = tag:match("^%s*(.-)%s*$")
                if #t > 0 then translated_tags[#translated_tags + 1] = t end
              end
              if #translated_tags > 0 then translate_tags = translated_tags end
            end
          end
        end
      end
    end
  end
end

if translate_desc then meta.description = translate_desc end
if translate_tags then meta.tags        = translate_tags end
if type(amort) == "table" then
  local no_tools  = setmetatable({}, cjson.array_mt)
  local days      = math.max(1, math.min(30, math.floor(tonumber(amort.token_duration_days) or 1)))
  local base_price = tonumber(amort.pol_per_request) or 0.001
  local dynamic    = amort.dynamic_pricing == true
  local pol_current = string.format("%.4f", base_price)

  if dynamic then
    local ANCHOR_COEFF = 0.1; local AGE_COEFF = 0.01; local DEMAND_COEFF = 0.05
    local pf = io.open("/var/lib/sys/config/pricing_params.json", "r")
    if pf then
      local ok_p, p = pcall(require("cjson.safe").decode, pf:read("*a")); pf:close()
      if ok_p and type(p) == "table" then
        ANCHOR_COEFF = tonumber(p.anchor_coeff)  or ANCHOR_COEFF
        AGE_COEFF    = tonumber(p.age_coeff)     or AGE_COEFF
        DEMAND_COEFF = tonumber(p.demand_coeff)  or DEMAND_COEFF
      end
    end
    local anchor_count = 0; local chain_age_days = 0; local buyers_30d = 0
    local ah = io.open(SOULS_DIR .. soul_id .. "/anchor_history.json", "r")
    if ah then
      local ok_a, hist = pcall(require("cjson.safe").decode, ah:read("*a")); ah:close()
      if ok_a and type(hist) == "table" then
        anchor_count = #hist
        if hist[1] and type(hist[1].ts) == "string" then
          local y,mo,d,h,mi,s = hist[1].ts:match("^(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
          if y then
            local ref = ngx.time(); local utc_t = os.date("!*t", ref)
            local tz_off = ref - os.time(utc_t)
            local genesis = os.time({ year=tonumber(y), month=tonumber(mo), day=tonumber(d),
              hour=tonumber(h), min=tonumber(mi), sec=tonumber(s), isdst=false }) + tz_off
            chain_age_days = (ngx.time() - genesis) / 86400
          end
        end
      end
    end
    local df = io.open(SOULS_DIR .. soul_id .. "/demand_log.json", "r")
    if df then
      local ok_d, dlog = pcall(require("cjson.safe").decode, df:read("*a")); df:close()
      if ok_d and type(dlog) == "table" then
        local cutoff = ngx.time() - 30 * 86400
        for _, e in ipairs(dlog) do
          if type(e) == "table" and (tonumber(e.ts) or 0) > cutoff then buyers_30d = buyers_30d + 1 end
        end
      end
    end
    if anchor_count > 0 or buyers_30d > 0 then
      local mult  = 1 + (anchor_count * ANCHOR_COEFF) + (chain_age_days * AGE_COEFF) + (buyers_30d * DEMAND_COEFF)
      local price = math.max(base_price, math.floor(base_price * mult * 10000 + 0.5) / 10000)
      pol_current = string.format("%.4f", price)
    end
  end

  local paypal_target = (amort.paypal_link and amort.paypal_link ~= "") and amort.paypal_link
                      or (amort.paypal_email or "")

  meta.amortization = {
    enabled              = amort.enabled == true,
    private              = amort.private == true,
    pol_per_request      = amort.pol_per_request,
    pol_current          = pol_current,
    dynamic_pricing      = dynamic,
    wallet               = amort.wallet,
    agent_tools          = (amort.enabled == true)
                           and filter_tools(amort.agent_tools or amort.free_tools) or no_tools,
    token_duration_days  = days,
    paypal_enabled       = amort.paypal_enabled == true,
    paypal_target        = paypal_target,
    price_eur            = amort.price_eur,
  }
end

-- Pinata-Pinning via MCP-internem Endpoint
local httpc = http.new()
httpc:set_timeout(20000)

local pin_body = cjson.encode({ soul_id = soul_id, meta = meta })
local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/pin-json", {
  method  = "POST",
  body    = pin_body,
  headers = { ["Content-Type"] = "application/json", ["Accept"] = "application/json" },
})

if not res or err then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "IPFS-Pinning fehlgeschlagen", detail = tostring(err) }))
  return
end

local ok_p, pdata = pcall(cjson.decode, res.body or "")
if not ok_p or type(pdata) ~= "table" then
  ngx.status = 502
  ngx.say('{"error":"Ungültige Antwort vom Pinning-Dienst"}')
  return
end

if res.status ~= 200 or pdata.ok ~= true then
  ngx.status = res.status
  ngx.say(cjson.encode({
    error   = pdata.error or "pinning_failed",
    message = pdata.message or "IPFS-Pinning nicht möglich",
    detail  = pdata,
  }))
  return
end

-- CID + übersetzte Metadaten in api_context.json persistieren
ctx.agent_registry_cid    = pdata.cid
ctx.agent_registry_url    = pdata.gateway_url
ctx.agent_registered_at   = pdata.pinned_at
ctx.updated_at            = ngx.now()
if type(translate_desc) == "string" and #translate_desc > 0 then
  ctx.description = translate_desc
end
if type(translate_tags) == "table" and #translate_tags > 0 then
  ctx.tags = translate_tags
end

local wf = io.open(ctx_file, "w")
if wf then wf:write(cjson.encode(ctx)); wf:close() end

ngx.say(cjson.encode({
  ok             = true,
  cid            = pdata.cid,
  ipfs_uri       = pdata.ipfs_uri,
  gateway_url    = pdata.gateway_url,
  pinned_at      = pdata.pinned_at,
  soul_id        = soul_id,
  note           = "Soul ist jetzt via IPFS für KI-Agenten auffindbar. CID in api_context.json gespeichert.",
}))
