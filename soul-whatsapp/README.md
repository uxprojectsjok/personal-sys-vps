# soul-whatsapp

Twilio Serverless Function – WhatsApp-Chatbot der als die Soul antwortet.
Unterstützt Text, Bilder (Vision), PDFs und sendet proaktiv Vault-Dateien (Stimme, Foto, Dokumente).

## Voraussetzungen

- [Twilio CLI](https://www.twilio.com/docs/twilio-cli/getting-started/install) installiert und eingeloggt
- Twilio Account mit WhatsApp Sandbox oder verifizierter Nummer
- SYS App: Service-Token mit Berechtigungen `Soul`, `Audio`, `Bilder`, `Kontext`
- Anthropic API Key

## Setup

```bash
cd soul-whatsapp
npm install
```

`.env` prüfen / aktualisieren:

```env
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_WEBHOOK=https://soul-whatsapp-4019-dev.twil.io/whatsapp

SOUL_API_URL=https://YOUR_DOMAIN/api/soul
SOUL_WEBHOOK_URL=https://YOUR_DOMAIN/api/webhook/elevenlabs
SOUL_SERVICE_TOKEN=<Token aus SYS App → Verbundene Dienste>

ANTHROPIC_API_KEY=sk-ant-...
```

## Deploy

```bash
twilio serverless:deploy --override-existing-project
```

Nach dem Deploy:
```
functions
  public /whatsapp  https://soul-whatsapp-4019-dev.twil.io/whatsapp
```

Diese URL in der Twilio Console als Webhook eintragen:
**Twilio Console → Messaging → Senders → WhatsApp → Sandbox-Einstellungen → When a message comes in**

## Token aktualisieren (ohne neu deployen)

Nur env var ändern und re-deployen:

```bash
# .env → SOUL_SERVICE_TOKEN aktualisieren, dann:
twilio serverless:deploy --override-existing-project
```

## Funktionsweise

1. WhatsApp-Nachricht kommt bei Twilio an
2. Twilio ruft `/whatsapp` Function auf
3. Function lädt Soul-Kontext via `SOUL_API_URL?token=...`
4. Claude beantwortet als Soul (Haiku für Text, Sonnet bei Bild/PDF)
5. Claude entscheidet ob `[SEND:audio]`, `[SEND:image]` oder `[SEND:context]` gesendet wird
6. Vault-Datei wird direkt über Twilio als Media-URL geschickt

## Vault muss entsperrt sein

Der Service-Token benötigt eine offene Vault-Session auf dem VPS.
Vault sperren = alle Service-Token bekommen `403 vault_locked`.

## Fehlerdiagnose

| Fehler | Ursache | Lösung |
|--------|---------|--------|
| `vault_locked` | Vault gesperrt | SYS App öffnen, Vault entsperren |
| `Soul API 401` | Token ungültig | Neuen Token in SYS App erstellen, `.env` + re-deploy |
| `Soul API 403` | Vault locked / Permissions fehlen | Vault entsperren oder Token-Berechtigungen prüfen |
| Keine Antwort | Function crashed | Twilio Console → Functions → Logs prüfen |

## Deployed auf

`soul-whatsapp-4019-dev.twil.io` · Service SID: `ZS44323347cd283636824b13a5f3f11fe8`
