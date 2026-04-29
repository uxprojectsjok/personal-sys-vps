# SaveYourSoul – Production Setup & OpenResty Deep Dive

> Dieses Dokument beschreibt die vollständige Production-Infrastruktur,
> alle notwendigen Konfigurationsschritte und die Erkenntnisse aus dem
> ersten vollständigen Prod-Deployment. Für neue Entwickler und zukünftige
> Deployments.

---

## Architektur-Überblick

```
Browser (SPA)
    │
    │  HTTPS
    ▼
OpenResty (VPS)
    ├── Static Files  →  /var/www/YOUR_DOMAIN/
    ├── /api/chat     →  Anthropic API (Proxy + soul_auth.lua)
    ├── /api/soul-update   →  Anthropic API (Proxy + soul_auth.lua)
    ├── /api/soul-cert     →  soul_cert.lua (HMAC, kein Auth)
    ├── /api/soul-sign-session  →  soul_sign_session.lua (HMAC, kein Auth)
    ├── /api/validate      →  soul_auth.lua → 200 OK
    └── /api/soul/v1/token →  soul_token_jwt.lua (JWT, soul_auth.lua)
```

**Kernprinzip:** Nuxt 4 generiert eine vollständig statische SPA (`nuxt generate`).
Es läuft kein Node.js-Prozess auf dem Server. OpenResty übernimmt alle API-Endpunkte
via Lua-Scripting. Die `server/api/*.js`-Handler existieren **nur für `nuxt dev`**.

---

## Warum OpenResty statt Node?

- Kein laufender Prozess notwendig (statisches Hosting)
- Anthropic API Key bleibt serverseitig (nie im Browser-Bundle)
- `SOUL_MASTER_KEY` für HMAC-Signierung bleibt serverseitig
- Lua ist im OpenResty-Bundle enthalten, kein zusätzlicher Dienst
- Performance: nginx-native Verarbeitung

---

## Verzeichnisstruktur auf dem VPS

```
/etc/openresty/
├── nginx.conf                          # Hauptkonfig (env-Deklarationen hier)
├── sites-available/
│   └── YOUR_DOMAIN                     # Vhost (aus repo: server/openresty/vhost.conf.template)
└── lua/
    ├── soul_auth.lua                   # Token-Validierung (access phase, soul-cert)
    ├── vault_auth.lua                  # Token-Validierung (soul-cert ODER webhook-token ODER ?token=)
    ├── soul_cert.lua                   # Cert-Generierung
    ├── soul_sign_session.lua           # Growth-Chain-Signierung
    ├── soul_token_jwt.lua              # JWT-Ausstellen
    ├── api_context.lua                 # GET/PUT /api/context
    ├── vault_sync.lua                  # POST /api/vault/sync
    ├── api_serve.lua                   # GET /api/soul, /api/vault/*
    ├── webhook.lua                     # POST /api/webhook[/elevenlabs]
    └── webhook_mnemonic.lua            # POST /api/webhook/mnemonic (BIP39-Auth)

/var/www/YOUR_DOMAIN/                   # Static Files (aus .output/public/)
/usr/local/openresty/site/              # OPM-Packages (z.B. lua-resty-openssl)
/var/lib/sys/souls/{soul_id}/           # Soul-Daten (api_context.json, sys.md, vault/)
```

---

## Environment-Variablen

### systemd Override (`sudo systemctl edit openresty`)

```ini
[Service]
Environment="ANTHROPIC_API_KEY=sk-ant-api03-..."
Environment="SOUL_MASTER_KEY=<32-Byte-Hex>"
Environment="API_SIGNING_KEY=<32-Byte-Hex>"
Environment="WALLETCONNECT_PROJECT_ID=<project-id>"
```

Generierung neuer Keys:

```bash
openssl rand -hex 32
```

### nginx.conf – env-Direktiven (PFLICHT)

**Kritisch:** nginx stripped alle Umgebungsvariablen aus Worker-Prozessen,
außer den explizit deklarierten. Lua-Code kann nur auf diese zugreifen.

In `/etc/openresty/nginx.conf` im `main`-Block (außerhalb von `http {}`):

```nginx
env ANTHROPIC_API_KEY;
env SOUL_MASTER_KEY;
env API_SIGNING_KEY;
```

### nginx.conf – lua_package_path (PFLICHT)

Damit `require("hmac_helper")` und andere lokale Lua-Module gefunden werden,
muss der Pfad im `http`-Block direkt nach `init_by_lua_block` stehen:

