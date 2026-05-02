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

Alles andere erledigt das Script automatisch:

- OpenResty installieren & konfigurieren
- SSL-Zertifikat beantragen
- Swap einrichten
- Frontend bauen & deployen
- MCP-Server einrichten

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
