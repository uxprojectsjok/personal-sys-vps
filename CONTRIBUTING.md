# Self-Hosting & Contributing to SaveYourSoul

## Overview

SaveYourSoul (SYS) is an open-source protocol for persistent AI soul identities.
The code is published under the Apache 2.0 License. You can self-host a fully
functional instance on your own infrastructure.

**Before you begin, read the [NOTICE](./NOTICE) file** — it covers trademark
restrictions and the authorship model explained below.

---

## What you can do freely

- Run your own private SYS instance with your own `SOUL_MASTER_KEY`
- Build applications on top of the SYS protocol
- Fork and modify the codebase (Apache 2.0, attribution required)
- Deploy the `soul-mcp` MCP server to expose souls to AI assistants
- Use the WhatsApp and voice-clone integrations for your own souls

## What requires permission

- Using the name **"SaveYourSoul"** or **"SYS"** for a public service or product
- Claiming your implementation is **"officially certified"** by the author
- Connecting to or impersonating the **canonical SYS network**

---

## Self-Hosting Guide

### Prerequisites

| Component | Requirement |
|-----------|-------------|
| Server OS | Ubuntu 22.04+ or Debian 12+ |
| Web server | OpenResty (Nginx + LuaJIT) |
| Node.js | 20+ (dev server only) |
| SSL | Let's Encrypt or own certificate |

### 1. Clone and configure

```bash
git clone https://github.com/YOUR_FORK/SaveYourSoul.git
cd SaveYourSoul
cp .env.example .env
# Fill in all values in .env
npm install
```

### 2. Generate your master key

```bash
openssl rand -hex 32   # → SOUL_MASTER_KEY
openssl rand -hex 32   # → API_SIGNING_KEY
```

Your `SOUL_MASTER_KEY` is the root of your instance's chain of trust.
**Keep it secret. Back it up offline. Never share it.**
All soul certificates issued by your instance are derived from this key.

### 3. Configure OpenResty

```bash
# Copy Lua scripts
cp server/openresty/*.lua /etc/openresty/lua/

# Create vhost from template
cp server/openresty/vhost.conf.template /etc/openresty/sites-available/YOUR_DOMAIN
# Replace all occurrences of YOUR_DOMAIN in the file with your actual domain

# Enable site
ln -s /etc/openresty/sites-available/YOUR_DOMAIN /etc/openresty/sites-enabled/

# Set environment variables via systemd override
systemctl edit openresty
# Add:
# [Service]
# Environment="ANTHROPIC_API_KEY=..."
# Environment="SOUL_MASTER_KEY=..."
# Environment="API_SIGNING_KEY=..."
# Environment="WAVESPEED_KEY=..."    # optional

openresty -s reload
```

Full setup instructions: [docs/PRODUCTION_SETUP.md](./docs/PRODUCTION_SETUP.md)

### 4. Build and deploy the frontend

```bash
npm run generate
cd utils && node killMetas.mjs && cd ..
rsync -a --delete .output/public/ /var/www/YOUR_DOMAIN/
openresty -s reload
```

### 5. Optional integrations

#### WhatsApp
```bash
cd soul-whatsapp
cp .env.example .env   # fill in Twilio credentials
npm install
twilio serverless:deploy --override-existing-project
```

#### Voice clone (ElevenLabs)
```bash
cd soul-voice-clone
cp .env.example .env   # fill in ElevenLabs + Twilio credentials
npm install
node clone-voice.mjs        # create voice + agent
node whatsapp-connect.mjs   # link to WhatsApp Business
```

---

## The Authorship Model

The SYS architecture has a built-in chain of trust that makes the original
author the canonical root:

```
SOUL_MASTER_KEY (secret, on-server)
    └── soul_cert = HMAC-SHA256(SOUL_MASTER_KEY, soul_id)[0:32]
            └── All API access validated against this cert
```

- **Your instance** = your own `SOUL_MASTER_KEY` = your own isolated network
- **Canonical SYS network** = original `SOUL_MASTER_KEY` at the reference implementation
- Souls from one instance cannot authenticate against another instance

Additionally, the `SoulRegistry.sol` smart contract, when deployed by the author
on Polygon mainnet, creates an immutable on-chain record of authorship that no
fork can replicate or invalidate.

---

## Contributing Code

Pull requests are welcome for:
- Bug fixes
- New integrations (new platforms, new vault backends)
- Documentation improvements
- Protocol extensions (must be backwards-compatible)

By submitting a PR, you agree that your contribution will be licensed under the
same Apache 2.0 License and attributed to the original copyright holder as per
the NOTICE file.

Please open an issue before starting large changes.

---

## Contact & Certification

To inquire about official certification, licensing, or partnership:

- Email: jan-oliver.karo@uxprojects-jok.com
- Web: https://uxprojects-jok.com
