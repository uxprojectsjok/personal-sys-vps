# Changelog

Changelog for `personal-sys-vps-private` — the private layer running **kro.uxprojects-jok.com**.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versions follow [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`). This repo has its own version track, independent of the public `personal-sys-vps` repo's tags — each entry below notes which public state it was last merged from.

See [README: Updating This Node](README.md#updating-this-node) for the merge/deploy process.

---

## [1.0.4] — 2026-07-16

**Fixed: `soul-mcp` crash-looping (systemd restart counter at 90+), taking down every MCP tool for the whole node repeatedly.**

Root cause: `soul_indexer.mjs`'s `subscribeWs()` sets up a live WebSocket subscription to the Polygon soul-registry contract via `ethers.WebSocketProvider`. When the public RPC (`polygon-bor-rpc.publicnode.com`) rate-limits the `eth_subscribe` call (`-32005 Rate limit exceeded`), ethers rejects a promise deep inside its own subscription-management code that nothing in this codebase awaits or catches — Node's default `unhandledRejection` behavior then kills the entire process. This wasn't isolated to the blockchain indexer: since soul-mcp is one process serving all MCP tools, every crash took down `verify_identity`, `soul_read`, peer messaging, everything — for however long the ~15s reconnect + systemd restart took. This is the actual cause of the "Server-Error" seen mid-verification (the passkey fix itself was already correct — the request just happened to land while the process was restarting).

**Changed**
- `server.mjs`: added a process-level `unhandledRejection` handler — logs and keeps running instead of crashing. `soul_indexer.mjs`'s own WebSocket already has reconnect/backoff logic for the failures it explicitly handles; this is a safety net for the ones it doesn't (this RPC rate-limit case, and structurally any future one like it).

**Notes**
- Confirmed via `journalctl -u soul-mcp`: crashes recurring roughly every ~12 minutes, restart counter had reached 90 before this fix — this had likely been silently degrading reliability for a long time, not something newly introduced today.
- Deployed directly (`systemctl restart soul-mcp`) — `/opt/sys/soul-mcp` is the live runtime path, no copy step. Verified running cleanly post-restart.
- Separate, lower-severity observation not fixed here: `soul_indexer.mjs`'s historical `eth_getLogs` scan logs a `Block-Range-Fehler ... Chunk übersprungen` warning per 90-block chunk once it hits the public RPC's archive-data limit — expected behavior for a non-archive public RPC (scan still makes forward progress, no crash, no data loss), just noisy at `warn` level. Worth revisiting (e.g. a `POLYGONSCAN_API_KEY`, or dropping to `debug` level) but out of scope for this fix.

## [1.0.3] — 2026-07-16

**Fixed: `verify_identity` fingerprint check failing despite a working passkey ("Biometrie Fingerabdruck fehlt").**

Root cause: two independent passkey-registration call sites, only one of which registers the public key server-side.
- `gate.vue`'s initial "save credentials with biometric unlock" step calls `registerPasskey('Soul')` with no `getAuthHeaders` — by design this skips the server-side `/api/verify/passkey-register` call ("best effort", see `useSoulPasskey.js` comment). The WebAuthn credential is created and works fine for gate unlock (purely client-side), but the server never learns the public key.
- `verify.vue`'s fingerprint check already had a self-heal path that re-registers the passkey on failure — but only for `reason === 'unknown_credential'` (passkeys.json exists, this credential isn't in it), not for `reason === 'no_passkey_registered'` (passkeys.json doesn't exist at all) — which is exactly what a gate-only-registered passkey produces. Souls that only ever went through `gate.vue` hit the uncovered case and got a hard failure instead of self-healing.

**Changed**
- `app/pages/verify.vue`: self-heal condition now also covers `no_passkey_registered`, not just `unknown_credential` — re-registers automatically on next fingerprint verification attempt, no user action beyond retrying needed.
- `app/pages/gate.vue`: `doSaveCreds()` now passes `getAuthHeaders` to `registerPasskey('Soul', ...)`, using the just-confirmed `${currentSoulId}.${cert}` bearer — new passkeys register server-side from the start, so this doesn't recur for newly onboarded souls.

**Notes**
- Confirmed root cause by checking `/var/lib/sys/souls/{soul_id}/passkeys.json` on this VPS directly — file didn't exist at all, confirming `no_passkey_registered` rather than `unknown_credential`.
- Rebuilt (`npm run generate` + `killMetas.mjs`) and redeployed to `/var/www/kro.uxprojects-jok.com` (`rsync --delete`) — this update only touched `app/`, no lua/soul-mcp changes, no service restart needed.
- Ported upstream to `personal-sys-vps` as its own `v1.0.2` (public repo, commit `32eab66`) — generic protocol bug, no private-specific content in either touched file. karo-familie.de should pick this up from there.

## [1.0.2] — 2026-07-16

Caught up `init.sh` with `sys-installer` (`8d7f801`) — the same health-sync log-path fix from v1.0.1, but the `init.sh` side of it (creates `/var/log/sys` www-data-writable at install time) hadn't been ported yet since it lives in a separate repo (`sys-installer`, distributed alongside `personal-sys-vps-private`'s `init.sh`/`reset.sh`/`recover-password.sh`/`deinstall.sh`, not merged from `personal-sys-vps`).

**Fixed**
- `init.sh`: added the `/var/log/sys` mkdir/chown/chmod block (matches `health-sync/setup_server.sh`, `health-sync/install.sh` — already up to date since those came in via the v1.0.1 merge from `personal-sys-vps`).

**Notes**
- Source of truth for this diff was `/var/www/SaveYourSoul_private_installer` (local `sys-installer` checkout, fast-forwarded to `origin/main` first) diffed file-by-file against `/opt/sys/init.sh` etc. — not a git merge, since `sys-installer` and `personal-sys-vps-private` share no git history at all (separate repos with separate purposes).
- `reset.sh`, `recover-password.sh`, `deinstall.sh`, `health-sync/install.sh`, `health-sync/setup_server.sh`: byte-identical to `sys-installer`, no changes needed.
- One intentional, permanent diff preserved in `init.sh` (lines ~105-108): the legal-pages notice text. `sys-installer`/public says "ships no legal notice"; this repo's `init.sh` correctly says "ships /impressum, /datenschutz, /lizenz... populated with the author's own details" — this repo actually carries those pages, the public template doesn't. Never sync this block from `sys-installer`.
- No live-server action needed beyond the repo update — `/var/log/sys` on this VPS was already corrected manually during the v1.0.1 work; this change only affects future fresh `init.sh` runs (new installs, `deinstall.sh` + reinstall).

## [1.0.1] — 2026-07-16

Merged the substantive fix from `personal-sys-vps` `v1.0.1` (health-sync log-path permissions). Everything else in that public tag's diff was either doc-only (public README/CHANGELOG, not applicable here) or content this repo intentionally lacks the inverse of — i.e. legal pages/consent banner/installer scripts that only exist *here*, correctly absent from public.

**Fixed**
- `fix(health-sync): www-data can't write to /var/log, Garmin login never starts` — cherry-picked `dfbe218` from `personal-sys-vps`. Log path moved from `/var/log/sys_health_sync.log` (root-owned `/var/log`, unwritable by `www-data`) to `/var/log/sys/health_sync.log` (dedicated `www-data`-owned directory, `750`). Touches `health-sync/install.sh`, `health-sync/setup_server.sh`, `lua/health_login.lua`, `lua/health_sync_status.lua`, `lua/health_sync_trigger.lua`, `docs/spec/health-sync-troubleshooting.md`.
- Live server: `/var/log/sys` existed but was `root:root 755` (pre-dating this fix) — corrected to `www-data:www-data 750` to match. The three changed `lua/*.lua` files deployed to `/etc/openresty/lua/` and `openresty -s reload` run.

**Notes**
- Merge method: not a full `git merge` — merge-base analysis (`git diff HEAD v1.0.1 --stat`) showed the two repos' histories have independently-applied equivalent commits since the common ancestor (different SHAs, same content) for most shared work, which would have produced a wall of noise conflicts on a real merge. Cherry-picked only the one commit representing genuinely new content instead. Kept as the documented approach going forward when the tree-diff is small; revisit with a real merge if a future public update is large/tangled enough that cherry-picking individual commits stops being tractable.
- `health-sync/.venv` does not exist yet on this VPS — Garmin sync was never installed here. The `cryptography` dependency addition and log-dir creation in `install.sh`/`setup_server.sh` will apply next time that installer is actually run; not run proactively here since it's interactive (needs Garmin credentials/soul selection).
- No frontend (`app/`) changes in this update — no `npm run generate` needed, lua deploy + reload was sufficient.

## [1.0.0] — 2026-07-16

First tagged release of the private layer. Baseline for the current production instance at kro.uxprojects-jok.com.

**Notes**
- Not yet merged with `personal-sys-vps` `v1.0.0` (which only added its own README/CHANGELOG documentation, no functional change) — next update should pull that in.
- Marks the point after retiring the redundant `SaveYourSoul_me_live` local checkout; `/opt/sys` (this checkout) is now the sole working copy for kro — no separate build/staging directory.
