#!/usr/bin/env bash
# check-url-refs.sh — detects stale route references after a page rename.
# Usage (manual):  scripts/check-url-refs.sh [old-route] [new-route]
# Usage (hook):    called automatically by .git/hooks/pre-commit
#
# Checks these locations for the old route string:
#   lua/            repo copy of Lua files
#   soul-mcp/       MCP server
#   /etc/openresty/lua/  live deployed files (if accessible)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHECK_DIRS=("$REPO_ROOT/lua" "$REPO_ROOT/soul-mcp")
LIVE_LUA="/etc/openresty/lua"
[[ -d "$LIVE_LUA" ]] && CHECK_DIRS+=("$LIVE_LUA")

RED='\033[0;31m'
YEL='\033[0;33m'
GRN='\033[0;32m'
NC='\033[0m'

# ── Manual mode: two arguments (old-route new-route) ─────────────────────────
if [[ $# -eq 2 ]]; then
  OLD_ROUTE="$1"
  NEW_ROUTE="$2"
  # Normalise: ensure leading slash, strip .vue suffix if accidentally passed
  OLD_ROUTE="/${OLD_ROUTE#/}"
  NEW_ROUTE="/${NEW_ROUTE#/}"

  echo -e "${YEL}Checking for stale references to '${OLD_ROUTE}'…${NC}"
  found=0
  while IFS= read -r line; do
    echo -e "  ${RED}STALE:${NC} $line"
    found=1
  done < <(grep -rn "\"${OLD_ROUTE}\"" "${CHECK_DIRS[@]}" 2>/dev/null || true)

  if [[ $found -eq 0 ]]; then
    echo -e "  ${GRN}No stale references found.${NC}"
  else
    echo ""
    echo -e "${YEL}Replace all occurrences:${NC}"
    echo "  sed -i 's|\"${OLD_ROUTE}\"|\"${NEW_ROUTE}\"|g' <file>"
  fi
  exit 0
fi

# ── Hook mode: auto-detect renamed pages from staged changes ──────────────────
# Find renamed page files: lines like "R100  app/pages/old.vue  app/pages/new.vue"
mapfile -t RENAMES < <(git diff --staged --name-status 2>/dev/null \
  | grep -E '^R[0-9]*[[:space:]]+app/pages/' \
  | sed 's/^R[0-9]*[[:space:]]*//' \
  || true)

[[ ${#RENAMES[@]} -eq 0 ]] && exit 0   # no page renames — nothing to do

errors=0
for line in "${RENAMES[@]}"; do
  OLD_FILE="$(echo "$line" | awk '{print $1}')"
  # Derive route from filename: app/pages/foo.vue → /foo
  # For index files: app/pages/foo/index.vue → /foo
  OLD_SLUG="${OLD_FILE#app/pages/}"
  OLD_SLUG="${OLD_SLUG%.vue}"
  OLD_SLUG="${OLD_SLUG%/index}"
  OLD_ROUTE="/${OLD_SLUG}"

  hits=$(grep -rn "\"${OLD_ROUTE}\"" "${CHECK_DIRS[@]}" 2>/dev/null || true)
  if [[ -n "$hits" ]]; then
    echo -e ""
    echo -e "${RED}✗ Stale route reference: '${OLD_ROUTE}'${NC}"
    echo "$hits" | while IFS= read -r h; do
      echo -e "    ${YEL}${h}${NC}"
    done
    echo -e "  Fix: replace \"${OLD_ROUTE}\" with the new route in the files above."
    errors=$((errors + 1))
  fi
done

if [[ $errors -gt 0 ]]; then
  echo ""
  echo -e "${RED}Commit blocked — ${errors} stale route reference(s) found.${NC}"
  echo -e "Run:  ${YEL}scripts/check-url-refs.sh /old-route /new-route${NC}  to locate and fix them."
  exit 1
fi

exit 0
