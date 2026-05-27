# Zapier Integration

Die Zapier-Integration besteht aus zwei unabhängigen Teilen:

| Teil | Richtung | Was es tut |
|------|----------|-----------|
| **Inbound Webhook** | Zapier → SYS | Zapier schreibt Ereignisse (Gmail, Kalender, …) in deine Soul |
| **MCP-Verbindung** | SYS → Zapier | Deine KI ruft Zapier-Tools auf (E-Mails senden, Docs erstellen, …) |

Beide Teile sind optional und unabhängig voneinander.

---

## Teil 1 — Inbound Webhook

### Wie es funktioniert

Zapier sendet einen POST-Request an deinen Node, wenn ein Trigger auslöst (neue E-Mail, Kalendertermin, Slack-Nachricht, …). Der Node schreibt den Inhalt strukturiert in deine `sys.md` — entweder in den **Agent Sandbox** (für die KI) oder die **Social Sphere** (für Peers sichtbar).

Schutz: Max. 50 Einträge pro Block — älteste werden beim Schreiben automatisch gelöscht.

### Webhook-URL finden

1. Node öffnen → **Einstellungen → API**
2. Im Zapier-Bereich: Webhook-URL kopieren

Format: `https://deine-domain.de/api/zapier?token=DEIN_TOKEN`

Das Token steht in `api_context.json` auf dem Server (`webhook_token`). Es wird beim ersten API-Setup automatisch generiert.

### Zap einrichten

**Schritt 1 — Trigger wählen**

Beispiele:
- Gmail → „New Email" (jede neue E-Mail)
- Google Calendar → „Event Start" (Termin beginnt)
- Slack → „New Message in Channel"
- Beliebiger anderer Trigger

**Schritt 2 — Action: Webhooks by Zapier → POST**

| Feld | Wert |
|------|------|
| URL | deine Webhook-URL aus den Einstellungen |
| Payload Type | `JSON` |

**Schritt 3 — Body-Felder befüllen**

```json
{
  "source":  "gmail",
  "action":  "write",
  "message": "{{Body Plain}}",
  "subject": "{{Subject}}",
  "from":    "{{From Email}}"
}
```

### Felder im Überblick

| Feld | Pflicht | Werte | Beschreibung |
|------|---------|-------|-------------|
| `source` | nein | `gmail`, `calendar`, beliebig | Bestimmt das Anzeigeformat |
| `action` | nein | `write`, `notify`, `read` | Wohin geschrieben wird |
| `message` | nein | freier Text | Hauptinhalt |
| `subject` | nein | Text | Betreff / Terminname |
| `from` | nein | E-Mail oder Name | Absender |
| `reply_to` | nein | Message-ID o.ä. | Reply-Kontext |

### Actions erklärt

| Action | Ziel in sys.md | Wer sieht es |
|--------|---------------|-------------|
| `write` (Standard) | `<!-- AGENT:START/END -->` | KI liest es in der nächsten Session |
| `notify` | `<!-- SOCIAL:START/END -->` | KI + Peers |
| `read` | — | Gibt `soul_name` + Core-Identity-Snippet zurück |

Wenn kein `action` angegeben wird: `write` wenn `message` vorhanden, sonst `read`.

### Formatierung je nach Source

Der Node formatiert die Nachricht automatisch passend:

**Gmail:**
```
Von: absender@mail.de | Betreff: Betreff der Mail | Inhalt der Nachricht
```

**Calendar:**
```
Termin: Meeting mit Alice | Von: kalender@domain.de | Beschreibung
```

**Generisch:**
```
Betreff — Inhalt (von Absender)
```

### Verbindung testen

In den Einstellungen → API → Zapier-Bereich gibt es einen **„Webhook testen"**-Button. Er sendet `{ "action": "read" }` und zeigt deinen `soul_name` wenn alles funktioniert.

Alternativ in Zapier selbst: „Test Action" im Webhook-Schritt — der Node antwortet mit:
```json
{
  "ok": true,
  "soul_name": "Dein Name",
  "action": "read",
  "message_written": false
}
```

---

## Teil 2 — MCP-Verbindung

### Wie es funktioniert

Zapier stellt einen eigenen MCP-Server bereit. Dein Node verbindet sich damit — die KI im Chat kann dann Zapier-Actions direkt aufrufen: E-Mails senden, Google-Docs erstellen, Slack-Nachrichten schicken, …

### Zapier MCP einrichten

1. **Zapier öffnen** → [zapier.com/mcp](https://zapier.com/mcp)
2. **Actions konfigurieren** — welche Tools die KI nutzen darf, z.B.:
   - Gmail: Send Email
   - Gmail: Find Email
   - Google Docs: Create Document from Text
   - Google Calendar: Create Event
3. **MCP-URL kopieren** — Format: `https://mcp.zapier.com/api/mcp/s/DEINE_ID/mcp`

### MCP-URL im Node hinterlegen

1. Node öffnen → **Einstellungen → API**
2. Feld „Zapier MCP URL" → URL einfügen → Speichern

Die KI hat die Tools ab der nächsten Chat-Session verfügbar.

### KI im Chat nutzen

Die KI sieht alle konfigurierten Zapier-Tools automatisch in ihrem Tool-Manifest. Du kannst sie direkt ansprechen:

> „Schick eine E-Mail an alice@example.com: Betreff: Hallo, Inhalt: …"
> „Erstell ein Google Doc mit dem Titel ‚Meeting-Protokoll' und folgendem Inhalt: …"
> „Was steht morgen in meinem Kalender?"

### Welche Tools verfügbar sind

Die KI ruft `/api/mcp-tools` auf — das gibt die aktuelle Tool-Liste von Zapier zurück. Wenn du in Zapier neue Actions hinzufügst oder entfernst, sind sie sofort wirksam ohne Node-Neustart.

---

## Sicherheit

- **webhook_token** schützt den Inbound-Webhook — nur Anfragen mit dem richtigen Token werden akzeptiert
- Ein gestohlenes `webhook_token` gibt **keinen Zugriff auf private Soul-Bereiche** — nur Agent Sandbox und Social Sphere können beschrieben werden
- Rolling-Cap (50 Einträge) verhindert Flooding auch bei einem geleakten Token
- Rotation: Einstellungen → API-Kontext → Webhook-Token-Feld → neuen Wert eintragen → alle Zaps mit neuer URL aktualisieren

Für vollständige Key-Management-Details: [KEYMANAGEMENT.md](../KEYMANAGEMENT.md)

---

## Häufige Probleme

| Problem | Ursache | Lösung |
|---------|---------|--------|
| Webhook antwortet mit 403 | API nicht aktiviert | Einstellungen → API → API aktivieren |
| Webhook antwortet mit 401 | Falsches Token in URL | Webhook-URL neu kopieren |
| `message_written: false` | Soul-Datei leer oder verschlüsselt | Soul im Browser öffnen und einmal speichern |
| MCP-Tools leer | MCP-URL nicht gesetzt | Einstellungen → API → MCP-URL eintragen |
| KI findet Tools nicht | Falsche MCP-URL | Zapier MCP-Seite → URL neu kopieren |
