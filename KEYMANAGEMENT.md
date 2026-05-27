# Key Management

This document covers the three keys that protect a SYS node, what each one does, and what happens when you rotate it.

---

## The Three Keys

| Key | Format | Where stored | Purpose |
|-----|--------|--------------|---------|
| `soul_master_key` | `sys_` + 64 hex | `master.json` (server) | Signs all soul_certs — the root of trust |
| `soul_cert` | 32 hex | `sys.md` frontmatter + browser sessionStorage | Authenticates every API call from the browser |
| `admin_token` | `adm_` + 64 hex | `master.json` (server) + browser localStorage | The only way to change the soul_master_key |
| `webhook_token` | any string ≤ 256 chars | `api_context.json` (server) | Authenticates the ElevenLabs agent (vault read/write access) |

---

## soul_cert Rotation

**Trigger:** Einstellungen → API → Cert rotieren

### What happens

1. Browser calls `POST /api/soul-rotate-cert` with the current cert
2. Server increments `cert_version` in `api_context.json` — old cert is immediately invalid
3. New cert is returned and stored in the browser (sessionStorage)
4. sys.md is updated locally, pushed to server, and offered as download
5. Biometric credentials are updated with the new cert if configured

### Effect on connected services

| Service | Effect | Action required |
|---------|--------|----------------|
| In-App Chat | None — new cert active immediately | — |
| ElevenLabs Agent | None — uses webhook_token, independent of soul_cert | — |
| MCP (Claude Desktop) | None — uses OAuth token, independent of soul_cert | — |

### What you must do

The rotation flow via Einstellungen → API → Cert rotieren is fully automated:

| Step | Automatic |
|------|-----------|
| New cert issued, cert_version incremented | ✓ |
| Browser stores new cert immediately | ✓ |
| Local vault file updated (if vault connected) | ✓ |
| sys.md pushed to server | ✓ |
| sys.md offered as download | ✓ |
| Server validation confirms new cert | ✓ |
| Biometric credentials updated | ✓ |

**Your only obligation:** Save the downloaded sys.md — it contains the new `soul_cert` in the frontmatter. If you lose it, use `recover-password.sh` (SSH access required).

---

## soul_master_key Rotation

**Trigger:** Einstellungen → Admin → Neuer Master-Key

### What happens

1. Browser generates a new key via `crypto.getRandomValues` — the server never generates keys
2. Browser calls `POST /api/set-master` authenticated with the admin_token
3. Old key is saved as `soul_master_key_prev` with a **15-minute grace period**
4. Within the grace period, the browser automatically triggers a cert rotation (see above)
5. After 15 minutes, the old key is fully invalid

### Effect on connected services

| Service | Effect | Action required |
|---------|--------|----------------|
| In-App Chat | None — cert rotation runs automatically | — |
| ElevenLabs Agent | Stops working after grace period | **Run `@create-agent` again** |
| MCP (Claude Desktop) | Works until OAuth token expires, then re-auth | Re-authenticate in Claude Desktop |

### What you must do

- Stay in the browser after rotation — the cert rotation runs automatically inside the 15-minute window. If you close the tab first, trigger cert rotation manually in the API tab.
- Run `@create-agent` in chat to re-register the ElevenLabs agent under the new key.
- Save the downloaded sys.md.

### Timing

```
t=0       Master-Key rotiert — grace period starts
t=0+auto  Cert rotation triggered automatically
t=+15min  Old master_key_prev expires — ElevenLabs agent stops working
```

---

## webhook_token Rotation

**Trigger:** Vault-Einstellungen → API-Kontext → Webhook-Token Feld → neuen Wert eintragen und speichern

### What happens

1. New token is saved in `api_context.json` — old token is immediately invalid
2. ElevenLabs agent loses vault access (it authenticated via the old token)

### Effect on connected services

| Service | Effect | Action required |
|---------|--------|----------------|
| ElevenLabs Agent | Stops accessing vault files | Run `@create-agent` in chat |
| In-App Chat | None — uses soul_cert, not webhook_token | — |
| MCP (Claude Desktop) | None — uses OAuth token | — |

### What you must do

- Run `@create-agent` to re-register the ElevenLabs agent under the new token

### When to rotate

Rotate the webhook_token when:
- You suspect it was leaked
- The ElevenLabs agent integration is no longer trusted
- Routine hygiene alongside a soul_cert rotation

---

## admin_token

**soul_cert = Tür zum Node. admin_token = Schlüssel zum Schlüsselbund.**

The admin_token has exactly one purpose: authenticating calls to `/api/set-master`. It is intentionally independent of the soul_cert — if the soul_master_key is lost or compromised, you still need a way in to replace it. That way is the admin_token.

### When you need to enter it manually

In practice you almost never type it yourself:

| Node mode | How the admin panel unlocks |
|-----------|----------------------------|
| **Personal Node** | soul_cert Bearer auth is accepted directly — no admin_token needed at all |
| **Multi-Hoster** | admin_token is returned during first registration and stored automatically in browser localStorage — the panel unlocks on its own |
| **New browser / cleared storage** | Token is gone from localStorage → enter it manually once to restore access |

The input field in Einstellungen → Admin only appears when the token is missing from localStorage. On your regular device it is invisible because the token is already there.

You receive it once during `init.sh` setup, or after running `recover-password.sh`. Keep a copy somewhere safe for the new-device case. It is never sent to any external service.

**You never need it during normal operation.** It exists for the moment you need to replace the soul_master_key — and even then, your browser usually handles it silently.

---

## When to rotate what

| Situation | Rotate |
|-----------|--------|
| Routine security hygiene | soul_cert (low impact) |
| You suspect the soul_cert was leaked | soul_cert immediately |
| You suspect the webhook_token was leaked | webhook_token — run `@create-agent` |
| You suspect the soul_master_key was leaked | soul_master_key + admin_token |
| You lost your sys.md | Use `recover-password.sh` (SSH access required) |
| Admin-Token leaked | soul_master_key rotation → set new admin_token in the same call |

---

## Key Generation

Keys are always generated in the browser via `crypto.getRandomValues`. The server never generates or knows the plaintext of a new key before you send it. This means:

- A compromised server cannot pre-generate a weak key for you
- Key rotation is safe to initiate even on a server you have partial doubts about

The vault encryption key (AES-256-CBC, used for sys.md and vault files) follows the same principle — generated in the browser, never transmitted to the server in plaintext.
