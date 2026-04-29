# soul-voice-clone

Klont die Stimme einer Soul als ElevenLabs Voice Clone, erstellt einen Conversational AI Agent und verbindet optional eine WhatsApp-Nummer.

## Voraussetzungen

- Node.js ≥ 18
- `ffmpeg` installiert (`winget install ffmpeg`)
- ElevenLabs Account mit API Key
- SYS App geöffnet, Soul eingeloggt, Vault entsperrt
- Service-Token aus SYS App → Verbundene Dienste → Neuer Dienst

## Setup

```bash
cd soul-voice-clone
npm install
```

`.env` anlegen (liegt bereits vor, nur Token aktualisieren):

```env
ELEVENLABS_API_KEY=sk_...
SOUL_SERVICE_TOKEN=<Token aus SYS App → Verbundene Dienste>
SOUL_WEBHOOK_URL=https://YOUR_DOMAIN/api/webhook/elevenlabs
SOUL_API_URL=https://YOUR_DOMAIN/api/soul
```

## Deploy – Schritt für Schritt

### 1. Voice Clone + Agent erstellen

```bash
node clone-voice.mjs
```

Läuft durch:
1. Holt Audio-Datei aus dem Soul Vault via Webhook
2. Konvertiert lokal zu MP3 mit Noise Reduction (ffmpeg)
3. Erstellt Voice Clone bei ElevenLabs
4. Erstellt Conversational AI Agent mit `soul_tool` Webhook
5. Speichert `voice_id.json` und `agent_id.json`

Voraussetzung: Vault muss entsperrt sein (Service-Token benötigt offene Session).

### 2. Agent testen

```
https://elevenlabs.io/app/conversational-ai/<agent_id>
```

### 3. WhatsApp verbinden (Meta Business)

```bash
node whatsapp-connect.mjs
```

Benötigt zusätzlich in `.env`:
```env
META_PHONE_NUMBER_ID=...
META_WHATSAPP_BUSINESS_ACCOUNT_ID=...
META_PERMANENT_TOKEN=...
```

Verbindet die Meta WhatsApp-Nummer mit dem ElevenLabs Agent aus `agent_id.json`.

### 4. Lokal testen (Twilio Sandbox)

```bash
node whatsapp-soul.mjs
```

Startet lokalen Express-Server auf Port 3099. Twilio Sandbox leitet Nachrichten weiter.

## Dateien

| Datei | Beschreibung |
|-------|-------------|
| `clone-voice.mjs` | Voice Clone + Agent erstellen |
| `whatsapp-connect.mjs` | Meta WhatsApp-Nummer mit Agent verbinden |
| `whatsapp-soul.mjs` | Lokaler WhatsApp-Server (Twilio Sandbox) |
| `voice_id.json` | Gespeicherte ElevenLabs Voice ID |
| `agent_id.json` | Gespeicherte ElevenLabs Agent ID |
| `.env` | API Keys und Tokens (nicht committen) |

## Fehlerdiagnose

| Fehler | Ursache | Lösung |
|--------|---------|--------|
| `vault_locked` | Vault nicht entsperrt | SYS App öffnen → Vault entsperren |
| `401` vom Webhook | Token ungültig/abgelaufen | SYS App → Verbundene Dienste → Token erneuern |
| `404` No API context | API-Kontext nicht aktiviert | SYS App → Soul einrichten → API → aktivieren |
| `500` vom Webhook | Lua-Fehler auf VPS | `webhook.lua` neu deployen |
| ffmpeg nicht gefunden | ffmpeg nicht installiert | `winget install ffmpeg` |
