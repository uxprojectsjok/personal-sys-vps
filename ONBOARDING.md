# VPS Onboarding — Personal SYS Node

## Voraussetzungen

- VPS mit Ubuntu 24.04 — ohne Plesk oder andere vorinstallierte Panels
- Mindestens 2 GB RAM
- Eine eigene Domain (z.B. bei Ionos)
- Ein Anthropic API Key ([console.anthropic.com → API Keys](https://console.anthropic.com/))

---

## Schritt 1 — Domain vorbereiten

Geh in dein DNS-Panel und lege einen A-Eintrag an:

| Typ | Hostname | Zeigt auf |
|-----|----------|-----------|
| A   | `soul` (oder dein Wunschname) | IP deines Servers |

> Der Eintrag kann 5–30 Minuten brauchen bis er aktiv ist.

---

## Schritt 2 — Mit dem Server verbinden

**Windows:** Öffne `cmd` (Windows + R → `cmd`)

```
ssh root@DEINE-IP
```

Beim ersten Verbinden `yes` bestätigen. Passwort aus der Ionos-Bestätigungsmail eingeben.

---

## Schritt 3 — OpenResty-Paketquelle einrichten

```bash
curl -fsSL https://openresty.org/package/pubkey.gpg | apt-key add -
echo "deb http://openresty.org/package/ubuntu noble main" > /etc/apt/sources.list.d/openresty.list
apt update
```

---

## Schritt 4 — Repository laden

```bash
git clone https://github.com/uxprojectsjok/personal-sys-vps.git /opt/sys
```

---

## Schritt 5 — Setup starten

```bash
cd /opt/sys && bash init.sh
```

Das Script fragt dich nach:

- Deiner Domain → z.B. `soul.meinname.de`
- Deiner E-Mail → für das SSL-Zertifikat
- Deinem Anthropic API Key → beginnt mit `sk-ant-...`
- Einem WalletConnect Project ID → optional, für Blockchain-Anchoring
- Einem Gate-Passwort → schützt die gesamte Oberfläche *(Eingabe wird nicht angezeigt — das ist normal)*

Alles andere erledigt das Script automatisch:

- OpenResty installieren & konfigurieren
- SSL-Zertifikat beantragen (Let's Encrypt) — vorhandene Certs werden wiederverwendet
- Swap einrichten (2 GB, nötig für den Frontend-Build)
- Frontend bauen & deployen
- Umgebungsvariablen für OpenResty einrichten

---

## Schritt 6 — Server absichern

Nach erfolgreicher Installation:

```bash
passwd
```

Vergib ein neues, sicheres Root-Passwort.

---

## Fertig

Öffne `https://DEINE-DOMAIN` im Browser — dein Soul Node ist bereit.

> Dieser Node akzeptiert genau eine Soul. Die erste Person die sich registriert ist der Eigentümer.

---

## Was du mit deinem Node machen kannst

**Identität**
- sys.md anlegen und pflegen — deine persönliche KI-Identitätsdatei
- Soul-Cert generieren für zustandslose Authentifizierung ohne Passwort-Wiederholung
- Gate-Passwort schützt die gesamte Oberfläche vor fremdem Zugriff

**KI**
- Chat mit Claude direkt auf deinem Node (Anthropic API, dein Key, deine Kosten)
- Claude liest deine sys.md als Kontext — Sessions bauen aufeinander auf
- Vision: Kamerabild hochladen → Claude analysiert und beschreibt
- Text-to-Speech via ElevenLabs (eigene Stimme optional klonbar)
- KI-Bildgenerierung via WaveSpeed AI
- Soul-Update: Claude schreibt strukturiert in deine sys.md-Abschnitte

**Vault**
- Lokaler Vault: Dateien bleiben auf deinem Gerät (File System Access API)
- Server-Vault: Bilder, Audio, Video, Kontext-Dateien auf deinem VPS speichern
- Verschlüsselung optional (AES-256-CBC, Schlüssel bleibt im Browser)

**Vernetzung**
- Soul-Verbindungen: andere SYS-Nodes als Peers verbinden
- MCP-Server: Claude Desktop und andere KI-Clients verbinden sich per OAuth 2.0
- WhatsApp-Bot mit deinem Soul als Kontext (Twilio Serverless, optional)
- Browser Extension für automatische Authentifizierung (Chrome MV3)

**Wachstum**
- Growth Chain: jede Session kryptografisch signiert und verkettet
- Blockchain-Anchoring auf Polygon (optional, nutzer-initiiert, eigenes Wallet)

---

## Passwort vergessen

Wenn du dein Gate-Passwort vergessen hast, kannst du es per SSH zurücksetzen — ohne die Soul zu verlieren:

```bash
bash /opt/sys/recover-password.sh
```

Das Script erkennt die Domain automatisch, liest den Master Key aus der Konfiguration und setzt einen neuen Passwort-Hash. Soul, Vault und SSL bleiben vollständig erhalten. Anschließend wird OpenResty neu gestartet, damit der alte Session-Cache geleert wird.

> Voraussetzung: SSH-Zugang zum Server als root. Wer keinen SSH-Zugang mehr hat, muss über die VPS-Konsole des Providers (z.B. Ionos KVM-Konsole) einsteigen.

---

## Soul zurücksetzen

Um die Soul-Daten zu löschen ohne den Server zu deinstallieren:

```bash
bash /opt/sys/reset.sh
```

Entfernt alle Soul-Daten und setzt den Node zurück auf "bereit für erste Registrierung". OpenResty, SSL und alle Konfigurationen bleiben erhalten.

---

## Deinstallation

```bash
bash /opt/sys/deinstall.sh
```

Entfernt alle SYS-Komponenten. Ubuntu bleibt unberührt. DNS-Eintrag muss manuell beim Provider gelöscht werden.
