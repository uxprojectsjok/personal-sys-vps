#!/bin/bash
# SYS Agent Runner — runs via cron or on-demand, processes tasks from agent.md
# Usage: sys-agent-run.sh [soul_id]
#   With soul_id: runs for that soul only, bypasses enabled check (for "run now")
#   Without args: cron mode — iterates all enabled souls

set -euo pipefail

SOULS_DIR="/var/lib/sys/souls"
CONFIG_DIR="/var/lib/sys/config"
AGENT_DIR="/var/lib/sys/agent"
LOG_MASTER="/var/log/sys_agent.log"

# Source dir written by init.sh — resolves correctly on both dev and fresh installs
_SYS_DIR_FILE="/var/lib/sys/sys_dir"
WORK_DIR=""
if [[ -f "$_SYS_DIR_FILE" ]]; then
  WORK_DIR="$(tr -d '[:space:]' < "$_SYS_DIR_FILE")"
fi
[[ -z "$WORK_DIR" || ! -d "$WORK_DIR" ]] && WORK_DIR="/opt/sys"

# Resolve claude binary: sentinel file → PATH
CLAUDE_BIN=""
if [[ -f /var/lib/sys/claude_path ]]; then
  CLAUDE_BIN="$(cat /var/lib/sys/claude_path | tr -d '[:space:]')"
  [[ -x "$CLAUDE_BIN" ]] || CLAUDE_BIN=""
fi
if [[ -z "$CLAUDE_BIN" ]]; then
  CLAUDE_BIN="$(command -v claude 2>/dev/null || true)"
fi

# Force-mode: specific soul_id passed as first arg (from "run now" button)
FORCE_SOUL="${1:-}"

# Node-wide kill-switch (Settings → config → Autonomous Agent). Missing file
# defaults to enabled — matches the eu_consumer_rights/monetization_enabled flag pattern
# for installs predating this flag. Applies to force-run too: if the node owner
# turned this off, "run now" must not bypass it.
AUTONOMOUS_AGENT_FLAG="$CONFIG_DIR/autonomous_agent"
if [[ -f "$AUTONOMOUS_AGENT_FLAG" ]] && [[ "$(cat "$AUTONOMOUS_AGENT_FLAG" 2>/dev/null)" == "false" ]]; then
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] autonomous_agent disabled — exiting" >> "$LOG_MASTER"
  exit 0
fi

mkdir -p "$AGENT_DIR/.claude"

ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

