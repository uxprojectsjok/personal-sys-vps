# Contributing to Personal SYS VPS

SYS is an open protocol. Contributions are welcome — bug fixes, new integrations, documentation improvements, and protocol extensions.

Before contributing, read the [NOTICE](./NOTICE) file for trademark and attribution requirements.

---

## What you can do freely (Apache 2.0)

- Self-host your own private SYS node with your own `SOUL_MASTER_KEY`
- Build applications and integrations on top of the SYS protocol
- Fork and modify the codebase (attribution required, see NOTICE)
- Add new Lua endpoints, composables, or integrations
- Deploy the `soul-mcp` MCP server for your own souls

## What requires written permission

- Using the name **"SaveYourSoul"** or **"SYS"** for a public service or product
- Claiming your implementation is **"officially certified"**

---

## Self-Hosting

The fastest way to run your own node:

```bash
git clone https://github.com/uxprojectsjok/personal-sys-vps.git /opt/sys
cd /opt/sys && bash init.sh
```

The script handles everything: OpenResty, SSL, Node.js, frontend build, Lua scripts, config. Full guide: [ONBOARDING.md](./ONBOARDING.md)

---

## Development Setup

```bash
git clone https://github.com/uxprojectsjok/personal-sys-vps.git
cd personal-sys-vps
cp .env.example .env   # fill in ANTHROPIC_API_KEY, SOUL_MASTER_KEY, API_SIGNING_KEY
npm install
npm run dev            # Nuxt dev server + Nitro API on https://localhost:3007
```

Production uses OpenResty (Lua) instead of Nitro. When changing API logic, keep both in sync:
- `server/api/*.js` — Nitro (dev)
- `lua/*.lua` → `/etc/openresty/lua/` — OpenResty (prod)

---

## Project Fingerprint

Verify your clone matches the official release:

```bash
node utils/project-hash.mjs
```

---

## Pull Requests

Open an issue before starting large changes. By submitting a PR, you agree your contribution is licensed under Apache 2.0 and attributed as per the NOTICE file.

**Contact:** info@uxprojects-jok.com — [uxprojects-jok.com](https://uxprojects-jok.com)
