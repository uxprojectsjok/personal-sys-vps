# Zapier Integration

The Zapier integration has two independent parts:

| Part | Direction | What it does |
|------|-----------|-------------|
| **Inbound Webhook** | Zapier → SYS | Zapier writes events (Gmail, Calendar, …) into your soul |
| **MCP Connection** | SYS → Zapier | Your AI calls Zapier tools (send emails, create docs, …) |

Both parts are optional and independent of each other.

---

## Part 1 — Inbound Webhook

### How it works

Zapier sends a POST request to your node when a trigger fires (new email, calendar event, Slack message, …). The node writes the content into your `sys.md` — either into the **Agent Sandbox** (for the AI) or the **Social Sphere** (visible to peers).

Protection: max. 50 entries per block — oldest entries are automatically removed when the cap is reached.

### Finding your webhook URL

1. Open your node → **Settings → API**
2. In the Zapier section: copy the webhook URL

Format: `https://your-domain.com/api/zapier?token=YOUR_TOKEN`

The token is stored in `api_context.json` on the server (`webhook_token`). It is generated automatically during the first API setup.

### Setting up a Zap

**Step 1 — Choose a trigger**

Examples:
- Gmail → "New Email"
- Google Calendar → "Event Start"
- Slack → "New Message in Channel"
- Any other trigger

**Step 2 — Action: Webhooks by Zapier → POST**

| Field | Value |
|-------|-------|
| URL | your webhook URL from Settings |
| Payload Type | `JSON` |

**Step 3 — Configure the body fields**

```json
{
  "source":  "gmail",
  "action":  "write",
  "message": "{{Body Plain}}",
  "subject": "{{Subject}}",
  "from":    "{{From Email}}"
}
```

### Body fields

| Field | Required | Values | Description |
|-------|----------|--------|-------------|
| `source` | no | `gmail`, `calendar`, any string | Determines the display format |
| `action` | no | `write`, `notify`, `read` | Where to write |
| `message` | no | free text | Main content |
| `subject` | no | text | Subject / event title |
| `from` | no | email or name | Sender |
| `reply_to` | no | message-id or similar | Reply context |

### Actions

| Action | Target in sys.md | Who sees it |
|--------|-----------------|-------------|
| `write` (default) | `<!-- AGENT:START/END -->` | AI reads it in the next session |
| `notify` | `<!-- SOCIAL:START/END -->` | AI + peers |
| `read` | — | Returns `soul_name` + Core Identity snippet |

If no `action` is provided: `write` when `message` is present, otherwise `read`.

### Formatting by source

The node formats the message automatically:

**Gmail:**
```
Von: sender@mail.com | Betreff: Email subject | Message body
```

**Calendar:**
```
Termin: Meeting with Alice | Von: calendar@domain.com | Description
```

**Generic:**
```
Subject — Content (von Sender)
```

### Testing the connection

Settings → API → Zapier section → **"Test Webhook"** button. It sends `{ "action": "read" }` and displays your `soul_name` if everything works.

Or test directly in Zapier via "Test Action" — the node responds with:
```json
{
  "ok": true,
  "soul_name": "Your Name",
  "action": "read",
  "message_written": false
}
```

---

## Part 2 — MCP Connection

### How it works

Zapier provides its own MCP server. Your node connects to it — the AI in chat can then call Zapier actions directly: send emails, create Google Docs, post Slack messages, …

### Setting up Zapier MCP

1. **Open Zapier** → [zapier.com/mcp](https://zapier.com/mcp)
2. **Configure actions** — which tools the AI is allowed to use, e.g.:
   - Gmail: Send Email
   - Gmail: Find Email
   - Google Docs: Create Document from Text
   - Google Calendar: Create Event
3. **Copy the MCP URL** — format: `https://mcp.zapier.com/api/mcp/s/YOUR_ID/mcp`

### Adding the MCP URL to your node

1. Open your node → **Settings → API**
2. "Zapier MCP URL" field → paste the URL → Save

The AI has access to the tools from the next chat session onward.

### Using tools in chat

The AI sees all configured Zapier tools automatically in its tool manifest. You can address it directly:

> "Send an email to alice@example.com — subject: Hello, body: …"
> "Create a Google Doc titled 'Meeting Notes' with the following content: …"
> "What's on my calendar tomorrow?"

### Available tools

The AI calls `/api/mcp-tools` which returns the current tool list from Zapier. If you add or remove actions in Zapier, they take effect immediately without restarting the node.

---

## Security

- **webhook_token** protects the inbound webhook — only requests with the correct token are accepted
- A leaked `webhook_token` gives **no access to private soul sections** — only the Agent Sandbox and Social Sphere can be written to
- Rolling cap (50 entries) prevents flooding even with a leaked token
- Rotation: Settings → API Context → webhook token field → enter new value → update all Zaps with the new URL

Full key management details: [KEYMANAGEMENT.md](../KEYMANAGEMENT.md)

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Webhook returns 403 | API not enabled | Settings → API → enable API |
| Webhook returns 401 | Wrong token in URL | Re-copy webhook URL from Settings |
| `message_written: false` | Soul file empty or encrypted | Open soul in browser and save once |
| MCP tools empty | MCP URL not set | Settings → API → enter MCP URL |
| AI cannot find tools | Wrong MCP URL | Zapier MCP page → re-copy URL |
