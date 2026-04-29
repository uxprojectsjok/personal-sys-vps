# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (Nuxt 4 + Nitro, HTTPS on localhost:3007)
npm run dev

# Production deploy (run from /var/www/SaveYourSoul_deploy on the VPS)
npm run generate
# Strip CSP meta tags (muss aus utils/ heraus laufen, Pfad ist relativ):
cd utils && node killMetas.mjs && cd ..
rsync -a --delete .output/public/ /var/www/sys.uxprojects-jok.com/
openresty -s reload

# Projekt-Instanzen (alle unter /var/www/)
# SaveYourSoul_deploy  — aktive Arbeitsinstanz (diese hier), läuft auf dem VPS
# SaveYourSoul_prod    — cleane Instanz für Git & Investoren (kein .env, keine Secrets)
# SaveYourSoul_bk      — lokaler Download-Snapshot: alles außer node_modules/, .dist/, .output/

# Preview generated build
npm run preview
```

Sub-projects:
```bash
# WhatsApp bot (Twilio Serverless)
cd soul-whatsapp && npm install
twilio serverless:deploy --override-existing-project

# Voice cloning
cd soul-voice-clone && npm install
node clone-voice.mjs          # Create voice clone + ElevenLabs agent
node whatsapp-connect.mjs     # Link agent to Meta WhatsApp
node whatsapp-soul.mjs        # Local test server on port 3099

