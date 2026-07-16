# Changelog

Changelog for `personal-sys-vps-private` — the private layer running **kro.uxprojects-jok.com**.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versions follow [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`). This repo has its own version track, independent of the public `personal-sys-vps` repo's tags — each entry below notes which public state it was last merged from.

See [README: Updating This Node](README.md#updating-this-node) for the merge/deploy process.

---

## [1.0.22] — 2026-07-16

**Fixed: `doFingerprint()` in `verify.vue` never pruned the local credential list after a successful verification — every attempt started from an unrestricted `authenticatePasskey()` call, so an OS/browser with several accumulated resident "Soul" credentials could keep handing back an unregistered one, permanently triggering the self-heal path (fail → register new → re-auth = up to 3 biometric prompts) instead of ever settling on the one that actually works.**

Same underlying credential-accumulation issue documented across v1.0.8–v1.0.17 (multiple discoverable WebAuthn credentials for one soul, OS picks non-deterministically), but this specific call site never got the `pruneToCredentialId()` fix that `SettingsModal.vue`'s and `VaultSessionPanel.vue`'s unlock flows already have — a third independent entry point into the same underlying passkey composable, missed for the same reason the second one was initially missed (see v1.0.17): a fix at one call site doesn't automatically cover the others.

Directly confirmed via the new `last_verified_at` tracking (v1.0.19/v1.0.21 public / v1.0.19 private tag numbering — see previous two entries): two brand-new passkey credentials were created within the same hour, each one only seconds before its first (and only) successful verification — proof that self-heal was firing on every single attempt, permanently, rather than being a one-time migration as designed.

**Fixed**
- `app/pages/verify.vue`: `doFingerprint()` now calls `pruneToCredentialId()` after every server-confirmed successful match — both the normal first-attempt path (using `lastUsedCredentialId`) and the self-heal path (using `lastRegisteredCredentialId`, the credential that was just registered and re-verified).

**Notes**
- User-reported symptom: fingerprint verification triggering Windows Hello two-to-three times per attempt, plus two "Soul" entries visible in Windows' passkey manager — the extra prompts are now explained by this bug; the two visible entries are unrelated and expected (kro.uxprojects-jok.com and karo-familie.de are different domains/RP IDs, WebAuthn credentials cannot be shared across them by design).
- Does not retroactively fix a browser that's already stuck in the loop — the fix takes effect starting with the next successful verification on each device, same caveat as every previous credential-pruning fix in this series.

## [1.0.21] — 2026-07-16

**Fixed: voice_hq verification always failed with "No security code found for this verification — please restart" when the verify challenge was created in open-choice mode (empty `methods[]`, user picks the method in the UI) and the user then chose Voice — regardless of whether an ElevenLabs API key was configured.**

Root cause in `lua/verify_challenge.lua`: the server-side anti-replay `voice_code` (a 6-digit code the user reads aloud, required so an old recording can't just be replayed) was only pre-generated inside a loop over the *explicitly requested* `methods[]` at challenge-creation time — `for _, m in ipairs(methods) do if m == "voice_hq" then ...`. When a challenge is created with an empty `methods[]` (the deliberately-supported "let the user choose in the UI" mode — see the `webauthn_challenge` comment two lines below, which already explains this exact scenario for fingerprint), `voice_code` stayed `nil` forever, even if the user later picked Voice. `verify_voice_hq_check.lua` correctly rejects any check against a missing code with `no_voice_code_on_challenge` — the frontend fix from v1.0.13 (which added a *specific* error message for this exact case, distinct from "no ElevenLabs key" or a real digit mismatch) was working as designed; the challenge itself just never had a code to check against.

**Fixed**
- `lua/verify_challenge.lua`: `voice_code` is now generated unconditionally on every challenge, exactly mirroring how `webauthn_challenge` already handles the same open-choice scenario for fingerprint ("Immer erzeugen, unabhängig von den gewählten Methoden").

**Notes**
- Found live: user had a valid ElevenLabs key configured and still got the "no security code" message, which per the v1.0.13 error-differentiation fix should only appear for this specific challenge-setup gap, not a real service/key problem — pointed straight at `verify_challenge.lua` instead of the check endpoint.
- Same underlying pattern as `webauthn_challenge`'s already-correct handling one function below it in the same file — worth remembering that "always generate, regardless of requested methods" is the right default for any per-method server-side secret when open-choice challenges are supported, not just an opt-in for the method that happened to need it first.

## [1.0.20] — 2026-07-16

**Fixed: the new "Re-sync vault key" and "Change Encryption" buttons used the ghost/outline style instead of the primary/filled style, inconsistent with the sibling "Rotate Soul-Cert" button in the same Settings tab.**

**Changed**
- `app/components/SettingsModal.vue`: both buttons switched from `sys-btn-ed--ghost` to `sys-btn-ed--primary`, matching "Rotate Soul-Cert"'s visual weight.

## [1.0.19] — 2026-07-16

**Added: `last_verified_at` tracking on passkey credentials — a prerequisite for ever safely cleaning up the accumulated stale credentials from today's earlier passkey-registration churn (see v1.0.6–v1.0.10), which `passkeys.json` had no way to distinguish from still-active ones.**

Direct follow-up to a user question during live testing ("why don't we just delete the 8 orphaned server entries?") after another `key_mismatch` recurrence traced back to the same known root cause (multiple accumulated passkey credentials, the OS/browser can return any of them). The honest answer: `passkeys.json` only ever recorded `created_at` — with no signal for which entries are still in active use on a real device (this soul has credentials from both a desktop browser and Android), blindly deleting any of the 7 "orphaned-looking" ones risked permanently locking out a device that was, in fact, still using one of them.

**Added**
- `lua/verify_fingerprint_check.lua`: on every successful fingerprint verification (`match:true`), the matched credential's entry in `passkeys.json` now gets `last_verified_at` set to the current UTC timestamp (same `os.date("!%Y-%m-%dT%TZ")` format `created_at` already uses).

**Notes**
- Purely additive — no change to verification logic, matching, or the response shape.
- Enables a future safe cleanup pass: once each real device has verified at least once post-deploy, entries with no `last_verified_at` at all are confidently stale and removable; entries that DO have one are proven still in use and must stay.
- Scoped to fingerprint verification specifically (`verify_fingerprint_check.lua`) — the vault-unlock/rekey flow (v1.0.18) never touches `passkeys.json` at all, they're independent subsystems that happen to share the same underlying WebAuthn credentials.

## [1.0.18] — 2026-07-16

**Added: an explicit, professional vault-encryption-method feature — the vault previously had no recorded encryption method and no safe way to change it after the fact, a gap surfaced by the direct question "how do I change the vault's encryption after the fact?" (there was no answer beyond raw file surgery).**

Until now `POST /api/vault/unlock` just accepted whatever key the client derived (via Passkey PRF or 12-word mnemonic) with no record of *which* method produced it, and no endpoint existed to safely migrate from one method/key to another — the only way to switch was to lock, manually decrypt everything with the old key, re-encrypt with the new one, and hope nothing was missed (exactly what earlier entries in this changelog, e.g. v1.0.11–v1.0.15, had to recover from by hand).

**Added**
- `lua/vault_unlock.lua`:
  - `POST /api/vault/unlock` now accepts an optional `method` field (`"passkey"|"mnemonic"`) and persists it as `vault_key_method` + `vault_key_set_at` in `api_context.json` — but only on the *first* successful key establishment for a soul (`had_key_before` guard), never overwritten by a routine unlock that just re-proves knowledge of the existing key.
  - `GET /api/vault/key-status` now also returns `vault_key_method` and `vault_key_set_at`.
  - New `POST /api/vault/rekey` endpoint: takes `old_vault_key` + `new_vault_key` + `new_method`, re-verifies the old key against every encrypted file first (reusing `scan_vault_for_mismatches` — the same guard `/unlock` already relies on), then decrypts-and-re-encrypts each file individually with a fresh IV. Only persists the new key/method/timestamp (and recomputes `webhook_token`, and refreshes any active browser session in `ngx.shared.vault_sessions`) once *every* file has migrated successfully — a partial failure leaves the old key fully intact and reports exactly which files didn't make it, rather than a half-migrated vault.
- `server/openresty/vhost.conf.template`: new `location = /api/vault/rekey` block, same `soul_auth.lua` + rate-limit pattern as the sibling `/unlock`/`/lock` endpoints.
- `app/composables/useVaultSession.js`: `unlock()` gained a `method` parameter (forwarded to the backend); new `rekey(oldKey, newKey, newMethod)` function wrapping the new endpoint.
- `app/components/VaultSessionPanel.vue`: both unlock call sites now pass `method`; added short tradeoff explanations under each method choice (Passkey: device-bound, may not sync across devices/managers; 12 words: portable but self-custody — no recovery if lost) so the initial choice is actually informed instead of an unexplained toggle.
- `app/components/SettingsModal.vue`: Vault Key section now shows the current method + when it was established; new "Change Encryption" flow — pick a new method, authenticate via Passkey or generate+confirm-saved a fresh 12-word phrase, then call `/api/vault/rekey` with the already-displayed current `vault_key_hex` as proof of access (the server re-verifies it independently regardless). Mirrors the existing "Rotate Soul-Cert" flow's visual pattern.
- `i18n/locales/{de,en}.json`: new `vault_session.*_tradeoff` strings and `settings.vault_key_change_*`/`vault_key_method_current`/`vault_key_set_at` strings; reworded `vault_session.method_warning` to point at the new safe migration path instead of just warning that a mismatch will happen.

**Verified**
- Full live round-trip against the real soul (`f0aad283-…`, 10 encrypted files): unlock with the real device key + `method=passkey` → `key-status` correctly showed `vault_key_method:"passkey"` and a `vault_key_set_at` timestamp → `rekey` to a random test key + `method=mnemonic` → all 10 files migrated, `key-status` reflected the new method and the new key decrypted everything (`all_ok:true`) → `rekey` back to the original key + `method=passkey` → state fully restored, byte-identical to the pre-test vault. A follow-up `rekey` attempt with a deliberately wrong `old_vault_key` correctly 409'd with `key_mismatch` and left the real key completely untouched.
- `nuxt build`/`nuxt generate` both completed clean (all 26 routes, including `/settings`, prerendered without error) before deploying the static output to `/var/www/kro.uxprojects-jok.com`.

**Notes**
- A normal `/api/vault/unlock` deliberately does **not** change `vault_key_method` once a key already exists — only `/api/vault/rekey` is allowed to change the recorded method, so "which method is active" can't silently drift just because someone unlocked with a differently-labeled request.
- The Settings "Change Encryption" flow reuses the vault key already displayed in that same section as `old_vault_key` rather than asking the user to re-prove access through a separate step — Settings already requires full soul-cert (owner-level) auth to reach that screen, and the server independently re-verifies the old key against every file regardless of what the client claims.

## [1.0.17] — 2026-07-16

**Fixed: the v1.0.15 credential-pruning fix only covered the Settings "Vault Key" resync flow — `VaultSessionPanel.vue`'s own "Unlock Vault" button (Soul → Set up → Vault tab) is a second, independent unlock entry point that still had the exact same stale-credential-list bug.**

Found immediately when testing the *other* unlock UI right after v1.0.15 shipped — same `key_mismatch` symptom on a device that had just worked. `VaultSessionPanel.vue` already used `authenticateOrRegister()` (fixed in v1.0.10), but never called `pruneToCredentialId()` after a server-confirmed successful unlock — that step was only wired into `SettingsModal.vue`'s resync button.

**Changed**
- `app/components/VaultSessionPanel.vue`: `handleUnlock()` now prunes the local credential list to the confirmed-working one after a successful passkey unlock, same as the Settings flow.
- `useVaultSession.js`: `unlock()`'s error handling now prefers the server's human-readable `message` field over the raw `error` code — the UI was literally showing the string `key_mismatch` to the user instead of the actual explanation ("this key can't decrypt N of M files...") that the endpoint already provides.

**Notes**
- Two independent UI entry points call the same unlock flow (`VaultSessionPanel.vue`, only rendered from `SoulSetupWizard.vue`; and the Settings "Vault Key" section added in v1.0.11) — worth remembering if a third one is ever added, the same pruning call needs to go there too rather than assuming one fix covers all callers.

## [1.0.16] — 2026-07-16

**Fixed: `PUT /api/context` (the write path behind the `soul_write` MCP tool) silently wrote `sys.md` in plaintext whenever the vault was locked, instead of rejecting the write — the most severe finding in this whole vault-encryption investigation, since `sys.md` is the actual core identity content.**

Found live: after re-encrypting `sys.md` and restoring the vault key earlier today, a later `soul_write` call (made by Claude during manual test runs, while the vault happened to be locked at that moment) silently overwrote `sys.md` back to plaintext — no error surfaced anywhere, `soul_write` just reported success as normal.

Root cause, in `lua/api_context.lua`'s `PUT` handler: the code branches on `effective_mode == "ciphered" and vkh` (a key is actually available) to decide whether to encrypt. The `else` branch's own comment said *"Open mode: Klartext nur wenn explizit cipher_mode=open gesetzt"* (plaintext only if cipher_mode is explicitly "open") — but the code never actually checked that. Any time `cipher_mode` was `"ciphered"` *but no key happened to be available* (vault locked), execution fell into the same plaintext branch the comment claimed was reserved for explicit open-mode operation.

**Changed**
- `lua/api_context.lua`: split the `else` branch into two — `cipher_mode == "ciphered"` with no key now returns `423 vault_locked` and refuses the write entirely, instead of silently downgrading to plaintext. Plaintext writes now only happen when `cipher_mode` is genuinely `"open"`, matching what the pre-existing comment always claimed.

**Notes**
- Recovered by re-encrypting the current (unchanged since the last recovery) plaintext content with the known-correct key and restoring `vault_key_hex` — verified `all_ok:true`, `checked:9` afterward.
- This is arguably the most important fix of today's whole vault-encryption thread: everything before this (v1.0.11/12/14/15) protected *secondary* files (context files, media) from key mismatches, but this bug meant the primary soul content itself could silently lose its encryption on every single write made while locked — an ongoing, repeatable data-exposure path, not a one-time artifact from the passkey churn.
- Did not audit every other write endpoint in the codebase for the same "comment says X, code does Y" pattern — worth a dedicated sweep if there's appetite, since this exact class of bug (an author's own comment describing intent that the code silently drifted away from) evidently isn't unique to this one file.

## [1.0.15] — 2026-07-16

**Fixed: "Vault Key: Re-sync" reported `key_mismatch` on the *same* device that had already worked correctly — a residual instance of the v1.0.8 stale-credential-list problem, this time on the normal (non-self-heal) authentication path.**

`saveCredentialId()` only ever appends to the locally saved credential-ID list — nothing prunes it, so it kept accumulating across every registration/migration from today's whole passkey saga. v1.0.8 fixed this specifically for the self-heal path (by restricting `allowCredentials` to the just-registered ID), but a *normal* `authenticatePasskey()` call (the common case: `hasPasskey` is true, no error) still offers the *entire* accumulated list. With several stale IDs still on file, the OS/browser can satisfy the WebAuthn ceremony with any of them — not necessarily the one whose derived key actually matches the vault — producing an apparently random mismatch on a device that had unlocked correctly moments earlier.

**Changed**
- `useSoulPasskey.js`: `authenticatePasskey()` now always records which credential was actually used in `lastUsedCredentialId` (previously only captured when a server challenge was passed). New `pruneToCredentialId(id)` replaces the entire saved list with just one ID — intentionally *not* called automatically, only when something external has confirmed that ID is the correct one.
- `SettingsModal.vue` (`handleResyncVaultKey`): after the server confirms a successful vault unlock (definitive proof this credential produces the right key), prunes the local list down to just that credential — eliminating the ambiguity for every future authentication on this device.

**Notes**
- Deliberately scoped to the vault-resync flow only, where a server response gives real confirmation. `getEncryptKey()`/`VaultSessionPanel.vue` still use the un-pruned `authenticateOrRegister()` — those paths have no server-side check that a given key is "correct," so pruning there could lock in the wrong credential.
- Does not retroactively fix already-affected browser sessions before this deploy — pruning only happens the next time someone runs a successful Vault Key resync in Settings.

## [1.0.14] — 2026-07-16

**Added: vault files that were never encrypted (e.g. context files seeded before the first passkey/vault-key ever existed) now get encrypted automatically on unlock and on lock, not just left as plaintext indefinitely.**

Follow-up to the v1.0.12 finding that `health.md`, `mind.md`, `earnings.md`, `agent.md` were still plaintext for this soul despite `cipher_mode: "ciphered"` — they were seeded during initial soul creation, before any vault key existed, and nothing ever went back to encrypt them. Worse: `POST /api/vault/lock` only ever removed the server's persisted key — it never actually protected files that were never encrypted in the first place, so "locked" gave a false sense of security for that specific vault.

**Changed**
- `lua/vault_unlock.lua`: new `sweep_encrypt_plaintext()`, sharing its core encrypt-in-place logic with the existing proven `migrate_encrypt_generic_context.lua` (a manual, one-time CLI migration script) — but wired in automatically instead of requiring a manual run.
  - Runs in `POST /api/vault/unlock` right after the existing mismatch-guard passes (v1.0.11/v1.0.12), using the just-validated key.
  - Runs in `POST /api/vault/lock`, using the still-available key *before* it gets cleared — ensures "locked" actually means "protected", not just "server access removed."
  - Excludes `sys.md` deliberately (its encryption is client-driven per the README, a behavior change out of scope for this fix) and `shopping.md`/`prompts.md`/`ownagent.md` (always plaintext by design).
- `scan_vault_for_mismatches()` and the new sweep both switched from a hardcoded 6-filename list to scanning `vault/context/` directly (excluding the same 3 names) — matches `migrate_encrypt_generic_context.lua`'s broader approach and also catches arbitrarily-named files written via the `context_write` MCP tool, which the hardcoded list would have silently skipped.
- `SettingsModal.vue`: Vault Key section now shows a distinct neutral "vault is locked, no key on file" state instead of a scary red "N files mismatched" warning when `has_key` is false (e.g. right after a normal lock) — the old logic couldn't tell "no key at all" apart from "wrong key present."

**Notes**
- Verified end-to-end on this soul: unlock encrypted `agent.md`, `earnings.md`, `health.md`, `mind.md` (4 files), all four round-trip-verified to decrypt back to their original content. `key-status` went from `checked:4` to `checked:9` once the directory scan replaced the hardcoded list (found a `vault/profile/face.json` the old list didn't know about). Re-tested lock → key-status (correctly shows "locked", not "mismatched") → unlock (correctly shows `newly_encrypted: []`, nothing left to do).

## [1.0.13] — 2026-07-16

**Fixed: `voice_hq` always showed "Security code not recognized" regardless of the actual failure reason, and there was no way to cancel out of the verify flow.**

Found during manual test runs. Investigated a real "voice not recognized" report: the FFT voice match had actually succeeded — the anti-replay digit check failed because **no ElevenLabs API key was configured for the soul at all**, so `verify_voice_hq_check.lua` could never even call the STT service. The frontend showed the same generic "security code not recognized" message for this as for a genuine wrong-digits case, making a pure configuration problem look like a voice-recognition failure.

**Changed**
- `app/pages/verify.vue` (`doVoiceHq`): now distinguishes the actual failure reason returned by the server (`elevenlabs_key_missing`, `no_voice_code_on_challenge`, `elevenlabs_error`/`upstream_error`/`invalid_response`/network failure, or a genuine digit mismatch) and shows a specific message for each instead of one generic string.
- Added a persistent close (×) button to the verify card, visible through every phase except the initial load and the final "done" screen (which already has its own explicit close flow). Previously the *only* way to back out of an in-progress verification was the face-capture step's cancel button — every other phase (fingerprint, voice, voice_hq, the method chooser) had no way to bail without closing the tab.

**Notes**
- The ElevenLabs key itself was deliberately left unconfigured for now (operator's call, not something to set up unprompted) — this fix only makes the failure mode legible, it doesn't make `voice_hq` usable without a key.

## [1.0.12] — 2026-07-16

**Fixed: v1.0.11's vault-key health-check/guard only covered `sys.md` — the real exposure was much broader.**

Prompted by a direct question ("does resync cover all vault files?") rather than something that would have surfaced on its own. Scanning this soul's vault against the current key found **3 more mismatched files** the sys.md-only check had missed entirely: `vault/images/profile.png`, a voice recording in `vault/audio/`, and `vault/context/activity.md` — each encrypted with a different key than `sys.md`, from different points in today's passkey churn. `activity_log.lua` was found to defensively refuse to write to a file it can't decrypt (to avoid replacing real history with a near-empty one) — meaning `activity.md` was silently, permanently stuck, not just wrong.

**Changed**
- `lua/vault_unlock.lua`: `key_matches_sys_md()` generalized to `file_matches_key(path, vault_key)`, plus new `scan_vault_for_mismatches()` covering `sys.md`, the server-encrypted context files (`health.md`, `mind.md`, `income.md`, `earnings.md`, `activity.md`, `agent.md` — not `shopping.md`/`prompts.md`, which are deliberately always plaintext), and all vault media (`images/`, `audio/`, `video/`, `profile/`).
- Both `POST /api/vault/unlock`'s guard and `GET /api/vault/key-status` now use the full scan instead of checking `sys.md` alone. Response shape changed: `{ checked, mismatched: [...], all_ok }` instead of a single `is_encrypted`/`matches` pair.
- `SettingsModal.vue`: Vault Key section now shows a checked/mismatched-file-count summary and lists which specific files don't match, instead of a single OK/mismatch badge. Also now displays the raw `vault_key_hex` value itself (like the Soul-Cert box above it) with a copy button.

**Fixed (found while extending the scan, same pattern as v1.0.11):**
- `file_matches_key()` required `#decrypted > 0` on top of trusting `resty.aes`'s nil-on-failure behavior — broke on a genuinely empty but validly-encrypted file (this soul's `activity.md`, reset to empty as part of recovering it). A valid decrypt of empty plaintext *is* a 0-length string, not a failure. Now trusts `type(decrypted) == "string"` alone.

**Notes**
- This soul's 3 mismatched files were resolved manually: `profile.png` and the voice recording were simply re-uploaded (encrypts fresh with the current correct key automatically); `activity.md` (just an auto-regenerating request log, no durable content) was reset to a freshly-encrypted empty file — unblocks `activity_log.lua`'s write-guard.
- Verified end-to-end post-fix: `all_ok:true`, `checked:4` for the correct key; a deliberately wrong key correctly reports all 4 as mismatched with `409 key_mismatch`.

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
