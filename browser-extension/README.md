# Browser Extension

Chrome extension (Manifest V3) — Soul companion in the browser.
Chat with your soul, start a voice agent, and pass the current page as context.

## Features

- Chat with your soul via SSE streaming (Claude API)
- Voice tab: start an ElevenLabs Conversational AI agent in a browser tab
- Page context: pass current tab content as context to your soul
- Soul login: automatically pick up the soul cert from the SYS tab
- File attach: attach text files to the chat
- Detach: open the popup as a standalone window

## Requirements

- Google Chrome (or Chromium-based browser)
- SYS app open at `https://YOUR_DOMAIN` in the same browser

## Installation

### Load as unpacked extension (development)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `browser-extension/` folder

The extension appears in the toolbar.

### Configure ElevenLabs agent URL

Edit `elevenlabs.config.json`:

```json
{
  "agent_url": "https://elevenlabs.io/app/talk-to?agent_id=YOUR_AGENT_ID"
}
```

After changing this file: Chrome Extensions → reload the extension (⟳).

### Apply updates

After code changes:
1. Open `chrome://extensions`
2. Click ⟳ (Reload) on the extension

## Connecting

1. Open the SYS app and log in (`https://YOUR_DOMAIN`)
2. Click the extension icon → **⚙** tab
3. Click **Connect to SYS**
4. The soul cert is automatically read from the SYS tab

The cert is stored in `chrome.storage.local` and persists across browser restarts.

## Structure

```
browser-extension/
  manifest.json           MV3 manifest
  background.js           Service worker (soul cache)
  content.js              Content script (page info + soul login)
  elevenlabs.config.json  Agent URL configuration
  icons/                  icon16/48/128.png
  popup/
    popup.html            UI
    popup.css             Styles
    popup.js              Logic (chat, voice, settings)
```

## API endpoints used

| Endpoint | Description |
|----------|-------------|
| `GET /api/soul` | Load soul content (Bearer soul_cert) |
| `POST /api/chat` | Claude chat with SSE streaming |

## Permissions

| Permission | Reason |
|------------|--------|
| `storage` | Store soul cert and cache |
| `activeTab` | Read active tab content |
| `scripting` | Extract soul cert from SYS tab |
| `tabs` | Tab URL for page context |
| `host_permissions: YOUR_DOMAIN` | API access |
