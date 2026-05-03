# Personal SYS VPS — Architecture

Dieses Dokument beschreibt die technische Architektur des Personal SYS VPS.  
Für Setup und Betrieb: [ONBOARDING.md](ONBOARDING.md)

---

## Überblick

```
┌──────────────────────────────────────────────────────────┐
│                    Browser (SPA)                         │
│  sys.md       → sessionStorage  (cleared on tab close)  │
│  Vault        → File System Access API (lokal)          │
│  Verschlüssel → WebCrypto API  (Schlüssel verlässt      │
│                                 den Browser nie)         │
└───────────────────────────┬──────────────────────────────┘
                            │ HTTPS / TLS
                            ▼
┌──────────────────────────────────────────────────────────┐
│               OpenResty (nginx + LuaJIT)                 │
│                                                          │
│  /                   → Static SPA (.output/public/)      │
│  /gate               → gate_auth.lua  (Passwortschutz)  │
│  /api/soul-cert      → soul_cert.lua  (unauthenticated) │
│  /api/chat           → soul_auth.lua → Anthropic API    │
│  /api/soul           → vault_auth.lua → api_serve.lua   │
│  /api/vault/*        → vault_auth.lua → vault_sync.lua  │
│  /api/node-status    → node_status.lua                  │
│  /api/peer/verify    → peer_verify.lua                  │
│  /api/peer/connect   → peer_connect.lua                 │
│  /mcp                → soul-mcp (Node.js :3098)         │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│          /var/lib/sys/souls/{soul_id}/                   │
│                                                          │
│  sys.md                  Identitätsdatei (enc. od. plain)│
│  api_context.json        Berechtigungen + Vault-Index    │
│  soul_connections.json   Peer-Verbindungen               │
│  vault/audio/                                            │
│  vault/images/                                           │
│  vault/video/                                            │
│  vault/context/                                          │
│  vault/profiles/                                         │
└──────────────────────────────────────────────────────────┘

Config: /var/lib/sys/config/{domain}/master.json
```

---

## Zwei-Umgebungen-Design

**Development:** `npm run dev` startet Nuxt 4 + Nitro. API-Routes in `server/api/*.js`.

**Production:** `npm run generate` erzeugt eine statische SPA in `.output/public/`. Kein Node.js-Prozess läuft in Production. Alle API-Logik übernimmt OpenResty via Lua-Scripts in `/etc/openresty/lua/`.

```
Dev:   Browser → Nuxt/Nitro (localhost:3007) → server/api/*.js
Prod:  Browser → OpenResty  → /etc/openresty/lua/*.lua
```

Nitro-Routes sind nur ein Dev-Mirror der Lua-Scripts — Änderungen an API-Logik müssen in beiden Dateien synchron gehalten werden.

---

## sys.md Format

```markdown
---
soul_id: 00000000-0000-0000-0000-000000000000
soul_name: ""
created: YYYY-MM-DD
last_session: YYYY-MM-DD
version: 1
cert_version: 0
maturity: 0
soul_cert: [wird automatisch generiert]
vault_hash: ""
soul_growth_chain: []
soul_chain_anchor: null
storage_tx: ""
---

## Kern-Identität
## Werte & Überzeugungen
## Ästhetik & Resonanz
## Sprachmuster & Ausdruck
## Wiederkehrende Themen & Obsessionen
## Emotionale Signatur
## Weltbild
## Offene Fragen dieser Person
## Session-Log (komprimiert)
## Kalender

<!-- AGENT:START -->
<!-- AGENT:END -->
```

**Frontmatter-Felder:**

