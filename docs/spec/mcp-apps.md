# MCP Apps

Interactive iframe UIs served alongside MCP tools (`@modelcontextprotocol/ext-apps`), for both own apps and apps published by wired/verdrahtete souls.

---

## Status

Own apps (`soul_apps.mjs`) and apps from wired souls (`wired_apps.mjs`) both work end-to-end, including the full interactive surface — not just static rendering. Confirmed live against a purpose-built experiment app (`interactive-test`, see below): a click inside the iframe reached a real MCP tool call, changed persistent server state, and silently surfaced in the model's next turn without the user typing anything — verified with server-side evidence (a counter in `api_context.json`), not just "the UI didn't show an error."

Two open questions, not yet resolved:
- Whether ChatGPT reliably honors the `_meta.ui.csp` domain hints the way it's supposed to, or whether an observed `Failed to fetch dynamically imported module` error will recur (see "Known host quirks" below).
- `wired_apps.mjs`'s interactive path (`callServerTool`/`updateModelContext`/`sendMessage` through a cross-node, Gatekeeper-proxied app) hasn't been experimentally confirmed yet — only read-only wired apps (`show-social-chat`) have.

---

## Architecture

### Two registration paths, one shared rendering problem

| | `soul_apps.mjs` | `wired_apps.mjs` |
|---|---|---|
| Apps from | `vault_shared/apps/{app_name}/` of your **own** soul | Apps of **wired/verdrahtete** souls, fetched via the Gatekeeper (`/api/vault/apps`, cross-node via `node_url`) |
| Registration timing | Eager, on every MCP connection | Eager, on every MCP connection (a tool registered mid-call wouldn't survive to the next request — `server.mjs` creates a new stateless `McpServer` instance per connection) |
| Tool name | one `registerAppTool` per own app | `wired_app_{soul_id_short}_{app_name}`, one per (wired soul × app) pair |
| Resource URI | `ui://{soul_id}/{app_name}/index.html` | `ui://wired/{soul_id}/{app_name}/index.html` |
| `injectBaseTag()` base | own `BASE_URL` | the **wired soul's own node_url**, not the Gatekeeper's `BASE_URL` — that's where its `style.css`/`app.mjs` actually live |
| Human-readable summary tool | (none needed, apps list in the UI) | `wired_list_apps` — text-only summary, registers nothing itself |

### App folder structure

```
vault_shared/apps/{app_name}/
  index.html       required
  style.css        optional
  app.mjs / app.js optional
  manifest.json    optional — {title, description, initialData}
```

`validateApp()` (`soul_apps.mjs`) only requires `index.html` to exist, be non-empty, under 2 MB, and look like HTML (`<!doctype html` / `<html` in the first 1 KB). It doesn't sandbox or parse further — always the owner's own soul on the owner's own node.

Both `soul_apps.mjs` and `wired_apps.mjs` register two things per app: an `ui://` **resource** (the actual HTML) and a **tool** (what shows up as callable — opens the app, `content: [{type:'text', text:"{title} geöffnet."}]`).

### The `<base>`-tag problem (why `injectBaseTag()` exists)

An MCP host renders a `ui://` resource inside an isolated sandbox iframe (Claude.ai: `*.claudemcpcontent.com`, one origin per conversation). App authors write ordinary relative references (`href="style.css"`, `src="app.mjs"`) — those need to resolve against **our** server, not the sandbox's own opaque origin. `injectBaseTag()` (`soul-mcp/lib/app_html.mjs`) solves this by injecting `<base href="{BASE_URL}/apps/{soul_id}/{app_name}/">` into the served HTML.

**Confirmed bug (Claude.ai, web + desktop, still live):** Claude does not honor the `_meta.ui.csp.baseUriDomains` hint we declare — `<base>` gets blocked outright ("violates ... base-uri 'self'"), where `'self'` is the sandbox origin, not ours. Without the tag, root-relative references (including the SDK import path itself, `/apps/_sdk/app.js`) resolve against the sandbox origin and 404, and `App.connect()` never runs.

**Workaround:** `injectBaseTag()` additionally hard-rewrites any literal `"/apps/_sdk/app.js"` string **found directly in the served HTML text** to a fully-qualified absolute URL, independent of whether `<base>` takes effect — this only covers references that are literally inline in `index.html` (e.g. an inline `<script type="module">` block, as in `iframe-probe`, see below). It does **not** reach into a separately-loaded `app.mjs`/`app.js` file's own `import` statements — those resolve at the browser's module-specifier-resolution layer, using the *importing script's own fetched URL* as the base, which works correctly as long as that script itself was loaded from the right origin (i.e., as long as `<script src="app.mjs">`'s own relative reference resolved correctly — via `<base>` where honored, or already broken upstream where not).

### CORS / CORP headers for cross-origin asset loading

The sandbox iframe is a foreign origin to us by design. Both static-asset routes set:
```
Access-Control-Allow-Origin: *
Cross-Origin-Resource-Policy: cross-origin
```
`/apps/_sdk/app.js` (server.mjs) — serves `node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js` (the bundled SDK-with-dependencies build, not the bare `app.js`), 24h cache.
`/apps/:soul_id/:app_name/*` (server.mjs) — serves any file inside an app's own folder; extension → MIME via `APP_ASSET_MIME` (includes both `.js` and `.mjs` → `text/javascript`), `no-cache`.

Without `Cross-Origin-Resource-Policy: cross-origin`, a host sandbox that sets Cross-Origin-Embedder-Policy would refuse the load even with correct CORS (`net::ERR_HTTP2_PROTOCOL_ERROR` despite 200 OK + CORS headers — observed live against Claude.ai).

---