run_soul() {
  local soul_id="$1"
  local soul_dir="$SOULS_DIR/$soul_id"
  local CONFIG_FILE="$CONFIG_DIR/agent_cron_${soul_id}.json"
  local AGENT_MD="$soul_dir/vault/context/agent.md"
  local LOG_FILE="/var/log/sys_agent_${soul_id}.log"
  local SHORT_ID="${soul_id:0:8}"

  # Truncate soul log at run start — file always contains only the last run
  > "$LOG_FILE" 2>/dev/null || true

  log_s() { echo "[$(ts)] $*" >> "$LOG_FILE"; echo "[$(ts)] [$SHORT_ID] $*" >> "$LOG_MASTER"; }

  # In cron mode check enabled flag; in force mode skip this
  if [[ -z "$FORCE_SOUL" ]]; then
    [[ -f "$CONFIG_FILE" ]] || { echo "[$(ts)] [$SHORT_ID] no config — skip" >> "$LOG_MASTER"; return; }
    local enabled
    enabled=$(python3 -c "import json; d=json.load(open('$CONFIG_FILE')); print(d.get('enabled',False))" 2>/dev/null || echo "False")
    if [[ "$enabled" != "True" ]]; then
      echo "[$(ts)] [$SHORT_ID] agent disabled — skip" >> "$LOG_MASTER"
      return
    fi
  fi

  log_s "=== Agent run: soul $soul_id ==="

  if [[ -z "$CLAUDE_BIN" ]]; then
    log_s "ERROR: claude not found (checked /var/lib/sys/claude_path and PATH)"
    return
  fi
  log_s "claude: $CLAUDE_BIN"

  if [[ ! -f "$AGENT_MD" ]]; then
    log_s "agent.md not found — idle"
    return
  fi

  # agent.md may be vault-encrypted on disk (cipher_mode "ciphered", e.g. after
  # passkey vault setup — SYS\x01-magic AES-256-CBC, see vault_fs.mjs). grep/Read
  # can't see through that, so decrypt to a scratch plaintext copy first; the
  # helper is a no-op passthrough for unciphered vaults (decryptIfNeeded checks
  # the magic bytes itself), so this is safe either way.
  local SCRATCH_DIR="$AGENT_DIR/scratch"
  mkdir -p "$SCRATCH_DIR"
  chmod 700 "$SCRATCH_DIR" 2>/dev/null || true
  local PLAIN_AGENT_MD="$SCRATCH_DIR/agent_${soul_id}.md"
  rm -f "$PLAIN_AGENT_MD"

  if ! node "$WORK_DIR/soul-mcp/scripts/agent_vault_ctx.mjs" decrypt "$soul_id" "$PLAIN_AGENT_MD" >>"$LOG_FILE" 2>&1; then
    log_s "ERROR: could not decrypt agent.md (vault key issue?) — skip"
    rm -f "$PLAIN_AGENT_MD"
    return
  fi
  chmod 600 "$PLAIN_AGENT_MD" 2>/dev/null || true

  # Detect pending tasks — supports both formats:
  #   checkbox:  - [ ] task
  #   section:   **Status:** open  (current, documented in soul-mcp/prompts/index.mjs)
  #              **Status:** offen | Status: offen | status: open | **Status:** aktiv  (legacy/German)
  local task_count=0
  task_count=$(grep -cE "^- \[ \]|\*\*Status:\*\* open|\*\*Status:\*\* offen|Status: offen|status: open|\*\*Status:\*\* aktiv" "$PLAIN_AGENT_MD" 2>/dev/null || true)

  if [[ "$task_count" -eq 0 ]]; then
    log_s "no pending tasks — idle"
    rm -f "$PLAIN_AGENT_MD"
    return
  fi

  log_s "$task_count pending task(s) found"

  # API key: soul config → master.json
  local API_KEY
  API_KEY="$(python3 -c "
import json
key = ''
try:
  d = json.load(open('$soul_dir/config.json'))
  key = d.get('anthropic_key', '')
except: pass
if not key:
  try:
    d = json.load(open('$CONFIG_DIR/master.json'))
    key = d.get('anthropic_key', '')
  except: pass
print(key)
" 2>/dev/null || echo "")"

  if [[ -z "$API_KEY" ]]; then
    log_s "ERROR: no anthropic_key — set in Settings → API tab"
    rm -f "$PLAIN_AGENT_MD"
    return
  fi
  log_s "API key: ok"

  export ANTHROPIC_API_KEY="$API_KEY"

  # MCP config (Zapier + SYS MCP) — written as --mcp-config file, NOT settings.json
  local MCP_URL SYS_MCP_URL SYS_MCP_TOKEN MCP_CONFIG_FILE MCP_CONFIG_ARG
  MCP_URL="$(python3 -c "
import json
try:
  d = json.load(open('$soul_dir/config.json'))
  print(d.get('mcp_url',''))
except: print('')
" 2>/dev/null || echo "")"

  # SYS MCP: URL aus config.json, Token aus authorized_services.json (64-hex service_token)
  SYS_MCP_URL="$(python3 -c "
import json
try:
  d = json.load(open('$soul_dir/config.json'))
  print(d.get('sys_mcp_url',''))
except: print('')
" 2>/dev/null || echo "")"
  SYS_MCP_TOKEN="$(python3 -c "
import json, re
try:
  d = json.load(open('$soul_dir/config.json'))
  t = d.get('sys_mcp_token', '')
  if re.match(r'^[0-9a-f]{64}$', t): print(t)
  else: print('')
except: print('')
" 2>/dev/null || echo "")"

  MCP_CONFIG_FILE="$AGENT_DIR/mcp.json"
  MCP_CONFIG_ARG=""
  MCP_TOOLS=""
  if [[ -n "$MCP_URL" || ( -n "$SYS_MCP_URL" && -n "$SYS_MCP_TOKEN" ) ]]; then
    python3 - "$MCP_URL" "$SYS_MCP_URL" "$SYS_MCP_TOKEN" "$MCP_CONFIG_FILE" <<'PYEOF'
import json, sys
zapier_url, sys_url, sys_token, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
cfg = {'mcpServers': {}}
if zapier_url:
  cfg['mcpServers']['zapier'] = {'type': 'http', 'url': zapier_url}
if sys_url and sys_token:
  cfg['mcpServers']['sys'] = {'type': 'http', 'url': sys_url,
    'headers': {'Authorization': f'Bearer {sys_token}'}}
with open(out, 'w') as f:
  json.dump(cfg, f, indent=2)
PYEOF
    log_s "MCP: configured (${MCP_URL:+Zapier }${SYS_MCP_URL:+SYS})"
    MCP_CONFIG_ARG="--mcp-config $MCP_CONFIG_FILE"
    [[ -n "$MCP_URL" ]] && MCP_TOOLS="${MCP_TOOLS},mcp__zapier__*"
    [[ -n "$SYS_MCP_URL" && -n "$SYS_MCP_TOKEN" ]] && MCP_TOOLS="${MCP_TOOLS},mcp__sys__*"
  else
    rm -f "$MCP_CONFIG_FILE"
    log_s "MCP: not configured (no mcp_url / sys_mcp_url in config)"
  fi

  local MODEL
  MODEL="$(python3 -c "
import json
try:
  d = json.load(open('$soul_dir/config.json'))
  print(d.get('model','claude-sonnet-4-6') or 'claude-sonnet-4-6')
except: print('claude-sonnet-4-6')
" 2>/dev/null || echo "claude-sonnet-4-6")"

  log_s "model: $MODEL"

  local TODAY
  TODAY="$(date -u '+%Y-%m-%d')"

  local CLAUDE_MD="$AGENT_DIR/CLAUDE.md"
  local CLAUDE_MD_HINT=""
  [[ -f "$CLAUDE_MD" ]] && CLAUDE_MD_HINT="First read $CLAUDE_MD — it defines your scope and allowed tools.

"

  local PROMPT="${CLAUDE_MD_HINT}Read $PLAIN_AGENT_MD and work through every pending task.

## Sections in agent.md
- **## Standing Tasks (always active)** — standing rules, always apply after completing each task. Never mark them done.
- **## Open Tasks** — tasks to complete. Identified by '**Status:** open' or '- [ ]'.
- **## Completed Tasks** — completed tasks archive.

(Older souls may still have the legacy German section names '## Dauertasks' / '## Offene Tasks' /
'## Erledigte Tasks' with '**Status:** offen' — treat them the same way, just don't rename the
existing headers as part of a task run.)

## Steps for each pending task
1. Complete it fully using your available tools.
2. Apply all rules from the standing-tasks section (e.g. send a summary email).
3. Rewrite agent.md:
   - Move the completed task block from the open-tasks section to the completed-tasks section
   - Change '**Status:** open' (or legacy '**Status:** offen') to '**Status:** completed $TODAY'
   - checkbox format: change '- [ ]' to '- [x] $TODAY —'
   - If the completed-tasks section only has '*(empty)*' or '*(leer)*', replace that line with the task block
   - Leave the standing-tasks section completely unchanged

Work sequentially. Be careful and conservative."

  # Pre-fix ownership + permissions so www-data can read/write during the run
  chown -R www-data:www-data "$soul_dir/vault/context/" 2>/dev/null || true
  chmod -R 660 "$soul_dir/vault/context/" 2>/dev/null || true
  find "$soul_dir/vault/context/" -type d -exec chmod 750 {} \; 2>/dev/null || true

  log_s "launching Claude..."

  # cd into soul dir so agent.md is in the project scope (Claude Code requires
  # files to be within cwd or --add-dir for Edit/Write to be auto-approved).
  cd "$soul_dir/vault/context"
  # shellcheck disable=SC2086
  echo "$PROMPT" | "$CLAUDE_BIN" \
    --model "$MODEL" \
    --print \
    --add-dir /var/lib/sys \
    --add-dir "$WORK_DIR" \
    --add-dir /etc/openresty \
    --allowedTools "Read,Edit,Write,Bash,Glob,Grep,LS,WebSearch,WebFetch,TodoWrite,TodoRead${MCP_TOOLS}" \
    $MCP_CONFIG_ARG \
    >> "$LOG_FILE" 2>&1 \
    || log_s "WARNING: claude exited non-zero"

  # Re-encrypt (or plain-write, matching whatever cipher_mode was found) the
  # scratch copy — possibly edited by Claude — back into the real vault path.
  # Runs even if claude exited non-zero above: it may have edited the file
  # before failing, and re-saving unedited content back is a harmless no-op.
  if [[ -f "$PLAIN_AGENT_MD" ]]; then
    if node "$WORK_DIR/soul-mcp/scripts/agent_vault_ctx.mjs" encrypt "$soul_id" "$PLAIN_AGENT_MD" >>"$LOG_FILE" 2>&1; then
      log_s "agent.md saved back to vault"
      rm -f "$PLAIN_AGENT_MD"
    else
      log_s "ERROR: failed to save agent.md back to vault — scratch copy kept for recovery: $PLAIN_AGENT_MD"
    fi
  fi

  # Restore www-data ownership + permissions on files root may have created/modified
  chown -R www-data:www-data "$soul_dir/vault/context/" 2>/dev/null || true
  chmod -R 660 "$soul_dir/vault/context/" 2>/dev/null || true
  find "$soul_dir/vault/context/" -type d -exec chmod 750 {} \; 2>/dev/null || true
  log_s "ownership restored"

  log_s "=== Run complete ==="
}

# ── Main ─────────────────────────────────────────────────────────────────────
MODE="$( [[ -n "$FORCE_SOUL" ]] && echo "force ($FORCE_SOUL)" || echo "scan" )"
echo "[$(ts)] cron fired — mode: $MODE" >> "$LOG_MASTER"

if [[ -n "$FORCE_SOUL" ]]; then
  run_soul "$FORCE_SOUL"
else
  soul_count=0
  for soul_dir in "$SOULS_DIR"/*/; do
    [[ -d "$soul_dir" ]] || continue
    soul_count=$((soul_count+1))
    run_soul "$(basename "$soul_dir")"
  done
  echo "[$(ts)] scan complete — $soul_count soul(s) checked" >> "$LOG_MASTER"
fi
