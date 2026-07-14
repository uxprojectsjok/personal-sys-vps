-- food_log.lua
-- POST /api/food-log
-- Logs a rated food entry to health.md and handles monthly rollover.
-- On month change: archives the old month to ## Annual Journal, resets ## Food Log.
-- Auth: vault_auth (soul_cert Bearer or webhook_token)

local cjson        = require "cjson.safe"
local resty_aes    = require "resty.aes"
local resty_random = require "resty.random"

local MAGIC = "SYS\x01"  -- 4 Magic-Bytes, kompatibel mit api_serve.lua / api_context.lua

local function hex_to_bin(hex)
  return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
end

local function decrypt_content(data, vault_key_hex)
  if not data or data == "" then return data end
  if data:sub(1, 4) ~= MAGIC then return data end
  if not vault_key_hex or #vault_key_hex ~= 64 then return nil end
  local iv = data:sub(5, 20)
  local ciphertext = data:sub(21)
  local key = hex_to_bin(vault_key_hex)
  local aes_ctx = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return nil end
  return aes_ctx:decrypt(ciphertext)
end

local function encrypt_content(plaintext, vault_key_hex)
  if not vault_key_hex or #vault_key_hex ~= 64 then return nil end
  local iv = resty_random.bytes(16, true)
  if not iv then return nil end
  local key = hex_to_bin(vault_key_hex)
  local aes_ctx = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return nil end
  local ciphertext = aes_ctx:encrypt(plaintext)
  if not ciphertext then return nil end
  return MAGIC .. iv .. ciphertext
end

local soul_id = ngx.ctx.soul_id
if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "unauthorized" }))
  return
end

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "method not allowed" }))
  return
end

ngx.req.read_body()
local raw = ngx.req.get_body_data()
local ok, body = pcall(cjson.decode, raw or "")
if not ok or type(body) ~= "table" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "invalid json" }))
  return
end

local name   = tostring(body.name   or ""):gsub("[\n\r]", " "):match("^%s*(.-)%s*$")
local rating = tostring(body.rating or "C"):upper():sub(1, 1)
local notes  = tostring(body.notes  or ""):gsub("[\n\r]", " "):match("^%s*(.-)%s*$")

if not rating:match("^[ABCDE]$") then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "rating must be A, B, C, D or E" }))
  return
end

if name == "" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "name is required" }))
  return
end

-- ── File path ─────────────────────────────────────────────────────────────────
local health_path = "/var/lib/sys/souls/" .. soul_id .. "/vault/context/health.md"

-- ── Read health.md (entschlüsseln falls verschlüsselt abgelegt) ──────────────
local fh = io.open(health_path, "rb")
local raw_content = fh and fh:read("*a") or ""
if fh then fh:close() end

local content = decrypt_content(raw_content, ngx.ctx.vault_key)
if content == nil then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "health.md verschlüsselt, aber Vault-Key nicht verfügbar" }))
  return
end

-- ── Current date / month ──────────────────────────────────────────────────────
local today         = os.date("%Y-%m-%d")
local current_month = os.date("%Y-%m")

-- ── Build entry line ──────────────────────────────────────────────────────────
local new_entry = notes ~= "" and
  string.format("- %s | %s | %s — %s", today, rating, name, notes) or
  string.format("- %s | %s | %s", today, rating, name)

-- ── Parse health.md into three zones ─────────────────────────────────────────
-- head_part      : everything before ## Food Log (weekly/monthly health data)
-- food_lines     : lines inside ## Food Log
-- annual_lines   : lines inside ## Annual Journal

local head_part    = ""
local food_lines   = {}
local annual_lines = {}
local zone = "head"

for line in (content .. "\n"):gmatch("([^\n]*)\n") do
  if line == "## Food Log" then
    zone = "food"
  elseif line == "## Annual Journal" then
    zone = "annual"
  elseif zone == "head" then
    head_part = head_part .. line .. "\n"
  elseif zone == "food" then
    table.insert(food_lines, line)
  else
    table.insert(annual_lines, line)
  end
end

head_part = head_part:gsub("%s+$", "")  -- strip trailing whitespace

-- ── Sort food entries by month ────────────────────────────────────────────────
local this_month = {}   -- entries for current month
local past        = {}  -- { [month_str] = { line, ... } }

for _, line in ipairs(food_lines) do
  local month_str = line:match("^%- (%d%d%d%d%-%d%d)%-%d%d |")
  if month_str then
    if month_str == current_month then
      table.insert(this_month, line)
    else
      if not past[month_str] then past[month_str] = {} end
      table.insert(past[month_str], line)
    end
  end
end

-- ── Archive past months → Annual Journal summaries ───────────────────────────
local archived_months = {}
local new_summaries   = {}