```nginx
http {
  init_by_lua_block {
    math.randomseed(ngx.now() * 1000 + ngx.worker.pid())
  }
  lua_package_path "/etc/openresty/lua/?.lua;;";
  ...
}
```

**Ohne diese Zeile** schlägt `require("hmac_helper")` mit 500 fehl, weil OpenResty
nur seine eigenen Pfade (`/usr/local/openresty/lualib/`) durchsucht.

**Wichtig:** Nach Änderung an systemd-Override oder nginx.conf ist
`sudo systemctl restart openresty` nötig (nicht nur `reload`), damit
der Master-Prozess die neuen Umgebungsvariablen aufnimmt.

### Build-Time-Variablen (müssen VOR `npm run generate` in `.env` stehen)

```env
WALLETCONNECT_PROJECT_ID=<your key>
```

Diese werden zur Build-Zeit in das JS-Bundle gebacken. Eine Änderung
erfordert einen neuen Build + Deploy.

---

## Lua-Scripts im Detail

### `soul_auth.lua` – Token-Validierung (access phase)

Validiert `Authorization: Bearer {soul_id}.{cert}`.

**Algorithmus:**

```
cert_expected = HMAC-SHA256(SOUL_MASTER_KEY, soul_id).hex()[:32]
cert_valid = (cert == cert_expected)
```

**Wichtig:** Nach erfolgreicher Validierung wird

- `ngx.ctx.soul_id = soul_id` gesetzt (für Content-Phase nutzbar)
- `Authorization`-Header gecleart (wird nicht an Anthropic weitergeleitet)

Wird als `access_by_lua_file` eingebunden – läuft vor dem Content-Handler.

---

### `soul_cert.lua` – Cert-Generierung (content phase)

```
POST /api/soul-cert  {"soul_id":"..."}
→ {"cert":"<32 hex chars>"}
```

Kein Auth erforderlich – das HMAC-Secret ist die Absicherung.
Gleiches HMAC wie in soul_auth.lua.

---

### `soul_sign_session.lua` – Growth-Chain-Signierung (content phase)

```
POST /api/soul-sign-session  {"soul_id":"...","content_hash":"...","date":"YYYY-MM-DD"}
→ {"signature":"<32 hex chars>"}
```

Message: `soul_id:date:content_hash` (Reihenfolge unveränderlich).
Kein Auth – beweist nur, dass die Signierung auf diesem Server stattfand.

---

### `soul_token_jwt.lua` – JWT-Ausstellen (content phase)

```
POST /api/soul/v1/token  Authorization: Bearer soul_id.cert
→ {"token":"<JWT>","expires_in":2592000,"soul_id":"..."}
```

Liest `soul_id` aus `ngx.ctx.soul_id` (von soul_auth.lua gesetzt).
JWT: HS256, 30 Tage, signiert mit `API_SIGNING_KEY`.

Benötigt `env API_SIGNING_KEY;` in nginx.conf.

---

## Anthropic-Proxy: Kritische Erkenntnisse

### Problem: Origin-Header → Anthropic 401

**Symptom:** `/api/chat` lieferte 401, obwohl soul_auth.lua durchkam.
**Ursache:** Wenn ein Browser eine Anfrage stellt, sendet er automatisch
`Origin: https://YOUR_DOMAIN`. OpenResty leitete diesen Header
unverändert an Anthropic weiter. Anthropic interpretiert `Origin`-Header
als direkten Browser-Request und lehnt ab mit:

```json
{
  "type": "error",
  "error": {
    "type": "authentication_error",
    "message": "CORS requests must set 'anthropic-dangerous-direct-browser-only-key'"
  }
}
```

**Fix:** In jedem Anthropic-Proxy-Location-Block:

```nginx
proxy_set_header Origin  "";
proxy_set_header Referer "";
```

Dies gilt für `/api/chat` UND `/api/soul-update`.

### `/api/soul-update` – Kein Streaming

Im Gegensatz zu `/api/chat` (SSE-Streaming) gibt `/api/soul-update`
eine vollständige JSON-Antwort zurück (`stream: false`).
Der Client baut den vollständigen Anthropic-Payload selbst
(System-Prompt + Konversationstext), OpenResty proxied ihn transparent.

---

## Deployment-Ablauf

### 1. Build (lokal)

```bash
# .env prüfen (Build-Time-Vars müssen vorhanden sein)
cat .env

npm run generate
# Output: .output/public/ (oder .output/YOUR_DOMAIN/ – prüfen!)
ls .output/
```

