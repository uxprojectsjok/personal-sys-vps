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
- Kein öffentlicher Zugang — der Gate schützt alles hinter einem Passwort

---

## Technischer Stack

**Frontend:** Nuxt 4, statisch gebaut (SSG), läuft vollständig im Browser — kein Node.js-Prozess auf dem Server.

**Backend:** OpenResty (nginx + LuaJIT) als API-Layer. Alle Endpunkte sind Lua-Skripte. Kein Webframework, keine Runtime-Dependencies außer OpenResty.

**Daten:** Flat-Files unter `/var/lib/sys/souls/{soul_id}/` — portierbar, inspizierbar, keine Migration nötig.

**Verschlüsselung:** AES-256-CBC im Browser (WebCrypto API). Der Server sieht nur verschlüsselte Bytes mit Magic-Header `SYSCRYPT01`. Der Schlüssel verlässt den Browser nie.

---

## Repository Structure

```
├── ARCHITECTURE.md          Protocol specification & reference implementation docs
├── app/                     Nuxt 4 frontend (SSG, pure client-side)
├── server/
│   ├── api/                 Nitro API routes (development only)
│   └── openresty/           Lua scripts for OpenResty (production API layer)
├── shared/
│   └── utils/               soulParser.js, soulMaturity.js — core protocol logic
├── soul-mcp/                MCP server (Node.js, OAuth 2.0 + PKCE)
├── browser-extension/       Chrome MV3 extension
├── docs/
│   ├── overview.md          Protocol overview & design principles
│   ├── quickstart.md        Getting started guide
│   ├── spec/                Protocol specifications (soul-md, auth, mcp-tools)
│   ├── api/                 API reference & examples
│   └── architecture/        OpenResty, vault, encryption internals
└── test/                    sys.md test fixtures
```

---

## sys.md Format

```markdown
---
soul_id: 00000000-0000-0000-0000-0000000000000
soul_name: ""
created: YYYY-MM-DD
last_session: YYYY-MM-DD
version: 1
soul_cert: [automatically generated]
vault_hash: ""
soul_growth_chain: []
soul_chain_anchor: null
storage_tx: ""
---

## Core Identity

_Who is this person in one sentence?_

## Values & Beliefs

_What motivates them? What do they believe in?_

## Aesthetics & Resonance

_Music, atmospheres, visual stimuli that attract this person._

## Speech Patterns & Expression

_How do they speak? How do they write?_

## Recurring Themes & Obsessions

_What keeps coming back?_

## Emotional Signature

_What is it like to talk to this person?_

## Worldview

_How do they see the world?_

## Unanswered Questions

_What are they still looking for?_

## Session Log (compressed)

...

## Calendar

...
```

Full specification: [docs/spec/sys_md.md](docs/spec/sys_md.md)

---

## Authentication

All protected endpoints use HMAC-SHA256 soul_cert tokens — stateless, no database:

```
cert   = HMAC-SHA256(SOUL_MASTER_KEY, soul_id).hex()[:32]
bearer = soul_id + "." + soul_cert
```

---

## MCP Integration

