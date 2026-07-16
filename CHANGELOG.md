# Changelog

All notable changes to the SYS protocol reference implementation are documented here.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versions follow [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).

Node operators: pin to a tag, read the entry before updating, and check for **Breaking** / **Migration required** flags — see [README: Updating Your Node](README.md#updating-your-node).

---

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
