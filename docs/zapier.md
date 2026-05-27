# Zapier MCP Integration

Connect your node to Zapier's MCP server — the AI in chat can then call Zapier actions directly: send emails, create Google Docs, post Slack messages, and more from 8,000+ apps.

---

## How it works

Zapier runs its own MCP server. Your node connects to it via a single URL. The AI sees all configured actions automatically in its tool manifest and can call them on demand during a conversation.

```
You in chat → AI → /api/mcp-call → Zapier MCP → Gmail / Google Docs / Slack / …
```

No background automation, no triggers — the AI acts when you ask it to.

---

## Setup

**Step 1 — Configure Zapier MCP**

1. Go to [zapier.com/mcp](https://zapier.com/mcp) (logged in)
2. Add the actions you want the AI to use, e.g.:
   - Gmail: Send Email
   - Gmail: Find Email
   - Google Docs: Create Document from Text
   - Google Calendar: Create Event / Find Event
3. Click **Connect** → **Generate token**
4. Copy the full connection URL (Option 2: URL with token)

**Step 2 — Add the URL to your node**

1. Open your node → **Settings → API**
2. Paste the URL into the **Zapier MCP** field → Save

The AI has access to the tools from the next chat session onward.

---

## Using tools in chat

The AI sees all configured Zapier actions automatically. Address it directly:

> "Send an email to alice@example.com — subject: Hello, body: …"
> "Create a Google Doc titled 'Meeting Notes' with the following content: …"
> "What's on my calendar tomorrow?"
> "Find the last email from bob@example.com"

---

## How it works under the hood

When the chat session starts, the node fetches the tool list from Zapier via `GET /api/mcp-tools`. These are passed to the Anthropic API as native tools. When the AI decides to call one, the node proxies the call through `POST /api/mcp-call` to Zapier's MCP server and returns the result.

Adding or removing actions in Zapier takes effect immediately — no node restart needed.

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| AI doesn't see Zapier tools | URL not set or session cached | Save the URL in Settings, then reload the page |
| AI sees tools but calls fail | Token expired | Regenerate token on zapier.com/mcp, update URL in Settings |
| Wrong MCP URL format | Copied wrong option | Use Option 2 (URL with token) from Zapier's connect dialog |