### 2. Static Files deployen

```bash
rsync -avz --delete .output/public/ user@YOUR_SERVER:/var/www/YOUR_DOMAIN/
```

### 3. Lua-Scripts deployen

Die Auth-Lua-Scripts (`soul_auth.lua`, `soul_cert.lua`, `soul_sign_session.lua`, `soul_token_jwt.lua`)
sind in diesem Repo als Interface-Stubs veröffentlicht — **kein lauffähiger Code**.
Die Implementierung muss vom Operator eigenständig bereitgestellt werden.

Die übrigen Lua-Scripts (`api_context.lua`, `api_serve.lua`, `vault_sync.lua`, etc.)
können direkt aus dem Repo kopiert werden:

```bash
scp server/openresty/*.lua user@YOUR_SERVER:/tmp/
# Auf dem VPS:
sudo cp /tmp/*.lua /etc/openresty/lua/
```

### 4. Vhost deployen

```bash
scp server/openresty/vhost.conf.template user@YOUR_SERVER:/tmp/
# Auf dem VPS: Template anpassen und als Vhost aktivieren
sudo openresty -t && sudo openresty -s reload
```

### 5. Env-Variablen (nur bei Ersteinrichtung oder Änderung)

```bash
sudo systemctl edit openresty
# Werte eintragen/ändern

sudo systemctl daemon-reload
sudo systemctl restart openresty  # restart, nicht reload!
```

### 6. nginx.conf env-Deklarationen (nur bei Ersteinrichtung)

```bash
# Prüfen ob alle Vars deklariert sind:
grep "^env " /etc/openresty/nginx.conf

# Fehlende ergänzen (im main-Block):
sudo nano /etc/openresty/nginx.conf
# → env ANTHROPIC_API_KEY;
# → env SOUL_MASTER_KEY;
# → env API_SIGNING_KEY;
```

---

## API-Endpunkte: Übersicht

| Endpunkt                    | Methode | Auth                 | Handler                | Zweck                             |
| --------------------------- | ------- | -------------------- | ---------------------- | --------------------------------- |
| `/api/chat`                 | POST    | soul_auth            | Anthropic Proxy (SSE)  | Chat-Streaming                    |
| `/api/soul-update`          | POST    | soul_auth            | Anthropic Proxy (JSON) | Soul-Anreicherung                 |
| `/api/validate`             | GET     | soul_auth            | `return 200`           | Cert-Vorvalidierung               |
| `/api/soul-cert`            | POST    | –                    | soul_cert.lua          | Cert generieren                   |
| `/api/soul-sign-session`    | POST    | –                    | soul_sign_session.lua  | Growth-Chain-Sig                  |
| `/api/soul/v1/token`        | POST    | soul_auth            | soul_token_jwt.lua     | JWT ausstellen                    |
| `/api/context`              | GET/PUT | soul_auth            | api_context.lua        | API-Konfiguration lesen/schreiben |
| `/api/vault/sync`           | POST    | soul_auth            | vault_sync.lua         | Datei in Vault hochladen          |
| `/api/soul`                 | GET     | vault_auth           | api_serve.lua          | Soul-Inhalt lesen                 |
| `/api/vault/manifest`       | GET     | vault_auth           | api_serve.lua          | Ressourcen-Übersicht              |
| `/api/vault/audio[/{f}]`    | GET     | vault_auth + ?token= | api_serve.lua          | Audio-Dateien                     |
| `/api/vault/images[/{f}]`   | GET     | vault_auth + ?token= | api_serve.lua          | Bild-Dateien                      |
| `/api/vault/context[/{f}]`  | GET     | vault_auth + ?token= | api_serve.lua          | Text-Kontext-Dateien              |
| `/api/webhook[/elevenlabs]` | POST    | vault_auth           | webhook.lua            | Alle Ressourcen + ElevenLabs      |
| `/api/webhook/mnemonic`     | POST    | BIP39 im Body        | webhook_mnemonic.lua   | Ciphered-Zugriff via 12 Wörter    |

---

## Lokale Entwicklung – Von Setup bis Build

### Voraussetzungen

```bash
node --version   # >= 20
npm --version
```

### 1. Repository klonen & Dependencies installieren

```bash
git clone <repo>
cd SaveYourSoul
npm install
```

### 2. `.env` anlegen

```bash
cp .env.example .env
# Werte eintragen
```

Die `.env` hat zwei grundlegend unterschiedliche Kategorien:

