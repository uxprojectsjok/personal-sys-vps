# browser-extension

Chrome-Erweiterung (Manifest V3) – Soul als Companion im Browser.
Chat mit der Soul, Voice Agent starten, aktuelle Seite als Kontext übergeben.

## Features

- Chat mit der Soul via SSE-Streaming (Claude API)
- Voice-Tab: ElevenLabs Conversational AI Agent im Browser-Tab starten
- Seiten-Kontext: Aktueller Tab-Inhalt als Kontext für die Soul
- Soul-Login: Soul-Cert direkt vom SYS-Tab übernehmen
- Datei-Attach: Textdateien in den Chat anhängen
- Detach: Popup als eigenes Fenster öffnen

## Voraussetzungen

- Google Chrome (oder Chromium-basierter Browser)
- SYS App unter `https://sys.uxprojects-jok.com` im selben Browser geöffnet

## Deploy / Installation

### Als unpacked Extension laden (Entwicklung)

1. Chrome öffnen → `chrome://extensions`
2. **Entwicklermodus** einschalten (oben rechts)
3. **Entpackte Erweiterung laden** klicken
4. Ordner `browser-extension/` auswählen

Die Erweiterung erscheint in der Toolbar.

### ElevenLabs Agent-URL konfigurieren

`elevenlabs.config.json` bearbeiten:

```json
{
  "agent_url": "https://elevenlabs.io/app/talk-to?agent_id=<DEINE_AGENT_ID>"
}
```

Agent ID aus `soul-voice-clone/agent_id.json` entnehmen.

Nach jeder Änderung an dieser Datei: Chrome Extensions → Erweiterung neu laden (⟳).

### Update deployen

Nach Code-Änderungen:
1. `chrome://extensions` öffnen
2. Bei der Erweiterung auf ⟳ (Neu laden) klicken

## Verbindung herstellen

1. SYS App öffnen und einloggen (`https://sys.uxprojects-jok.com`)
2. Erweiterungs-Icon klicken → Tab **⚙**
3. **Mit SYS verbinden** klicken
4. Soul-Cert wird automatisch aus dem SYS-Tab gelesen

Das Cert wird in `chrome.storage.local` gespeichert und bleibt über Browser-Neustarts erhalten.

## Struktur

```
browser-extension/
  manifest.json           MV3 Manifest
  background.js           Service Worker (Soul-Cache)
  content.js              Content Script (Seiten-Info + Soul-Login)
  elevenlabs.config.json  Agent-URL konfigurieren
  icons/                  icon16/48/128.png
  popup/
    popup.html            UI
    popup.css             Styles
    popup.js              Logik (Chat, Voice, Settings)
```

## API-Endpunkte

| Endpunkt | Beschreibung |
|----------|-------------|
| `GET /api/soul` | Soul-Inhalt laden (Bearer soul_cert) |
| `POST /api/chat` | Claude Chat mit SSE-Streaming |

## Berechtigungen

| Permission | Grund |
|------------|-------|
| `storage` | Soul-Cert und Cache speichern |
| `activeTab` | Aktiven Tab-Inhalt lesen |
| `scripting` | Soul-Cert aus SYS-Tab auslesen |
| `tabs` | Tab-URL für Seiten-Kontext |
| `host_permissions: sys.uxprojects-jok.com` | API-Zugriff |