| Feld                | Typ      | Beschreibung                                                      |
|---------------------|----------|-------------------------------------------------------------------|
| `soul_id`           | UUID v4  | Globaler Primärschlüssel. Basis aller Cert-Berechnungen.          |
| `soul_name`         | string   | Anzeigename (vom Nutzer gewählt).                                 |
| `created`           | ISO 8601 | Erstellungsdatum.                                                 |
| `last_session`      | ISO 8601 | Letzte Session.                                                   |
| `version`           | integer  | sys.md Schema-Version.                                            |
| `cert_version`      | integer  | Cert-Rotationsstand. Wird bei `soul_rotate_cert` inkrementiert.  |
| `maturity`          | 0–100    | Reifegradpunktzahl. Berechnet von `shared/utils/soulMaturity.js`. |
| `soul_cert`         | hex(32)  | HMAC-SHA256-Cert. Vom Server ausgestellt, im Browser gespeichert. |
| `vault_hash`        | string   | SHA-256 des letzten Vault-Snapshots.                              |
| `soul_growth_chain` | array    | Wachstums-Milestones (maturity-basiert).                          |
| `soul_chain_anchor` | object   | Blockchain-Anker (Polygon tx + IPFS CID).                        |
| `storage_tx`        | string   | IPFS/Arweave-Referenz letzter Cloud-Push.                         |

**Agent-Sandbox (`<!-- AGENT:START -->` / `<!-- AGENT:END -->`):**  
Nur der Inhalt dieses Blocks wird über `/api/soul/paid-read` an externe Agenten (MCP, WhatsApp-Bot, etc.) ausgeliefert. Der Rest der sys.md verlässt den Server nie in Richtung Dritter. Der Block ist leer bis der Nutzer ihn selbst befüllt.

---

## Authentifizierungsmodell

**HMAC-SHA256 Soul-Cert:**

```
cert     = HMAC-SHA256(SOUL_MASTER_KEY, soul_id + ":" + cert_version).hex()[:32]
bearer   = soul_id + "." + cert
```

Der Server berechnet den erwarteten Cert neu und vergleicht mit Constant-Time-Gleichheit. Kein Datenbank-Lookup, kein Session-State.

**Cert-Rotation:** `cert_version` kann inkrementiert werden (`soul_rotate_cert.lua`) ohne den `SOUL_MASTER_KEY` zu ändern. Alte Certs (niedrigere `cert_version`) werden damit ungültig.

**Gate-Schutz:** Vor dem Soul-Cert sitzt ein Gate (`gate_auth.lua`). Das Gate-Passwort ist als `HMAC-SHA256(raw_master_key, "gate_pw:" + passwort)` in `/var/lib/sys/config/{domain}/master.json` gespeichert. Sessions leben in einem OpenResty Shared Dict.

**Drei Auth-Pfade:**

| Pfad           | Token-Format            | Verwendung                                     |
|----------------|-------------------------|------------------------------------------------|
| Soul-Cert      | `{uuid}.{32 Hex}`       | Owner-Operationen (Upload, Update, Delete)     |
| Service-Token  | `{64 Hex}`              | Externe Dienste mit granularen Berechtigungen  |
| BIP39-Mnemonic | 12 Wörter im POST-Body  | Cipher-Mode-Auth ohne gespeichertes Token      |

---

## Verschlüsselung

**Server-side (Standard):**
```
sys.md + Vault-Dateien → AES-256-CBC → gespeichert auf VPS
Magic-Prefix: SYSCRYPT01  (Bytes: 53 59 53 01)
Format: [4 Magic][16 IV][Ciphertext]
Schlüssel: vault_key_hex in api_context.json (server-side)
```

**Lokal (Browser-Bundle, optional):**
```
sys.md + Vault → AES-256-GCM → .soul Bundle
Schlüssel: PBKDF2-SHA256, 100 000 Iter., 32 Byte, Salt prepended
Schlüssel verlässt den Browser nie.
```

**Transit:** TLS 1.2+. Soul-Cert ist Bearer-Token — TLS ist die Transportsicherheit.

---

## Gate & Multi-Domain

`/var/lib/sys/config/{domain}/master.json` — pro Domain isoliert:

```json
{
  "soul_master_key": "sys_<64hex>",
  "soul_master_key_prev": "",
  "prev_valid_until_ts": 0,
  "access_password_hash": "<hmac-sha256>"
}
```

`config_reader.lua` liest via `M.get_master_path()` zuerst den Domain-spezifischen Pfad — mehrere isolierte Domains auf einem OpenResty ohne Konflikte.

---