for month_str, lines in pairs(past) do
  table.insert(archived_months, month_str)
  local counts    = { A=0, B=0, C=0, D=0, E=0 }
  local top_meals = {}
  local week_groups = {}
  local week_order  = {}

  for _, l in ipairs(lines) do
    local r = l:match("| ([ABCDE]) |")
    if r then
      counts[r] = (counts[r] or 0) + 1
      if r == "A" or r == "B" then
        local meal = l:match("| [ABCDE] | (.+)") or ""
        local dash = meal:find(" — ", 1, true)
        if dash then meal = meal:sub(1, dash - 1) end
        meal = meal:match("^%s*(.-)%s*$")
        if meal ~= "" then table.insert(top_meals, meal) end
      end
    end
    -- ISO week grouping
    local dy, dm, dd = l:match("^%- (%d%d%d%d)-(%d%d)-(%d%d) |")
    if dy then
      local ts = os.time({ year=tonumber(dy), month=tonumber(dm), day=tonumber(dd), hour=12 })
      local wk = os.date("%G-W%V", ts)
      if not week_groups[wk] then
        week_groups[wk] = { A=0, B=0, C=0, D=0, E=0, total=0 }
        table.insert(week_order, wk)
      end
      if r then
        week_groups[wk][r] = week_groups[wk][r] + 1
        week_groups[wk].total = week_groups[wk].total + 1
      end
    end
  end

  table.sort(week_order)
  local week_parts = {}
  for _, wk in ipairs(week_order) do
    local wg = week_groups[wk]
    if wg.total > 0 then
      local sc = (wg.A*5 + wg.B*4 + wg.C*3 + wg.D*2 + wg.E) / wg.total
      local wa = sc >= 4.5 and "A" or sc >= 3.5 and "B" or sc >= 2.5 and "C" or sc >= 1.5 and "D" or "E"
      local kw = wk:match("W(%d+)$") or wk
      table.insert(week_parts, string.format("KW%s:%s(%d)", kw, wa, wg.total))
    end
  end

  local total = counts.A + counts.B + counts.C + counts.D + counts.E
  if total > 0 then
    local score = (counts.A*5 + counts.B*4 + counts.C*3 + counts.D*2 + counts.E) / total
    local avg_ltr = score >= 4.5 and "A" or score >= 3.5 and "B" or score >= 2.5 and "C" or score >= 1.5 and "D" or "E"

    local seen = {}; local uniq = {}
    for _, m in ipairs(top_meals) do
      if not seen[m] then seen[m] = true; table.insert(uniq, m) end
    end
    local highlights = #uniq > 0 and table.concat(uniq, ", ") or "–"
    if #highlights > 70 then highlights = highlights:sub(1, 67) .. "…" end

    local week_line = #week_parts > 0 and ("\n- Weeks: " .. table.concat(week_parts, " · ")) or ""

    table.insert(new_summaries, {
      month = month_str,
      text  = string.format(
        "### %s\n- Food: %s (avg) — %d×A %d×B %d×C %d×D %d×E · %d entries%s\n- Top: %s",
        month_str, avg_ltr, counts.A, counts.B, counts.C, counts.D, counts.E, total, week_line, highlights
      )
    })
  end
end

-- Sort new summaries newest-first (they prepend the existing annual journal)
table.sort(new_summaries, function(a, b) return a.month > b.month end)
table.sort(archived_months)  -- for response info

-- ── Prepend new entry (newest first) ─────────────────────────────────────────
table.insert(this_month, 1, new_entry)

-- ── Reconstruct health.md ─────────────────────────────────────────────────────
local out = { head_part, "\n\n## Food Log" }

for _, line in ipairs(this_month) do
  table.insert(out, "\n" .. line)
end

table.insert(out, "\n\n## Annual Journal")

for _, s in ipairs(new_summaries) do
  table.insert(out, "\n" .. s.text)
end

-- Re-attach existing annual journal lines, skip leading blanks
local leading = true
for _, line in ipairs(annual_lines) do
  if leading and line == "" then
    -- skip
  else
    leading = false
    table.insert(out, "\n" .. line)
  end
end

local new_content = table.concat(out) .. "\n"

-- ── cipher_mode prüfen (ngx.ctx.vault_key sagt nichts über die Soul-Einstellung
-- aus, nur ob ein Key existiert) ─────────────────────────────────────────────
local cipher_mode = "ciphered"
local ctx_file = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
local cf = io.open(ctx_file, "r")
if cf then
  local craw = cf:read("*a"); cf:close()
  local cok, cctx = pcall(cjson.decode, craw)
  if cok and type(cctx) == "table" and cctx.cipher_mode then
    cipher_mode = cctx.cipher_mode
  end
end

local out_bytes = new_content
if cipher_mode == "ciphered" then
  local encrypted = encrypt_content(new_content, ngx.ctx.vault_key)
  if encrypted then out_bytes = encrypted end
end

-- ── Write back ────────────────────────────────────────────────────────────────
-- Ensure context dir exists
os.execute("mkdir -p /var/lib/sys/souls/" .. soul_id .. "/vault/context")

local wf = io.open(health_path, "wb")
if not wf then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "could not write health.md" }))
  return
end
wf:write(out_bytes)
wf:close()

-- ── Response ──────────────────────────────────────────────────────────────────
ngx.header["Content-Type"] = "application/json"
ngx.say(cjson.encode({
  ok          = true,
  entry       = new_entry,
  rolled_over = #archived_months > 0,
  archived    = #archived_months > 0 and archived_months or nil,
}))
