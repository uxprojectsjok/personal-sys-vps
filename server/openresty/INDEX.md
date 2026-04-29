# OpenResty / Lua – Inhaltsverzeichnis

Alle Dateien dieses Verzeichnisses sind die **Quell-Kopie** der Live-Lua-Scripts unter `/etc/openresty/lua/` auf dem VPS.
Änderungen müssen nach `/etc/openresty/lua/` kopiert und mit `openresty -s reload` aktiviert werden.

---

## Authentifizierung

| Datei | Endpunkt | Beschreibung |
|---|---|---|
| `hmac_helper.lua` | — | Geteilter HMAC-SHA256 Helper, genutzt von soul_auth + vault_auth |
| `soul_auth.lua` | `access_by_lua` | Prüft `Bearer {soul_id}.{cert}` für Chat- und Validate-Endpunkte |
| `vault_auth.lua` | `access_by_lua` | Auth-Gate für alle `/api/soul`, `/api/vault/*`, `/api/webhook/*` Endpunkte — akzeptiert soul-cert und service-token |
| `soul_cert.lua` | `POST /api/soul-cert` | Stellt einen HMAC-signierten soul_cert aus (kein Auth erforderlich) |
| `soul_token_jwt.lua` | `POST /api/soul/v1/token` | Tauscht soul_cert gegen JWT (HS256, 30 Tage, signiert mit API_SIGNING_KEY) |

---

## Soul

| Datei | Endpunkt | Beschreibung |
|---|---|---|
| `api_serve.lua` | `GET /api/soul`, `GET /api/vault/manifest`, `GET /api/vault/audio` u.a. | Liefert sys.md (ggf. entschlüsselt) und Vault-Manifest |
| `api_context.lua` | `GET/PUT /api/context` | Liest und schreibt api_context.json (Berechtigungen, Vault-Index, Soul-Inhalt) |
| `soul_sign_session.lua` | `POST /api/soul-sign-session` | Erstellt HMAC-Signatur für Blockchain-Session-Anchoring |

---

## Vault

| Datei | Endpunkt | Beschreibung |
|---|---|---|
| `vault_sync.lua` | `POST /api/vault/sync` | Datei-Upload in den VPS-Vault (Base64, mit ClamAV-Scan, ffmpeg-Konvertierung, Quota-Check) |
| `vault_delete.lua` | `DELETE /api/vault` | Löscht den kompletten Soul-Ordner unwiderruflich |
| `vault_unlock.lua` | `POST /api/vault/unlock`, `POST /api/vault/lock`, `GET /api/vault/session` | Vault-Session verwalten (entsperren, sperren, Status) |
| `vault_services.lua` | `GET/POST/DELETE /api/vault/services` | Service-Tokens verwalten (für externe Dienste wie ElevenLabs, WhatsApp) |
| `vault_profile.lua` | `GET/PUT /api/vault/profile/{type}` | Liest und schreibt KI-Analyse-Profile (face, voice, motion, expertise) |
| `vault_profile_analyze.lua` | `POST /api/vault/profile/analyze` | Automatische Profil-Erstellung via Claude Vision (derzeit: face) |
| `vault_public.lua` | `GET/POST /api/vault/public/*` | Public-Vault-Endpunkte für geteilte Dateien (ohne Auth abrufbar) |

---

## Verbindungen & Netzwerk

| Datei | Endpunkt | Beschreibung |
|---|---|---|
| `soul_connections.lua` | `GET/POST /api/vault/connections` | Eigene Soul-Verbindungen verwalten + Netzwerk-Soul-Inhalte lesen |
| `vault_connections_peer.lua` | `GET /api/vault/connections/peer-files` | Dateien verbundener Souls abrufen |
| `external_vault.lua` | `GET /api/vault/external/soul` | Soul-Datei von externer URL laden (ArDrive, IPFS, S3, GitHub …) |
| `fetch_bundle.lua` | `POST /api/fetch-bundle` | `.soul`-Bundle von öffentlicher URL serverseitig holen (SSRF-geschützt) |

---

## Webhooks & externe Dienste

| Datei | Endpunkt | Beschreibung |
|---|---|---|
| `webhook.lua` | `POST /api/webhook`, `POST /api/webhook/{service}` | Universal Soul API für externe Dienste (auth via service-token) |
| `webhook_mnemonic.lua` | `POST /api/webhook/mnemonic` | Webhook-Auth via 12 BIP39-Wörter (Vault-Key-Ableitung per PBKDF2) |
| `tts.lua` | `POST /api/tts` | ElevenLabs TTS mit geklonter Soul-Stimme |

---

## Vision & KI-Generierung

| Datei | Endpunkt | Beschreibung |
|---|---|---|
| `vision_analyze.lua` | `POST /api/vision-analyze` | Kamerabild-Analyse via Claude Haiku Vision → Prompt für Bildgenerierung |
| `wavespeed_submit.lua` | `POST /api/wavespeed-submit` | Generierungsauftrag bei WaveSpeed AI einreichen (text-to-image, image-edit …) |
| `wavespeed_result.lua` | `GET /api/wavespeed-result?id=` | Status einer WaveSpeed-Task abfragen |

---

## Nginx-Konfiguration

| Datei | Beschreibung |
|---|---|
| `sys.uxprojects-jok.com.nginx` | Aktive vhost-Konfiguration (Live-Stand) |
| `vhost.conf.template` | Template für neue vhost-Setups |
| `vhost_backup` | Älterer vhost-Stand als Referenz |
| `old_vps_sys.uxprojects-jok.com` | Konfiguration der vorherigen VPS-Instanz |

---

## Sonstiges

| Datei | Beschreibung |
|---|---|
| `apparmor-openresty` | AppArmor-Profil für den OpenResty-Prozess |
| `security-setup.sh` | Einmalig ausgeführtes Setup-Script für Verzeichnisrechte und Systemhärtung |

---

*Zuletzt synchronisiert: 2026-04-11*