## Peer-to-Peer Soul-Verbindungen

Zwei Nodes können sich gegenseitig verifizieren und verbinden:

```
Node A → GET /api/peer/verify?soul_id=... @ Node B   (CORS, öffentlich)
Node B → antwortet mit node_status + soul_id Signatur
Node A → POST /api/peer/connect @ Node B             (authenticated)
       → speichert Verbindung in soul_connections.json
```

Verbindungen werden in `soul_connections.json` gespeichert und über `SoulNetworkPanel.vue` verwaltet.

---

## On-Chain Anchoring

```
Soul-Hash → anchor() → Polygon Mainnet
                     → IPFS (Inhalt)
                     → soul_chain_anchor in sys.md
```

Smart Contract: `0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B` (Polygon Mainnet)  
Optional: erfordert eigene `WALLETCONNECT_PROJECT_ID` (kostenlos: cloud.walletconnect.com).

---

## Rate Limiting

Rate-Limit-Zonen sind global in `/etc/openresty/nginx.conf` definiert:

| Zone           | Rate    | Angewendet auf                          |
|----------------|---------|-----------------------------------------|
| `chat_api`     | 2 r/s   | `/api/chat`, Vision-Endpunkte           |
| `vault_upload` | 5 r/s   | `/api/vault/*`                          |
| `gate`         | 5 r/min | `/gate`, Gate-Auth-Endpunkte            |

---

## MCP Server

`soul-mcp/` — Node.js MCP Server mit OAuth 2.0 + PKCE, Port 3098, via OpenResty bei `/mcp` erreichbar.

**Verfügbare Tools:** `soul_read`, `soul_write`, `soul_maturity`, `soul_skills`, `profile_get`, `audio_list`, `audio_get`, `image_list`, `image_get`, `context_get`, `context_list`, `vault_manifest`, `network_list`, `network_peer_get`, `calendar_read`, `verify_human`

---

## Frontend

- **Framework:** Nuxt 4, `ssr: false` — pure client-side rendering
- **State:** Kein Pinia/Vuex. Module-level Singleton-Refs in Composables
- **Fonts:** Lokal serviert — Noto Serif (Headings), Oxanium (UI), Remix Icons
- **CSS:** Tailwind + CSS Custom Properties. Dark-Only, kein Light-Mode
- **Build:** Statische SPA, deployed via `rsync` in den Webroot

**Wichtige Composables:**

| Composable         | Verantwortlichkeit                                       |
|--------------------|----------------------------------------------------------|
| `useSoul`          | sys.md Inhalt, soul_cert, Maturity                       |
| `useVault`         | File System Access API, Bild-Preprocessing               |
| `useApiContext`    | API-Berechtigungen, AES-256-CBC Vault-Verschlüsselung    |
| `useChainAnchor`   | Polygon + IPFS Blockchain-Anchoring                      |
| `useClaude`        | Claude API SSE-Streaming                                 |
| `useVaultConnections` | Peer-to-Peer Soul-Verbindungen                        |

---

## Umgebungsvariablen

Server-Secrets (via systemd-Override, nicht im Build):

| Variable            | Zweck                                                       |
|---------------------|-------------------------------------------------------------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API (Chat + Vision)                        |
| `SOUL_MASTER_KEY`   | HMAC-Root-Key für soul_cert. Nie exponieren.                |
| `API_SIGNING_KEY`   | Sekundärer Signing-Key für Service-Token.                   |

Im Build eingebakken (aus `.env` zur Build-Zeit gelesen):

| Variable                   | Zweck                                                   |
|----------------------------|---------------------------------------------------------|
| `WALLETCONNECT_PROJECT_ID` | WalletConnect v2 Project ID (optional, Anchoring-Feature)|
| `NODE_NAME`                | Anzeigename des Nodes auf der Landingpage               |
| `NODE_TAGLINE`             | Untertitel des Nodes (optional)                         |

---

## Lizenz

Apache License 2.0 — siehe [LICENSE](LICENSE).  
Copyright © 2026 Jan-Oliver Karo — UX-Projects, Marburg, Germany
