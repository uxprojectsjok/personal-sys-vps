# Personal SYS VPS

**Dein Knoten im Internet. Als Mensch.**

Dieses Repository enthält alles, um einen eigenen, privaten SYS-Node auf einem VPS zu betreiben. Ein SYS-Node ist kein Dienst, den jemand für dich betreibt — er läuft auf deinem Server, unter deiner Domain, mit deinen Daten. Du bist Eigentümer, Betreiber und einziger Nutzer.

Der Node ist der Ort, an dem deine **sys.md** lebt: eine persönliche Identitätsdatei, die du in KI-Systeme einspeisen kannst. Sie wächst mit jeder Session, gehört ausschließlich dir und verlässt deinen Server nur, wenn du es aktiv entscheidest.

> **Dezentral, selbstgehostet, passwortgeschützt.**
> Kein Anbieter hat Zugriff. Keine Cloud-Abhängigkeit. Keine Nutzungsbedingungen, die sich ändern können.

---

## Was ist ein SYS-Node?

Ein SYS-Node ist dein persönlicher Knoten im Internet — ähnlich wie eine E-Mail-Adresse, aber für deine Identität als Mensch in einer Welt mit KI.

```
Du  →  sys.md (deine Identitätsdatei)
     →  SYS-Node (dein VPS, deine Domain)
     →  KI-Systeme (Claude, MCP-Tools, WhatsApp-Bot, ...)
     →  andere SYS-Nodes (Peer-to-Peer, verschlüsselt)
```

Der Node akzeptiert genau eine Soul. Wer sich zuerst registriert, ist der Eigentümer — für immer, bis zum bewussten Reset.

### Was der Node macht

- **Speichert** deine sys.md verschlüsselt (AES-256-CBC, Schlüssel nur im Browser)
- **Authentifiziert** dich via HMAC-SHA256 soul_cert — ohne Cookies, ohne OAuth
- **Leitet** deine KI-Anfragen weiter (Anthropic Claude, SSE-Streaming)
- **Verwaltet** deinen Vault — Bilder, Audio, Video, Kontext-Dateien
- **Vernetzt** dich mit anderen SYS-Nodes (Peer-to-Peer Soul-Verbindungen)
- **Schützt** den gesamten Zugang mit einem Gate-Passwort

### Was der Node nicht macht

- Kein Multi-User, keine Tenants, keine Rollen
- Keine Nutzungsanalyse, kein Tracking, kein Analytics
- Kein eigener Datenbankserver (Flat-File, kein PostgreSQL/Redis)
- Kein öffentlicher Zugang — das Gate schützt alles hinter einem Passwort

---

## Technischer Stack

**Frontend:** Nuxt 4, statisch gebaut (SSG), läuft vollständig im Browser — kein Node.js-Prozess auf dem Server.

**Backend:** OpenResty (nginx + LuaJIT) als API-Layer. Alle Endpunkte sind Lua-Skripte. Kein Webframework, keine Runtime-Dependencies außer OpenResty.

**Daten:** Flat-Files unter `/var/lib/sys/souls/{soul_id}/` — portierbar, inspizierbar, keine Migration nötig.

**Verschlüsselung:** AES-256-CBC im Browser (WebCrypto API). Der Server sieht nur verschlüsselte Bytes mit Magic-Header `SYSCRYPT01`. Der Schlüssel verlässt den Browser nie.

---

## Repository-Struktur

