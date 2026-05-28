# Onboarding — Personal SYS Node

> **Installer scripts:** `init.sh`, `reset.sh`, `recover-password.sh`, and `deinstall.sh` are not part of the public repository. They are privately maintained by the author (Jan-Oliver Karo) and shared selectively during the testing phase. If you are part of the testing group, you have received access to the private installer repository separately.

---

## Requirements

| What | Details |
|------|---------|
| VPS | Ubuntu 24.04 LTS, min. 2 GB RAM. No pre-installed control panels (Plesk, etc.). |
| Domain | An A record pointing to your server's IP. |
| Anthropic API Key | Optional — required for AI chat features. Can also be set via the Admin UI after installation. Get one at [console.anthropic.com](https://console.anthropic.com/). |
| WalletConnect Project ID | Optional — required for Polygon blockchain anchoring. Free at [cloud.walletconnect.com](https://cloud.walletconnect.com). Must be set at install time (baked into the static build). |

---

## Step 1 — Point your domain to the server

In your DNS panel, create an A record:

| Type | Hostname | Points to |
|------|----------|-----------|
| A | `soul` (or your chosen subdomain) | Your server's IP |

> DNS propagation can take 5–30 minutes.

---

## Step 2 — Connect to your server

```bash
ssh root@YOUR-SERVER-IP
```

---

## Step 3 — Run the setup script

The installer scripts are distributed via a private repository. You need `gh` CLI to access them.

**3a — Install gh CLI and authenticate:**

```bash
curl -sS https://webi.sh/gh | sh && source ~/.config/envman/PATH.env
```

```bash
gh auth login --hostname github.com --git-protocol https --web
```

The terminal shows a one-time code. Open `https://github.com/login/device` on your phone or laptop and enter the code — no browser needed on the VPS.

**3b — Clone repos and run installer:**

```bash
gh repo clone uxprojectsjok/personal-sys-vps /opt/sys && \
gh repo clone uxprojectsjok/sys-installer /tmp/sys-installer -- --depth=1 && \
cp /tmp/sys-installer/*.sh /opt/sys/ && \
cd /opt/sys && bash init.sh
```

The script will ask for:

- **Node mode** — Personal Node (single soul) or Multi-Hoster (multiple souls)
- **Domain** — e.g. `soul.yourname.com`
- **Email** — for the SSL certificate (Let's Encrypt)
- **Anthropic API Key** — optional, press Enter to skip and configure via the UI later
- **WalletConnect Project ID** — optional, press Enter to skip; required for Polygon anchoring
- **Gate password** — protects the entire interface *(input is hidden — this is normal)*

> **Why WalletConnect must be set at install time:** The Project ID is baked into the static JavaScript bundle during `npm run generate`. It cannot be changed via the Admin UI after the build — a new install or rebuild is required.

Everything else runs automatically:
- Install and configure OpenResty
- Request an SSL certificate (Let's Encrypt) — existing certs are reused
- Set up swap (2 GB, needed for the frontend build)
- Build and deploy the frontend
- Configure environment variables for OpenResty
- Start the MCP server as a systemd service

---

## Step 4 — Secure your server

After a successful installation:

```bash
passwd
```

Set a new, strong root password.

---

## Done

Open `https://YOUR-DOMAIN` in your browser — your SYS node is ready.

> **Personal mode:** The node accepts exactly one soul. The first person to register is the permanent owner.
>
> **Multi-Hoster mode:** Registration stays open. Each soul is isolated — separate data, separate credentials.

---

## Node modes

### Personal Node

The default mode. The first soul to register locks the node — subsequent registration attempts are rejected. Suitable for private personal use.

### Multi-Hoster

One VPS hosts multiple souls. Registration is always open. Use cases: families, friend groups, companies, or soul hosting services.

In Multi-Hoster mode, every soul has fully isolated data under `/var/lib/sys/souls/{soul_id}/`. Each soul receives its own `soul_master_key` and `admin_token` at registration, stored in `soul_admin.json`. All soul certs and API keys are derived from these per-soul secrets — no soul can impersonate another, even on the same node.

When a soul first imports their sys.md, the node generates fresh credentials and immediately triggers a download of the updated sys.md (which contains the new cert). This updated file is required for all subsequent logins on this node.

> **WalletConnect limitation in Multi-Hoster mode:** All souls on the node share the same WalletConnect Project ID. If the Project ID needs to change, the frontend must be rebuilt and redeployed.

---

## What you can do with your node

**Identity**
- Create and maintain your sys.md — your personal AI identity file
- Generate a soul_cert for stateless authentication without repeated passwords
- The gate password protects the entire interface from unauthorized access

**AI**
- Chat with Claude on your node (Anthropic API, your key, your costs)
- Claude reads your sys.md as context — sessions build on each other
- **mind.md** — KI configuration file in `vault/context/mind.md`. Defines the KI's name, communication style, and self-reflection notes. Auto-created on first vault sync. Readable/writable by the KI itself via `mind_read` / `mind_write` tools. Sections `Identität` and `Grenzen` are write-protected.
- **Emergency Protocol** — 3-level KI lockdown accessible via the "Notfall" button in the chat header. Level 1: chat blocked. Level 2: image generation and all AI calls blocked. Level 3: full isolation (soul-mcp stopped). Instantly reversible with "Wiederherstellen".
- Vision: upload a camera image → Claude analyzes and describes it
- Text-to-speech via ElevenLabs (voice cloning supported)
- AI image generation via WaveSpeed AI
- Soul update: Claude writes structured data into your sys.md sections
- Profile capture in chat: type `@gesicht`, `@bewegung`, or `@stimme` to record biometric data directly from within the chat

**Vault**
- Local vault: files stay on your device (File System Access API)
- Server vault: images, audio, video, context files stored on your VPS
- Encryption optional (AES-256-CBC, key stays in the browser)

**Networking**
- Soul connections: connect other SYS nodes as peers
- MCP server: Claude Desktop and other AI clients connect via OAuth 2.0
- Zapier integration: automate workflows and notifications via webhooks
- Browser extension for automatic authentication (Chrome MV3)

**Growth**
- Growth chain: every session cryptographically signed and chained
- Blockchain anchoring on Polygon (optional, user-initiated, your own wallet)

---

## WalletConnect: registering your domain

If you set a WalletConnect Project ID, you must register your domain in the WalletConnect dashboard:

1. Go to [cloud.walletconnect.com](https://cloud.walletconnect.com) → your project → **Allowed Domains**
2. Add `https://YOUR-DOMAIN` to the allowlist

Without this, WalletConnect will block connection attempts from your node.

---

## Forgot your password?

Reset the gate password via SSH without losing your soul:

```bash
bash /opt/sys/recover-password.sh
```

The script automatically reads the domain and master key from the configuration and sets a new password hash. Soul, vault, and SSL remain fully intact. OpenResty is restarted to clear the old session cache.

> **Requirement:** SSH access to the server as root. If SSH access is lost, use your provider's VPS console (e.g., Hetzner console, Ionos KVM).

---

## Reset soul data

To delete soul data without uninstalling the server:

```bash
bash /opt/sys/reset.sh
```

**Personal Node:** removes the single soul and unlocks the node for a new registration.

**Multi-Hoster:** lists all registered souls by number. Select one to delete or `a` to remove all. Vault data, SSL, and server configuration are fully preserved in both cases. OpenResty is restarted to clear the session cache.

> **Stuck after a failed import?** If you dismissed the admin token modal by accident or your sys.md has an outdated cert, the login sheet shows a *"Registrierung zurücksetzen"* button — no SSH required.

---

## Uninstall

```bash
bash /opt/sys/deinstall.sh
```

Removes all SYS components. Ubuntu is untouched. Delete the DNS record manually at your provider afterward.

---

## Cost overview

| Item | Cost |
|------|------|
| VPS (e.g. Hetzner CX22) | ~€4–6/month |
| Domain | ~€10/year |
| SSL (Let's Encrypt) | Free |
| Anthropic API | Pay-per-use (your account) |
| Blockchain anchor | Gas in POL (one-time, optional) |
