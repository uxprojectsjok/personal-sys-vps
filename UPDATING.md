# Updating Your Node

This repository is the **protocol foundation** — the reference implementation every SYS node is built from. It is not a service that pushes updates to your server. **You pull. You decide when. You are responsible for applying the update on your own node.** This is the same model used by Mastodon, Matrix/Synapse, and most self-hosted federated software: a canonical upstream publishes releases, operators upgrade on their own schedule.

## Release process

- Fixes and features land on `main` first, then get tagged as a release: `vMAJOR.MINOR.PATCH` (semver).
- Every tag has a corresponding entry in `CHANGELOG.md` (repo root) stating what changed, and explicitly flagging:
  - **Breaking** — requires action before/after updating (config change, migration, manual step)
  - **Migration required** — a one-time step is needed on existing nodes (schema/file-layout change)
- Track tags, not `main` HEAD. Running an untagged commit means running unreleased, potentially unstable work.

## How to update your node

```bash
cd /opt/sys
git fetch --tags
git log --oneline main..v<new-tag>          # skim what's changing before you jump
git checkout v<new-tag>
```

Then rebuild and redeploy exactly like a fresh install's build step:

```bash
npm run generate
node utils/killMetas.mjs
node utils/project-hash.mjs                  # confirm the fingerprint matches the tag's documented value
rsync -a --delete .output/public/ /var/www/<your-domain>/
```

> [!TIP]
> **Low-memory VPS (≤2GB RAM):** `npm run generate` can OOM during the Vite client build — the WalletConnect dependency tree is heavy enough to exceed a 1-2GB heap. Two things are needed together, not just one:
> 1. **Swap**, so there's physical backing for a larger heap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`, then persist it with `echo '/swapfile none swap sw 0 0' >> /etc/fstab`.
> 2. **A raised V8 heap limit** — swap alone doesn't help, because V8's default `--max-old-space-size` is derived from *physical* RAM, not swap: `NODE_OPTIONS="--max-old-space-size=3072" npm run generate`.

If the target tag's `CHANGELOG.md` entry says **Lua**, **soul-mcp**, or **openresty config** changed, redeploy those explicitly — a `git checkout` alone does not restart running services:

```bash
cp lua/*.lua /etc/openresty/lua/ && openresty -s reload
cp soul-mcp/tools/<changed-file>.mjs /opt/sys/soul-mcp/tools/ && systemctl restart soul-mcp
```

> [!WARNING]
> If the `CHANGELOG.md` entry marks the release **Migration required**, run the documented migration step for that version *before* redeploying — read the entry fully first, don't skim straight to the commands.

## Protocol compatibility vs. implementation detail

Two nodes on different versions must still be able to talk to each other. Not everything in this repo carries the same compatibility guarantee:

| Layer | Examples | Compatibility guarantee |
|---|---|---|
| **Protocol / wire contracts** | MCP tool signatures, `soul_cert` format, peer request/response shapes, `sys.md` sphere delimiters | Stable across versions. Breaking changes are versioned and announced ahead of time — never silent. |
| **Implementation detail** | UI, internal architecture, page layout, non-protocol Lua internals | Can change freely between releases. Does not affect interop with other nodes. |

When two nodes are on different tags, protocol-layer calls (peer messaging, trust requests, `soul_discover`) must keep working. If you're unsure whether a change you're proposing upstream touches the protocol layer, treat it as if it does.

## Keeping your node's own customizations safe

Your operator-specific content — legal pages, extra vhost `location` blocks, i18n keys for your own pages, personalized setup text — must **not** be edited directly inside files this repo tracks (`vhost.conf.template`, `i18n/locales/*.json`, `init.sh`, etc.). A future `git checkout`/update will overwrite those edits with no warning.

Instead:
- Add your own pages/config in files this repo does not ship (new components, new locale keys in a file the core `i18n` loader doesn't own, an appended include at the end of your generated vhost).
- If a core file you need to extend doesn't yet expose a clean extension point (an include line, a merge-safe config block), that's a gap worth raising upstream rather than patching around — open an issue or PR against `personal-sys-vps` so every node benefits from the fix, instead of every operator solving it separately on each update.

## Verifying what you're running

```bash
git -C /opt/sys describe --tags   # which release you're on
node utils/project-hash.mjs       # fingerprint of your actual checkout
```

Compare both against the tag and fingerprint documented in `CHANGELOG.md` for that release. A mismatch means local, undocumented modifications — expected if you've built your own operator-specific pages, worth a second look if you haven't.
