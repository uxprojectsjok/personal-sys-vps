# Changelog

All notable changes to the SYS protocol reference implementation are documented here.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versions follow [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).

Node operators: pin to a tag, read the entry before updating, and check for **Breaking** / **Migration required** flags — see [README: Updating Your Node](README.md#updating-your-node).

---

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
