# Changelog

All notable changes to the SYS protocol reference implementation are documented here.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versions follow [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).

Node operators: pin to a tag, read the entry before updating, and check for **Breaking** / **Migration required** flags — see [README: Updating Your Node](README.md#updating-your-node).

---

## [1.2.13] — 2026-07-23

**Fixed: on a Multi-Hoster node with more than one soul, an owner/service-token MCP client always got the alphabetically first soul, regardless of which one it actually meant to reach.**

**Root cause:** `soul-mcp/server.mjs`'s `handleMcp()` has three token-type branches (paid, peer-cert, owner/service). The paid and peer-cert branches already correctly honor `?soul_id=` and reject ambiguous requests when it's missing and more than one soul exists — the owner/service-token branch never got the same treatment, it just did `dirs.find(d => uuid-regex)` and picked whatever came first.

**Fixed**
- `soul-mcp/server.mjs`: owner/service-token branch now resolves `?soul_id=` when present and valid, falls back to the single soul when there's only one (unchanged single-hoster behavior), and returns the same `"Multi-Hoster: ?soul_id= Parameter erforderlich"` 401 the peer-cert branch already used, instead of silently guessing, when the param is missing and multiple souls exist.
- `lua/soul_meta.lua`: the public `/api/soul/meta` endpoint's `mcp_endpoint` field was missing `?soul_id=` — inconsistent with the endpoint `soul-mcp/lib/soul_indexer.mjs` generates, and would have pointed any external client straight into the bug above. Now includes it.
- `README.md`: the Multi-Hoster row's Agent Runner caveat was worded as an unconditional guarantee. It only holds at `init.sh` provisioning time (which skips installing the cron entirely for a fresh Multi-Hoster install) — there's no runtime check anywhere, so switching an existing Single-Hoster node to Multi-Hoster later does not retroactively remove an already-installed cron. Wording now reflects that.

---

## [1.2.12] — 2026-07-23

**Multi-Hoster registration (`/join`) now matches the reveal-on-demand pattern already used by `/gate`, and both pages gained a legal-links footer that was previously missing on `/gate` (and on the single-hoster landing, `/`).**

**Changed**
- `app/pages/join.vue`: the registration form (password + invite code) is now hidden behind a discreet top-right reveal button by default, with a close button to return to the blank landing — same rationale as `/gate`: this page can be linked externally and shouldn't visually announce itself as an access point. Subtitle text enlarges to fill the now-more-prominent default state.
- `app/pages/gate.vue`: added the fixed-to-viewport-bottom Legal Notice · Privacy Policy · License footer (was present nowhere on this page before).
- `app/pages/index.vue`: added the same legal-links footer to the single-hoster landing card, stacking to a column on mobile so the links no longer overflow the screen edges.
- `app/components/SysMark.vue`: new optional `operator` prop — renders a small credit line below the logo when set, empty/opt-in by default, for operators who want to identify themselves on their gate/join/landing pages.
- `app/assets/css/sys-v2.css`: `.gate`/`.gate-card` spacing adjusted (more bottom clearance, larger max-width, top padding) to make room for the new fixed footer without overlapping the card content; mobile logo width capped consistently.
- `i18n/locales/{en,de}.json`: added `join.reveal_aria` for the new reveal-trigger button's accessible label.
- `public/sw.js`: cache version bump (v13 → v14) for the app-shell changes above.

---

## [1.2.11] — 2026-07-23

**Added: `reset.sh`, `recover-password.sh`, `deinstall.sh` — these were only ever distributed via the separate `sys-installer` repo, `.gitignore`d out of this one (grouped with `init.sh`). They belong here: unlike `init.sh` (a live-generated, per-run script with node-specific substitutions), these are static operator tools with no generation step, and a node operator working from this repo had no way to find them.**

**Added**
- `reset.sh`: removes the current soul (single-hoster) or a selected/all souls (multi-hoster), leaves the rest of the installation running. Detects shared-server mode and reloads instead of restarting OpenResty when other sites are active.
- `recover-password.sh`: sets a new gate password without touching soul data, for when the gate password is forgotten. Domain-aware `master.json` resolution, shared-server-safe OpenResty reload.
- `deinstall.sh`: full uninstall, detects shared-server mode and leaves OpenResty/Node.js/`/etc/openresty` untouched if other sites are active on the same box.
- `.gitignore`: removed the three matching entries (`init.sh` itself stays ignored — it's generated per-run with node-specific substitutions, genuinely different from these three static scripts).

---

## [1.2.10] — 2026-07-22

**Fixed: on mobile, tapping the "Gate" tab in the bottom nav bar navigated to `/gate` but left the nav bar itself visible on top of the login screen.**

**Root cause:** `SysMobileNav.vue`'s gate tab did a plain `router.push('/gate')` — a client-side SPA navigation that leaves `useSoul()`'s shared `hasSoul` state untouched (it isn't tied to the current route). `app.vue` renders the nav bar via `<SysMobileNav v-if="hasSoul" />`, so it stayed mounted on the gate page. Every page's own sidebar already handles this correctly via a local `lockGate()` (clear soul state, clear the `sys_gate` cookie, full-page navigation) — the mobile bottom nav's gate tab never got the equivalent treatment.

**Fixed**
- `app/components/SysMobileNav.vue`: gate tab now calls `useSoul().clear()`, clears the `sys_gate` cookie, and does a full `window.location.href` navigation instead of `router.push()` — same pattern as every page's own `lockGate()`.

---

## [1.2.9] — 2026-07-22

**Fixed: verification challenges created by the ElevenLabs voice agent (`POST /api/agent/verify`) had no `voice_code` and no `webauthn_challenge` — every fingerprint or voice_hq attempt against one of these challenges was unconditionally doomed, regardless of device or user action.**

**Root cause:** `agent_verify.lua` (the ElevenLabs `verify_identity` webhook tool's own challenge-creation endpoint — a separate code path from the Claude.ai MCP server's `verify_identity.mjs`, which correctly uses `POST /api/verify/challenge` / `verify_challenge.lua`) never generated either field. Without a server-issued `webauthn_challenge`, `authenticatePasskey()` has nothing to embed in the WebAuthn assertion, so `lastAssertion.value` never gets set in `verify.vue` even after a real, successful biometric confirmation — the client-side code then unconditionally shows "Biometrische Verifikation abgelehnt." Without `voice_code`, the voice_hq recording screen has no digits to display, which is what live testing (2026-07-22) surfaced as "the recording isn't the current one with reading out numbers."

`verify_challenge.lua` already had this exact fix, documented in its own comments as resolving a prior instance of the same bug class ("Immer erzeugen, unabhängig von den gewählten Methoden") — `agent_verify.lua` was simply never brought in line with it.

**Fixed**
- `lua/agent_verify.lua`: now generates both `voice_code` (6-digit anti-replay code) and `webauthn_challenge`, unconditionally, matching `verify_challenge.lua`'s existing approach exactly.

---

## [1.2.8] — 2026-07-22

**Added: a way to cancel a pending verification challenge from `/connection` — previously the "verify now" badge had no cancel option, so an unwanted challenge (e.g. one a voice agent started at the wrong moment) could only be left to expire.**

**Added**
- `lua/verify_cancel.lua` (new): `POST /api/verify/cancel` — sets a `pending` challenge's status to `cancelled`. Idempotent (already-verified/expired/cancelled challenges just return their current status, not an error). A poller reading `status="cancelled"` on `/api/verify/status` stops immediately instead of waiting for natural TTL expiry.
- `app/pages/connection.vue`: "Abbrechen"/"Cancel" button next to "Jetzt verifizieren"/"Verify now" on the pending-challenge banner, reusing the existing `.cn-btn--reject` styling from the trust-request banner.
- `soul-mcp/tools/verify_identity.mjs`: distinct message for `status="cancelled"` ("Verifikation vom Nutzer abgebrochen.") instead of falling into the generic "Challenge abgelaufen." branch.
- `i18n/locales/{de,en}.json`: `connection.btn_verify_cancel`.
- `server/openresty/vhost.conf.template`: `/api/verify/cancel` location block (same auth/rate-limit pattern as `/api/verify/complete`).

---

## [1.2.7] — 2026-07-22

**Extended the ElevenLabs voice-agent verification window: live testing showed `fingerprint` verification failing with `completed_methods` still empty because the challenge had already expired by the time the user reached the confirmation screen.**

**Fixed**
- `lua/agent_verify.lua`: challenge TTL `300` → `600` seconds. A full voice round trip (agent explains verification, user switches to the SYS app, confirms biometric) routinely ate into the old 5-minute window, especially with a few seconds of user silence at call start before the agent's first LLM turn.
- `lua/create_agent.lua` fallback prompt, `shared/constants/default_mind.md`: the agent's own give-up threshold ("If after 3 minutes verified=false...") bumped to 5 minutes to match, with a safety margin under the new 10-minute server-side TTL.

---

## [1.2.6] — 2026-07-22

**Fixed a regression from [1.2.3]: `@create-agent` failed live with `ElevenLabs 400: English Agents must use turbo or flash v2` as soon as the new English-by-default `language` actually got exercised for the first time.**

**Root cause:** ElevenLabs' TTS model families are language-gated in both directions — the fast English-only models (`eleven_flash_v2`/`eleven_turbo_v2`) are rejected for any non-English `language`, and the multilingual model (`eleven_flash_v2_5`) is rejected for `language="en"` specifically ("English Agents must use turbo or flash v2"). `lua/create_agent.lua` hardcoded `eleven_flash_v2_5` unconditionally — correct for the German default this file always had before [1.2.3], but wrong the moment `language` could actually be `"en"`. Since `language` was hardcoded to `"de"` before that change, this specific validation path had never been exercised until now.

**Fixed**
- `lua/create_agent.lua`: `tts_cfg.model_id` now picks `eleven_flash_v2` for `language == "en"` and `eleven_flash_v2_5` for everything else, matching ElevenLabs' actual per-language model requirement instead of a single hardcoded value.

---

## [1.2.5] — 2026-07-22

**Fixed a live bug: `session_end` (and several other write paths) wrote Session Log entries into the wrong section, because none of them recognized the actual current canonical heading `## Session Log (compressed)` — only older variants that predate it. Confirmed live: the maintainer's own soul had two parallel Session Log sections, one legacy (`## Session-Log (komprimiert)`) and one orphan duplicate (`## Session-Log`) that `session_end` had been silently writing into instead of the real, currently-displayed section.**

**Root cause:** `buildDefaultSoul()` has created new souls with `## Session Log (compressed)` since the English-migration pass ([1.2.0]), but several independent write/read paths still only knew about pre-migration heading spellings and never learned the current one — a gap in that migration's own coverage, not something touched since. Every one of these paths does its own local heading match with no shared resolution logic, so the gap had to be closed in each of them individually.

**Fixed**
- `soul-mcp/tools/session_end.mjs`: now tries `Session Log (compressed)` first, then legacy variants, before creating a new section — was hardcoded to a heading (`Session-Log`) that only ever matched an already-broken duplicate, never the real section.
- `shared/utils/soulParser.js`: `appendSessionLog()`/`deduplicateSessionLog()` (the browser-side `@session-end` path, same bug independently) — same fix.
- `soul-mcp/lib/herz.mjs`: `appendToSoulLog()` (the Archivist's own `[herz]` auto-notes) only checked for `Session Log`/`Session-Log`, silently no-oping on any soul using the current template — added the missing `(compressed)`/`(komprimiert)` variants.
- `lua/agent_post_call.lua`: the ElevenLabs post-call webhook logged voice sessions into `section="Session-Log"` — same wrong-heading bug in the voice-call path, unrelated to but structurally identical to the `session_end` one.
- `soul-mcp/tools/soul_write.mjs`, `soul_delete.mjs`, `soul_read.mjs`, `soul-mcp/prompts/index.mjs`, `app/composables/useClaude.js`: tool descriptions/examples that told the AI to use a stale heading name (`Session Log`, `Session-Log`) corrected to the real one — these are generic any-section tools, so the fix is the example text, not new matching logic; using the wrong example would have kept creating new duplicates going forward.
- `app/pages/index.vue`, `app/pages/chronicle.vue`: the Chronicle/homepage recent-entries display was missing the canonical heading from its lookup entirely (only checked the two legacy variants) — would have shown nothing for any soul on the current template.

**Live cleanup:** merged the maintainer's own soul's two parallel Session Log sections into one `## Session Log (compressed)` section, newest-first, no entries lost (verified via decrypt/parse round-trip before and after).

---

## [1.2.4] — 2026-07-22

**Docs cleanup: the sys.md spec doc still showed the old German template example from before the English-migration pass (v1.2.0).**

**Fixed**
- `docs/spec/sys_md.md`: the "fresh soul → crystallized soul" lifecycle example still had `## Kern-Identität` / `## Werte & Überzeugungen` and a German LONGMEM/MINDIDX comment — updated to the current English template (`## Core Identity` / `## Values & Beliefs`, English comment), matching what `buildDefaultSoul()` actually generates and what `README.md`/`ARCHITECTURE.md`'s own examples already show.
- `README.md`: one leftover German label (`Selbstreflexion-Workflow`) in the repo-tree comment for `soul-mcp/prompts/index.mjs` → `Self-Reflection workflow`.
- Checked all other docs (`ARCHITECTURE.md`, `CONTRIBUTING.md`, `KEYMANAGEMENT.md`, `docs/spec/*.md`) for other stale template examples — none found; their sys.md/mind.md examples were already English from earlier passes.

---

## [1.2.3] — 2026-07-22

**Finished the ElevenLabs voice-agent creation flow (`lua/create_agent.lua`, and its dev-server stub `server/api/create-agent.post.js`): translated its German fallback system prompt, tool descriptions, and greeting default to English, made the response language configurable instead of hardcoded, and fixed a live bug in the greeting-parsing logic.**

**Found while translating:** the greeting line-picker always looked for a `"de:"`-tagged line first, and its fallback grabbed the raw first line of the ElevenLabs Greeting section without stripping any tag. Since `shared/constants/default_mind.md`'s canonical template only has an `"en:"` line (no `"de:"` line), any soul using the untouched default template got a spoken/displayed first message literally starting with `"en: "` — confirmed against the maintainer's own live `mind.md`, which has exactly this untouched canonical content.

**Also found:** the `soul_write` tool description handed to every ElevenLabs agent (and the equivalent line in the German fallback prompt) told the AI to write self-reflection entries via `soul_write` with `section='Selbstreflexion'` — the same wrong-tool-plus-wrong-language bug already fixed for `mind_write` in [1.2.1], just duplicated here in a separate code path that reaches every agent regardless of whether the soul has a custom template.

**Fixed**
- `lua/create_agent.lua`: `language` now defaults to `"en"` (was hardcoded `"de"`); overridable per soul via a new optional `config.json` field `elevenlabs_language`. `{lang}` template substitution and the `agent.language`/`stt.language` ElevenLabs config now follow this value instead of always resolving to `"Deutsch"`.
- Greeting parsing now prefers the line tagged for the active `language`, falls back to any tagged line with the tag stripped, then a raw untagged line — no more leaking `"en: "`/`"de: "` into the spoken greeting.
- Fallback system prompt (used only when a soul's `mind.md` has no custom `## ElevenLabs Agent` section) translated to English, mirroring `shared/constants/default_mind.md`'s canonical wording; its `soul_write`/`"Selbstreflexion"` line corrected to reference `mind_write`/`section='Self-Reflection'` for self-reflection, with `soul_write`'s own example pointed at an actual `sys.md` section instead.
- All ElevenLabs tool descriptions (`verify_identity`, `soul_read`, `soul_write`, `mind_read`, `mind_write`, `peer_inbox`, `peer_send`, `context_*`, `health_check`, `food_log`, `vault_*`, `audio/image/video_list`, `profile_get`, `shop_log`, `soul_earnings`, `soul_maturity`, `soul_skills`, `soul_discover`, `web_search`, `verify_human`, `session_end`) translated to English — these are sent to every agent regardless of custom-template usage, so they were previously German even for souls with an all-English custom system prompt.
- `server/api/create-agent.post.js` (Nuxt dev-server stub, not used in production): same `language` default + override, same fallback-prompt translation, `buildFirstMessage`'s tag-matching hardened the same way as the Lua version.
- `lua/agent_queue.lua`: translated remaining German code comments (no functional change, continuation of [1.2.2]).

**Not changed:** kept the maintainer's own soul untouched — their live `mind.md` already holds the canonical English `## ElevenLabs Agent`/`## ElevenLabs Greeting` content with no `elevenlabs_language` override needed, so the new `"en"` default already matches their actual data.

---

## [1.2.2] — 2026-07-22

**Fixed: `agent.md` had three mutually-inconsistent formats across the codebase, and the agent runner's task-detection regex didn't even match the format `soul-mcp/prompts/index.mjs` (the AI's own documented instructions) actually tells it to write — meaning a task added exactly as documented could go completely unprocessed, forever.**

**The three divergent formats found:**
- `lua/soul_cert.lua` / `lua/agent_queue.lua` (soul creation): `## Pending` / `## Done`
- `shared/sys-agent-run.sh`'s prompt to Claude: German `## Dauertasks` / `## Offene Tasks` / `## Erledigte Tasks`
- `soul-mcp/prompts/index.mjs` (what the AI is actually told when adding a task via `context_write`): English `## Standing Tasks (always active)` / `## Open Tasks` / `## Completed Tasks`, with a structured `**Status:** open` field — this one is the most complete and already correctly English, so it's the canonical target the other two are reconciled to.

**Confirmed live:** grep-testing the runner's exact regex against `**Status:** open` (the literal format `index.mjs` documents) returned zero matches — a real, currently-active bug, not just a language inconsistency.

**Fixed**
- `shared/sys-agent-run.sh`: task-detection regex now also matches `**Status:** open` (kept all existing legacy patterns for backward compatibility). The prompt sent to Claude now describes the correct English section names and structured status format, with a note to also recognize the legacy German section names on older souls without renaming them mid-run.
- `lua/soul_cert.lua`, `lua/agent_queue.lua`: `agent.md` creation template changed from `## Pending`/`## Done` to the canonical `## Standing Tasks (always active)` / `## Open Tasks` / `## Completed Tasks` — matching what `soul-mcp/prompts/index.mjs` already told the AI to expect, and what the (now-fixed) runner prompt describes.

**Live cleanup:** replaced the maintainer's own soul's `agent.md` (still empty, on the old template) with the corrected one.

---

## [1.2.1] — 2026-07-22

**Fixed a real, already-live bug in `mind.md`'s Self-Reflection section: the AI's own tool description told it to use the German section name `"Selbstreflexion"`, which no longer matches the English canonical template (`## Self-Reflection`) — every self-reflection write created a duplicate section instead of updating the real one. Confirmed live: the maintainer's own soul had exactly this duplicate, including a note where the AI had already caught its own mistake but couldn't fix it (`mind_write` can only replace/append, never delete a section).**

**Root cause, in order:** `app/composables/useClaude.js`'s `mind_write` tool description and an example line in the system prompt both used the German section names (`"Selbstreflexion"`, and one line even called `soul_write` — the wrong tool entirely, writing to sys.md instead of mind.md). `lua/mind.lua`'s section lookup is an exact string match with no language fallback, so a mismatch between what the AI requests and what the file's heading actually says silently creates a new section instead of erroring.

**Separately found:** `init.sh`'s "create mind.md for existing souls" backfill step (and the Nuxt dev-server's `/api/mind` stub) each carried their own hardcoded German copy of the mind.md template, both stale — missing two whole sections (`Signature`, `Session End`) present in the canonical `shared/constants/default_mind.md`. This only affected that one backfill path; new souls already got the correct template via `default_mind.lua`.

**Fixed**
- `app/composables/useClaude.js`: `mind_read`/`mind_write` tool descriptions and the one `soul_write`/`"Selbstreflexion"` example line in the system prompt now use the correct English section names and the correct tool (`mind_write`).
- `lua/mind.lua`: added a `resolve_section()` + `SECTION_ALIASES` bilingual fallback (mirrors the pattern already used for `sys.md` in `herz.mjs`/`soulParser.js`) — a request for `"Self-Reflection"` now resolves to whichever variant (English or German) actually exists in that specific soul's `mind.md`, so language mismatches can't create duplicate sections anymore, in either direction.
- `init.sh`, and the same fix ported to `sys-installer`'s `init.sh`: the backfill step's separate hardcoded German template replaced with a copy of `/var/lib/sys/config/default_mind.md` (already placed there earlier in the script) — eliminates the duplicate-copy drift risk going forward instead of just re-syncing content once more.
- `server/api/mind.get.js` (Nuxt dev-server stub): same duplicate-template problem, same fix — now reads `shared/constants/default_mind.md` directly instead of a separately hardcoded, stale copy.
- `server/api/create-agent.post.js` (dev-server): `getMindSection` lookup for the greeting text only tried the German `"ElevenLabs Erstbegrüßung"` — didn't match the (now dev-server-correct) English canonical template's `"ElevenLabs Greeting"` heading. Added as a first-try fallback.

**Live cleanup:** removed the orphaned duplicate `## Selbstreflexion` section from the maintainer's own soul's `mind.md` (content was just the AI's own note that the section didn't belong there) using the same decrypt/verify/re-encrypt approach as the `sys.md` fix in v1.1.1.

---

## [1.2.0] — 2026-07-22

**New souls now default to English section headers (`## Core Identity`, `## Values & Beliefs`, etc.) instead of German — the first phase of an English-only push into the actual template content, not just the docs. Existing German-header souls (including the maintainer's own) keep working completely unchanged.**

**Why:** `buildDefaultSoul()` generated a fully German template for every new soul — 8 section headers plus placeholder text. That's inconsistent with this repo's public-facing, English-first direction, and it was already a live bug independent of language: `mind.lua` expects the English `"Self-Reflection"` while `init.sh` writes the German `"Selbstreflexion"` — a mismatch discovered while investigating this. This entry only fixes the `sys.md` section-header side; `mind.md` and `agent.md` are separate, larger fixes (each has its own divergent-template problem) and are tracked for a follow-up pass.

**Approach:** additive, not a rename. A `resolveHeading()` helper (new in `shared/utils/soulParser.js`, matching the pattern already used in `soul-mcp/lib/herz.mjs`) tries the English heading first, falls back to the German one, and defaults to English for brand-new content. Every place that reads or writes a named section now goes through this resolution instead of a hardcoded literal — so a German-header soul and an English-header soul produce identical behavior everywhere.

**Changed**
- `app/composables/useSoul.js`: `buildDefaultSoul()` template translated to English (headers + `*Not yet described.*` / `*No sessions yet.*` placeholders + `## Social Sphere` / `## Agent Sandbox` — verified safe, the actual privacy/access boundary is the language-neutral `<!-- SOCIAL:START/END -->` / `<!-- AGENT:START/END -->` markers, never the heading text, across all 10 files that reference these blocks). The manual-soul-update placeholder-stripping logic now matches both languages; the Session Log protected-section guard now recognizes both variants too.
- `shared/utils/soulParser.js`: added `resolveHeading()`; `SOUL_TOPIC_MAP` (keyword → section relevance matching for system-prompt context selection) now lists both language variants per section, and gained English keyword equivalents alongside the existing German ones (additive — fixes what was likely a silent relevance-matching gap for English-speaking users, who'd never trigger any German keyword); `buildSoulContext()`'s hardcoded always-included sections now resolve via `resolveHeading()`.
- `shared/utils/soulMaturity.js`: `SCORED_SECTIONS` converted to the same `{en, de}` fallback pattern already used server-side in `soul-mcp/tools/soul_maturity.mjs` — previously a flat German-only list, meaning any English-header soul would have scored 0 on the entire "Depth" pillar. `SIGNATURE_KEYWORDS` gained English equivalents alongside the German ones (additive).
- `app/pages/soul.vue`: the soul-viewer/editor's `SOUL_SECTIONS` now resolves each section's actual heading (English or German) via `resolveHeading()` before both reading (`getContent`) and writing (`saveEdit`) — previously hardcoded to German literals only, which would have silently shown every section as empty (and any edit would have written a *new*, duplicate German heading instead of updating the real English one) for an English-header soul.
- `app/composables/useVerifySpecial.js`: `extractIdentitySections()`'s section list extended to include the English variants (additive).
- `soul-mcp/lib/herz.mjs`: two remaining crystallization steps (ideas/learnings distillation) were still matching the German heading only, inconsistent with the rest of the file, which already had a local `resolveHeading()` helper used everywhere else — now resolve consistently like the rest of the Archivist.
- `app/composables/useSpotify.js`, `useYouTube.js`: updated a stale comment referencing the German heading name (no functional matching in either file — verified).

**Verified:** ran a synthetic parse/score/context-select test against an equivalent German-header soul and an English-header soul side by side — identical maturity score, identical `resolveHeading()` resolution, identical `buildSoulContext()` section selection for both.

---

## [1.1.2] — 2026-07-22

**Fixed: `useChainAnchor.js` had the same bug class as v1.1.1, but in sys.md's own `soul_anchor_history` frontmatter field — every anchor just pushed onto whatever local history already existed, with no check against the current contract. After a contract migration this meant `soul_anchor_history` would keep growing forever with entries from a retired contract mixed into every future anchor's history.**

**Fixed**
- `app/composables/useChainAnchor.js`: before appending, now compares the local history length against `chainMetrics.anchor_count` (the validated, contract-scoped server truth already fetched for the page). A mismatch means local history is stale, so it's discarded and rebuilt fresh instead of extended indefinitely.
- Directly repaired the affected soul's already-corrupted `sys.md` on the live node (3 blended entries → the 1 real v1.1.0-contract entry) using the existing `vault_fs.mjs` decrypt/encrypt helpers — verified the file decrypts correctly afterward.

---

## [1.1.1] — 2026-07-22

**Fixed: `soul_chain_metrics_cli.mjs`'s RPC-lag protection re-injected local `anchor_history.json` entries with a real tx hash missing from the fresh on-chain result, with no age limit — after the v1.1.0 contract migration, this permanently resurrected years-old entries from the retired v1.0.0 contract on every `/anchor` page load, blending pre- and post-migration history into one wrong-looking continuous chain (stale genesis date, chain age, anchor count).**

**Fixed**
- `soul-mcp/soul_chain_metrics_cli.mjs`: the merge-back loop that re-adds "missing" local entries now only applies within a 5-minute window of `now` — long enough to cover genuine RPC lag right after a fresh anchor broadcast, too short to resurrect anything from a retired contract. Verified live on kro.uxprojects-jok.com: `anchor_history.json` self-healed from 4 blended entries (stale genesis `2026-07-17`) down to the 1 real v1.1.0-contract entry (correct genesis `2026-07-22`) on the next run.

---

## [1.1.0] — 2026-07-22

**SoulRegistry v1.1.0 deployed and verified on Polygon Mainnet — `0xE80B92edFE2286a5a941D10123AbF5E11F76342B`, block 90,674,283. Replaces v1.0.0 (`0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B`, retired), which had a permanent 365-anchor lifetime cap incompatible with anchoring's role as an ongoing liveness signal. Deployed via `contracts/deploy.mjs`; verified on Polygonscan (solc v0.8.36+commit.8a079791, optimizer 200 runs, exact match).**

**Breaking:** every soul must re-anchor on the new address — `getHistory()` is scoped per contract instance, there is no automatic migration of pre-2026-07-22 anchor history.

**Changed**
- 4 hardcoded contract-address locations updated: `soul-mcp/lib/blockchain.mjs`, `soul-mcp/lib/soul_indexer.mjs`, `soul-mcp/tools/verify_identity.mjs`, `app/composables/useChainAnchor.js` — plus each file's `DEPLOY_BLOCK` (83,500,000 → 90,674,283) and `blockchain.mjs`'s five `DEPLOY_TS` occurrences (1775260800 → 1784716422), used for block-rate calibration.
- `README.md`, `ARCHITECTURE.md`: contract address updated (4 occurrences in README, 1 in ARCHITECTURE.md).
- `docs/spec/soul-registry-contract.md`: full rewrite for the new contract — address/deployer/block/verification metadata updated to v1.1.0; `MAX_ANCHORS_PER_SOUL` and `MaxAnchorsReached` removed from the Constants table, Custom Errors tables, and ABI (they no longer exist in the deployed contract); new "What Changed in v1.1.0" section; new "History" section preserving the retired v1.0.0 address, retirement date, and its 2026-06-05 function-level verification table for provenance.

---

## [1.0.99] — 2026-07-22

**Added: `contracts/deploy.mjs` — a self-run deployment script for `contracts/SoulRegistry.sol`, since Remix wasn't a viable path this time. Compiles via `solc` and deploys via `ethers.js`, both already used elsewhere in this repo.**

**Added**
- `contracts/deploy.mjs`: reads `PRIVATE_KEY` from an env var (never a CLI arg, never logged), compiles the contract fresh via `npx solc --standard-json` (stdin-piped — the CLI does not accept a file-path argument for standard-json input, an easy trap), estimates gas, prints an explicit confirmation prompt before sending the real transaction, then prints the deployed address, explorer link, and the exact compiler version + optimizer settings needed for the Polygonscan verification step. Supports `NETWORK=amoy` for a free testnet dry run first. The private key never leaves the machine it's run on — this script is meant to be run by the operator locally, not through an assistant or any third party.
- Verified end-to-end against Polygon Mainnet with a throwaway key: compiles cleanly, connects, reads real balance, and correctly aborts before sending a transaction when the wallet is unfunded.
- `docs/spec/soul-registry-contract.md`, `README.md`: documented the script as the deployment path in the v1.1.0 `[!WARNING]` and Repository Structure.
- `.gitignore`: added `contracts/.solc-input.json` (a stray intermediate file from script development, already removed from the working tree).

---

## [1.0.98] — 2026-07-22

**Added: `contracts/SoulRegistry.sol` — a v1.1.0 SoulRegistry with `MAX_ANCHORS_PER_SOUL` (365, immutable) removed. Not yet deployed; the deployed v1.0.0 contract is unaffected and this changelog entry does not change any live behavior.**

**Why:** Anchoring has become an ongoing liveness signal — a soul that stops anchoring reads as inactive/dead. `MAX_ANCHORS_PER_SOUL = 365` is a genuine Solidity `constant` in the deployed contract (baked into bytecode, no admin setter); combined with the existing `COOLDOWN_SECONDS = 1 day` rate limit, any soul anchoring daily hits this cap permanently after ~1 year — `anchor()` then reverts with `MaxAnchorsReached` forever, with no recovery short of a full contract redeploy. That directly contradicts continuous liveness anchoring as a design goal.

**Added**
- `contracts/SoulRegistry.sol`: new file, based on the verified deployed v1.0.0 source (fetched from Polygonscan, compiled clean with `solc 0.8.36`, ABI-diffed against v1.0.0 to confirm only the intended surface changed). `MAX_ANCHORS_PER_SOUL` and the `MaxAnchorsReached` error are removed entirely; `COOLDOWN_SECONDS` is unchanged (still a legitimate anti-spam rate limit, not a lifetime cap — no conflict with daily liveness anchoring). `VERSION` bumped to `"1.1.0"`.
- `docs/spec/soul-registry-contract.md`: new `[!WARNING]` documenting the not-yet-deployed status and the real cost of ever deploying it — every soul's on-chain history restarts at zero (`getHistory()` is scoped to a single contract instance, no migration path), and the contract address is hardcoded independently in 4 code files plus 3 docs.
- `.gitignore`: added `*.abi`/`*.bin`/`contracts/artifacts/`/`contracts/cache/` for local Solidity build output.
- `utils/project-hash.mjs`, `README.md`: `.sol` added to the fingerprint's tracked source extensions and the Integrity section's extension list — `contracts/SoulRegistry.sol` is now covered by the release fingerprint like any other source file.
- `README.md`, Repository Structure: added the new `contracts/` entry; also fixed a stale "cron" mention in the `health-sync/install.sh` description left over from v1.0.91's cron removal.

---

## [1.0.97] — 2026-07-22

**Fixed: the Constants table put `anchorFee` alongside `MAX_ANCHORS_PER_SOUL`/`COOLDOWN_SECONDS` as if all three were equally fixed — but `anchorFee` is a regular mutable `public` state variable (`uint256 public anchorFee = 0.5 ether;`), not a Solidity `constant` like the other two. 0.5 POL is just its deployment-time initial value; the owner can change it at any time via `setFee()`.**

**Fixed**
- Split the table: `## Constants` now holds only the two true, unchangeable `constant`s. New `## Fee (mutable)` section holds `anchorFee`, explicit that it's the current value, not a fixed protocol parameter.

---

## [1.0.96] — 2026-07-22

**Fixed: v1.0.95's soul-registry-contract.md note hedged on the contract's pause/withdraw semantics, claiming "this repo doesn't hold the Solidity source." That was avoidable — the contract is verified on Polygonscan and its full source is fetchable there. Fetched and read the actual verified `SoulRegistry.sol`, which also surfaced a bigger gap: the doc's "minimal ABI" (built from the frontend's `useChainAnchor.js`, itself a browser-side subset) was missing 8 of 16 custom errors, 5 of 7 events, and 3 public view getters entirely.**

**Fixed**
- Replaced the hedged `[!NOTE]` with confirmed facts, citing the actual source: `pause()` only gates `anchor()` via the `whenNotPaused` modifier — every view function keeps working while paused; `withdraw()` can only ever reach `anchorFee` payments since `receive()` rejects any direct POL transfer (`revert("Use anchor()")`).
- Added the 8 missing custom errors (`NotOwner`, `NotPendingOwner`, `AlreadyPaused`, `ContractNotPaused`, `InvalidAddress`, `NothingToWithdraw`, `WithdrawFailed`, `CannotTransferToSelf`) — split into a new two-table layout (user-facing vs. admin-only) for readability.
- Added a new **Events** section (previously events only appeared buried in the ABI block, undocumented elsewhere) covering all 7: `Anchored`, `SoulTransferred`, `FeeUpdated`, `Paused`, `Unpaused`, `OwnershipTransferProposed`, `OwnershipTransferred`.
- Added the 3 missing public view getters: `paused()`, `owner()`, `pendingOwner()`.
- Added a new **Contract Identity** section for the on-chain `NAME`/`AUTHOR`/`DESCRIPTION`/`VERSION` public constants.
- Renamed "ABI (minimal)" → "ABI (complete)" — it now actually is.

---

## [1.0.95] — 2026-07-22

**Styled and cross-linked docs/spec/soul-registry-contract.md — the doc was a complete orphan (nothing in README.md, ARCHITECTURE.md, or genesis-chain.md linked to it) and skipped this repo's established intro-paragraph convention.**

**Added**
- Intro paragraph linking to `genesis-chain.md` (concept) and `README.md#on-chain-anchoring` (why every node must share the same contract), matching the pattern already used in `sys_md.md`/`genesis-chain.md`.
- Cross-links added *to* this doc from README's On-Chain Anchoring section, ARCHITECTURE.md's On-Chain Anchoring section, and `genesis-chain.md` — previously unreachable from anywhere else in the docs.
- A `[!NOTE]` on the Admin Functions table being a deliberate centralization point (single owner wallet can set the fee, pause new anchors, withdraw collected fees) — with an explicit caveat that this repo doesn't hold the Solidity source, so exact `pause()`/`withdraw()` semantics should be verified on Polygonscan directly rather than taken on this doc's word.

---

## [1.0.94] — 2026-07-22

**Added: the health-sync `[!WARNING]` notice now says integrating real-life gadgets (wearables, health trackers) into SYS is an active area of work — signals this is being actively developed, not a dead/abandoned experiment.**

**Added**
- `docs/spec/health-sync.md`, `health-sync/README.md`: one sentence added to the Experiment warning.

---

## [1.0.93] — 2026-07-22

**Fixed: v1.0.92 restyled the health-sync "Experiment" notice as plain italic text, misreading the maintainer's feedback backwards — the point was that a hand-bolded blockquote still renders pale/muted-gray on GitHub regardless of manual bold/emoji, not that pale was the goal. Converted to a real `[!WARNING]` GFM alert instead, matching this repo's established convention that alerts (not DIY blockquote styling) are how anything meant to stand out gets flagged.**

**Fixed**
- `docs/spec/health-sync.md`, `health-sync/README.md`: plain italic blockquote → `[!WARNING]` alert.

---

## [1.0.92] — 2026-07-22

**Changed: the "Experiment — not a core SYS feature" notices in health-sync docs used a bold `⚠️` blockquote, which reads as an urgent alert. Per the established convention, alerts are reserved for things that actually matter (security, breaking changes) — a low-stakes "heads up, this is experimental" label should visually recede, not shout. Restyled as plain italic blockquote text.**

**Changed**
- `docs/spec/health-sync.md`, `health-sync/README.md`: `> ⚠️ **Experiment** — ...` → `> *Experiment — ...*`.

---

## [1.0.91] — 2026-07-22

**Merged `docs/spec/health-sync-garmin.md` and `docs/spec/health-sync-troubleshooting.md` into one `docs/spec/health-sync.md`, and found a real product-decision violation along the way: `install.sh`/`setup_server.sh` were silently installing a weekly cron job, contradicting the maintainer's standing "Health Sync is always manual, never cron" decision — removed the cron from the code rather than just documenting around it.**

**Fixed**
- **Cron removed from the codebase** (not just the docs): `health-sync/install.sh` no longer writes a crontab entry; `health-sync/setup_server.sh` no longer writes `/etc/cron.d/sys-health-sync`. Both scripts' help/output text updated to describe manual sync instead ("run manually — no cron").
- `health-sync/writer.py` had a mixed-language output bug: `fmt_sleep()` hardcoded German `"/Nacht (Ø)"` instead of the English `"/night (avg)"` every other line already used; `fmt_steps()` explicitly converted the English `11,131` thousands separator to German `11.131` via `.replace(",", ".")`. Both fixed to plain English, matching the rest of `health.md`'s output and the doc's own example.
- `writer.py`'s Monthly Summary "Active days: X / Y" used `today.day` (day of the current calendar month, 1–31) as the denominator, even though the data is fetched over a fixed rolling 30-day window (`fetch_days(30, ...)`) — produced nonsensical values like "18 / 3" on the 3rd of a month. Fixed the denominator to the actual window size, `30`.
- The doc's `last_sync` frontmatter example showed `YYYY-MM-DD` only; the actual code writes a full timestamp (`datetime.now().strftime('%Y-%m-%d %H:%M:%S')`). Corrected to `YYYY-MM-DD HH:MM:SS`.
- Discovered and documented a previously-undocumented in-app Garmin login/MFA flow (`POST /api/health/login`, `POST /api/health/mfa`, the Settings → Gesundheit "Garmin Login" button) — it handles Garmin's MFA challenge from the browser, but explicitly does **not** fix IP rate-limiting (it logs in from the same server IP as `health_sync.py`), which the troubleshooting doc's old text didn't distinguish and a reader could easily have tried as a rate-limit "fix" that silently can't work.
- Three broken links to a nonexistent `docs/experiments/health-sync.md` fixed across `health-sync/README.md` (badge line) and `health-sync/install.sh` (two echo lines) — now point at the new merged `docs/spec/health-sync.md`.
- `lua/health_setup.lua`'s docstring comment updated to drop the now-removed "(Venv, Cron)" mention.

---

## [1.0.90] — 2026-07-22

**Fixed: docs/spec/soul-registry-contract.md's "ABI (minimal)" block was missing `anchorFee()` and all seven custom errors — verified the complete real ABI against `app/composables/useChainAnchor.js`, which the frontend actually uses to call the contract.**

**Fixed**
- Added `function anchorFee() view returns (uint256)` to the ABI and as a documented Public Function — it's the fee you must read before calling `anchor()` (sending less reverts with `InsufficientFee`), used at `useChainAnchor.js:76,656`.
- Added all seven custom errors to the ABI (`RateLimitExceeded`, `MaxAnchorsReached`, `NotSoulOwner`, `SoulNotRegistered`, `InsufficientFee`, `InvalidSoulId`, `InvalidContentHash`, `ContractPaused`) plus a new "Custom Errors" reference table — without these, ethers can't decode revert reasons into anything more than raw hex; `parseContractError()` in `useChainAnchor.js` relies on exactly this error set.
- Verified the rest of the doc (constants, function signatures, `keccak256(soul_id)`/`sha256(sys.md)` verification steps) against the same file and `soul-mcp/lib/blockchain.mjs` — no further discrepancies found.

---

## [1.0.89] — 2026-07-22

**Changed: docs/spec/genesis-chain.md's `soul_anchor_history` entry example showed a single bare object, even though the field is an array that grows with every anchor — expanded to a realistic three-entry array, and verified the `genesis` field's actual behavior against `lua/soul_register_anchor.lua`.**

**Changed**
- `docs/spec/genesis-chain.md`: single-object example → three-entry array (genesis + two later anchors), matching the "All anchors (JSON array, inline)" description right above it.
- Corrected the `genesis` field claim: it's set on the first entry only and **omitted entirely** on every later entry (not `"genesis": false`) — verified against `#history == 0` check in `soul_register_anchor.lua:86`.

---

## [1.0.88] — 2026-07-22

**Added: README.md's Agent Marketplace teaser never mentioned dynamic pricing at all — added a sentence covering the mechanism, plus the price-decay behavior verified against `lua/soul_price.lua`: `anchor_count`/`chain_age_days` only ever grow, so the demand term (`buyers_30d`) is the only thing that can push the price back down, decaying automatically as buyers age out of the rolling 30-day window.**

**Added**
- `README.md`, Agent Marketplace teaser: one sentence on dynamic pricing (price floor never drops, demand term decays over a 30-day window) with a link to `docs/spec/dynamic-pricing.md`.

---

## [1.0.87] — 2026-07-22

**Changed: removed the "Nextcloud" comparison from UPDATING.md's pull-based update model paragraph — unlike Mastodon and Matrix.org (non-profit projects), Nextcloud GmbH is a commercial company, and the maintainer preferred not to name a company for a comparison unrelated to any actual integration.**

**Changed**
- `UPDATING.md`: "the same model used by Mastodon, Matrix/Synapse, Nextcloud, and most self-hosted federated software" → "...Mastodon, Matrix/Synapse, and most self-hosted federated software".

---

## [1.0.86] — 2026-07-22

**Fixed: SECURITY.md's Scope paragraph still had the old "UX-Projects (Jan-Oliver Karo)" parenthetical form from v1.0.66 — the repo's naming convention settled since then on no separator at all ("UX-Projects Jan-Oliver Karo"), and this one line was never revisited.**

**Fixed**
- `SECURITY.md`, Scope: "UX-Projects (Jan-Oliver Karo) infrastructure" → "UX-Projects Jan-Oliver Karo infrastructure". Full-tree grep confirms no other live doc still has a wrong-order/wrong-separator instance — remaining matches are CHANGELOG history describing past fixes, left untouched per this repo's rule of never editing changelog history.

---

## [1.0.85] — 2026-07-22

**Fixed: the third-party-services disclaimer lists (NOTICE, README.md ×2) were missing Zapier — verified it's a genuine integration (`app/composables/useMcpTools.js`, `lua/mcp_call.lua`, `lua/mcp_tools.lua`, `server/api/mcp-*.js`, i18n locales), not an oversight to leave out.**

**Fixed**
- `NOTICE`: added `Zapier (workflow automation)` to the THIRD-PARTY SERVICES list.
- `README.md`: added Zapier to both third-party-services disclaimers (the top `[!NOTE]` teaser and the full Legal section paragraph).

---

## [1.0.84] — 2026-07-22

**Clarified: KEYMANAGEMENT.md's `@create-agent` re-registration steps didn't say what actually happens — verified against `lua/create_agent.lua` that it deletes the old ElevenLabs agent (`DELETE .../convai/agents/{old_agent_id}?force=true`) and provisions a brand-new one, not an in-place update.**

**Changed**
- webhook_token rotation's "Effect on connected services" table and "What you must do": both now say `@create-agent` creates a new agent (old one deleted), instead of the vaguer "re-register".

---

## [1.0.83] — 2026-07-22

**Changed: "MCP (Claude Desktop)" was too narrow — MCP OAuth is a protocol, not a single client. Generalized to "MCP clients (Claude Desktop, Claude Code, ChatGPT connectors, …)" in KEYMANAGEMENT.md's three "Effect on connected services" tables, and added Claude Code to the same list already present in ARCHITECTURE.md's MCP tools section.**

**Changed**
- `KEYMANAGEMENT.md`: all three `MCP (Claude Desktop)` table rows → `MCP clients (Claude Desktop, Claude Code, ChatGPT connectors, …)`.
- `ARCHITECTURE.md`: MCP OAuth client list now includes Claude Code alongside Claude Desktop and ChatGPT connectors.

---

## [1.0.82] — 2026-07-22

**Fixed: soul_master_key Rotation's "Effect on connected services" table in KEYMANAGEMENT.md claimed the ElevenLabs Agent and MCP/Claude Desktop connections both break on master-key rotation — traced `set_master.lua` end to end and found neither claim holds.**

**Fixed**
- Verified `/api/set-master` (`lua/set_master.lua`) only ever writes `soul_master_key`/`soul_master_key_prev`/`admin_token`/`anthropic_key` to `master.json`/`soul_admin.json` — it never touches `authorized_services.json` or `webhook_token` in `api_context.json`.
- ElevenLabs Agent auth is 100% `webhook_token`-based (`lua/create_agent.lua` bakes `?token=` query params into every webhook URL, no `soul_cert`/`master_key` reference anywhere in the file) — so "Stops working after grace period, run `@create-agent` again" was false. Corrected to "None — uses webhook_token, independent of soul_master_key", matching the already-correct wording in the soul_cert rotation table above it.
- MCP/Claude Desktop auth is a random CSPRNG service token validated purely by string lookup + `expires_at` in `check_service_token()` (`lua/vault_auth.lua`) — same story, corrected to "None — uses OAuth service token, independent of soul_master_key".
- Removed the now-inaccurate "Run `@create-agent` in chat to re-register..." step from "What you must do" and the "old master_key_prev expires — ElevenLabs agent stops working" line from the timing diagram.
- Fixed a stale "API tab" reference in the same "What you must do" section (should say Config tab, per the v1.0.81 fix).

---

## [1.0.81] — 2026-07-22

**Fixed: KEYMANAGEMENT.md had five German UI-navigation-path fragments left over in an otherwise-English doc — verified the correct English labels/tab names against `app/components/SettingsModal.vue` and `i18n/locales/en.json` before translating, and caught a real path error in the process.**

**Fixed**
- **soul_cert rotation trigger was wrong, not just untranslated**: doc said "Einstellungen → API → Cert rotieren" — there is no such path. The `cert_rotate` button actually lives under the **Config** tab's **Soul-Cert** section (`settings.tab_config` / `settings.soul_cert`), not the API tab. Corrected to "Settings → Config → Soul-Cert → Rotate Soul-Cert" in both occurrences.
- `Einstellungen → Admin → Neuer Master-Key` → `Settings → Config → Server Admin → New Soul Master Key` — verified against the `isAdmin` block's `settings.server_admin` / `settings.new_master_key` keys, also nested under the Config tab, not a separate "Admin" tab (no such tab exists).
- `Vault-Einstellungen → API-Kontext → Webhook-Token Feld → neuen Wert eintragen und speichern` → `Settings → Services → ElevenLabs Agent URL → Renew token` — the webhook_token rotate button (`settings.token_renew`) sits next to the ElevenLabs Agent URL field under the **Services** tab (`tab = 'dienste'`), not under any vault-specific settings screen.
- `Einstellungen → Admin` (localStorage-fallback field description) → `Settings → Config → Connect Admin` — matches the `settings.admin_connect` section shown to non-admin multi-hoster users.
- Two remaining German sentences (`t=0 Master-Key rotiert...` timing line, and the `soul_cert = Tür zum Node...` admin_token intro line) translated to English.

---

## [1.0.80] — 2026-07-22

**Fixed a broad pass through the rest of ARCHITECTURE.md — verified every remaining technical claim against the actual config/code, checked for stray German text (none found beyond what was already fixed this session).**

**Fixed**
- **Rate Limiting table was almost entirely wrong**: only `gate`'s rate happened to be correct. `chat` said 2 r/s (actual 1 r/s), `api` said 5 r/s (actual 30 r/s), `mcp` said 10 r/s (actual 5 r/s), `oauth` said 5 r/s (actual 3 r/s). The table also only listed 5 of 11 declared zones — `auth`, `chat_api`, `vault_upload` weren't mentioned at all, despite gating 25, 1, and 2 locations respectively, and `main`/`system`/`health` (declared but currently unapplied to any location) weren't acknowledged either. Rebuilt the whole table against `nginx.conf.template`'s `limit_req_zone` declarations and every `limit_req zone=` usage in `vhost.conf.template`.
- **sys.md YAML example and frontmatter table**: same `cert_version`/`soul_growth_chain`/`soul_chain_anchor`-shown-as-always-present bug already fixed in `README.md`/`sys_md.md` (v1.0.70) was still present here, untouched. Aligned to match, including the missing `elevenlabs_agent_id`/`elevenlabs_voice_id` fields and a table of when the three dynamic fields actually get added.
- `useConnectedVault` composable description said "via MCP" — it's a plain `fetch()` against `/api/vault/public/{soul_id}`, no MCP protocol involved. Corrected.
- `ELEVENLABS_API_KEY` is declared in `nginx.conf.template` (`env ELEVENLABS_API_KEY;`) but was missing from both the Environment Variables table and the "Environment variables in nginx workers" example block. Added to both.

---

## [1.0.79] — 2026-07-22

**Fixed: KEYMANAGEMENT.md's intro and heading said "the three keys" — the table right below has always listed four (`soul_master_key`, `soul_cert`, `admin_token`, `webhook_token`).**

**Fixed**
- `KEYMANAGEMENT.md`: "the three keys" → "the four keys", "## The Three Keys" → "## The Four Keys". Simple count mismatch against the doc's own table.

---

## [1.0.78] — 2026-07-22

**Fixed: all three "Available tools" lines in ARCHITECTURE.md's MCP Server section were stale — verified against `soul-mcp/tools/index.mjs`'s three registration functions (`registerTools`/`registerPaidTools`/`registerPeerTools`) and `lua/create_agent.lua`'s ElevenLabs webhook config.**

**Fixed**
- **Owner**: listed 19 tools; the owner's `registerTools()` actually registers ~45 — missing entries included `soul_delete`, `soul_cloud_push`, `create_agent`, `mind_read`/`mind_write`, `peer_inbox`/`peer_send`, `health_check`/`food_log`/`health_sync`, `soul_chain_status`/`soul_chain_metrics`, `soul_anchor_paypal_*`, `soul_paid_comment`, `soul_context_query`, `soul_preview`, `soul_read_by_token`, `call_me`, `session_end`, `soul_draw`, `shop_write_read`/`shop_log`, `context_write`, `verify_identity`, `beme_chat_paid`. Reworded to a categorical description instead of an exhaustive list, since that's exactly what went stale.
- **Paid agent**: said 13 configurable options via `amortization.agent_tools`; the actual `allowed.has(...)` checks in `registerPaidTools()` show 16 — `beme_chat_paid`, `health_check_payed`, and `shop_write_read` were missing (all three were the subject of past bugfixes in this same CHANGELOG — v1.0.40–42 — that evidently never made it back into this doc). Also documented the always-on tools (`soul_discover`, `soul_preview`, `soul_paid_comment`, read-only `vault_shared_get`/`vault_shared_list`) that exist outside the configurable set entirely.
- **Trusted peer soul**: said "same list as paid agents" — false. `registerPeerTools()` is a structurally different function with its own tool set (`soul_write_peer`, `soul_context_query_peer`, `profile_get_peer`, per-media-type list/get pairs) and no per-tool allowlist, unlike the paid-agent path.
- Added a note on the ElevenLabs voice agent's tool access, previously undocumented in this section entirely: it uses a separately curated ~27-tool webhook list configured in `lua/create_agent.lua`, not the raw MCP protocol — broad, but not literally the owner's full MCP tool set.

---

## [1.0.77] — 2026-07-22

**Docs: documented the AI/agent-paying side of x402 in ARCHITECTURE.md — previously only the soul's receiving side was covered. The operator's own test wallet (private key, mainnet, real money) was entirely undocumented outside the Settings UI itself.**

**Added**
- `ARCHITECTURE.md`, new subsection after Amortization: describes the operator's dedicated x402 test wallet (Settings → x402) — private key export from a MetaMask account created specifically for this, AES-256-GCM encrypted storage, real signed payments on Polygon mainnet via `@x402/evm`/viem, verified against `soul-mcp/lib/x402_agent_wallet.mjs` and `x402_client.mjs`.
- A `[!WARNING]` alert on private-key custody risk, matching the same "never your main wallet" language already shown in the Settings UI itself (`i18n` `settings.x402_key_desc`).
- A closing note framing autonomous AI-driven payments as an early, experimental, industry-wide capability — this implementation is explicit operator test tooling, not a production spending-budget feature.

---

## [1.0.76] — 2026-07-22

**Docs: turned the plain-text `amortization.trusted_souls[]` mention in ARCHITECTURE.md into a concrete JSON example, matching the style used for `api_context.json`/`master.json` elsewhere in this doc.**

**Changed**
- `ARCHITECTURE.md`, "Soul-to-Soul Connections": added an example showing the mixed-array structure (plain UUID for same-server peers, `{soul_id, endpoint}` for cross-domain) — verified against `lua/soul_amortization.lua`'s `trusted_souls` validation logic.

---

## [1.0.75] — 2026-07-22

**Fixed: ARCHITECTURE.md's peer-setup instructions pointed at a UI location that doesn't exist — "Agent Marketplace → Connected Peers." Trusted peers are added on their own dedicated Peers page.**

**Fixed**
- `ARCHITECTURE.md`, "Soul-to-Soul Connections": corrected the setup instruction to the actual UI (`app/pages/peers.vue`, nav label "Peers" — a top-level page, not nested under Agent Marketplace). Noted that both features share the same `amortization.trusted_souls` backend field regardless of which frontend writes to it, since that part of the original claim was accurate.

---

## [1.0.74] — 2026-07-22

**Docs: `master.json`'s example in ARCHITECTURE.md showed only 4 of the ~14 fields the file actually accumulates — including missing `multi_hoster`, the exact field the very next paragraph describes being added to this same file.**

**Fixed**
- `ARCHITECTURE.md`, "Gate & Multi-Domain": added `admin_token`, `multi_hoster`, and `node_soul_id` to the `master.json` example — verified against every `master_data`/`existing`/`mdata` field assignment across `lua/*.lua`. Added a one-line note that operator service config (API keys, `mcp_url`, `reown_project_id`) also accumulates here, omitted from the example for brevity rather than pretending it doesn't exist.
- Clarified that `node_soul_id` is specifically what the Multi-Hoster paragraph's "node soul lock" checks — tying the new field directly to the explanation already there instead of leaving it unexplained.

---

## [1.0.73] — 2026-07-22

**Docs: added an `api_context.json` example to ARCHITECTURE.md's Cert-version fallback note, matching the style already used for `master.json` further down.**

**Changed**
- `ARCHITECTURE.md`: added a minimal `api_context.json` example right after the fallback explanation, verified against `lua/api_context.lua` and `lua/hmac_helper.lua`. Uses `soul_cert_version` as the field name — confirmed canonical (`hmac_helper.lua`'s `read_cert_version()` reads `soul_cert_version` first, falling back to a legacy `cert_version` key for backward compatibility).

---

## [1.0.72] — 2026-07-22

**Docs: added a concrete example under the `@msg` format explanation — a Social Sphere exchange plus an Agent Sandbox with a paid agent's appended comment, so readers get a visual of the area instead of just the abstract format string.**

**Changed**
- `README.md`, "sys.md Format": added a lorem-ipsum-content example showing both spheres populated, including the `[tx:...]` payment-reference suffix `soul_paid_comment` attaches automatically — ties directly into the write-permissions fix from v1.0.71.

---

## [1.0.71] — 2026-07-22

**Fixed: the three-sphere table's "Who writes" column for Agent Sandbox said "Owner only" in all three places it appears (README.md, ARCHITECTURE.md, docs/spec/sys_md.md) — wrong. Paid agents can append a comment there via `soul_paid_comment`.**

**Fixed**
- `README.md`, `ARCHITECTURE.md`, `docs/spec/sys_md.md`: verified against `soul-mcp/tools/soul_paid_comment.mjs` and `lua/soul_paid_comment.lua` — a paid agent holding a valid x402/PayPal `access_token` can call `soul_paid_comment` to insert a structured `<!-- @msg ... -->` entry immediately before `<!-- AGENT:END -->`. It's append-only (the agent can't replace or clear the block), but it's real write access, not "Owner only." Corrected all three tables to "Owner + paid agents (append-only comment via `soul_paid_comment`)".

---

## [1.0.70] — 2026-07-21

**Docs: verified `docs/spec/sys_md.md` against the code (`useSoul.js`, `herz.mjs`, `soul_parser.mjs`, `lua/beme.lua`) — found and fixed a real cross-doc inconsistency with README.md's frontmatter example, plus applied current GitHub-alert styling.**

**Fixed**
- `docs/spec/sys_md.md`'s frontmatter example already matched `buildDefaultSoul()` exactly, but its field table omitted three real fields (`cert_version`, `soul_growth_chain`, `soul_chain_anchor`) that get added dynamically once their feature is first used, rather than being part of a freshly created soul. Added a table documenting when each appears.
- `README.md`'s frontmatter example had the opposite problem: it showed `cert_version: 0`, `soul_growth_chain: []`, and `soul_chain_anchor: null` as if present on every fresh soul (they're not — confirmed against the same `buildDefaultSoul()`), and was missing `elevenlabs_agent_id`/`elevenlabs_voice_id`, which are. Aligned to match `sys_md.md` and the actual template, with the same "added later" clarification.
- Everything else checked (Archivist trigger names `onAnchor`/`onSilence`/`onCircadian`/`onAgent`, `queryLongmem()`, `soul_context_query` tool, `beme_chat`'s LONGMEM-prepending via `lua/beme.lua`, the MIND-repo case-study link) confirmed accurate — no changes needed.

**Changed**
- `docs/spec/sys_md.md`: two prose paragraphs (the opportunistic-versioning note, the lazy-MINDIDX-migration note) converted to `[!NOTE]` GitHub alerts. The bare `README.md` → "Integrity" text reference turned into an actual link (`../../README.md#integrity`). Dropped a stray German "Stand: 2026-07-04" dateline — inconsistent with every sibling `docs/spec/*.md` file, none of which carry one.

---

## [1.0.69] — 2026-07-21

**Docs: labeled the cross-device QR-scan flow as Proof-of-Concept in verification-hub.md — implemented and functional per code, but not yet tested at scale, unlike the other Status-section items presented at full confidence.**

**Changed**
- `docs/spec/verification-hub.md`: "Cross-device (QR-scan)" bullet in Status now reads "— Proof-of-Concept, test". Matching annotation added to the Known Limitations & Roadmap checklist so the `[x]` there doesn't read as more battle-tested than it is.

---

## [1.0.68] — 2026-07-21

**Docs: removed the `[!IMPORTANT]` security-fix alert from verification-hub.md's Status section — the fix is complete and already reflected in the `[x]` checkmarks under Known Limitations & Roadmap; the callout also referenced a "Server-side proof" heading that doesn't exist in this doc's structure.**

**Changed**
- `docs/spec/verification-hub.md`: dropped the alert, folded its one still-relevant fact (biometric methods carry real server-side proof) into the existing intro sentence.

---

## [1.0.67] — 2026-07-21

**Docs: `docs/spec/verification-hub.md` was badly out of date — verified against the current codebase and substantially rewritten. The system evolved well past what the spec described: a page split, a real cross-device flow, and a security fix closing a hole where biometric methods could be marked verified without any real scan happening.**

**Fixed**
- The spec described a single page `/verbindung`, which no longer exists. The verification UI is now split: `/connection` is the owner dashboard that only *launches* verification, and `/verify` is a standalone page that does the actual work — including a `vt:`-token-authenticated cross-device flow (scan a QR code with your phone, verify there, the desktop tab auto-closes via a claim mechanism).
- Documented 6 `lua/verify_*.lua` endpoints that exist in the codebase but weren't in the spec at all: `verify_claim` (multi-device coordination), `verify_fingerprint_check` and `verify_passkey_register` (the WebAuthn security fix), `verify_human_check` (a new, independent on-chain "real human" scoring dimension), `verify_reown` (WalletConnect init for the scanning device), and `verify_voice_hq_check` (anti-replay).
- **Security-relevant correction**: the old spec's `/api/verify/complete` description implied the browser's `verified: true` claim was trusted. It no longer is, for any biometric method — the server re-derives `verified` from proof flags it sets itself (a real WebAuthn signature check, an anti-spoofing/liveness face check, or an anti-replay spoken-code check via ElevenLabs Scribe). Plain FFT-only `voice` (no anti-replay proof) has been retired as a challenge method; `voice_hq` is the only voice option now.
- Updated the MCP tool section: `verify_identity`'s `method` parameter is now a plural `methods` array with no `voice` option, the tool short-polls internally instead of requiring the caller to always re-call, and its result message now surfaces every scoring dimension (per-method timestamps, wallet, blockchain-anchor line) instead of a single pass/fail.
- Updated the challenge-file-format example with ~12 fields that didn't exist in the old spec (`claimed_by`, `voice_code`, `webauthn_challenge`, the `*_verified` proof flags, `human_verified` and related fields, `method_results`).
- Design Decisions and Overview tables reworked to reflect four independent, stacking proof dimensions (fingerprint, face, voice, human check) plus wallet 2FA, instead of four mutually-exclusive "levels."

---

## [1.0.66] — 2026-07-21

**Docs: the uxprojects-jok.com link in the two Markdown-rendered "UX-Projects Jan-Oliver Karo" mentions only wrapped "UX-Projects" — expanded to cover the full name.**

**Changed**
- `README.md`, Copyright and trademark lines: `[UX-Projects](...) Jan-Oliver Karo` → `[UX-Projects Jan-Oliver Karo](...)`, link now spans the whole name.

---

## [1.0.65] — 2026-07-21

**Docs: dropped the separator between "UX-Projects" and "Jan-Oliver Karo" per the maintainer's clarification — the correct form is "UX-Projects Jan-Oliver Karo" with no dash or comma, not "UX-Projects — Jan-Oliver Karo" as fixed in v1.0.64.**

**Changed**
- `README.md`, `NOTICE`, `LICENSE`, `ARCHITECTURE.md`: removed the em-dash/comma between the two in every co-occurrence (copyright lines, trademark clause, required attribution string). Order from v1.0.64 (UX-Projects first) unchanged.

---

## [1.0.64] — 2026-07-21

**Fixed: v1.0.63 paired "UX-Projects" with "Jan-Oliver Karo" but in the wrong order — corrected per the maintainer's explicit ordering to "UX-Projects — Jan-Oliver Karo" (trade name first) everywhere the two appear together, not just the one line touched in v1.0.63.**

**Fixed**
- `README.md` (Copyright line, trademark line), `NOTICE` (Copyright line, trademark clause, required attribution string), `LICENSE` (Copyright line), `ARCHITECTURE.md` (Copyright line): reordered every "Jan-Oliver Karo — UX-Projects" / "Jan-Oliver Karo, UX-Projects" to "UX-Projects — Jan-Oliver Karo" / "UX-Projects, Jan-Oliver Karo". Verified via full-tree grep that no wrong-order instance remains and every co-occurrence now matches.

---

## [1.0.63] — 2026-07-21

**Fixed: the trademark ownership line in License said "trademarks of Jan-Oliver Karo" — the name alone, without "UX-Projects" attached. Same naming-consistency category as v1.0.61 (which fixed "UX-Projects" appearing without the name), just the reverse direction: this repo's convention pairs both wherever ownership is stated, and NOTICE and the Copyright line right above this one already do.**

**Fixed**
- `README.md`, "License": "trademarks of Jan-Oliver Karo" → "trademarks of Jan-Oliver Karo — UX-Projects", matching NOTICE's trademark clause and the Copyright line two lines above it.

---

## [1.0.62] — 2026-07-21

**Docs: Status section's "Smart contract" bullet claimed verifiability but didn't print the address, same gap already fixed in On-Chain Anchoring (v1.0.59).**

**Changed**
- `README.md`, "Status": added the contract address `0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B` inline and linked "Polygonscan" to the address-specific page instead of the bare site.

---

## [1.0.61] — 2026-07-21

**Fixed: "UX-Projects" appeared standalone (without the natural person's name attached) in three sentences — in Germany, a trade name used alone without the operating individual's name attached can read as implying an incorporated entity ("Unternehmen") rather than a sole proprietor. Every other mention in this repo already correctly pairs it with "Jan-Oliver Karo" (copyright lines, NOTICE) or uses first person; these three were the exceptions.**

**Fixed**
- `README.md`, Legal section: "UX-Projects does not process personal data..." and "...stored by UX-Projects" → first person ("I"/"me"), matching the surrounding paragraphs, which already use "I have no access...", "I do not provide hosting...".
- `README.md`, Legal section: "...touchpoint between a running SYS node and UX-Projects infrastructure..." → "my infrastructure", same reason.
- `SECURITY.md`, Scope: "...shared surface between nodes and UX-Projects infrastructure..." → "UX-Projects (Jan-Oliver Karo) infrastructure" — this document doesn't use first person elsewhere, so paired the name instead of switching voice.
- Verified via full-tree grep: no other standalone occurrences remain anywhere in the tracked `.md`/`NOTICE`/`LICENSE` files.

---

## [1.0.60] — 2026-07-21

**Docs: added a link to the live soul-scan tool right under the `soul_discover`/Agent Marketplace explanation in On-Chain Anchoring.**

**Changed**
- `README.md`, "On-Chain Anchoring": added `Browse anchored souls: sys.uxprojects-jok.com/scan` under the `soul_discover` paragraph, so the abstract "reads exclusively from this contract" claim has an immediately clickable way to see it in practice.

---

## [1.0.59] — 2026-07-21

**Docs: removed a duplicated Agent Runner description from the Node modes table, made the anchoring contract address visible inline (not just as a link target), and added a no-affiliation disclaimer for Reown.**

**Changed**
- `README.md`, "Node modes": dropped the Autonomous Agent Runner description from the **Personal Node** table cell — already fully covered by its own teaser section under "What the node does" (added in v1.0.49), this was a leftover duplicate.
- `README.md`, "On-Chain Anchoring": the anchoring paragraph linked to the contract address on Polygonscan but never printed the address itself. Added it inline.
- `README.md`, "On-Chain Anchoring": the Reown Project ID sentence didn't disclose the same no-affiliation relationship already stated for every other third-party service in this README. Reworded to say so explicitly and to make clear any WalletConnect-compatible alternative an operator wires in themselves works just as well — Reown isn't a hard dependency of the protocol, just what this codebase happens to use.

---

## [1.0.58] — 2026-07-21

**Docs: converted every remaining plain blockquote in README.md to a GitHub alert (`[!NOTE]`/`[!IMPORTANT]`). Plain `>` blockquotes render as low-contrast, muted-gray text on GitHub — easy to skim past, especially in dark mode. Alerts render with a colored icon + background instead.**

**Changed**
- `README.md`: 8 blockquote blocks converted — the top status banner and third-party disclaimer, the domain/SSL prerequisite, both "installer scripts not included" notes, the "Node mode ≠ Shared server" and "recover-password.sh ≠ reset.sh ≠ deinstall.sh" disambiguations, the Repository Structure installer-scripts pointer, and the on-chain anchoring contract requirement. Hard requirements and the pre-release status got `[!IMPORTANT]`; everything else got `[!NOTE]`. `UPDATING.md`'s two alerts (`[!TIP]`, `[!WARNING]`, added in v1.0.56) and the Archivar heading warning (`[!WARNING]`, v1.0.55) were already converted — this closes out the rest.

---

## [1.0.57] — 2026-07-21

**Docs: trimmed two stale/hedging sentences from Installation, and surfaced the Public/Private Node choice in "Node modes" — it's set at the same `init.sh` startup step as Personal/Multi-Hoster but wasn't mentioned there at all.**

**Changed**
- `README.md`, Installation: removed "will be released together with full documentation at official launch" (an open-ended future promise, not evergreen reference content) and the "setup script prompts for domain, email..." sentence (operational detail duplicated by the `init.sh` walkthrough operators actually get when they run it).
- `README.md`, "Node modes": added a short lead-in noting `init.sh` asks two *independent* questions at startup — soul count (Personal/Multi-Hoster, already documented here) and Marketplace access (Public/Private, previously only documented under "What is a SYS node?"). Linked rather than duplicated the full Public/Private table.

---

## [1.0.56] — 2026-07-21

**Docs: extracted the "Updating Your Node" section into a dedicated `UPDATING.md` — it had grown to 73 lines across 5 subsections (release process, update commands, a low-memory-VPS OOM workaround, protocol-compatibility guarantees, customization safety, verification), which was the main source of clutter in an otherwise project-overview README. Also fixed a stale file-extension list in the Integrity section.**

**Changed**
- New `UPDATING.md`: full content moved here verbatim (two of its callouts upgraded to GitHub `[!TIP]`/`[!WARNING]` alerts along the way, consistent with the Archivar warning fixed in v1.0.55).
- `README.md`, "Updating Your Node": condensed to a two-sentence summary plus a link to `UPDATING.md`. Heading and anchor (`#updating-your-node`) unchanged, so existing cross-references from `SECURITY.md`, `ARCHITECTURE.md`, `CHANGELOG.md`'s own header, and README's own table of contents all still resolve.

**Fixed**
- `README.md`, "Integrity": the fingerprint file-extension list said `.vue, .js, .lua, .sh, .json, .md` — missing `.mjs`, `.template`, and `.css`, all of which `project-hash.mjs`'s `INCLUDE_EXTS` actually covers. Also reworded the exclusion description to match the git-ls-files-based mechanism from v1.0.49, rather than the pre-fix filesystem-walk framing.

---

## [1.0.55] — 2026-07-21

**Docs: made the Archivar heading warning visually stand out as a GitHub alert instead of a plain blockquote, and replaced the "Key tools" sample in MCP Integration with a set that actually reflects real usage instead of an arbitrary pick.**

**Changed**
- `README.md`, "sys.md Format": the `## ` heading warning inside AGENT/SOCIAL blocks is data-loss-relevant (the Archivar can silently remove misused headings) and was easy to skim past as a regular note. Converted to a GitHub `[!WARNING]` alert, which renders with a distinct colored box on GitHub instead of blending in with the surrounding blockquotes.
- `README.md`, "MCP Integration": dropped "Claude and other" from "Claude and other MCP-compatible AI clients" — same over-specific-then-generic wording already trimmed from the intro diagram in an earlier pass, just missed here.
- `README.md`, "MCP Integration" Key tools: replaced `vault_manifest`, `audio_list`, `verify_human` with `context_get`, `verify_identity`, `beme_chat`, based on real per-session tool-call frequency (`verify_identity` and `soul_write` were the two most-used tools by a wide margin; `beme_chat` and `context_get` next; `audio_list` wasn't called at all). `soul_read` and `soul_discover` kept — `soul_read` is mandated first-call by the tool-selection guide regardless of raw frequency, `soul_discover` is the network/marketplace discovery entry point referenced elsewhere in this README.

---

## [1.0.54] — 2026-07-21

**Fixed: `soul_write` with `mode="replace"` on the Agent Sandbox or Social Sphere section silently stripped the `<!-- AGENT:START/END -->` / `<!-- SOCIAL:START/END -->` delimiters, collapsing a protected sphere back to plain text. `append`/`prepend` had a related bug — new content landed outside the markers instead of inside them. Found live: an AI session wrote a message into "Agent Sandbox" via `soul_write`, the markers vanished, and the chat UI stopped rendering the section because it depends on them to recognize it.**

Not a security issue — `lua/soul_paid_read.lua` already fails closed (404 `no_agent_content`) when the markers are missing, it never falls back to leaking the full `sys.md`. But relying on every AI session remembering to hand-preserve markers on every write is fragile, and it broke in practice on the first real trigger.

**Fixed**
- `soul-mcp/tools/soul_write.mjs`: `updateSection()` now detects sphere markers in the section's *existing* content and operates on the content between them, not on the raw section text — for all three modes. `replace` re-wraps the new content in the same markers; `append`/`prepend` insert inside them instead of outside. If the caller's new content already includes its own marker pair (a marker-aware caller), it's trusted verbatim and not double-wrapped. Sections without markers are unaffected — verified with a standalone test covering replace, append, a plain unmarked section, and the caller-supplied-markers case.
- Scoped to `soul_write.mjs` only: `soul_write_peer.mjs` already has its own marker-safe Social Sphere-only write path, `session_end.mjs`'s `updateSection` only ever targets "Session-Log", and `mind.put.js` has no sphere markers to begin with — none of the three needed this fix.

---

## [1.0.53] — 2026-07-21

**Docs: Repository Structure had drifted significantly from the actual tree — verified every listed path/file against disk and fixed what didn't match. `sys.md Format` was checked too and is fully accurate (stage-based read filtering, >18-entry LONGMEM dedup threshold, and the bilingual EN/DE section-name mapping in `herz.mjs`/`soul_maturity_peer.mjs` all confirmed in code) — no changes needed there.**

**Fixed**
- `README.md` Repository Structure, `app/pages/`: listed German page-file names (`dateien`, `chronik`, `einnahmen`, `reife`, `verankern`, `verbindung`, `einrichten`, `einstellungen`, `exportieren`) that no longer exist — the files were renamed to English at some point and the README never caught up. Replaced with the current actual names (`vault`, `chronicle`, `earnings`, `maturity`, `anchor`, `connection`, `setup`, `settings`, `export`) and added eight pages that existed but were never listed at all (`agb`, `call`, `health`, `index`, `join`, `link`, `soul`, `verify`).
- `app/components/`: added `SysMark` and `SysPageLoading` (exist, weren't listed); removed `SoulViewer` (doesn't exist — stale).
- `lua/`: "80+ endpoints" understated the current count by nearly half — corrected to "150+" (actual: 152).
- `soul-mcp/tools/`: "50+ tools" corrected to "65+" (actual: 69).
- `soul-mcp/lib/`: added four files that exist but weren't listed — `artwork_log.mjs`, `eu_withdrawal_terms.mjs`, `x402_agent_wallet.mjs`, `x402_client.mjs`.
- `server/openresty/`: added `vhost-http.conf.template`, which exists alongside the two already listed.
- `utils/`: removed `sync-server.sh` — it does not exist anywhere in the repo or on disk; this project stopped using that pattern (Lua/nginx changes are now discussed and deployed manually, per this same README's own release-process guidance) and the listing was never updated. Added `generate-icons.mjs` (used in the `build`/`generate` npm scripts) and `gen-pricing-params.mjs` (generates `pricing_params.json` from `pricing.js`), both present but unlisted.
- `docs/`: "Protocol documentation, API reference, specs" overstated what's there — only `docs/spec/` exists, no separate API reference. Tightened to "Protocol specs (docs/spec/)".
- `utils/project-hash.mjs` line: fixed a literal `$HASH$HASH$HASH$HASH$HASH` artifact left in the description text.

---

## [1.0.52] — 2026-07-21

**Docs: fixed an inaccurate encryption-scope claim in the Technical Stack section — verified against `lua/migrate_encrypt_generic_context.lua` and `soul-mcp/tools/context_write.mjs`.**

**Fixed**
- `README.md`: "Encrypted at rest, server-managed" listed exactly six named files (`health.md`, `mind.md`, `income.md`, `earnings.md`, `activity.md`, `agent.md`) as if that were the complete set. The actual rule is broader and generic: every file under `vault/context/` — including arbitrary files created via `context_write` — is encrypted whenever `cipher_mode` is `"ciphered"`, with exactly two deliberate exceptions (`shopping.md`, `prompts.md`). The six named files were the original, narrower rule before `migrate_encrypt_generic_context.lua` generalized it; the README hadn't caught up. Reworded to state the general rule with the six as examples, not the exhaustive list.
- Rest of the Technical Stack section (Nuxt 4 / `ssr: false`, OpenResty API layer, flat-file data layout, `SYS\x01` + 16-byte-IV encryption format, `vault_key_hex` field name) checked against the current code and confirmed accurate — no other changes.

---

## [1.0.51] — 2026-07-21

**Docs: de-duplicated the sys.uxprojects-jok.com link that had accumulated once per teaser section in "What the node does" (8 repeats) into a single pointer at the top of the section.**

**Changed**
- `README.md`: added one "Full feature list, screenshots, and walkthroughs" link right under the `### What the node does` heading; removed the repeated per-section link from Identity & Authentication, AI & Soul, Health & Body, Agent Runner, Peer Network, Networking, Agent Marketplace, and Growth & Anchoring. Internal links that point somewhere more specific than the marketing site (`docs/spec/verification-hub.md`, the `#what-is-a-sys-node` anchor for the Public Node requirement) were kept.

---

## [1.0.50] — 2026-07-21

**Docs: condensed the last detailed bullet list — Identity & Authentication now matches the teaser style used across the rest of "What the node does".**

**Changed**
- `README.md`: **Identity & Authentication** collapsed from a 7-bullet list into a one-paragraph teaser, keeping the internal spec link ([docs/spec/verification-hub.md](docs/spec/verification-hub.md)) alongside the external feature-list pointer. All of "What the node does" now follows the same short-teaser-plus-link pattern.

---

## [1.0.49] — 2026-07-21

**Fixed a real bug in `utils/project-hash.mjs`: it walked the filesystem directly instead of using git's tracked-file list, so local, untracked files sitting in a maintainer's working copy (a private-repo `init.sh`, `public/soul_test.md`, `server/openresty/INDEX.md` — all correctly gitignored, none of them shipped in this repo) silently became part of the fingerprint. Every fingerprint value published in this README before this release was computed with that extra, non-reproducible input — an operator running the command against their own clean `git clone` would never have matched it.**

**Fixed**
- `utils/project-hash.mjs`: file list now comes from `git ls-files` instead of a recursive `readdirSync` walk. Only what a fresh clone actually receives gets hashed — untracked/gitignored files can no longer leak into the fingerprint, regardless of what happens to be sitting in whoever's local working directory when they run it. Verified reproducible: identical hash from this working copy and a fresh `git clone` of it.
- As a side effect, file traversal order changed too (`git ls-files` sorts by full path; the old code sorted per-directory during a recursive walk, which orders differently whenever a filename and a directory name share a prefix, e.g. `app.md` vs. `app/`). Combined with the file-set fix, this means **no fingerprint published before this release is comparable to fingerprints from this release onward** — this is a one-time algorithm change, not evidence of tampering. Pin to this tag or later before relying on the fingerprint check.

**Docs**
- `README.md`: moved the Vault bullets and the "Local Vault Folder Structure" diagram up into the "What is a SYS node?" intro, right after the paragraph that first introduces the sys.md + Vault relationship, instead of leaving readers to encounter the concept in the intro and its detail eight sections later.
- `README.md`: condensed **Peer Network (Social Sphere)** into the same short-teaser-plus-link style as the other feature sections (see v1.0.48).

---

## [1.0.48] — 2026-07-21

**Docs: further README trim following v1.0.45's professionalization pass — dropped a dated milestone writeup and condensed three more feature sections (Agent Runner, Networking, Agent Marketplace, Growth & Anchoring) into the same short-teaser-plus-link style already used for AI & Soul and Health & Body.**

**Changed**
- `README.md`: removed the "AI-native Peer Messenger (Milestone — 2026-06-12)" writeup — a dated, narrative walkthrough of a one-off test, not evergreen reference material.
- `README.md`: **Agent Runner**, **Networking**, **Agent Marketplace**, **Growth & Anchoring** condensed from bullet lists to one-paragraph teasers pointing to [sys.uxprojects-jok.com](https://sys.uxprojects-jok.com) for the full feature list — same pattern as **AI & Soul** and **Health & Body** in v1.0.45. **Identity & Authentication**, **Peer Network**, and **Vault** stay as detailed bullet lists — security/protocol fundamentals, not consumer feature marketing.

**Notes**
- No fingerprint change — README.md is excluded from `project-hash.mjs` by design (self-referential).

---

## [1.0.47] — 2026-07-21

**Fixed two loose ends left over from the v1.0.46 cleanup: a phantom MCP tool (`twilio_call_config` — documented and prompted for, but never actually implemented anywhere) and a dev/prod parity gap in `/api/vision-analyze` that the WaveSpeed removal made worse rather than better.**

**Removed — `twilio_call_config` phantom tool**
- `soul-mcp/prompts/index.mjs`: removed the `### twilio_call_config` entry (and the now-empty `## 9. Infrastructure & Integrations` section it was the only member of) from the tool-selection guide injected into the AI's context. The guide told the AI this tool exists and how to call it; no such tool was ever registered in `soul-mcp/tools/index.mjs` or implemented in `lua/` — calling it would have failed.
- `README.md`: removed `twilio_call_config` from the Repository Structure tool list.
- `NOTICE`: removed "Twilio (WhatsApp)" from the third-party services list — no working integration exists to disclaim.

**Restored — `/api/vision-analyze` dev mirror**
- `server/api/vision-analyze.post.js`: recreated. The version deleted in v1.0.46 was WaveSpeed-only and never matched production `lua/vision_analyze.lua`'s actual behavior (food detection, product detection, soul-reaction, ambiguity check) — deleting it turned a silent mismatch into a 404 for the whole camera-vision feature in `npm run dev`. The new version ports `lua/vision_analyze.lua`'s prompt and response-parsing logic line-for-line (same German prompt text, same field set) so `app/components/ChatInterface.vue`'s existing handling code — untouched by this fix — works correctly in dev, not just in production.

**Notes**
- No production Lua or MCP server code changed — `lua/vision_analyze.lua` was already correct and is the source of truth the new dev mirror was ported from.

---

## [1.0.46] — 2026-07-21

**Security/Cleanup: removed two features that were never meant to be in this public repo — WaveSpeed AI image/video generation (accidentally ported from the private `personal-sys-vps-private` build, where the equivalent feature works against the maintainer's own key) and the Emergency Protocol AI-lock (no UI trigger anywhere in the frontend — `emergencyOpen`/`emergencyLevel` were set but never flipped to open the modal, confirmed by a full-tree grep for any click handler wiring it up). Both were fully functional at the API layer despite being unreachable or unintended here, which is its own risk. Same category of issue as the operator-data leaks fixed in v1.0.43/v1.0.44, this time a feature-level leak rather than a data leak.**

**Removed — WaveSpeed AI**
- `lua/wavespeed_submit.lua`, `lua/wavespeed_result.lua`: deleted — dedicated submit/poll endpoints for the WaveSpeed generation API.
- `soul-mcp/tools/soul_generate.mjs`: deleted — the MCP tool and its in-app-chat counterpart (`case 'soul_generate'` in `soul-mcp/server.mjs`), unregistered from `soul-mcp/tools/index.mjs`.
- `server/api/vision-analyze.post.js`: deleted — this dev-mode mirror of `/api/vision-analyze` only ever implemented the WaveSpeed-generation-prompt path, not the production `lua/vision_analyze.lua`'s food/product/soul-reaction detection (a pre-existing, unrelated dev/prod drift — noted but not fixed here, out of scope).
- `lua/get_config.lua`, `lua/set_config.lua`, `lua/test_key.lua`: `wavespeed_key` config field and status reporting removed; other keys (Anthropic, ElevenLabs, MCP URL, Reown) unaffected.
- `app/components/SettingsModal.vue`: WaveSpeed API key entry UI removed.
- `app/components/ChatInterface.vue`, `app/composables/useClaude.js`: removed the `soul_generate` tool definition and its dead `genPrompt`/`outputMode` local variables (already unused before this fix — no button ever consumed them); corrected a stale `// WaveSpeed image generation` comment on what is actually the generic message-action dispatcher.
- `server/openresty/vhost.conf.template`, `server/openresty/nginx.conf.template`: removed the two WaveSpeed routes, the `WAVESPEED_KEY` env passthrough, and `api.wavespeed.ai`/`*.wavespeed.ai` from the CSP allowlist.
- `server/api/mind.get.js`: removed the now-orphaned `## Wavespeed` section from the default `mind.md` template.
- `i18n/locales/{de,en}.json`, `NOTICE`, `SECURITY.md`, `server/openresty/INDEX.md`: WaveSpeed strings and mentions removed.

**Removed — Emergency Protocol**
- `lua/soul_emergency.lua`, `lua/emergency_guard.lua`: deleted — the isolate/restore/status endpoint and the rewrite-phase guard three other endpoints (`soul-update`, `chat`, `beme`) called into.
- `server/api/emergency/{isolate,restore,status}.post|get.js`: deleted — dev mirrors.
- `app/components/EmergencyModal.vue`: deleted.
- `app/pages/session.vue`: removed the modal mount, its import, `emergencyOpen`/`emergencyLevel`/`emergencyActive` state, the `handleEmergencyChange` handler, and the `/api/emergency/status` poll on load.
- `server/openresty/vhost.conf.template`: removed the `/api/emergency/*` location block and the three `rewrite_by_lua_file emergency_guard.lua` gates on `soul-update`, `chat`, and `beme`.
- `i18n/locales/{de,en}.json`: removed the `emergency` key block.

**Docs**
- `README.md`: removed the **Emergency Protocol** feature section and its `EmergencyModal`/`emergency_guard.lua` mentions in Repository Structure. (WaveSpeed was already absent from the current README text before this release — see v1.0.45.)

**Notes**
- `server/openresty/me.uxprojects-jok.com`: removed from the repo — a real, generated vhost config for the maintainer's own domain that should never have been tracked here (`project-hash.mjs` already excluded it from the fingerprint as "generated instance file, not template", but it stayed in git). Same category as the operator-data leaks in v1.0.42–44. Added to `.gitignore` to prevent recurrence. Its edits earlier in this same entry are retained in git history but the file itself is gone from `main`.
- `NOTICE` still lists Twilio as an integrated third-party service; per this same investigation it has no working implementation anywhere in `lua/` or `soul-mcp/tools/` (only a prompt-template mention) — flagged, not removed here since it wasn't part of this cleanup's confirmed scope.

---

## [1.0.45] — 2026-07-21

**Docs: professionalization pass across the public-facing documentation — dead links removed, README given visual structure (badges, table of contents, tightened status banner), the three German-language `docs/spec/` files translated to English and restructured out of dev-diary form, plus new repo-level polish (SECURITY.md, GitHub topics, homepage URL).**

No application code changed in this release — documentation and repository metadata only.

**Fixed**
- `README.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`: removed links to `ONBOARDING.md` and `docs/overview.md` — neither file exists in this repo. Replaced with pointers to the content that actually covers the same ground (`README.md#installation`, `README.md#updating-your-node`, `docs/spec/`).
- `README.md`: the `sys.md Format` example showed a `version: 2` frontmatter without `cert_version`, while `ARCHITECTURE.md` documents `version: 3` with `cert_version` as current — read together, this looked like the two docs disagreed on the schema. Updated the example to `version: 3` + `cert_version: 0`, and added a line clarifying that existing `version: 2` souls remain fully compatible (no migration needed), linking to `docs/spec/sys_md.md` for the full lifecycle.

**Changed**
- `README.md`: added License/release/protocol badges under the title, a table of contents before the first section, and rewrote the "Work in progress" banner into a single, more confident status callout — same substance (active development, pre-release, production use on the maintainer's own node), less repetition, no more warning emoji.
- `docs/spec/genesis-chain.md`, `docs/spec/soul-registry-contract.md`: translated from German to English for consistency with the rest of the documentation. `soul-registry-contract.md`'s dated "Tested 2026-06-05" section reframed as a standing `## Verification` section.
- `docs/spec/verification-hub.md`: translated to English and restructured — removed the dev-session narrative ("Aktuelle Entwicklung", commit hashes) in favor of a `## Status` section stating current state as fact, and promoted the architecture-decisions table out of the session log into a standing `## Design Decisions` section. The open-items list is now `## Known Limitations & Roadmap` instead of a dated TODO checklist.
- `README.md` intro ("Your node on the internet"): "sole user" was only accurate for Personal mode — reworded to state the operator/soul distinction explicitly for Multi-Hoster. The identity description now names the Vault (`vault/context/*.md`, fetched via the `context_list`/`context_get` MCP tools) alongside sys.md, rather than implying sys.md alone is the identity store. Removed the "No provider has access / No cloud dependency" callout as redundant restating of points already made.
- `README.md` "What is a SYS node?": added a Vault explanation (sys.md as the compact core vs. the Vault as everything around it) and a **Public vs. Private Node** explanation — a separate, previously undocumented install-time flag (`init.sh` → `/var/lib/sys/config/public_node`) that gates whether the node accepts Agent Marketplace / paid external-agent traffic at all, independent of Personal/Multi-Hoster soul mode and of the trusted-peer whitelist. Cross-referenced from the **Agent Marketplace** feature bullets.

**Added**
- `SECURITY.md`: responsible-disclosure contact and scope, addressing the gap highlighted by the PII-leak incidents fixed in v1.0.43/v1.0.44.
- GitHub repository topics (`self-hosted`, `ai-agent`, `mcp`, `model-context-protocol`, `decentralized-identity`, `openresty`, `nuxt`, `protocol`) and homepage URL (`sys.uxprojects-jok.com`) — previously unset.

**Notes**
- `karo-familie.de` referenced in the v1.0.26 entry below was flagged during this pass and intentionally left untouched — out of scope for this release, tracked separately.
- Fingerprint recalculated after all `.md` changes (the hash covers `.md` files) — see `## Integrity` below.

---

## [1.0.44] — 2026-07-21

**Security/Cleanup: systematic sweep of the entire current tree for operator-specific data that had leaked into this generic template repo beyond the i18n sections fixed in v1.0.43 — real address/phone/name/username in an actively-wired legal-notice page, plus a personal Linux username and hardcoded paths in devops scripts.**

`personal-sys-vps` is meant to be a neutral protocol foundation — every operator sets up their own instance on top of it via the separate `sys-installer` repo. Content specific to the maintainer's own private node (`personal-sys-vps-private`, kro.uxprojects-jok.com) has repeatedly bled into this public repo across several sessions; this pass searched systematically for phone numbers, names, addresses, and usernames rather than reacting to individual reports.

**Changed**
- `app/pages/agb.vue`, `public/agb.txt`: this page is not decorative — `soul-mcp/server.mjs` and `soul-mcp/tools/show_withdrawal_terms.mjs` serve it as `terms_url`/`terms_url_txt` in the EU pre-contract/withdrawal-rights consent flow shown before x402/PayPal marketplace payments (wired in during the v1.0.38 x402 port). Real operator name/address/email replaced with Lorem-ipsum placeholder text plus a visible notice that the node operator must supply their own legally-reviewed terms before accepting real payments — the route and the withdrawal-terms wiring stay functional, only the content is now a template.
- `scripts/vps/setup-claude-remote.sh`: removed a hardcoded reference to the maintainer's actual Linux username; the hardcoded `PROJECT_DIR="/var/www/SaveYourSoul"` (present in two places, including inside a generated systemd unit) replaced with an explicit `YOUR_PROJECT_DIR` placeholder an operator must edit.
- `soul-mcp/soul-mcp.service`: `WorkingDirectory=`/`EnvironmentFile=` hardcoded the same real-sounding path — unified with the `YOUR_DOMAIN`-style placeholder convention already used elsewhere in the same file.
- Cosmetic: a handful of code comments and UI placeholder examples (`soul-mcp/lib/eu_withdrawal_terms.mjs`, `app/composables/useSoulPasskey.js`, `soul-mcp/server.mjs`, `app/components/AgentMarketplacePanel.vue`, `app/components/SoulAnchorModal.vue`, both i18n locale files) referenced the maintainer's real name/city as illustrative examples — swapped for generic placeholders (`Max Mustermann`, `Berlin`, `node-a.example.com`).

**Notes**
- Confirmed clean via full-tree grep for the maintainer's real name, address, phone number, and Linux username — 0 hits outside the intentional copyright/trademark lines in `README.md`/`ARCHITECTURE.md` and the standard OSS contact address in `CONTRIBUTING.md`.
- This data is still present in this repo's git history (predates this fix, going back to the initial commit) — a separate history rewrite is planned to remove it there too; not part of this tag.

## [1.0.43] — 2026-07-21

**Fixed: a security/privacy issue and a build-breaking bug, both from the same incomplete "WIP: port v1.0.65-1.0.67 fixes from private repo" commit (`b318d17`) — four whole i18n sections (`impressum`, `datenschutz`, `lizenz`, `consentBanner`) were pasted into `i18n/locales/{de,en}.json` from `personal-sys-vps-private` without genericizing operator-specific fields or ever running a build against this repo.**

Found live-updating karo-familie.de: `npm run generate` failed immediately with `[unplugin-vue-i18n] Detected HTML in ... message`, because these sections embed raw HTML (`<p>`, `<a>`, `<strong>`) directly in translation strings — something every other HTML-bearing message in this file avoids. Tracing the failing key (`impressum.s1Content`) surfaced the real problem: unlike the neighboring `s5Content` field (which correctly uses a `__NODE_URL__` placeholder), the operator's real name, home address, and phone number had been pasted in as literal content — live on the public GitHub repo since 2026-07-15/2026-07-20. None of the four sections are wired to any `.vue` page in this repo (confirmed via full-tree grep) — they're dead, unreferenced, and were evidently never exercised.

**Security**
- Personal contact data (name, street address, phone number) that leaked into `i18n/locales/{de,en}.json`'s `impressum`/`datenschutz` sections has been removed from current `main`. It remains in git history on older commits/tags — a separate history rewrite (`git filter-repo`/BFG) is needed to fully purge it; not done as part of this fix.

**Removed**
- `i18n/locales/de.json`, `i18n/locales/en.json`: deleted the entire `impressum`, `datenschutz`, `lizenz`, and `consentBanner` top-level keys — confirmed zero references anywhere in `app/`. (This repo's actual legal-notice page, `app/pages/agb.vue`/`public/agb.txt`, is unaffected and unrelated to this bug — it predates this port and is intentionally real content for this reference deployment.)

**Notes**
- `package-lock.json`/`soul-mcp/package-lock.json`: regenerated via a real `npm install` on both the root app and `soul-mcp` — the committed lockfiles from the v1.0.38 x402 port were incomplete (missing entries for the new `@x402/*`/`viem`/`@napi-rs/canvas` dependency tree), another sign that build was never actually run against this repo before committing.
- If a future port from the private repo reintroduces operator-identity content, genericize it the same way `s5Content`'s `__NODE_URL__` placeholder already does, and run `npm run generate` before committing.

## [1.0.42] — 2026-07-20

**Ported: `beme_chat_paid`'s owner-bypass (`v1.0.39`) only recognized the `soul_id.cert` credential format, not the 64-hex `service_token` that OAuth-connected clients (Claude.ai, ChatGPT via the Setup Assistant) actually use — that request shape fell through to the paid-`access_token` check and failed. Added a third auth path checking `authorized_services.json`, gated on `permissions.soul == true` (the same threshold that token already has elsewhere).**

## [1.0.41] — 2026-07-20

**Ported: `beme_chat_paid` was silently stripped from `agent_tools` on every save attempt — `v1.0.39` added it to the read/pin-side `ALLOWED_TOOLS` (`soul_register.lua`/`soul_register_preview.lua`) but missed a third, separate copy of the same allowlist in `soul_amortization.lua`'s write path (`PUT /api/soul/amortization`). Fixed by adding `beme_chat_paid=true` there too, matching the other two.**

## [1.0.40] — 2026-07-20

**Ported: simplified the earnings transaction table on mobile — 5 columns (TX, from, amount, period, status) don't fit a narrow viewport. Below 720px, shows only TX hash and amount (3 decimals); full 5-column table with full precision unchanged on desktop. Underlying data and CSV export unaffected.**

## [1.0.39] — 2026-07-20

**Ported four rounds of post-x402-launch fixes from `personal-sys-vps-private`, including a real security fix and two "returns wrong/zero data" bugs that a full-tree grep during this exact port surfaced.**

**Security fix**
- `lua/soul_paid_beme.lua`: this endpoint (`POST /api/soul/paid-beme`) already existed on `main` but fed the *entire* unencrypted `sys.md` — including the private sphere — into the AI's system prompt for anyone holding a valid paid access token, violating the same rule `soul_paid_read.lua` already enforces. Rewritten to use only the `<!-- AGENT:START -->…<!-- AGENT:END -->` block, and to accept the owner's own `soul_cert` as an alternative to a real payment (so an operator can test the paid conversational experience without transacting).
- `soul-mcp/server.mjs` (`handleMcp`): `soul_cert` and `peer_cert` share the identical wire format (`{uuid}.{32hex}`); connecting with the owner's own soul_cert (a documented MCP connection method) was silently misrouted as an unrecognized peer applying for trust — only `request_trust`/`request_trust_status` got registered, never the full owner toolset. Fixed with a self-check before any peer/trust-request logic runs: if the token's soul_id matches the connection target and the cert verifies cryptographically, register full owner tools instead.

**Added**
- `soul-mcp/tools/beme_chat_paid.mjs`: new MCP tool for conversational agent-paid access, scoped to the Agent Sandbox block only. Registered unconditionally for the owner (testing, no payment needed) and gated behind the same `agent_tools` chip-toggle mechanism as `audio_get`/`image_get`/etc. for paying marketplace clients. Added to `AgentMarketplacePanel.vue`'s tool picker and the `ALLOWED_TOOLS` allowlists in `soul_register.lua`/`soul_register_preview.lua`.

**Fixed**
- `soul-mcp/tools/soul_earnings.mjs`: only ever read `total_pol`/`entries` — completely ignoring `total_usdc`/`usdc_entries`, which the REST endpoint has returned since the original x402 port. An owner asking their AI "how much have I earned?" got an undefined/zero answer despite real x402 income and a correctly-showing web UI. Now reads USDC as primary, with historical POL kept as a footnote when non-empty.
- `app/pages/agb.vue` / `public/agb.txt`: never actually received the x402 wording update during the original x402 port (`v1.0.38`) — still described a "POL/Kryptowährungs-Zahlungsweg". Fixed to match what `v1.0.38`'s changelog already claimed.
- `i18n/locales/de.json`/`en.json`: `marketplace.hero_sub` and `datenschutz.s2PaymentContent` still described the removed POL flow — updated to x402/USDC + PayPal, old wording kept only as an explicit historical note where relevant.

## [1.0.38] — 2026-07-20

**Added x402 (USDC on Polygon) as a second payment rail, then removed the original direct-POL-transfer rail entirely — ported from `personal-sys-vps-private` (kro.uxprojects-jok.com), where it was built, live-tested with real USDC payments on Polygon mainnet, and subsequently used to fully replace the POL rail this same development cycle.**

x402 (Linux Foundation, standards-based) lets an autonomous AI agent pay for Soul access without any SYS-specific tooling: a 402 challenge with a `PAYMENT-REQUIRED` header, answered by a signed EIP-3009 `transferWithAuthorization` retry. Settlement runs through Polygon's own production x402 facilitator (`x402.polygon.technology`) — no account or API key needed, and SYS never holds a spendable private key server-side (same "verify, never send" model as the original POL flow's on-chain-tx verification). This was chosen over Coinbase's CDP facilitator after a broken AgentConnect-based wallet-pairing flow (see below) made the case for the simplest possible integration.

The direct POL-transfer rail (`soul_pay.lua`, `soul_pay_read.mjs`) is removed rather than kept alongside x402 — historical POL earnings/access-token records are retained (`earnings.json`, token type labels), only the *payment path* is gone. Node operators on an older POL-only soul: existing PayPal access and historical earnings are unaffected; `amortization.pol_per_request` is superseded by `amortization.price_usdc` — re-configure pricing in the Marketplace after updating.

**Breaking:** `POST /api/soul/pay` (direct POL transfer) no longer exists. `soul_pay_read` (MCP tool) is removed — a generic x402 client needs no SYS-specific payment tool.

**Added**
- `lua/soul_pay_x402.lua`: the x402 payment endpoint (`POST /api/soul/pay/x402`) — computes price fresh at both the 402-challenge and the signed-retry step (no price-quote/TTL system needed, unlike the old POL flow — x402's signature-then-facilitator-settle model closes the on-chain-confirmation timing gap that quotes existed to bridge), verifies the signed authorization server-side against the same core fields (amount, recipient, chain, asset, expiry) before trusting the facilitator's result, then delegates verify+settle to the Polygon facilitator.
- `lua/soul_price.lua`: rewritten from a POL-specific price+quote-lock endpoint into a currency-agnostic pricing-*factors* endpoint (anchor/age/demand multiplier only), used solely for the Marketplace live-preview UI.
- `lua/x402_agent_status.lua`, `x402_agent_key.lua`, `x402_agent_balances.lua`, `x402_agent_pay.lua` + `soul-mcp/lib/x402_agent_wallet.mjs`, `x402_client.mjs`: an *operator's own* x402 test wallet (Settings → x402 tab) — lets the node operator hold a small USDC/POL balance and send real x402 payments for testing, independent of the soul's own payment-receiving path. Uses `@x402/evm` + `viem` for direct private-key signing.
- `soul-mcp/server.mjs`: `POST /internal/verify-x402` (defense-in-depth checks before trusting the facilitator) and the `/internal/x402-agent/*` endpoints backing the Settings tab above.
- `amortization.price_usdc` field (Marketplace UI, `soul_amortization.lua`, `soul_register.lua`/`soul_register_preview.lua`, `soul_preview.lua`, discovery index) replacing `pol_per_request` throughout — same dynamic-pricing formula, now denominated in USDC at 6-decimal precision (was 4, matching POL's precision needs; USDC's atomic unit is 1e-6).
- EU withdrawal-rights consent flow (`show_withdrawal_terms`/`accept_digital_content_terms`, plus their REST twins): `payment_method` now `"paypal" | "x402"` (was `"paypal" | "pol" | "x402"`).

**Removed**
- `lua/soul_pay.lua`, `soul-mcp/tools/soul_pay_read.mjs`.
- POL-specific UI (Marketplace "Base amount per access (in POL)" field and live-price box), i18n strings, and legal-text (`agb.vue`/`agb.txt`) sections — all now describe x402/USDC or PayPal only. Old POL access tokens still display with a "(legacy)" label rather than being hidden.

**Fixed**
- `soul-mcp/tools/soul_paid_comment.mjs`, `soul_read_by_token.mjs`, `soul-mcp/prompts/index.mjs` (MCP system-prompt tool reference): description text, Zod field docs, 401 error messages, and the tool-reference table all pointed at the removed `soul_pay_read` tool — updated to describe paying `pay_endpoint` via x402 directly.
- `llms.txt` generator (`soul-mcp/server.mjs`) and the RFC 8707 Protected Resource Metadata endpoints (`/.well-known/oauth-protected-resource[/mcp]`, `unauthorized()` 401 body): payment hints now describe the x402 flow instead of a POL wallet transfer.

**Not ported**: the `sys-agent-x402.sh` wrapper (lets the SYS Agent Runner spend from the operator's test wallet through a narrow allowlist) and its `init.sh` installation step — both depend on `init.sh`, which doesn't exist in this repo yet. The core payment rail and the operator's manual Settings-tab test wallet work independently of this.

## [1.0.33] — 2026-07-19

**Added: `soul_draw` and `soul_generate` — two creative tools giving a soul (e.g. a personal AI identity) autonomous headless drawing and high-quality AI image/video generation, ported from `personal-sys-vps-private` (kro.uxprojects-jok.com) where they were built and live-verified across several iterations.**

These were built entirely in the private repo this development cycle and never ported until now — `soul_draw.mjs` didn't exist here at all. Porting `soul_generate` without it would have been incomplete: it shares `lib/artwork_log.mjs`'s progress-logging helper and is designed to sequentially refine a `soul_draw` sketch into a higher-quality piece using the same `canvas_id`.

**Added**
- `soul-mcp/tools/soul_draw.mjs`: headless vector/raster drawing from brush-stroke lists (Catmull-Rom interpolation + taper envelope from a handful of control points). Persistent across sessions via `canvas_id` — PNG preview in `vault_shared`, protected SVG vector source in `vault/context` (encrypted, not reachable via peer-sharing). Each call logs progress into `sys.md`'s "## Kunstwerke" section with a content hash, feeding into the existing blockchain-anchor mechanism.
- `soul-mcp/tools/soul_generate.mjs`: WaveSpeed AI image/video generation as a second creative tool. `text-to-image` and `edit-multi` (refines an existing `{canvas_id}.png`, previous stage auto-archived) run synchronously. `image-to-video` runs asynchronously across multiple calls instead — video generation commonly takes 1–5 minutes, too long for a single synchronous call; the first call submits and returns immediately, later calls with the same `canvas_id` do a single non-looping status check until the result is ready. A required `decision` field on every call documents *why* the generation happened, not just *what* — keeps the soul as author, the AI model as tool. Daily rate limit against runaway cost (image modes count on success, video counts on submission, since that's when the cost is committed).
- `soul-mcp/lib/artwork_log.mjs`: shared `sys.md` progress-logging helper used by both tools (`contentHash` is optional, for steps like "video generation started" that have nothing to hash yet).
- `soul-mcp/package.json`: added `@napi-rs/canvas` dependency (raster + SVG canvas rendering, shared 2D API).
- `soul-mcp/tools/vault_shared_list.mjs`: recognizes `{canvas_id}.svg`/`.png`/`.mp4` (no timestamp prefix) as distinct "Canvas" types, separate from one-off uploads — lets a soul rediscover and continue an existing work instead of accidentally duplicating it. Exports `formatVaultSharedList`/`listVaultSharedFs` for reuse by the in-app-chat path.
- `soul-mcp/tools/vault_shared_get.mjs`: images and SVGs now return real content (image content blocks for raster, readable text for SVG source) instead of just a URL.
- `lua/vault_shared_view.lua`/`lua/vault_shared_mcp_get.lua`: added `image/svg+xml` MIME support.
- `server/openresty/vhost.conf.template`: `/api/soul-tool`'s `proxy_read_timeout` raised from 30s to 120s — needed for `soul_generate`'s WaveSpeed polling, which can legitimately take 45–90s depending on mode.
- Wired into both tool registries (MCP `registerTools()` in `soul-mcp/tools/index.mjs`, in-app chat `/internal/run-tool` in `soul-mcp/server.mjs`, chat tool-schema mirror in `app/composables/useClaude.js`).

**Notes**
- Both tools are owner-only by design (not wired into `registerPaidTools()`/`registerPeerTools()`).
- The underlying design/philosophy document (why these tools require a documented decision rather than raw prompt passthrough) lives in the originating node's own vault content, not in this repo — node-specific, not code.

## [1.0.32] — 2026-07-19

**Fixed: found the actual root cause of the `beme_chat` empty-completion bug fixed in v1.0.31 — the model was consuming its entire `max_tokens` budget on invisible extended-thinking tokens before generating any visible text, for demanding prompts under a tight token budget.**

v1.0.31's diagnostic logging (`ngx.WARN`) turned out to never actually reach the log file on the reference deployment — `error_log` configured without an explicit level defaults to `error`, and `ngx.WARN` sits below that threshold. Bumped to `ngx.ERR`. With logging actually working, reproduced the bug with a demanding prompt + tight `max_tokens` and got the real answer from the log: the model spent the entire output budget on an extended-thinking block and never emitted a `text` block. Confirmed directly against the Anthropic API that `claude-sonnet-4-6` uses extended thinking even when it isn't requested.

**Fixed**
- `lua/beme.lua`: logging bumped from `ngx.WARN` to `ngx.ERR`; added `max_tokens` and `usage.output_tokens` to the log line for faster diagnosis.
- `lua/beme.lua`: the Anthropic request now sends `thinking: {type: "disabled"}` explicitly. Verified against the Anthropic API for both allowed models (`claude-sonnet-4-6`, `claude-sonnet-5`) — both accept the param and return real text instead of consuming the budget on thinking.

**Notes**
- Found and fixed on `personal-sys-vps-private` (kro.uxprojects-jok.com) v1.0.46, where it was verified live against a real soul and directly against the Anthropic API. Ported here unchanged — generic infrastructure, not node-specific content. If your `error_log` directive already specifies `warn` or lower, the `ngx.WARN`→`ngx.ERR` part of this fix wasn't affecting you, but the `thinking:disabled` fix still applies.

## [1.0.31] — 2026-07-19

**Fixed: `beme_chat` could return a blank/void response instead of a real answer — not a transport or auth error, but Anthropic occasionally returning HTTP 200 with no usable text content, which `beme.lua` silently forwarded as `{response:""}`.**

There was zero logging of *why* this happened — no `stop_reason`, no content-block breakdown — so it was previously undiagnosable when it occurred.

**Fixed**
- `lua/beme.lua`: when the extracted `response_text` is empty despite a 200 from Anthropic, no longer silently returns `{response:""}`. Now logs `stop_reason` and the response's content-block types to the OpenResty error log, and returns a proper `502 {"error":"empty_completion","message":"..."}` instead — surfaces as an actionable error rather than a confusing blank reply.
- `soul-mcp/tools/beme_chat.mjs`: catch block now unwraps a 502's JSON body (when present) to show the real `message` instead of the raw `SYS API 502: {...}` dump.

**Notes**
- Root cause of *why* Anthropic returns an empty completion for a given message is still open — this fix doesn't prevent it, it makes it diagnosable (via the new log line) and turns it into a clear error instead of a silent blank one.
- Found and fixed on `personal-sys-vps-private` (kro.uxprojects-jok.com) v1.0.44, where it was live-verified against a real soul (confirmed via `nginx` access-log response sizes before/after). Ported here unchanged since `beme.lua`/`beme_chat.mjs` are generic infrastructure, not node-specific content.

## [1.0.30] — 2026-07-19

**Added: `.json` is now a full context-document type (visible, uploadable/syncable, AI-readable) — previously excluded at every layer of the vault stack, both client and server.**

`.json` was explicitly excluded at 8 independent spots across the client and server: `useVault.js`'s local folder scan (both memory-mode and File-System-Access-API mode) skipped `.json` when building the file list, `useApiContext.js`'s `fileTypeFromPath()` returned `null` for any `.json` extension ("Metadaten/Config-Dateien niemals syncen"), the Vault Explorer's file-picker `accept` attribute and its `MEDIA_EXTS` archive filter both omitted `.json`, and server-side `vault_sync.lua`'s upload whitelist, `context_write.mjs`'s filename regex, `api_context.lua`'s auto-registration scan, and two peer/public-sharing `file_type_of()` helpers (`vault_connections_peer.lua`, `vault_public.lua`) all only recognized `md`/`txt`/`pdf`.

The exclusion made sense historically (guarding against internal config files like `api_context.json`/`config.json` accidentally being treated as vault content), but was too broad — it also blocked any legitimate structured-data document a node operator or the AI itself wanted to keep in `vault/context/`.

**Added**
- `.json` recognized as a `context`-type document everywhere `.md`/`.txt`/`.pdf` already were: local vault scan (`useVault.js`), sync-type mapping (`useApiContext.js`), file-picker `accept` + archive filter (`VaultExplorer.vue`), upload whitelist (`vault_sync.lua`), MCP `context_write`/`context_get`/`context_list` (regex + descriptions), auto-registration scan (`api_context.lua`), peer/public sharing type detection and inline-text serving (`vault_connections_peer.lua`, `vault_public.lua`), and the `application/json` MIME type (`api_serve.lua`, `vault_public.lua`).

**Notes**
- Two known companion files, `voice_profile.json` and `motion_profile.json` (written by `VoiceRecorder.vue`/`AudioCaptureCard.vue`/`MotionCaptureCard.vue`/`MotionRecorder.vue` under `voice_samples/`/`motion_samples/`), stay explicitly excluded by exact basename from context-document treatment — they're recorder-internal embedding data, not user documents.
- Found and verified live on `personal-sys-vps-private` (kro.uxprojects-jok.com); ported here unchanged since this is generic vault-stack infrastructure, not node-specific content. `npx nuxt generate` confirmed clean on this repo after applying the patch; the private-repo live test (`context_write` → `context_get` → `context_list` against a real soul) is documented in that repo's own CHANGELOG (v1.0.43).

## [1.0.29] — 2026-07-18

**Fixed: branding files (`logo.png`, `logo.ico`, `favicon.ico`, `manifest.json`, the PWA icons) were served with a 1-year `immutable` cache — the same rule correctly applied to Nuxt's content-hashed `/_nuxt/*` bundle assets, but these branding files keep the same URL forever even when their content changes. A returning visitor who'd loaded the site before a logo swap kept seeing the old logo for up to a year, even though the server was already serving the new one correctly.**

**Fixed**
- `server/openresty/vhost.conf.template`: added a location block for `logo.png`/`logo.ico`/`favicon.ico`/`manifest.json`/`icons/icon-192.png`/`icons/icon-512.png`, matched *before* the broad long-cache regex (nginx evaluates regex locations in file order, first match wins), giving them `max-age=300, must-revalidate` instead of the 1-year immutable default. The broad rule itself is untouched and still correctly applies `immutable` caching to genuinely content-hashed bundle files.
- `public/sw.js`: cache version bumped (`sys-shell-v12` → `v13`) as an additional safety net for any already-installed service worker.

**Notes**
- This bug was latent since the branding system was introduced (v1.0.24) — it never surfaced until a node operator actually swapped a logo file after already having visited the live site. Found and verified live on `personal-sys-vps-private` (kro.uxprojects-jok.com), ported here unchanged since the caching rule is generic infrastructure, not node-specific content.

## [1.0.28] — 2026-07-18

**Fixed: `utils/generate-icons.mjs`'s maskable-icon padding color was hardcoded to `manifest.json`'s `background_color`, which can visibly mismatch a logo's actual background — produces a faint but visible border/frame around the generated PWA icon.**

**Fixed**
- `utils/generate-icons.mjs`: now samples the source `logo.png`'s own corner pixel color at generation time and uses that as the padding color, instead of assuming it matches `manifest.json`. Falls back to the old hardcoded value only if the corner pixel is transparent or sampling fails.

**Notes**
- Found and fixed on `personal-sys-vps-private` (kro.uxprojects-jok.com) while deploying a real logo with a true `#000000` black background against the template's `#161513` charcoal default — ported here unchanged.

## [1.0.27] — 2026-07-17

**Fixed: the "How to update your node" runbook (`README.md`) didn't account for low-memory VPS deployments — `npm run generate` OOMs during the Vite client build on a 1-2GB node, since the WalletConnect dependency tree needs more heap than the default V8 limit allows.**

Hit live while updating karo-familie.de (1.8GB RAM, no swap configured) from v1.0.22 to v1.0.26: the client build crashed with "JavaScript heap out of memory" partway through bundling. Adding swap alone didn't fix it — V8's default `--max-old-space-size` is sized off *physical* RAM at process start, not swap-backed virtual memory, so the heap cap stayed low even with 2G of swap active. Both a swapfile (for physical backing) and an explicit raised heap limit (to actually make V8 use the extra room) are required together.

**Changed**
- `README.md` ("How to update your node"): added a low-memory VPS note between the rebuild step and the service-restart caveat, with the swapfile setup commands and the `NODE_OPTIONS=--max-old-space-size=3072 npm run generate` invocation.

## [1.0.26] — 2026-07-17

**Fixed: direct URL entry to the bare domain (`/`) on a locked single-hoster node showed the public "Save Your Soul." marketing landing with its own soul-file-upload login — completely unauthenticated and unrelated to `/gate`'s password/passkey login. A locked single-owner node has no legitimate use for this page (it belongs to the multi-hoster "anyone can join" case, where `/join` is the correct entry point).**

**Fixed**
- `app/pages/index.vue`: `onMounted()` now calls the existing no-auth `GET /api/gate-status` before deciding what to render. If the node is a locked single-hoster (`soul_registered && !multi_hoster`) and the visitor has no active local session, it silently redirects to `/gate` instead of ever rendering the marketing landing. A new `gateRedirectChecked` ref prevents the landing from flashing before the check resolves; the SPA-shell branch changed from a bare `v-else` to `v-else-if="hasSoul"` so it doesn't incorrectly render during that same window.
- Multi-hoster nodes are unaffected — the public landing + soul-upload/create flow remains the intended behavior there.

**Changed**
- `app/pages/gate.vue`: blank-landing logo enlarged again (120px → 220px) — needed more presence on the otherwise near-empty screen.

**Notes**
- Found, verified live, and ported from `personal-sys-vps-private` (kro.uxprojects-jok.com) — confirmed there by direct browser test with no active session.

## [1.0.25] — 2026-07-17

**Changed: the "SYS." wordmark on `/gate`, `/`, and `/join` is now the actual `logo.png` image instead of styled text — the text rendering didn't look good, and with the branding system from v1.0.24 already treating `logo.png` as the single source of truth, the wordmark itself should reflect whatever logo a node operator drops in, not a hardcoded "SYS" string.**

**Added**
- `app/components/SysMark.vue`: new component, `<img src="/logo.png" alt="SYS">` with a `size` prop (default `52px`, `/gate`'s blank landing uses `120px`). Centralizes the one place that needs editing for any future logo-related layout change, instead of three separate hardcoded blocks.

**Changed**
- `app/pages/gate.vue`, `index.vue`, `join.vue`: replaced `<div class="gate-mark">SYS<span class="dot">.</span></div>` with `<SysMark />` (Nuxt auto-imports it, same convention as `SysIcon`).
- `app/assets/css/sys-v2.css`: removed the now-unused `.gate-mark`/`.gate-mark .dot` text-styling rules (font, letter-spacing, dot color) — nothing renders that markup anymore.

**Notes**
- `alt="SYS"` kept as a fixed accessibility label, independent of the actual logo artwork — screen readers get a stable, meaningful name regardless of what a given node's `logo.png` looks like.
- Deliberately **not** ported to `personal-sys-vps-private` (kro) yet — kro has no `public/logo.png` of its own, and shipping this as-is there would show a broken image icon instead of the current working "SYS." text. Kro gets its own logo later; this stays public-repo-only until then.

## [1.0.24] — 2026-07-17

**Added: a single-source branding system — a node operator now only needs to replace three files in `public/` (`logo.png`, `logo.ico`, `favicon.ico`) to rebrand the entire app, including the PWA home-screen icons, which previously had to be regenerated by hand at fixed pixel sizes.**

Before this, `public/icons/icon-192.png` and `icon-512.png` were separate, independently-maintained files with no relationship to `logo.png`/`logo.ico` — swapping the logo files alone left the PWA install icon, Apple touch icon, and WalletConnect popup icon all showing the old artwork.

**Added**
- `utils/generate-icons.mjs`: regenerates `public/icons/icon-192.png` and `icon-512.png` from `public/logo.png` on every build. Uses a ~80% safe-zone with padding in the manifest's `background_color` (`#161513`), since `manifest.json` declares `purpose:"maskable any"` — content outside that inner zone can get clipped by an OS-applied circular/rounded mask. Skips silently (keeps existing icons) if `public/logo.png` isn't present, so a fresh clone without the file still builds.
- `package.json`: `build`/`generate` scripts now run `node utils/generate-icons.mjs` before `nuxt build`/`nuxt generate`, so the icons stay in sync automatically — no separate manual step for a node operator to remember.

**Changed**
- `public/logo.png`, `public/logo.ico`, `public/favicon.ico`: updated to the current SYS artwork (`favicon.ico` added as a redundant fallback — some browsers/crawlers probe `/favicon.ico` by convention regardless of the `<link rel="icon">` tag already pointing at `/logo.ico`, which stays primary).
- Removed unused legacy logo files: `public/logo/logo.png`, `public/logo/logo.ico` (an unreferenced duplicate folder), `public/logo_transparent.png` (unreferenced).

**Notes**
- The "SYS." wordmark shown throughout the UI (`/gate`, `/`, `/join`, etc.) is rendered as styled text (`.gate-mark`), not an image — swapping the logo files doesn't change it. A full rebrand still needs a separate text edit if the wordmark itself should change.
- `public/logo.png` is also referenced directly by the WalletConnect/AppKit popup (`useChainAnchor.js`) — that reference already just points at the static file path, so it updates automatically with no code change needed there.
- Fixed a bug caught during testing: an initial version of the script called `.resize()` twice in one `sharp` pipeline (once for the inner safe-zone, once "to be safe" after `.extend()`) — the second call silently overwrote the first's config instead of composing, producing 230×230/614×614 output instead of the requested 192×192/512×512. Removed the redundant second call; `sharp`'s `fit:'contain'` resize already guarantees the exact requested dimensions on its own.

## [1.0.23] — 2026-07-17

**Changed: redesigned `/gate` into a blank, unbranded landing screen — the login itself no longer draws any visual attention, since this URL can be linked externally (e.g. an imprint-law requirement) and shouldn't visibly read as a login/access point.**

Previously `/gate` always immediately showed either the biometric-unlock prompt or the password form, with a tagline and a "Local node" footer status line. Now the default view is just the centered "SYS." mark. A discreet, full-brightness (not dimmed — a low-opacity version proved hard to find even for the intended user) circular button in the top-right corner reveals the exact same existing login flow (biometric / password+cert form / save-credentials prompt — internal logic unchanged) as a smooth inline fade-in, no page navigation. A close (×) button lets the user return to the blank landing without a full reload.

**Changed**
- `app/pages/gate.vue`: new `revealed` ref gates the entire existing mode-driven login UI behind the discreet trigger button; added a `Transition` wrapper for the fade-in. Removed the tagline and footer status line entirely — no replacement text, the blank design itself communicates "not a public entry point" rather than a label. The "SYS." mark is significantly larger on this page only (scoped override, doesn't affect other pages using the same base class).
- `i18n/locales/{de,en}.json`: new `gate.owner_login_aria`/`gate.close_aria` strings, used only as the trigger/close buttons' accessible names and tooltips — never shown as visible body text.
- `public/manifest.json`: `start_url` changed from `/` to `/gate` — the installed PWA/home-screen icon was opening the *public* `index.vue` marketing landing (a separate page with its own soul-file-upload login), completely bypassing this redesigned entry point.

**Notes**
- `start_url` changes are typically only read at PWA *install* time — an already-installed home-screen icon likely needs to be removed and re-added for the new URL to take effect.
- `/` (`index.vue`) and `/gate` (`gate.vue`) remain two intentionally separate entry points with different purposes; this only changes which one the PWA shortcut opens by default.
- Found, iterated on, and verified live on `personal-sys-vps-private` (kro.uxprojects-jok.com), ported here with one adjustment: the private repo's version also always renders its Impressum/Datenschutz/Lizenz footer links regardless of login state (EU legal requirement specific to that node) — this generic template has no such pages, so that part was intentionally left out here.

## [1.0.22] — 2026-07-16

**Fixed: a Passkey newly registered through either Vault flow (Settings "Re-sync"/"Change Encryption", or the setup-wizard "Unlock Vault" panel) was never registered server-side for Fingerprint-Verify — so the next fingerprint verification attempt would ignore the working Vault passkey and register yet another new one, forcing an unnecessary extra biometric "save this passkey" prompt on the same device.**

**Fixed**
- `app/components/SettingsModal.vue`: new `verifyAuthHeaders()` helper, passed to both `authenticateOrRegister()` calls (Re-sync vault key, Change Encryption).
- `app/components/VaultSessionPanel.vue`: same helper added, passed to its `authenticateOrRegister()` call.

**Notes**
- `useSoulPasskey.js`'s `authenticateOrRegister()` already supported this via its second parameter — it just wasn't being used at these three call sites. Only takes effect for passkeys registered going forward.
- Found and verified on `personal-sys-vps-private` (kro.uxprojects-jok.com), ported here unchanged.

## [1.0.21] — 2026-07-16

**Fixed: newly registered passkeys are indistinguishable in the OS passkey manager (e.g. Windows Hello) when a user runs multiple SYS nodes on the same device — both `rp.name` and the default username were hardcoded identically across every node, so two entries both just showed "Soul" with no way to tell them apart.**

**Fixed**
- `app/composables/useSoulPasskey.js`: `registerPasskey()` now qualifies the WebAuthn `user.name`/`displayName` with the domain (`"{username} · {hostname}"`) instead of the bare, node-agnostic default.

**Notes**
- Only affects newly created passkeys going forward — WebAuthn has no rename operation, so already-registered credentials keep showing as plain "Soul" until deleted and re-registered.
- Found and verified on `personal-sys-vps-private` (kro.uxprojects-jok.com), ported here unchanged.

## [1.0.20] — 2026-07-16

**Fixed: fingerprint verification never pruned the local credential list after a successful match, unlike the vault-unlock flows — every attempt started from an unrestricted `authenticatePasskey()` call, so an OS with several accumulated resident credentials could keep returning an unregistered one, permanently re-triggering the self-heal path (fail → register new → re-auth, up to 3 biometric prompts) instead of ever converging on the working credential.**

**Fixed**
- `app/pages/verify.vue`: `doFingerprint()` now calls `pruneToCredentialId()` after every server-confirmed successful match — both the normal first-attempt path and the self-heal path.

**Notes**
- Found and verified on `personal-sys-vps-private` (kro.uxprojects-jok.com) via the `last_verified_at` tracking added one version earlier — confirmed two brand-new credentials were created within the same hour, each only seconds before its first successful verification, proving self-heal was firing on every attempt rather than being a one-time migration. Ported here unchanged.

## [1.0.19] — 2026-07-16

**Fixed: voice_hq verification always failed with "No security code found for this verification — please restart" when the verify challenge was created in open-choice mode (empty `methods[]`, user picks the method in the UI) and the user then chose Voice — regardless of whether an ElevenLabs API key was configured.**

**Fixed**
- `lua/verify_challenge.lua`: the server-side anti-replay `voice_code` was only pre-generated when `voice_hq` was explicitly listed in the challenge's `methods[]` at creation time — open-choice challenges never got a code, so choosing Voice there was doomed from the start. Now generated unconditionally on every challenge, matching how `webauthn_challenge` already handles the identical scenario for fingerprint.

**Notes**
- Found and verified on `personal-sys-vps-private` (kro.uxprojects-jok.com), ported here unchanged.

## [1.0.18] — 2026-07-16

**Added: `last_verified_at` tracking on passkey credentials, plus a small styling fix.**

**Added**
- `lua/verify_fingerprint_check.lua`: on every successful fingerprint verification, the matched credential's entry in `passkeys.json` now gets `last_verified_at` set (same timestamp format `created_at` already uses). Prerequisite for ever safely cleaning up accumulated stale credentials from repeated registration — without a "still in use" signal, deleting an apparently-orphaned entry risks locking out a device (e.g. a second phone) that's still using it.

**Changed**
- `app/components/SettingsModal.vue`: "Re-sync vault key" and "Change Encryption" buttons switched from ghost/outline to primary/filled style, matching the sibling "Rotate Soul-Cert" button.

**Notes**
- Found and verified on `personal-sys-vps-private` (kro.uxprojects-jok.com), ported here unchanged.

## [1.0.17] — 2026-07-16

**Added: an explicit, recorded vault-encryption method plus a safe way to change it — previously the vault key could be established via Passkey or a 12-word mnemonic with no record of which, and no supported way to migrate from one to the other short of manual file surgery.**

**Added**
- `lua/vault_unlock.lua`:
  - `POST /api/vault/unlock` accepts an optional `method` field (`"passkey"|"mnemonic"`), persisted as `vault_key_method`/`vault_key_set_at` in `api_context.json` — only on the *first* successful key establishment for a soul, never overwritten by a routine unlock that just re-proves an existing key.
  - `GET /api/vault/key-status` now also returns `vault_key_method` and `vault_key_set_at`.
  - New `POST /api/vault/rekey`: verifies `old_vault_key` against every encrypted file (reusing the existing mismatch-scan guard), then re-encrypts each file individually with `new_vault_key` and a fresh IV. Only persists the new key/method (and refreshes any active session/`webhook_token`) once every file has migrated — a partial failure leaves the old key fully intact and reports exactly which files didn't migrate.
- `server/openresty/vhost.conf.template`: new `location = /api/vault/rekey` block, same auth/rate-limit pattern as the sibling vault endpoints.
- `app/composables/useVaultSession.js`: `unlock()` gained a `method` parameter; new `rekey(oldKey, newKey, newMethod)`.
- `app/components/VaultSessionPanel.vue`: both unlock call sites pass `method`; added short tradeoff explanations for each method (Passkey: device-bound, may not sync across devices/managers; 12 words: portable but self-custody — no recovery if lost).
- `app/components/SettingsModal.vue`: Vault Key section shows the current method + when it was established; new "Change Encryption" flow (pick a new method, authenticate or generate+confirm-saved a new mnemonic, then migrate via `/api/vault/rekey`) mirroring the existing "Rotate Soul-Cert" flow.
- `i18n/locales/{de,en}.json`: new tradeoff/change-flow strings; `vault_session.method_warning` reworded to point at the new safe migration path.

**Notes**
- Found and verified on `personal-sys-vps-private` (kro.uxprojects-jok.com) with a full live round-trip against a real 10-file vault — unlock with method recorded, rekey to a new key/method, rekey back, and a wrong-key rekey attempt correctly rejected without touching any file — ported here unchanged.
- A normal unlock deliberately never changes the recorded method once a key exists — only `/api/vault/rekey` may change it, so the active method can't silently drift.

## [1.0.16] — 2026-07-16

**Fixed: the previous credential-pruning fix only covered the Settings "Vault Key" resync flow — `VaultSessionPanel.vue`'s own "Unlock Vault" button is a second, independent unlock entry point with the same stale-credential-list bug.**

**Changed**
- `app/components/VaultSessionPanel.vue`: `handleUnlock()` now prunes the local credential list after a successful passkey unlock, same as the Settings flow.
- `useVaultSession.js`: `unlock()`'s error handling now prefers the server's human-readable `message` field over the raw `error` code — the UI was showing the literal string `key_mismatch` instead of the actual explanation.

**Notes**
- Found on `personal-sys-vps-private` (kro.uxprojects-jok.com) immediately when testing this second unlock UI, ported here unchanged. Two independent entry points call the same unlock flow — worth remembering if a third is ever added.

## [1.0.15] — 2026-07-16

**Fixed: `PUT /api/context` (the write path behind the `soul_write` MCP tool) silently wrote `sys.md` in plaintext whenever the vault was locked, instead of rejecting the write.**

Root cause, in `lua/api_context.lua`'s `PUT` handler: the `else` branch's own comment said *"Open mode: Klartext nur wenn explizit cipher_mode=open gesetzt"* (plaintext only if cipher_mode is explicitly "open") — but the code never actually checked that. Any time `cipher_mode` was `"ciphered"` but no key happened to be available (vault locked), execution fell into the same plaintext branch the comment claimed was reserved for explicit open-mode operation.

**Changed**
- `lua/api_context.lua`: split the `else` branch — `cipher_mode == "ciphered"` with no key now returns `423 vault_locked` and refuses the write, instead of silently downgrading to plaintext.

**Notes**
- Found live on `personal-sys-vps-private` (kro.uxprojects-jok.com) — a `soul_write` call made while the vault happened to be locked silently overwrote `sys.md` back to plaintext, no error surfaced. Recovered there by re-encrypting the current content and restoring `vault_key_hex`. Ported here unchanged.
- Arguably the most important fix of the whole vault-encryption thread this session — earlier fixes protected secondary files from key mismatches, but this bug meant the primary soul content itself could silently lose its encryption on every write made while locked, an ongoing exposure path rather than a one-time artifact.

## [1.0.14] — 2026-07-16

**Fixed: "Vault Key: Re-sync" could report `key_mismatch` on the same device that had already worked correctly — a residual instance of the stale-credential-list problem, this time on the normal (non-self-heal) authentication path.**

`saveCredentialId()` only ever appends to the locally saved credential-ID list, never prunes. A *normal* `authenticatePasskey()` call still offers the entire accumulated list as `allowCredentials` — with several stale IDs on file, the OS/browser can satisfy the ceremony with any of them, not necessarily the one whose derived key matches the vault.

**Changed**
- `useSoulPasskey.js`: `authenticatePasskey()` now always records which credential was actually used in `lastUsedCredentialId`. New `pruneToCredentialId(id)` replaces the entire saved list with just one ID — only called when something external has confirmed that ID is correct.
- `SettingsModal.vue` (`handleResyncVaultKey`): after the server confirms a successful vault unlock, prunes the local list down to just that credential.

**Notes**
- Found on `personal-sys-vps-private` (kro.uxprojects-jok.com), ported here unchanged. Deliberately scoped to the vault-resync flow only, where a server response gives real confirmation.

## [1.0.13] — 2026-07-16

**Added: vault files that were never encrypted (e.g. context files seeded before the first vault key ever existed) now get encrypted automatically on unlock and on lock, not just left as plaintext indefinitely.**

Found on `personal-sys-vps-private`: `health.md`, `mind.md`, `earnings.md`, `agent.md` were still plaintext despite `cipher_mode: "ciphered"`, seeded during initial soul creation before any vault key existed. `POST /api/vault/lock` only ever removed the server's persisted key — it never protected files that were never encrypted, so "locked" gave a false sense of security for those files.

**Changed**
- `lua/vault_unlock.lua`: new `sweep_encrypt_plaintext()`, sharing its core logic with the existing `migrate_encrypt_generic_context.lua` (a manual, one-time CLI migration script), but wired in automatically on both `POST /api/vault/unlock` (after the mismatch-guard passes) and `POST /api/vault/lock` (using the key before it gets cleared). Excludes `sys.md` (client-driven encryption, out of scope here) and `shopping.md`/`prompts.md`/`ownagent.md` (always plaintext by design).
- Mismatch/sweep scanning switched from a hardcoded filename list to scanning `vault/context/` directly — also catches arbitrarily-named files written via `context_write`.
- `SettingsModal.vue`: distinguishes "vault locked, no key on file" from "wrong key present" instead of showing a false mismatch warning after a normal lock.

**Notes**
- Found on `personal-sys-vps-private` (kro.uxprojects-jok.com), verified end-to-end there. Ported here unchanged.

## [1.0.12] — 2026-07-16

**Fixed: `voice_hq` always showed "Security code not recognized" regardless of the actual failure reason, and there was no way to cancel out of the verify flow.**

Found during manual test runs on `personal-sys-vps-private`: the FFT voice match had succeeded, but the anti-replay digit check failed because no ElevenLabs API key was configured for the soul — the frontend showed the same generic message for a missing-API-key configuration problem as for a genuine wrong-digits case.

**Changed**
- `app/pages/verify.vue` (`doVoiceHq`): now distinguishes the server's actual failure reason (`elevenlabs_key_missing`, `no_voice_code_on_challenge`, service/network errors, or a genuine digit mismatch) and shows a specific message for each.
- Added a persistent close (×) button to the verify card, visible through every phase except initial load and the final "done" screen. Previously only the face-capture step had any way to back out of an in-progress verification.

**Notes**
- Found on `personal-sys-vps-private` (kro.uxprojects-jok.com), ported here unchanged. Doesn't configure an ElevenLabs key — that's an operator decision, this just makes the failure mode legible.

## [1.0.11] — 2026-07-16

**Fixed: v1.0.10's vault-key health-check/guard only covered `sys.md` — the real exposure was much broader.**

Scanning a real soul's vault against its current key found 3 more mismatched files the sys.md-only check had missed: a profile image, a voice recording, and `activity.md` (a write-activity log) — each encrypted with a different key from passkey churn. `activity_log.lua` was found to defensively refuse to write to a file it can't decrypt, meaning a mismatched `activity.md` gets silently, permanently stuck, not just wrong.

**Changed**
- `lua/vault_unlock.lua`: generalized the single-file check into `scan_vault_for_mismatches()`, covering `sys.md`, the server-encrypted context files (`health.md`, `mind.md`, `income.md`, `earnings.md`, `activity.md`, `agent.md`), and all vault media (`images/`, `audio/`, `video/`, `profile/`).
- Both `POST /api/vault/unlock`'s guard and `GET /api/vault/key-status` now use the full scan. Response shape changed to `{ checked, mismatched: [...], all_ok }`.
- `SettingsModal.vue`: Vault Key section now shows a checked/mismatched-file-count summary and lists which files don't match, and displays the raw `vault_key_hex` (like the Soul-Cert box) with a copy button.

**Fixed (found while extending the scan):**
- The check required non-empty decrypted output on top of trusting `resty.aes`'s nil-on-failure — broke on a genuinely empty but validly-encrypted file. A valid decrypt of empty plaintext is a 0-length string, not a failure.

**Notes**
- Found on `personal-sys-vps-private` (kro.uxprojects-jok.com), verified end-to-end there. Ported here unchanged.

## [1.0.10] — 2026-07-16

**Added: Vault Key health-check + manual re-sync in Settings → Config.** Previously there was no visible status for whether the server-persisted vault key actually matches `sys.md`, and no way to fix a mismatch short of the initial setup wizard — a mismatch only surfaced as a cryptic "vault locked" error on the next `soul_read`.

**Added**
- `GET /api/vault/key-status` (`lua/vault_unlock.lua`, new route in `vhost.conf.template`): reports whether the currently persisted `vault_key_hex` actually decrypts the soul's `sys.md` — the same check now guarding `POST /api/vault/unlock`, exposed as a read-only health-check.
- `SettingsModal.vue` → Config tab, new "Vault Key" section: shows the health-check result and a "Re-sync vault key" button reusing the existing passkey → `authenticateOrRegister()` → `deriveVaultKeyHex()` → `unlock()` flow — reachable without going through `SoulSetupWizard.vue`, previously the *only* place it was wired up.

**Fixed (found while building the above):**
- `key_matches_sys_md()`'s classic Lua `and/or` ternary breaks when the true-branch value is itself `false` — collapses to the false-branch instead, hiding a real mismatch. Replaced with an explicit `if`.
- `key_matches_sys_md()` re-validated PKCS7 padding manually on top of `resty.aes`'s decrypt output, which already strips padding internally and returns `nil` on a bad key (same as `api_serve.lua`'s proven `try_decrypt()`). The manual re-check produced false negatives for correct keys.

**Notes**
- Found on `personal-sys-vps-private` (kro.uxprojects-jok.com), verified end-to-end against real data there. Ported here unchanged.

## [1.0.9] — 2026-07-16

**Fixed: "Save with biometrics" still failed after an OS-level passkey deletion — a third independently-stale piece of local state, on top of v1.0.8.**

`useSoulPasskey.js`'s own `hasPasskey` ref, backed by a separate `localStorage` key (`sys_passkey_credential_ids`), also survives an OS-level passkey deletion untouched — every call site using the `hasPasskey.value ? authenticatePasskey() : registerPasskey()` pattern kept trying to authenticate against a deleted credential instead of registering a new one, with no fallback.

**Changed**
- `useSoulPasskey.js`: new `authenticateOrRegister(username, getAuthHeaders)` — tries authenticate first if `hasPasskey` is true, but on failure clears the stale local credential-ID list and falls back to registration. `getEncryptKey()` uses it internally too.
- `gate.vue` (`doSaveCreds`), `VaultSessionPanel.vue`: switched to `authenticateOrRegister()`.

**Notes**
- Found on `personal-sys-vps-private` (kro.uxprojects-jok.com). Audited the rest of `app/` for the same pattern — these were the only two call sites. Ported here unchanged.

## [1.0.8] — 2026-07-16

**Fixed: deleting a passkey outside the app (OS/Google Password Manager) permanently stopped the app from ever offering to register a new one.**

Root cause: `useSavedCreds.js`'s `hasCreds` (an encrypted password+cert blob in `localStorage`) is what `submit()` checks to decide whether to show the "save with biometric" step. This blob has no relationship to whether the underlying passkey still exists on the device — it survives an OS-level passkey deletion untouched, so the app kept assuming a working passkey existed indefinitely.

**Changed**
- `app/pages/gate.vue`: `biometricUnlock()`'s auth-failure branch now clears the stale `hasCreds` blob and drops to the manual login form instead of just showing an error and stopping.

**Notes**
- Found on `personal-sys-vps-private` (kro.uxprojects-jok.com) via a user who deleted all their passkeys and got permanently stuck with no way to be re-offered registration. Ported here unchanged.
- Doesn't retroactively fix an already-stuck browser session — the stale blob only clears the next time `biometricUnlock()` runs and fails.

## [1.0.7] — 2026-07-16

**Fixed: the fingerprint self-heal could still fail with `unknown_credential` — the re-verify step could authenticate with the wrong local passkey.**

Root cause: `authenticatePasskey()` (in `useSoulPasskey.js`) built its WebAuthn `allowCredentials` list from every locally saved credential ID, not just the one just created. Because passkey creation uses `residentKey: 'preferred'`, each repeated self-heal registration created a new, identically-named ("Soul") discoverable credential in the platform keychain. With multiple matching credentials offered, the OS/browser can satisfy the WebAuthn `get()` call with any of them, not necessarily the one that was just registered — landing back on `unknown_credential` if it picks an older, differently-registered one.

**Changed**
- `useSoulPasskey.js`: `registerPasskey()` now exposes `lastRegisteredCredentialId`. `authenticatePasskey()` gained an optional second parameter to restrict `allowCredentials` to exactly one ID instead of all saved ones.
- `app/pages/verify.vue`: the self-heal's re-verify step now passes `lastRegisteredCredentialId.value`, forcing the browser to use precisely the credential that was just registered.

**Notes**
- Found on `personal-sys-vps-private` (kro.uxprojects-jok.com), 7 stray credentials had accumulated for one soul before this fix. Doesn't clean those up (lives in the browser/OS keychain, not server-reachable) — harmless clutter, future self-heal runs work correctly regardless. Ported here unchanged.

## [1.0.6] — 2026-07-16

**Fixed: fingerprint's passkey self-heal (added in v1.0.2) registered a new passkey but never proved it, so the server kept rejecting the method.**

Root cause: the self-heal path (`app/pages/verify.vue`) registered a fresh passkey after a `no_passkey_registered`/`unknown_credential` failure, then reported success directly — treating "I could call `navigator.credentials.create()`" as proof. But `verify_complete.lua`'s guard only trusts `d.fingerprint_verified`, set exclusively by a real signature check in `verify_fingerprint_check.lua`. The self-heal never performed that second step, so the server silently rejected the method every time despite the client reporting success.

**Changed**
- `app/pages/verify.vue`: after a successful self-heal registration, immediately sign the current challenge with the new credential and call `/api/verify/fingerprint-check` again for real — `ok` is now decided by that actual signature check, not registration success alone.

**Notes**
- Found on `personal-sys-vps-private` (kro.uxprojects-jok.com): `passkeys.json` had accumulated 6 distinct newly-created credentials across separate attempts, `completed_methods` never contained `"fingerprint"` despite three separate real sessions. Ported here unchanged.

## [1.0.5] — 2026-07-16

**Fixed: verification score not accumulating across multiple methods completed on the same challenge outside the pre-selected multi-method flow.**

`verify_complete.lua` has two flows: a multi-method flow (used when the challenge was created with `required_methods`, or the frontend sent `selected_methods` with >1 entries) that correctly accumulates `completed_methods`/`score`, and a single-method flow for the simple case. The single-method flow both (a) rejected any further `/complete` call once the challenge reached `status="verified"` (`409 already_completed`), and — more importantly — (b) when it did run, overwrote `d.completed_methods`/`d.score` with just the current method instead of adding to what was already there. A user completing fingerprint, then separately completing face on the same challenge would see the UI's client-side method list correctly show both as done, but the server-reported score reset to the last method's weight alone.

**Changed**
- `lua/verify_complete.lua`: single-method flow now accumulates onto `completed_methods`/`score` like the multi-method flow does, and no longer hard-rejects once `status="verified"` — each additional, individually-proven method (duplicates still rejected by the existing check) adds to the running total instead of replacing it.

**Notes**
- Found on `personal-sys-vps-private` (kro.uxprojects-jok.com) via a user report showing "Fingerprint +1 / Facial recognition +1 / ... Score 1". Ported here unchanged.
- Does not merge scores across genuinely separate challenge_id's — only fixes accumulation within one challenge's lifetime.

## [1.0.4] — 2026-07-16

**Fixed: a second, distinct soul-mcp crash mechanism that survived the v1.0.3 fix.**

After deploying v1.0.3's `unhandledRejection` handler on the node this was found on, the process crashed once more a couple minutes later — a genuinely different failure: `Error: Unexpected server response: 429` from the `ws` library, meaning the WebSocket *handshake itself* was rejected (HTTP 429) before any JSON-RPC exchange even happened. `ws` emits this as a synchronous `'error'` event on the WebSocket instance, and `soul_indexer.mjs`'s `subscribeWs()` only ever listened for `'close'`, never `'error'` — Node's rule is that an emitted `'error'` event with zero listeners throws and kills the process (a different code path from unhandled promise rejections; `unhandledRejection` cannot catch it).

**Changed**
- `soul_indexer.mjs`: added an `'error'` listener on `_ws.websocket` (logs only — reconnect is already scheduled by the paired `'close'` event for the same failure, `ws`'s `emitErrorAndClose()` fires both; a second reconnect scheduled here would race it).
- `soul_indexer.mjs`: the historical `eth_getLogs` backfill's archive-error path (`Block-Range-Fehler`) was `continue`-ing past the `SCAN_DELAY_MS` pacing sleep entirely — for a block range mostly beyond the public RPC's archive window, the backfill hammered the same public endpoint the WebSocket subscription depends on with effectively no pacing on that path. Moved the sleep to run before the `continue` too. Plausible (not proven) contributing cause of the rate-limit errors in the first place.

**Notes**
- Found on `personal-sys-vps-private` (kro.uxprojects-jok.com) immediately after deploying v1.0.3 there — checked logs specifically because that fix should have stopped restarts, and instead a different stack trace showed up. Ported here unchanged.

## [1.0.3] — 2026-07-16

**Fixed: `soul-mcp` crash-looping (systemd restart counter at 90+ on the node this was found on), taking down every MCP tool for the whole node repeatedly.**

Root cause: `soul_indexer.mjs`'s `subscribeWs()` sets up a live WebSocket subscription to the Polygon soul-registry contract via `ethers.WebSocketProvider`. When the public RPC (`polygon-bor-rpc.publicnode.com`) rate-limits the `eth_subscribe` call (`-32005 Rate limit exceeded`), ethers rejects a promise deep inside its own subscription-management code that nothing in this codebase awaits or catches — Node's default `unhandledRejection` behavior then kills the entire process. Since soul-mcp is one process serving all MCP tools, every crash took down `verify_identity`, `soul_read`, peer messaging, everything, for however long the ~15s reconnect + systemd restart took.

**Changed**
- `soul-mcp/server.mjs`: added a process-level `unhandledRejection` handler — logs and keeps running instead of crashing.

**Notes**
- Found and fixed first on `personal-sys-vps-private` (kro.uxprojects-jok.com), confirmed via `journalctl -u soul-mcp` — crashes recurring roughly every ~12 minutes, restart counter had reached 90. Ported here unchanged, no private-specific content in the touched lines.
- Separate, lower-severity observation not fixed here: `soul_indexer.mjs`'s historical `eth_getLogs` scan logs a `Block-Range-Fehler ... Chunk übersprungen` warning per 90-block chunk once it hits the public RPC's archive-data limit — expected behavior for a non-archive public RPC (scan still makes forward progress, no crash, no data loss), just noisy at `warn` level.

## [1.0.2] — 2026-07-16

**Fixed: `verify_identity` fingerprint check failing despite a working passkey ("Biometrie Fingerabdruck fehlt").**

Root cause: two independent passkey-registration call sites, only one of which registers the public key server-side.
- `gate.vue`'s initial "save credentials with biometric unlock" step calls `registerPasskey('Soul')` with no `getAuthHeaders` — by design this skips the server-side `/api/verify/passkey-register` call ("best effort", see `useSoulPasskey.js` comment). The WebAuthn credential is created and works fine for gate unlock (purely client-side), but the server never learns the public key.
- `verify.vue`'s fingerprint check already had a self-heal path that re-registers the passkey on failure — but only for `reason === 'unknown_credential'` (passkeys.json exists, this credential isn't in it), not for `reason === 'no_passkey_registered'` (passkeys.json doesn't exist at all) — which is exactly what a gate-only-registered passkey produces. Souls that only ever went through `gate.vue` hit the uncovered case and got a hard failure instead of self-healing.

**Changed**
- `app/pages/verify.vue`: self-heal condition now also covers `no_passkey_registered`, not just `unknown_credential` — re-registers automatically on next fingerprint verification attempt, no user action beyond retrying needed.
- `app/pages/gate.vue`: `doSaveCreds()` now passes `getAuthHeaders` to `registerPasskey('Soul', ...)`, using the just-confirmed `${currentSoulId}.${cert}` bearer — new passkeys register server-side from the start, so this doesn't recur for newly onboarded souls.

**Notes**
- Found and fixed first on `personal-sys-vps-private` (kro.uxprojects-jok.com), confirmed by checking `/var/lib/sys/souls/{soul_id}/passkeys.json` directly on that node — file didn't exist at all. Ported here unchanged since neither file has any private-specific content.

## [1.0.1] — 2026-07-16

**Fixed**
- Health Sync / Garmin login was completely non-functional: OpenResty's worker
  (`www-data`) has no write access to `/var/log` (`root:syslog`, mode 775), so
  the backgrounded `garmin_login.py` process silently failed to even start.
  The UI then always hit its 25s timeout and showed a misleading "enter MFA
  code" prompt, even though Garmin was never actually contacted and no SMS
  was ever sent.
- `cryptography` was missing from the health-sync venv (`vault_crypto.py`
  needs it to decrypt stored Garmin credentials) — added to both installers'
  `pip install` step.

**Changed**
- Health-sync log writes repointed from `/var/log/sys_health_sync.log` to
  `/var/log/sys/health_sync.log` — a dedicated, `www-data`-writable directory.
  `sys-installer`'s `init.sh` now creates this directory during core install;
  `setup_server.sh` / `install.sh` create it defensively too.

**Migration required**
- Nodes that ran Health Sync setup *before* this release won't self-heal —
  the directory/dependency fixes only apply on (re-)run of `setup_server.sh`
  or `install.sh`. On an already-running node, apply manually:
  ```bash
  mkdir -p /var/log/sys && chown www-data:www-data /var/log/sys && chmod 750 /var/log/sys
  /opt/sys/health-sync/.venv/bin/pip install -q cryptography
  ```

**Notes**
- Integrity fingerprint for this tag: `d3edd4a4be7bbaf0` (`node utils/project-hash.mjs`).

---

## [1.0.0] — 2026-07-16

First tagged release. Marks the baseline for the current two-node production split:

- `kro.uxprojects-jok.com` — Personal Node, deployed from the private full-feature repo (`personal-sys-vps-private`).
- `karo-familie.de` — Multi-Hoster Node, deployed from this repo (`personal-sys-vps`) + `sys-installer`.

**Added**
- Update strategy documentation in `README.md` ("Updating Your Node"): tagged-release process, protocol-vs-implementation compatibility guarantee, convention for keeping operator-specific customizations safe across updates, version/fingerprint verification.
- This `CHANGELOG.md`.

**Notes**
- No migration required — this release only adds documentation and process, no code/schema changes relative to the prior untagged state both live nodes were already running.
- Integrity fingerprint for this tag: `1b2f589a68e36f67` (`node utils/project-hash.mjs`).