```
├── init.sh                  Setup-Script — zero to running in one command
├── reset.sh                 Soul löschen, Node freigeben (Daten weg, Config bleibt)
├── recover-password.sh      Gate-Passwort zurücksetzen ohne Soul-Verlust
├── deinstall.sh             Alles entfernen was init.sh installiert hat
│
├── app/                     Nuxt 4 Frontend (SSG, läuft vollständig im Browser)
│   ├── pages/               Routen: index, session, gate, api-docs, ...
│   ├── components/          UI-Komponenten (SoulNetworkPanel, Vault, Chat, ...)
│   └── composables/         Shared State: useSoul, useVault, useChainAnchor, ...
│
├── lua/                     OpenResty Lua-Scripts (Production API Layer)
│   ├── soul_cert.lua        Soul-Cert Ausstellung (HMAC-SHA256)
│   ├── soul_auth.lua        Request-Authentifizierung
│   ├── gate_auth.lua        Gate-Passwort Schutz
│   ├── peer_connect.lua     Cross-Domain Soul-Verbindungen
│   ├── vault_sync.lua       Vault-Dateien hochladen/synchronisieren
│   └── ...                  (40+ weitere Lua-Endpunkte)
│
├── server/
│   ├── api/                 Nitro API-Routes (Development-Server only)
│   └── openresty/           nginx.conf.template, vhost.conf.template
│
├── shared/
│   └── utils/               soulParser.js, soulMaturity.js — browserübergreifende Logik
│
├── soul-mcp/                MCP-Server (Node.js, OAuth 2.0 + PKCE)
│   └── tools/               soul_read, soul_write, vault_manifest, ...
│
├── browser-extension/       Chrome MV3 Extension
├── utils/
│   ├── killMetas.mjs        CSP-Meta-Tags aus dem Build entfernen
│   └── project-hash.mjs     SHA-256 Fingerprint aller Source-Dateien
└── docs/                    Protokoll-Dokumentation, API-Referenz, Specs
```

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

<!-- AGENT:START -->
<!-- AGENT:END -->
```

Der `<!-- AGENT:START -->` / `<!-- AGENT:END -->` Block ist die **Agent-Sandbox**: nur dieser Bereich wird über `/api/soul/paid-read` an externe Agenten (MCP, WhatsApp-Bot, etc.) ausgeliefert. Der Rest der sys.md verlässt den Server nie in Richtung Dritter.

Vollständige Spezifikation: [docs/spec/sys_md.md](docs/spec/sys_md.md)

---

## Authentifizierung

Alle geschützten Endpunkte verwenden HMAC-SHA256 soul_cert Tokens — zustandslos, ohne Datenbank:

```
cert   = HMAC-SHA256(SOUL_MASTER_KEY, soul_id + ":" + cert_version).hex()[:32]
bearer = soul_id + "." + soul_cert
```

---

## MCP-Integration

`soul-mcp/` implementiert das [Model Context Protocol](https://modelcontextprotocol.io) mit OAuth 2.0 + PKCE. Claude und andere MCP-kompatible KI-Clients können sich verbinden und mit granularen Berechtigungen auf sys.md und Vault-Dateien zugreifen.

Wichtige Tools: `soul_read`, `soul_write`, `vault_manifest`, `audio_list`, `network_list`

---

## Installation

Der Produktions-Stack verwendet OpenResty (nginx + LuaJIT) als API-Layer — kein Node.js in Production.

**Vollständige Anleitung:** [ONBOARDING.md](ONBOARDING.md)

> **Hinweis:** Du brauchst eine Domain mit A-Eintrag auf die IP deines Servers — ohne DNS-Eintrag schlägt die SSL-Zertifizierung fehl.

**Voraussetzungen:** Ubuntu 24.04 VPS (min. 2 GB RAM), Domain, Anthropic API Key

```bash
git clone https://github.com/uxprojectsjok/personal-sys-vps.git /opt/sys
cd /opt/sys && bash init.sh
```

Das Script fragt interaktiv nach Domain, E-Mail und Anthropic API Key — alles andere läuft automatisch. Am Ende: Root-Passwort mit `passwd` ändern.

### Soul verwalten

| Script | Was es tut |
|--------|-----------|
| `bash /opt/sys/recover-password.sh` | **Passwort vergessen** — setzt ein neues Gate-Passwort. Soul-Daten bleiben vollständig erhalten. Benötigt SSH-Zugang zum Server. |
| `bash /opt/sys/reset.sh` | **Soul entfernen** — löscht alle Soul-Daten, gibt den Node frei für eine neue Registrierung. OpenResty, SSL und alle Konfigurationen bleiben erhalten. |
| `bash /opt/sys/deinstall.sh` | **Komplett deinstallieren** — entfernt alles was `init.sh` installiert hat. Ubuntu bleibt unberührt. DNS-Eintrag danach manuell beim Provider löschen. |

> `recover-password.sh` ≠ `reset.sh` ≠ `deinstall.sh`
> Passwort vergessen: Soul bleibt. Reset: Mieter zieht aus. Deinstall: Haus wird abgerissen.

---

## Integrität

Verifiziere deinen Clone gegen den offiziellen Stand:

```bash
node utils/project-hash.mjs
```

Aktueller Release-Fingerprint: `f04b66ec1441cbb12ca8eab30e68de4ab04825adedd3fb880cc6a9eaf509d957`

Der Hash umfasst alle Source-Dateien (`.vue`, `.js`, `.lua`, `.sh`, `.json`, `.md`) — ohne `node_modules`, Build-Output, Secrets und Lock-Files.

---

## Protokoll-Netzwerk

SYS ist ein offenes Protokoll. Dieser Node ist eine Implementierung — weitere können unabhängig entstehen.

Geplante Protokoll-Knoten (offen für Beiträge):

| Knotentyp | Funktion |
|-----------|----------|
| **soul-discover** | Verzeichnisdienst — Nodes registrieren sich, Peers finden sich |
| **soul-relay** | Nachrichtenrelais zwischen Nodes |
| **soul-bridge** | Brücke zu anderen Identitätssystemen (DID, ActivityPub) |
| **soul-archive** | Langzeitspeicher für verschlüsselte Soul-Snapshots |

Das SYS-Protokoll ist Apache 2.0 lizenziert. Eigene Implementierungen, Knoten und Erweiterungen sind ausdrücklich erwünscht.

---

## On-Chain Anchoring

Souls können ihren Identitäts-Hash auf der Polygon-Blockchain verankern.

**Smart Contract:** `0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B` (Polygon Mainnet)

```
Soul-Identitätshash  →  anchor()  →  Polygon-Blockchain
                                  →  IPFS (Inhalt)
                                  →  soul_chain_anchor in sys.md
