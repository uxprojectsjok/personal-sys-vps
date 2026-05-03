# Eigenen SYS-Node betreiben

Jeder Node läuft auf einem eigenen Server — unter eigener Domain, mit eigenen Daten.

---

## Voraussetzungen

| Was | Wo |
|-----|----|
| VPS (min. 2 GB RAM, Ubuntu 24.04) | Hetzner, Ionos, Contabo, DigitalOcean, … |
| Domain (z.B. soul.deinname.de) | Namecheap, Porkbun, Cloudflare, … |
| Anthropic API Key | console.anthropic.com |

---

## Schritt 1 — VPS einrichten

1. VPS mit **Ubuntu 24.04 LTS** bestellen
2. Öffentliche IP-Adresse notieren

---

## Schritt 2 — Domain auf den Server zeigen

Beim Domain-Registrar einen **A-Eintrag** anlegen:

```
Typ:   A
Name:  soul  (oder @ für Hauptdomain)
Wert:  <deine Server-IP>
TTL:   3600
```

DNS-Propagation dauert 5–30 Minuten.

---

## Schritt 3 — Setup starten

Per SSH einloggen und das Init-Script ausführen:

```bash
git clone https://github.com/uxprojectsjok/personal-sys-vps.git /opt/sys
cd /opt/sys && bash init.sh
```

Das Script fragt nach Domain, E-Mail und Anthropic API Key — alles andere läuft automatisch.
Am Ende: Root-Passwort mit `passwd` ändern.

Vollständige Anleitung: [ONBOARDING.md](../ONBOARDING.md)

---

## Architektur

```
deine-domain.de
    └── dein VPS
            ├── OpenResty (nginx + Lua) — API Layer
            ├── Soul-Daten  /var/lib/sys/souls/{soul_id}/
            └── Static SPA  /var/www/deine-domain.de/
```

---

## Blockchain-Anchoring (optional)

Soul-Identitäts-Hash auf Polygon verankern:

- Soul-Dashboard → Blockchain-Bereich
- Transaktion mit eigenem Wallet signieren (POL für Gas)
- Anker ist dauerhaft on-chain nachweisbar

Erfordert eine eigene WalletConnect Project ID (kostenlos: cloud.walletconnect.com).

---

## Kostenübersicht

| Posten | Kosten |
|--------|--------|
| VPS (Hetzner CX22) | ~4–6 €/Monat |
| Domain | ~10 €/Jahr |
| SSL (Let's Encrypt) | kostenlos |
| Blockchain-Anchor | Gas in POL (einmalig) |
