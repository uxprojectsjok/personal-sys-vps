# Self-Hosting Your Soul Node

Every Soul runs on its own server — owned and controlled by the user.
This guide uses DigitalOcean as a reference implementation. Any VPS provider works.

---

## Concept

- Your Soul, your server, your domain
- No dependency on a central host
- The SaveYourSoul platform only earns when you anchor your Soul on the blockchain — nothing else

---

## What You Need

| What | Where |
|------|-------|
| VPS (min. 1 vCPU, 1 GB RAM) | DigitalOcean, Hetzner, Contabo, … |
| Domain | Namecheap, Porkbun, Cloudflare, … |
| Claude.ai account | claude.ai |

---

## Step 1 — Create a Droplet (DigitalOcean example)

1. Go to [digitalocean.com](https://digitalocean.com) → Create Droplet
2. Region: choose one close to you (e.g. Frankfurt)
3. Image: **Ubuntu 24.04 LTS**
4. Plan: **Basic · Regular · $6/mo** (1 vCPU, 1 GB RAM, 25 GB SSD)
5. Authentication: Password (note it down)
6. Create Droplet → note the public IP address

---

## Step 2 — Point Your Domain to the Droplet

At your domain registrar, add an **A Record**:

```
Type:  A
Name:  @   (or subdomain like "soul")
Value: <your Droplet IP>
TTL:   3600
```

DNS propagation takes 5–30 minutes.

---

## Step 3 — Let Claude Set Up the Server

Open [claude.ai](https://claude.ai) and start a new conversation:

> "I want to set up a SaveYourSoul node on my server.
> My IP is `<Droplet IP>`, my domain is `<yourdomain.com>`,
> my root password is `<password>`."

Claude will:
- Connect to your server via SSH
- Run the init script (installs OpenResty, Lua scripts, SSL)
- Configure your domain and generate your Soul Master Key
- Confirm when your Soul is live at `https://yourdomain.com`

After setup: **change your root password immediately.**

---

## Step 4 — Revoke Claude's Access

Once setup is complete, revoke any temporary credentials you shared.
Your server runs independently from this point on — no external access needed.

---

## Blockchain Anchoring (optional)

To make your Soul discoverable in the network, anchor it on Polygon:

- Go to your Soul dashboard → Agent Marketplace
- Follow the anchoring steps (POL required for the transaction)
- Your Soul gets a permanent on-chain identity and appears in Soul Discovery

This is the only step where the SaveYourSoul platform is involved.

---

## Architecture

```
Your Domain (yourdomain.com)
    └── Your VPS
            ├── OpenResty (nginx + Lua)
            ├── Soul data  /var/lib/sys/souls/{soul_id}/
            └── Static SPA /var/www/yourdomain.com/

Blockchain (Polygon)
    └── Soul anchor → discoverable via soul_discover
```

---

## Cost Overview

| Item | Cost |
|------|------|
| VPS (DigitalOcean Basic) | ~$6/mo |
| Domain | ~$10/yr |
| SSL (Let's Encrypt) | free |
| Blockchain anchor | gas fee in POL (one-time) |