# Browser extension: load unpacked in chrome://extensions → /browser-extension/
```

There is no test runner configured. Test sys.md files live in `/test/` for manual validation.

## Architecture

### Two-environment backend

**Development:** Nitro (Nuxt server) auto-serves `server/api/*.js` routes at localhost:3007.

**Production:** `nuxt generate` + `utils/killMetas.mjs` builds a pure static SPA deployed to `/var/www/sys.uxprojects-jok.com/`. No Node.js process runs on the VPS. All API calls are handled by OpenResty Lua scripts at `/etc/openresty/lua/`. Server config lives at `/etc/openresty/nginx.conf` and `/etc/openresty/sites-available/sys.uxprojects-jok.com`. Lua scripts read/write files under `/var/lib/sys/souls/{soul_id}/`. Production environment variables are injected via systemd override, not from `.env`.

The `server/openresty/` directory in this repo is the **source** for the Lua scripts — changes must be copied to `/etc/openresty/lua/` on the server. When modifying backend logic, both the Nitro route (`server/api/*.js`) and the OpenResty Lua counterpart must stay in sync.

### Mobile & Desktop

Es gibt keine getrennten Codebases. Die App ist eine **responsive Single-Codebase** — dieselben Routen und Komponenten für beide Versionen. Das Layout wechselt rein per CSS:

- **Mobile (< 768px):** Hamburger-Menü (`md:hidden`) in `session.vue` und `api-docs.vue`, kompaktes Header-Grid, einspaltige Layouts
- **Desktop (≥ 768px):** Alle Action-Icons sichtbar (`hidden md:flex`), mehrspaltige Grids (`sm:grid-cols-2 lg:grid-cols-4`), erweiterter Header
- **Safe Area Support:** `.pb-safe` / `.pt-safe` Utilities mit `env(safe-area-inset-*)` für Geräte mit Notch
- PWA-Meta-Tags in `nuxt.config.js` (`apple-mobile-web-app-capable`, `mobile-web-app-capable`, `status-bar-style: black-translucent`)

Breakpoints: `sm` (640px), `md` (768px — primärer Mobile/Desktop-Umschalter), `lg` (1024px), Tailwind mobile-first.

### Frontend state pattern

`ssr: false` — pure client-side rendering. No Pinia or Vuex. All shared state lives in **module-level singleton refs** inside composables (`app/composables/`). Composables are auto-imported everywhere and remain alive for the full page lifecycle.

Key composables and their responsibilities:
- `useSoul` — sys.md content, soul_cert, maturity
- `useVault` — File System Access API (browser-native vault), image preprocessing (512px max before sending to vision)
- `useApiContext` — API permissions, AES-256-CBC vault encryption, sync index
- `useSoulEncrypt` / `useSoulDecrypt` — full soul encryption (YAML frontmatter + vault)
- `useChainAnchor` — optional Polygon + IPFS blockchain anchoring
- `useClaude` — Claude API SSE streaming

### Authentication model

All API endpoints are protected by HMAC-SHA256 `soul_cert` tokens (32-char hex, signed with `SOUL_MASTER_KEY`). No session cookies or OAuth. The browser generates a cert by calling `/api/soul-cert`, which the Lua `soul_cert.lua` signs. Subsequent requests carry the cert as a header and are validated by `soul_auth.lua` or `vault_auth.lua`.

### Data flow

```
Browser SPA → HTTPS → OpenResty
  ├── Static assets     → /var/www/sys.uxprojects-jok.com/
  ├── /api/chat         → soul_auth.lua → Anthropic API (SSE passthrough)
  ├── /api/vision-*     → soul_auth.lua → Claude Vision / WaveSpeed AI
  ├── /api/soul         → vault_auth.lua → serve sys.md (encrypted or plain)
  ├── /api/vault/*      → vault_auth.lua → vault_sync.lua / vault_delete.lua
  └── /api/soul-cert    → soul_cert.lua (unauthenticated cert issuance)

Vault on disk: /var/lib/sys/souls/{soul_id}/
  ├── sys.md
  ├── api_context.json     (permissions + vault sync index)
  ├── soul_connections.json
  └── vault/{audio,images,video,context}/
```

### Encryption

Vault files can be encrypted with AES-256-CBC before upload. Encrypted files are prefixed with the magic bytes `SYSCRYPT01`. Key derivation and the format are documented in `docs/VAULT_ENCRYPTION.md`. Both the browser (`useSoulEncrypt.js`) and the Lua backend (`api_serve.lua`) must agree on this format.

### Soul.md format

`sys.md` is a Markdown file with YAML frontmatter (soul_id, name, version, timestamps, maturity score) followed by named sections. `shared/utils/soulParser.js` handles parsing and section updates. `shared/utils/soulMaturity.js` computes the 0–100 maturity score used to determine growth stage. These are shared between the Nitro dev server and the browser bundle.

### Multi-channel integrations

- **WhatsApp:** `soul-whatsapp/` Twilio Serverless function — proxies messages to Anthropic with soul context
- **Voice clone:** `soul-voice-clone/` — ElevenLabs API creates a cloned voice + conversational agent linked to WhatsApp
- **Browser extension:** Chrome MV3 (`browser-extension/`) — extracts soul_cert from page context, injects it into requests
- **Vision pipeline:** Camera → `vision-analyze.post.js` → Claude Vision → WaveSpeed AI image/video generation

### Design System

**Typography** (all fonts served locally from `/public/fonts/`):
- **Headings** (`h1`–`h6`): `Noto Serif` — bold, serif. Applied via `h1,h2,h3,h4,h5,h6` in `@layer base`.
- **UI / Body**: `Oxanium` — geometric, technical feel. Applied to `html` font-family.
- **Fallback**: `Inter` (also locally available), then `system-ui`.
- **Icons**: `Remix Icons` icon font — CSS loaded from `/fonts/remixicon/remixicon.css`. Use `<i class="ri-xxx-line">` or `<i class="ri-xxx-fill">`.

**Theme**: Dark-Only. Kein Light-Mode, kein Toggle. `useColorScheme` gibt immer `isDark = true` zurück und setzt `data-theme="dark"` fest.

**Colors** (CSS custom properties in `main.css`):
- `--sys-bg` / `--sys-bg-elevated` / `--sys-bg-surface` — OLED black scale
- `--sys-fg` / `--sys-fg-muted` / `--sys-fg-dim` — silver text scale
- `--sys-orange` `#e85000` — primary CTA accent (buttons, highlights)
- `--sys-violet` `#8b5cf6` — hover/glow accent
- `--chart-1..5` — cyan/teal palette (hsl 188 100% 50% → teal)

**Button hierarchy** (utility classes):
- `.sys-btn-filled` — orange pill (primary hero action)
- `.sys-cta-primary` — same orange, for hero CTAs
- `.sys-btn-tonal` — glass/surface (secondary)
- `.sys-btn-outlined` — border-only (tertiary)
- `.sys-btn-ghost` — invisible until hover (quaternary)
- `.sys-btn-danger` — red semantic

**Component patterns**:
- Modals: `fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4` backdrop + inner `relative w-full max-w-md bg-[var(--sys-bg-elevated)] border border-[var(--sys-border)] rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden`
- All modals closed via X button top-right (`aria-label="Schließen"`). No separate "Schließen" close buttons.
- Carousel: `.shad-carousel` / `.shad-carousel-content` with CSS `translateX(-${index * 100}%)` transform.
- Shadcn Lyra utilities: `.shad-card`, `.shad-badge`, `.shad-alert`, `.shad-alert-destructive`, `.shad-alert-success`, `.shad-table`, `.shad-separator`, `.shad-input`.

**Accessibility**:
- WCAG 2.1 / German BGG: `prefers-reduced-motion`, `prefers-contrast: high` breakpoints in CSS.
- Focus ring: `outline: 1px solid rgba(255,255,255,0.25)` via `:focus-visible`.
- All interactive elements min-height 44px (`button, [role="button"], a, label`).
- `aria-label` on all icon-only buttons, `role="dialog" aria-modal="true"` on modals.

### Config

Feature flags in `nuxt.config.js` `runtimeConfig.public`:
- `allowCreateSoul: false` — invite-only, disables new soul creation
- `docsPublic: false` — controls API docs visibility

Rate limiting for `/api/chat` is configured in the OpenResty nginx vhost (`zone=chat:10m rate=2r/s`).
