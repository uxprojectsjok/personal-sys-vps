# Changelog

All notable changes to the SYS protocol reference implementation are documented here.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versions follow [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).

Node operators: pin to a tag, read the entry before updating, and check for **Breaking** / **Migration required** flags — see [README: Updating Your Node](README.md#updating-your-node).

---

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