## SDK capabilities (`@modelcontextprotocol/ext-apps`, client-side `App` class)

Everything an app can do once `App.connect()` succeeds:

| Method | Effect | Notes |
|---|---|---|
| `callServerTool({name, arguments})` | Calls any registered MCP tool, returns its result | The workhorse — used by `show-social-chat` (`soul_read`), `interactive-test` (a dedicated counter tool) |
| `updateModelContext({content})` | Silently attaches content to the model's context | **No immediate reply** — the host defers delivery until the next turn (real user message, or a `sendMessage` call). Only the last update is kept; each call overwrites the previous one. Confirmed live: a click surfaced unprompted in the model's next answer. |
| `sendMessage({role, content})` | Adds a message to the visible conversation thread | Triggers an immediate model response — the one mechanism that actually "goes into the chat," not just the app UI |
| `requestDisplayMode({mode})` | Asks the host to change how the iframe is displayed (e.g. `fullscreen`) | Host may ignore; check the returned `mode` |
| `setupSizeChangedNotifications()` | Tells the host to track/react to iframe content size | Not gated behind the handshake internally (no `_assertInitialized` in the SDK) — safe to call immediately, independent of whether `connect()` itself hangs |
| `openLink({url})` | Asks the host to open an external URL | Host may deny (`isError: true`) |
| `downloadFile(...)` | Asks the host to save a file | |
| `sendLog({level, data, logger})` | Debug/telemetry only, never enters the conversation | |

### The hanging-handshake workaround (`ext-apps#671`)

Observed in Claude.ai: the host creates the iframe, but the raw `App.connect()` handshake can hang indefinitely — the app is otherwise fully functional. Standing fix, used in every app in this project:
```js
let handshakeDone = false;
app.connect().then(() => { handshakeDone = true; }).catch(() => {});
app.setupSizeChangedNotifications(); // not gated on the handshake — call immediately
setTimeout(() => {
  if (!handshakeDone) app.notification({ method: "ui/notifications/initialized" }).catch(() => {});
}, 500);
```
A disposable diagnostic app (`iframe-probe`, built ad hoc under `vault_shared/apps/`) is what pinned this down originally, with visible step markers (static render → script ran → SDK imported → handshake done → fallback fired → tool call succeeded). Worth rebuilding on demand if a new host needs the same kind of triage — it's not part of this repo, since app folders are runtime data under `vault_shared/`, not tracked in git.

---

## Lesson from live testing: static vs. dynamic SDK import

Building an interactive test app with `import { App } from "/apps/_sdk/app.js"` as a **static**, top-of-file import failed completely in ChatGPT — not just the SDK-dependent buttons, but a *purely local* button with zero server dependency also did nothing. Root cause: a failed static `import` kills the entire containing module before any of its code — including unrelated `addEventListener` calls — ever runs. There is no partial failure with a static import; it's all-or-nothing.

The fix, and the template going forward for any app doing real interactive work (not just static display):
1. Attach **all** button/event listeners synchronously, before touching the SDK at all — local-only functionality then survives total SDK failure.
2. Load the SDK via **dynamic** `import()`, wrapped in try/catch, with the outcome (`loading…` / `imported ✓` / `import failed — {message}`) written to a visible status line — failures become diagnosable instead of silently indistinguishable from "nothing was clicked."

One observed failure this way: `Failed to fetch dynamically imported module: https://{your-domain}/apps/_sdk/app.js` in ChatGPT, on a session where the server itself was independently confirmed fully healthy (`curl` from the server: `HTTP 200`, correct size, correct `Access-Control-Allow-Origin`/`Cross-Origin-Resource-Policy` headers). A retry (new session) succeeded — SDK reported connected, and all interaction mechanisms worked without error, later confirmed via server-side state. Whether this was a one-off sandbox-startup hiccup or an intermittent CSP/network issue on ChatGPT's side is still open — worth re-testing if it recurs.

### Zero-network host-bridge check

Also worth adding to an interactive test app: a synchronous check for `window.openai` / `window.claude` / `window.mcp` before any fetch happens at all. Purpose: if a host injects its own bridge object natively (the way OpenAI's own, non-MCP Apps SDK convention does via `window.openai`), that path wouldn't depend on successfully fetching our hosted SDK bundle at all — a potential fallback if the dynamic-import route keeps failing intermittently on a given host. Not yet observed to return anything on any host tested so far.

---

## Design Decisions

| Decision | Chosen | Rejected | Reason |
|---|---|---|---|
| App registration timing | Eager, at MCP connection setup, for every own/wired app | Lazy, register on first `wired_list_apps` call | `server.mjs` builds a new stateless `McpServer` per connection — anything registered mid-call is gone before the next request |
| SDK delivery | Host requests `/apps/_sdk/app.js` from us over the network | Bundle the SDK inline into every app's `index.html` | Keeps app authors from needing to vendor the SDK themselves; costs a network round-trip per app load, which is the thing that occasionally fails |
| `<base>`-tag workaround scope | Hard-rewrite only the literal `/apps/_sdk/app.js` string found in served HTML | Try to rewrite arbitrary import paths inside separately-loaded `app.js`/`app.mjs` files too | Not reachable from server-side HTML text processing at all — those resolve at the browser's module layer using the script's own fetched URL, which is a different (and for now working, once `<base>` or its rewrite gets the *outer* HTML right) resolution path |
| Interactive test apps | Worth keeping around as a real, permanent-ish experiment tool (multiple mechanisms side by side, visible diagnostics) | A one-shot throwaway like `iframe-probe` | Ongoing value for testing new hosts/regressions — a pure pass/fail diagnostic answers less than one that exercises the actual interaction surface |
