# Changelog

Changelog for `personal-sys-vps-private` — the private layer running **kro.uxprojects-jok.com**.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versions follow [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`). This repo has its own version track, independent of the public `personal-sys-vps` repo's tags — each entry below notes which public state it was last merged from.

See [README: Updating This Node](README.md#updating-this-node) for the merge/deploy process.

---

## [1.0.0] — 2026-07-16

First tagged release of the private layer. Baseline for the current production instance at kro.uxprojects-jok.com.

**Notes**
- Not yet merged with `personal-sys-vps` `v1.0.0` (which only added its own README/CHANGELOG documentation, no functional change) — next update should pull that in.
- Marks the point after retiring the redundant `SaveYourSoul_me_live` local checkout; `/opt/sys` (this checkout) is now the sole working copy for kro — no separate build/staging directory.