`soul-mcp/` implements the [Model Context Protocol](https://modelcontextprotocol.io) with OAuth 2.0 + PKCE. Claude, or any MCP-compatible AI client, can connect and access sys.md and vault files with granular permissions.

Key tools: `soul_read`, `soul_write`, `vault_manifest`, `audio_list`, `network_list`

---

## Self-Hosting

The production stack uses OpenResty (nginx + LuaJIT) as the API layer — no Node.js in production.

**Vollständige Anleitung:** [ONBOARDING.md](ONBOARDING.md)

### Kurzübersicht

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

## Integrity

Verify your clone matches the official release:

```bash
node utils/project-hash.mjs
```

Current release fingerprint: `cce19155c2104bb5d0e11b946e82bc54c22addff96f95e8351a199b58993f9fe`

The hash covers all source files (`.vue`, `.js`, `.lua`, `.sh`, `.json`, `.md`) — excluding `node_modules`, build output, secrets, and lock files. Run it after cloning to confirm the code is unmodified.

---

## Protocol Network

SYS ist ein offenes Protokoll. Dieser Node ist eine Implementierung — weitere können unabhängig davon entstehen.

Geplante Protokoll-Knoten (offen für Beiträge):

| Knotentyp | Funktion |
|-----------|----------|
| **soul-discover** | Zentraler Verzeichnisdienst — Nodes registrieren sich, Peers finden sich |
| **soul-relay** | Anonymisierter Nachrichtenrelais zwischen Nodes |
| **soul-bridge** | Protokoll-Brücke zu anderen Identitätssystemen (DID, ActivityPub) |
| **soul-archive** | Langzeitspeicher für verschlüsselte Soul-Snapshots |

Wer einen Protokoll-Knoten betreiben möchte, kann das unabhängig tun. Das SYS-Protokoll ist Apache 2.0 lizenziert. Eigene Implementierungen, Knoten und Erweiterungen sind ausdrücklich erwünscht.

---

## On-Chain Anchoring

Alle Souls können ihren Identitäts-Hash auf der Polygon-Blockchain verankern. Dies macht die Identität unveränderlich nachweisbar und unabhängig vom Server.

**Smart Contract:** `0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B` (Polygon Mainnet)

```
Soul-Identitätshash  →  anchor()  →  Polygon-Blockchain
                                  →  IPFS (Inhalt)
                                  →  soul_chain_anchor in sys.md (Nachweis)
```

Das Anchoring ist freiwillig und nutzer-initiiert. Jeder Anker-Vorgang zahlt eine geringe Gebühr (`anchorFee`) direkt an den Smart Contract — on-chain, transparent, unveränderlich einsehbar auf [Polygonscan](https://polygonscan.com/address/0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B).

**Für Node-Betreiber:** Der Contract-Code ist öffentlich. Wer einen eigenen SYS-Node betreibt, nutzt automatisch diesen Contract — die Adresse ist im Protokoll fest verankert. Eine eigene Contract-Instanz ist nicht notwendig und würde die Cross-Node-Kompatibilität brechen.

---

## Haftung & rechtliche Einordnung

**Jan-Oliver Karo ist Protokoll-Entwickler, nicht Betreiber.**

Jede Person, die dieses Repository klont und `init.sh` ausführt, betreibt ihren eigenen, vollständig unabhängigen Server — unter ihrer eigenen Domain, auf ihrer eigenen Hardware, mit ihren eigenen Daten. Jan-Oliver Karo hat keinen Zugriff auf diese Server, keine Kenntnis über die gespeicherten Daten und keine Möglichkeit, darauf einzuwirken.

Dies entspricht der Rolle eines Software-Autors, nicht eines Diensteanbieters:

- **Kein Dienst:** Jan-Oliver Karo stellt keine Hosting-Infrastruktur, keine Konten und keine verwalteten Server bereit.
- **Keine Datenhaltung:** Die Daten der Nutzerinnen und Nutzer liegen ausschließlich auf deren eigenen Servern. Jan-Oliver Karo hat keinen Zugriff darauf.
- **Kein Betreiber:** Jede Node-Betreiberin und jeder Node-Betreiber ist im Sinne des TTDSG, der DSGVO und des TMG selbst Verantwortlicher für ihren respektive seinen Knoten.
- **Autonomer Smart Contract:** Der Anchoring-Contract läuft autonom auf der Polygon-Blockchain. Jan-Oliver Karo ist der Ersteller (Deployer) des Contracts, kein laufender Betreiber. On-Chain-Transaktionen sind unwiderruflich und liegen vollständig in der Verantwortung der auslösenden Nutzerin bzw. des auslösenden Nutzers.

Die Nutzung dieser Software erfolgt auf eigene Verantwortung. Die Apache 2.0 Lizenz schließt jede Haftung ausdrücklich aus.

> Für eigene Implementierungen, Fork-Projekte und abgeleitete Protokoll-Knoten gilt das gleiche Prinzip: Wer betreibt, haftet. Wer nur Code schreibt und veröffentlicht, nicht.

---

## Status

- **Open protocol** — Apache 2.0, compatible implementations welcome
- **Reference implementation** — experimental, betrieben von der Community
- **Smart contract** — live auf Polygon Mainnet, auditierbar auf Polygonscan

---

## Disclaimer

This software is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement. In no event shall the authors or copyright holders be liable for any claim, damages or other liability, whether in an action of contract, tort or otherwise, arising from, out of or in connection with the software or the use or other dealings in the software.

The author (Jan-Oliver Karo) is the developer of this protocol and software. He is not the operator of any node, server, or service built with this software. Each self-hosted node is operated independently by its respective owner. The author has no access to any data stored on self-hosted nodes.

On-chain transactions via the anchoring smart contract are irreversible and executed solely by the user's own wallet. The contract operates autonomously on the Polygon blockchain. The author's role is that of the contract deployer, not an ongoing operator.

---

## License

Apache License 2.0 — see [LICENSE](LICENSE)

Copyright © 2026 Jan-Oliver Karo — [UX-Projects](https://uxprojects-jok.com), Marburg, Germany

"SaveYourSoul" and "SYS" are trademarks of Jan-Oliver Karo. See [NOTICE](NOTICE) for trademark and attribution requirements.
