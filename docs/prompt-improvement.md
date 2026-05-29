# Prompt Improvement Workflow

How to review, improve, and deploy all KI system prompts in SYS.

---

## Overview

All system prompts that control KI behavior are hardcoded in three source files:

| File | KI Instance | Sections |
|------|-------------|---------|
| `app/composables/useClaude.js` | Main chat KI | Identity, Communication style, Intellectual standard, Tool rules, Voice mode, Observer mode |
| `lua/beme.lua` | Beme (peer messages) | Identity, Communication style |
| `lua/vision_analyze.lua` | Image analysis | Persona, soulReaction |

`prompts.md` in `vault/context/` is a generated documentation file — a readable snapshot of all prompts with source locations, intended for external review.

---

## Workflow

### 1. Generate prompts.md

Run from the project root:

```bash
node utils/generate-prompts.mjs
```

The script reads all three source files, extracts the prompt blocks, and writes `prompts.md` into every registered soul vault at `/var/lib/sys/souls/{soul_id}/vault/context/prompts.md`.

### 2. Download and review

Open your SYS node → Vault → Server → Kontext → `prompts.md` → Download.

Give the file to an external KI (e.g. Claude in claude.ai) with instructions like:

> "Verbessere die Prompt-Texte sprachlich und im Ton. Behalte Abschnitt 4 (Tool-Namen) und den technischen Teil von Abschnitt 8 unverändert. Gib mir alle 8 Abschnitte neu formuliert zurück."

### 3. Hand improvements to Claude Code

Paste the improved sections into a conversation with Claude Code on the VPS. Claude Code identifies the exact source locations and makes targeted edits — no blind patching.

### 4. Regenerate prompts.md

After code changes:

```bash
node utils/generate-prompts.mjs
```

The vault file is now up to date.

### 5. Deploy

```bash
# Deploy Lua changes (if beme.lua or vision_analyze.lua changed)
cp lua/beme.lua /etc/openresty/lua/beme.lua
cp lua/vision_analyze.lua /etc/openresty/lua/vision_analyze.lua
openresty -s reload

# Build and deploy frontend (if useClaude.js changed)
npm run generate
cp -r .output/public/* /var/www/me.uxprojects-jok.com/
```

---

## Important: prompts.md is not auto-updated

`prompts.md` is generated on demand — it is **not** automatically regenerated when source code changes. If you change a prompt in `useClaude.js`, `beme.lua`, or `vision_analyze.lua` without re-running the script, `prompts.md` will be out of date.

**Rule:** Re-run `node utils/generate-prompts.mjs` after every prompt change before committing.

---

## What can be changed vs. what to leave alone

| Section | Can change | Leave alone |
|---------|-----------|-------------|
| 1 — Identity | Wording, tone | Keep `[NAME]` placeholder |
| 2 — Communication style | Everything | — |
| 3 — Intellectual standard | Everything | — |
| 4 — Tool rules | Descriptions next to `→` | Tool names themselves (e.g. `soul_read`, `food_log`) |
| 5 — Voice mode | Everything | — |
| 6 — Observer mode | Everything | — |
| 7 — Beme | Everything | — |
| 8 — Image analysis | Persona intro, soulReaction | JSON format, food detection logic |

---

## How generate-prompts.mjs works

- **Dynamic sections (1–5):** Extracted live from `useClaude.js` using string markers. Changing the prompt text is reflected automatically; changing the section headers requires updating the markers in the script.
- **Static sections (6–8):** Hardcoded in the script because Lua long-string syntax and JS template literals cannot be cleanly extracted. After changing `beme.lua` or `vision_analyze.lua`, the corresponding static variable in `generate-prompts.mjs` must be updated manually to match.

---

## Files

| Path | Purpose |
|------|---------|
| `utils/generate-prompts.mjs` | Generator script |
| `vault/context/prompts.md` | Generated snapshot (per soul, not in repo) |
| `app/composables/useClaude.js` | Main chat KI prompt source |
| `lua/beme.lua` | Beme prompt source |
| `lua/vision_analyze.lua` | Image analysis prompt source |