```

Das Anchoring ist freiwillig und nutzer-initiiert. Jeder Anker-Vorgang zahlt eine `anchorFee` direkt an den Smart Contract — on-chain, transparent, einsehbar auf [Polygonscan](https://polygonscan.com/address/0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B).

Wer einen eigenen SYS-Node betreibt, benötigt eine eigene WalletConnect Project ID (kostenlos: cloud.walletconnect.com). Die Contract-Adresse ist im Protokoll fest verankert — eine eigene Contract-Instanz würde die Cross-Node-Kompatibilität brechen.

---

## Rechtliches

Ich bin der Autor dieser Software, kein Betreiber.

Wer dieses Repository klont und `init.sh` ausführt, betreibt einen eigenen, vollständig unabhängigen Server — unter eigener Domain, auf eigener Hardware, mit eigenen Daten. Ich habe keinen Zugriff auf diese Server und keine Kenntnis über die dort gespeicherten Daten.

- Ich stelle keine Hosting-Infrastruktur, keine Konten und keine verwalteten Server bereit.
- Die Daten der Nutzerinnen und Nutzer liegen ausschließlich auf deren eigenen Servern.
- Der Anchoring-Contract läuft autonom auf der Polygon-Blockchain. On-Chain-Transaktionen liegen vollständig in der Verantwortung der auslösenden Person.

Die Nutzung dieser Software erfolgt auf eigene Verantwortung. Die Apache 2.0 Lizenz schließt Gewährleistung und Haftung aus.

---

## Status

- **Offenes Protokoll** — Apache 2.0, kompatible Implementierungen willkommen
- **Smart Contract** — live auf Polygon Mainnet, einsehbar auf Polygonscan

---

## Lizenz

Apache License 2.0 — siehe [LICENSE](LICENSE)

Copyright © 2026 Jan-Oliver Karo — [UX-Projects](https://uxprojects-jok.com), Marburg, Germany

„SaveYourSoul" und „SYS" sind Marken von Jan-Oliver Karo. Siehe [NOTICE](NOTICE) für Marken- und Attributionsanforderungen.