#### Server-Secrets (nur für `nuxt dev`, nie im Bundle)

```env
ANTHROPIC_API_KEY=sk-ant-api03-...
SOUL_MASTER_KEY=<identisch mit VPS-Wert>
API_SIGNING_KEY=<identisch mit VPS-Wert>
```

Diese Werte werden von den `server/api/*.js`-Handlern zur Laufzeit gelesen.
Sie landen **niemals** im Browser-Bundle – Nuxt isoliert Server-Code strikt.

**Kritisch:** `SOUL_MASTER_KEY` muss auf lokalem Rechner und VPS **exakt identisch** sein.
Das Cert wird mit diesem Key signiert. Ein Mismatch → 401 in Production für alle lokal erstellten Souls.

#### Public-Vars (Build-Time – werden ins JS-Bundle eingebacken)

```env
WALLETCONNECT_PROJECT_ID=<your key>
```

Dieser Wert wird von `nuxt.config.js` über `runtimeConfig.public` zur **Build-Zeit** in
das JavaScript-Bundle eingebettet. Er ist im Browser sichtbar – **kein Secret**.
Änderungen erfordern immer einen neuen Build + Deploy.

### 3. Dev-Server starten

```bash
npm run dev
# → https://localhost:3007
```

Der Dev-Server läuft zwingend mit HTTPS (`.certs/`-Verzeichnis, via mkcert).
`crypto.subtle` für BIP39-Verschlüsselung funktioniert nur über HTTPS – kein `http://`.

**Für LAN-Tests auf Smartphone** (bereits konfiguriert):

```
https://192.168.178.x:3007
```

`host: "0.0.0.0"` in `nuxt.config.js` ist bereits gesetzt. Einmalig Zertifikatswarnung
im Smartphone-Browser akzeptieren.

### 4. Dev-Architektur vs. Production – Der zentrale Unterschied

```
┌─────────────────────────────┐    ┌──────────────────────────────────┐
│  nuxt dev (lokal)           │    │  nuxt generate → VPS             │
├─────────────────────────────┤    ├──────────────────────────────────┤
│ Vite Dev-Server             │    │ Statische Dateien                │
│  └─ SPA im Browser          │    │  → kein laufender Node-Prozess   │
│                             │    │                                  │
│ server/api/*.js  ←────────  │    │ OpenResty (Lua)                  │
│  ├── chat.post.js           │    │  ├── soul_auth.lua               │
│  ├── soul-cert.post.js      │    │  ├── soul_cert.lua               │
│  ├── soul-update.post.js    │    │  ├── soul_sign_session.lua       │
│  ├── soul-sign-session.post │    │  └── soul_token_jwt.lua          │
│  └── soul/v1/token.post.js  │    │                                  │
└─────────────────────────────┘    └──────────────────────────────────┘
```

**In dev** laufen alle `/api/*`-Anfragen gegen die lokalen Nuxt-Handler in `server/api/`.
**In prod** existieren diese Handler nicht – OpenResty Lua übernimmt alle `/api/*`-Routen.

Beide Implementierungen (JS und Lua) müssen **dasselbe Verhalten** zeigen.
Bei Änderungen an einem immer auch das andere anpassen.

### 5. HTTPS-Zertifikate (Ersteinrichtung, falls `.certs/` fehlt)

```bash
# mkcert installieren
# Windows: choco install mkcert
# macOS:   brew install mkcert

mkcert -install
mkdir .certs && cd .certs
mkcert localhost 127.0.0.1 ::1 192.,,,
# Erzeugt: localhost+2.pem + localhost+2-key.pem
```

Die Pfade sind in `nuxt.config.js` bereits eingetragen.

### 6. Build erstellen

```bash
npm run generate
```

**Ausgabeverzeichnis prüfen** – der Pfad ist nicht immer gleich:

```bash
ls .output/
# Mögliche Pfade:
#   .output/public/                    ← Standard (aktuelle Builds)
#   .output/YOUR_DOMAIN/               ← Domain-basiert (kann vorkommen)

# Zur Sicherheit: Dateianzahl prüfen
find .output -name "*.js" | wc -l
# Erwartet: ~100-120 Dateien
```

Immer den tatsächlichen Pfad prüfen, bevor rsync läuft –
sonst deployt man versehentlich einen alten Build.

### 7. Deploy

