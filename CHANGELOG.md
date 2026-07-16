# Changelog

Changelog for `personal-sys-vps-private` — the private layer running **kro.uxprojects-jok.com**.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versions follow [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`). This repo has its own version track, independent of the public `personal-sys-vps` repo's tags — each entry below notes which public state it was last merged from.

See [README: Updating This Node](README.md#updating-this-node) for the merge/deploy process.

---

## [1.0.11] — 2026-07-16

**Added: Vault Key health-check + manual re-sync in Settings → Config.** Follow-up to today's vault-key-mismatch incident — there was no visible status for whether the server-persisted vault key actually matches `sys.md`, and no way to fix a mismatch short of the initial setup wizard. A mismatch previously surfaced only as a cryptic "vault locked" error the next time `soul_read` ran.

**Added**
- `GET /api/vault/key-status` (`lua/vault_unlock.lua`, new route in `vhost.conf.template`): reports whether the currently persisted `vault_key_hex` actually decrypts the soul's `sys.md` — the same check now guarding `POST /api/vault/unlock` (below), exposed as a read-only health-check.
- `SettingsModal.vue` → Config tab, new "Vault Key" section: shows the health-check result (✓ / ✗ / not encrypted) and a "Re-sync vault key" button that runs the existing passkey → `authenticateOrRegister()` → `deriveVaultKeyHex()` → `unlock()` flow — reachable without going through `SoulSetupWizard.vue`, which was previously the *only* place this flow was wired up.

**Fixed (found while building the above, before it ever reached this CHANGELOG as a "known-good" feature):**
- `key_matches_sys_md()`'s classic Lua `and/or` ternary (`is_encrypted and matches or cjson.null`) breaks when the true-branch value (`matches`) is itself `false` — collapses to the false-branch (`cjson.null`) instead, hiding a real mismatch as "not applicable". Replaced with an explicit `if`.
- `key_matches_sys_md()` re-validated PKCS7 padding manually on top of `resty.aes`'s decrypt output — but `resty.aes` already strips padding internally and returns `nil` on a bad key (same behavior `api_serve.lua`'s proven `try_decrypt()` already relies on). The manual re-check inspected the *last byte of already-unpadded plaintext* as if it were still a padding byte, producing a false mismatch for the objectively correct key. Caught by testing the new endpoint end-to-end against this soul's real (now-fixed) data instead of trusting it after only a design review.
- A plain `openresty -s reload` did not pick up the lua changes during this session's own testing (stale `lua_code_cache` behavior observed, not fully root-caused) — a full `systemctl restart openresty` was needed. Worth remembering for future lua debugging sessions: if a `reload` + retest doesn't show an expected change, try a full restart before concluding the code itself is wrong.

**Notes**
- Verified end-to-end against live data: correct key → `matches:true`; a deliberately wrong key via `POST /api/vault/unlock` → `409 key_mismatch`, correctly rejected without corrupting the persisted key.
- Vhost route added in three places (documented drift risk): `server/openresty/vhost.conf.template` (repo), `server/openresty/me.uxprojects-jok.com` (repo copy), `/etc/openresty/sites-enabled/kro.uxprojects-jok.com` (live).

## [1.0.10] — 2026-07-16

**Fixed: "Save with biometrics" still failed with "Biometrik-Bestätigung abgelehnt oder abgebrochen." after an OS-level passkey deletion — a third independently-stale piece of local state, on top of the two fixed in v1.0.9.**

v1.0.9 fixed `hasCreds` (the encrypted password+cert blob) getting stuck stale. This is a *different* stale flag: `useSoulPasskey.js`'s own `hasPasskey` ref, backed by a separate `localStorage` key (`sys_passkey_credential_ids`) listing locally known credential IDs. Deleting a passkey via the OS/Google Password Manager doesn't touch this list either — so `hasPasskey.value` stayed `true`, and every call site using the `hasPasskey.value ? authenticatePasskey() : registerPasskey()` pattern (`gate.vue`'s `doSaveCreds()`, `VaultSessionPanel.vue`, and the composable's own `getEncryptKey()`) kept trying to *authenticate* against a deleted credential instead of registering a new one — failing every time with no path forward.

**Changed**
- `useSoulPasskey.js`: new `authenticateOrRegister(username, getAuthHeaders)` — tries authenticate first if `hasPasskey` is true, but on failure clears the stale local credential-ID list and falls back to registration, instead of just giving up. `getEncryptKey()` now uses it internally too.
- `gate.vue` (`doSaveCreds`), `VaultSessionPanel.vue`: switched from the raw `hasPasskey.value ? authenticate : register` pattern to `authenticateOrRegister()`.

**Notes**
- Same underlying WebAuthn ambiguity as v1.0.9 (can't distinguish "declined" from "no matching credential") — same accepted tradeoff: worst case an accidental decline costs one redo, but a genuinely deleted passkey no longer leaves the user stuck.
- Audited the rest of `app/` for the same `hasPasskey.value ?` pattern — these were the only two call sites left; both fixed.
- Rebuilt + redeployed.

## [1.0.9] — 2026-07-16

**Fixed: deleting a passkey outside the app (OS/Google Password Manager) permanently stopped the app from ever offering to register a new one.**

After a user deleted all their passkeys from Android's Credential Manager and logged in manually with the password, `gate.vue` never offered to set up a new passkey again — the biometric setup step simply didn't appear.

Root cause: `useSavedCreds.js`'s `hasCreds` (an encrypted password+cert blob in `localStorage`, keyed by soul) is what `submit()` checks to decide whether to show the "save with biometric" step (`if (support.supported && !creds.hasCreds.value)`). This blob has no relationship to whether the underlying passkey still exists on the device — it survives an OS-level passkey deletion untouched. So the app kept assuming "a working passkey must exist, since we have a saved encrypted blob" indefinitely, even after the credential it was encrypted with was gone. Deleting a passkey outside the app is exactly the scenario this broke.

**Changed**
- `app/pages/gate.vue`: `biometricUnlock()`'s auth-failure branch now clears the stale `hasCreds` blob and drops to the manual login form (matching the existing pattern for a failed decrypt just below it) instead of just showing an error and stopping. A subsequent manual login then correctly sees no working credentials and re-offers passkey registration.

**Notes**
- WebAuthn deliberately doesn't distinguish "user declined this prompt" from "no matching credential exists" (anti-enumeration privacy property of the spec) — so this can't cleanly detect *why* auth failed, only *that* it failed. Clearing state either way is judged the safer default: an accidental decline costs one redo of passkey setup, but a genuinely deleted passkey no longer leaves the user permanently stuck.
- Does not retroactively fix an already-stuck browser session from before this fix was deployed — the stale blob only gets cleared the next time `biometricUnlock()` runs and fails. A user already stuck needs to reach the biometric-unlock screen once (it fails immediately, that's expected) to trigger the self-heal, then log in manually as usual.
- Rebuilt + redeployed.

## [1.0.8] — 2026-07-16

**Fixed: v1.0.7's fingerprint self-heal still failed with `unknown_credential` — the re-verify step could authenticate with the wrong local passkey.**

After v1.0.7 deployed, a retry still failed: `Failed. unknown_credential`. Checked `/var/lib/sys/souls/{soul_id}/passkeys.json` — the new credential from this exact attempt *was* registered server-side, so the failure had to be client-side credential selection.

Root cause: `authenticatePasskey()` (in `useSoulPasskey.js`) builds its WebAuthn `allowCredentials` list from *every* locally saved credential ID, not just the one just created. Because passkey creation uses `residentKey: 'preferred'`, each of the repeated self-heal registrations (see v1.0.3/v1.0.7 history) created a new, identically-named ("Soul") discoverable credential in the platform keychain — by this point 7 of them for one soul. With multiple matching credentials offered, the OS/browser can satisfy the WebAuthn `get()` call with any of them, not necessarily the one that was just registered — landing back on `unknown_credential` if it picks an older, differently-registered one.

**Changed**
- `useSoulPasskey.js`: `registerPasskey()` now exposes `lastRegisteredCredentialId`. `authenticatePasskey()` gained an optional second parameter to restrict `allowCredentials` to exactly one ID instead of all saved ones.
- `app/pages/verify.vue`: the self-heal's re-verify step now passes `lastRegisteredCredentialId.value`, forcing the browser to use precisely the credential that was just registered — no ambiguity.

**Notes**
- Doesn't clean up the stray credentials already sitting in the platform keychain/passkeys.json (7 for the soul this was found on) — harmless clutter, not fixable from the server side (they live in the browser/OS Secure Enclave, not something a server request can delete). Future self-heal runs will keep working correctly regardless, since the fix constrains selection at the point of use, not at cleanup.
- Rebuilt + redeployed (`npm run generate` + `killMetas.mjs` + `rsync --delete`).

## [1.0.7] — 2026-07-16

**Fixed: fingerprint's passkey self-heal (added in v1.0.3) registered a new passkey but never proved it, so the server kept rejecting the method — root cause of the "Score 1 instead of 2" reports even after v1.0.3 and v1.0.6.**

Checked the actual challenge files after a fresh multi-method attempt (`required_methods:["fingerprint","face"]`): `completed_methods` only ever contained `"face"`, never `"fingerprint"`, across three separate sessions today. `passkeys.json` had accumulated **six** distinct newly-created credentials — one per attempt — instead of reusing one, confirming the self-heal's `registerPasskey()` call was succeeding every time but not actually resolving anything.

Root cause: the self-heal path (`app/pages/verify.vue`, added for the v1.0.3 fix) registered a fresh passkey after a `no_passkey_registered`/`unknown_credential` failure, then called `submitResult(true)` directly — treating "I could call `navigator.credentials.create()`" as proof. But `verify_complete.lua`'s guard (`if method=="fingerprint" and verified and d.fingerprint_verified ~= true then verified=false`) only trusts `d.fingerprint_verified`, which is *exclusively* set by a real signature check in `verify_fingerprint_check.lua`. The self-heal never performed that second step, so the server silently rejected the method every time despite the client reporting success — v1.0.3's fix closed the registration gap but didn't close the loop.

**Changed**
- `app/pages/verify.vue`: after a successful self-heal registration, immediately sign the current challenge with the new credential (`authenticatePasskey(webauthnChallenge)`) and call `/api/verify/fingerprint-check` again for real — `ok` is now decided by that actual signature check, not by registration success alone. Costs one extra biometric prompt, only on this one-time migration path (subsequent normal attempts succeed on the first try once the credential is registered).

**Notes**
- v1.0.6 (score accumulation) was a real, independent fix and stays correct — it just wasn't the whole story, since fingerprint was never reaching `completed_methods` at all in these sessions to accumulate in the first place.
- Left the 6 stray registered credentials in `passkeys.json` as-is — harmless (multiple passkeys per soul is supported by design, for multiple devices), just untidy leftover from the bug.
- Rebuilt + redeployed (`npm run generate` + `killMetas.mjs` + `rsync --delete` to `/var/www/kro.uxprojects-jok.com`).

## [1.0.6] — 2026-07-16

**Fixed: verification score not accumulating across multiple methods completed on the same challenge outside the pre-selected multi-method flow.**

`verify_complete.lua` has two flows: a multi-method flow (used when the challenge was created with `required_methods`, or the frontend sent `selected_methods` with >1 entries) that correctly accumulates `completed_methods`/`score`, and a single-method flow for the simple case. The single-method flow both (a) rejected any further `/complete` call once the challenge reached `status="verified"` (`409 already_completed`), and — more importantly — (b) when it did run, overwrote `d.completed_methods`/`d.score` with just the current method instead of adding to what was already there. A user completing fingerprint, then separately completing face on the same challenge (e.g. the checkbox multi-select wasn't used, or a retry after an interruption landed back in the single-method path) would see the UI's client-side method list correctly show both as done, but the server-reported score reset to the last method's weight alone (`Score 1` instead of `2`).

**Changed**
- `lua/verify_complete.lua`: single-method flow now accumulates onto `completed_methods`/`score` like the multi-method flow does, and no longer hard-rejects once `status="verified"` — each additional, individually-proven method (duplicates are still rejected by the existing check) adds to the running total instead of replacing it. Matches the file's own top-of-file comment: "Score = #completed_methods".

**Notes**
- Found via a user report showing "Fingerprint +1 / Facial recognition +1 / ... Score 1" — the discrepancy between the per-method checklist (client-side, accumulates locally regardless of server state) and the numeric score (taken verbatim from the last server response) is what made this visible.
- Does not merge scores across genuinely separate challenge_id's (e.g. if a new challenge was created from scratch for a later method instead of resuming the same one) — only fixes accumulation within one challenge's lifetime, which is the documented/intended scope of a single "verification session".
- Deployed via `cp` to `/etc/openresty/lua/` + `openresty -s reload`, no rebuild needed (lua-only change).

## [1.0.5] — 2026-07-16

**Fixed: a second, distinct soul-mcp crash mechanism that survived the v1.0.4 fix.**

After deploying v1.0.4's `unhandledRejection` handler, the process crashed once more a couple minutes later — a genuinely different failure: `Error: Unexpected server response: 429` from the `ws` library, meaning the WebSocket *handshake itself* was rejected (HTTP 429) before any JSON-RPC exchange even happened. `ws` emits this as a synchronous `'error'` event on the WebSocket instance, and `soul_indexer.mjs`'s `subscribeWs()` only ever listened for `'close'`, never `'error'` — Node's rule is that an emitted `'error'` event with zero listeners throws and kills the process (this is a different code path from unhandled promise rejections; `unhandledRejection` cannot catch it).

**Changed**
- `soul_indexer.mjs`: added an `'error'` listener on `_ws.websocket` (logs only — reconnect is already scheduled by the paired `'close'` event for the same failure, `ws`'s `emitErrorAndClose()` fires both; a second reconnect scheduled here would race it).
- `soul_indexer.mjs`: the historical `eth_getLogs` backfill's archive-error path (`Block-Range-Fehler`, see v1.0.x notes) was `continue`-ing past the `SCAN_DELAY_MS` pacing sleep entirely — meaning for a block range mostly beyond the public RPC's archive window (true here: scanning from block 83.5M with current height ~90.3M, ~75,880 chunks), the backfill hammered the same public endpoint the WebSocket subscription depends on with effectively no pacing on that path. Moved the sleep to run before the `continue` too. Plausible (not proven) contributing cause of the rate-limit errors in the first place, not just a response to them — worth watching whether crash frequency drops now that this is fixed.

**Notes**
- Found by checking `journalctl -u soul-mcp` immediately after the v1.0.4 deploy specifically because the fix should have stopped restarts — instead a *different* stack trace showed up, which is what surfaced this one.
- Deployed via `systemctl restart soul-mcp`, verified running.

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