```bash
# Schritt 1: Static Files
rsync -avz --delete .output/public/ user@YOUR_SERVER:/var/www/YOUR_DOMAIN/

# Schritt 2: Lua-Scripts (nur wenn geändert)
# Hinweis: Auth-Stubs (soul_auth, soul_cert, soul_sign_session, soul_token_jwt)
# müssen vom Operator eigenständig implementiert werden.
scp server/openresty/*.lua user@YOUR_SERVER:/tmp/
# Auf VPS:
sudo cp /tmp/*.lua /etc/openresty/lua/

# Schritt 3: Vhost (nur wenn geändert)
# Auf Basis von server/openresty/vhost.conf.template
sudo openresty -t && sudo openresty -s reload
```

### Variablen-Übersicht

| Variable            | Wo gesetzt       | Wo gelesen                                     | Geheim?                          |
| ------------------- | ---------------- | ---------------------------------------------- | -------------------------------- |
| `ANTHROPIC_API_KEY` | `.env` / systemd | `server/api/*.js` · nginx env                  | ✅ Ja                            |
| `SOUL_MASTER_KEY`   | `.env` / systemd | `validateSoulToken.js` · `soul_auth.lua`       | ✅ Ja – muss auf dev und VPS identisch sein |
| `API_SIGNING_KEY`   | `.env` / systemd | `soul/v1/token.post.js` · `soul_token_jwt.lua` | ✅ Ja                            |
| `WALLETCONNECT_PROJECT_ID` | `.env` (Build-Time) | `nuxt.config.js` → JS-Bundle          | ⚠️ Nein – im Browser sichtbar   |

---

## Häufige Fehler & Lösungen

| Fehler                                   | Ursache                                        | Lösung                                                                             |
| ---------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `405 Method Not Allowed` auf `/api/*`    | Location fehlt in nginx-Vhost                  | Location-Block hinzufügen + reload                                                 |
| `authentication_error: CORS requests...` | Origin-Header an Anthropic weitergeleitet      | `proxy_set_header Origin "";` in Proxy-Location                                    |
| `API_SIGNING_KEY nicht gesetzt`          | `env API_SIGNING_KEY;` fehlt in nginx.conf     | In nginx.conf ergänzen + restart                                                   |
| Cert-Fehler nach Vault-Restore           | syncVaultSoul überschreibt Cert                | Vault-Restore vor refreshCert()                                                    |
| `soul_id nicht lesbar` in JWT-Lua        | Authorization-Header nach soul_auth gecleart   | `ngx.ctx.soul_id` aus soul_auth lesen                                              |
| `module 'hmac_helper' not found`         | `lua_package_path` fehlt in nginx.conf         | `lua_package_path "/etc/openresty/lua/?.lua;;";` im `http`-Block ergänzen + reload |
| WalletConnect Project ID fehlt           | BUILD-TIME-Variable nicht in .env vor generate | `.env` prüfen, neu builden                                                         |

---

## Repo-Struktur: Openresty-Files

```
server/openresty/
├── vhost.conf.template            # Vhost-Template (YOUR_DOMAIN ersetzen)
├── soul_auth.lua                  # Token-Validierung (soul-cert, access phase)
├── vault_auth.lua                 # Token-Validierung (soul-cert | webhook | ?token=)
├── soul_cert.lua                  # Cert-Generierung
├── soul_sign_session.lua          # Growth-Chain-Signierung
├── soul_token_jwt.lua             # JWT-Ausstellen
├── api_context.lua                # API-Konfiguration lesen/schreiben
├── vault_sync.lua                 # Vault-Datei-Upload
├── api_serve.lua                  # Vault-Ressourcen servieren
├── webhook.lua                    # Generischer + ElevenLabs-Webhook
├── webhook_mnemonic.lua           # Ciphered-Webhook via 12 BIP39-Wörter
└── vhost-api-locations.nginx      # (veraltet – Referenz)
```

Die `.nginx`- und `.lua`-Dateien im Repo sind die **maßgebliche Quelle**.
Änderungen immer zuerst im Repo, dann auf den VPS kopieren.

### Zusätzliche Server-Abhängigkeit: lua-resty-openssl

`webhook_mnemonic.lua` benötigt `lua-resty-openssl` für PBKDF2 + HMAC-SHA256.
Installation via OPM (OpenResty Package Manager):

```bash
opm get fffonion/lua-resty-openssl
# Installiert nach /usr/local/openresty/site/ — automatisch im Lua-Pfad
```

Prüfen ob installiert:

```bash
ls /usr/local/openresty/site/lualib/resty/openssl/kdf.lua
```
