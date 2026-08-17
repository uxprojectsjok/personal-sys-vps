# MCP Apps

Interactive iframe UIs served alongside MCP tools (`@modelcontextprotocol/ext-apps`), for both own apps and apps published by wired/verdrahtete souls.

---

## Status

Own apps (`soul_apps.mjs`) and apps from wired souls (`wired_apps.mjs`) both work end-to-end, including the full interactive surface — not just static rendering. Confirmed live against a purpose-built experiment app (`interactive-test`, see below): a click inside the iframe reached a real MCP tool call, changed persistent server state, and silently surfaced in the model's next turn without the user typing anything — verified with server-side evidence (a counter in `api_context.json`), not just "the UI didn't show an error."

One open question, not yet resolved:
- `wired_apps.mjs`'s interactive path (`callServerTool`/`updateModelContext`/`sendMessage` through a cross-node, Gatekeeper-proxied app) hasn't been experimentally confirmed yet — only read-only wired apps (`show-social-chat`) have.

An observed `Failed to fetch dynamically imported module` error (see "Lesson from live testing" below) turned out to have a mundane, confirmed, already-fixed server-side cause on the node where it was found — not a ChatGPT-side CSP quirk as first suspected. See "Two real infra bugs, worth checking on your own node" below.

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

One observed failure this way: `Failed to fetch dynamically imported module: https://{your-domain}/apps/_sdk/app.js` in ChatGPT, on a session where the server itself was independently confirmed fully healthy (`curl` from the server: `HTTP 200`, correct size, correct `Access-Control-Allow-Origin`/`Cross-Origin-Resource-Policy` headers). A retry (new session) succeeded — SDK reported connected, and all interaction mechanisms worked without error, later confirmed via server-side state. At the time this looked like it might be an intermittent CSP/network issue on ChatGPT's side — it wasn't. See below: the real cause was a node-local OpenResty permission bug.

### Zero-network host-bridge check

Also worth adding to an interactive test app: a synchronous check for `window.openai` / `window.claude` / `window.mcp` before any fetch happens at all. Purpose: if a host injects its own bridge object natively (the way OpenAI's own, non-MCP Apps SDK convention does via `window.openai`), that path wouldn't depend on successfully fetching our hosted SDK bundle at all — a potential fallback if the dynamic-import route keeps failing intermittently on a given host. Not yet observed to return anything on any host tested so far.

---

## Two real infra bugs, worth checking on your own node

Neither of these is specific to any MCP host — both are OpenResty configuration/ownership issues that can exist on any SYS node, found by chasing down symptoms that first looked like host quirks. If you hit similar intermittent failures, check these first before suspecting the MCP host.

### `proxy_temp/` root-owned — explains the "Failed to fetch" error above

OpenResty's `proxy_temp/0` through `/9` (under its install prefix, e.g. `/usr/local/openresty/nginx/proxy_temp/`) need to be owned by the same user the worker processes run as (typically `www-data`) — check `user` in `nginx.conf` against `ps aux | grep "nginx: worker"`. If they're root-owned instead (can happen after certain install/upgrade paths), any proxied response large enough to need disk buffering can intermittently fail with `open() ".../proxy_temp/N/00/..." failed (13: Permission denied)`, visible in `error.log`. `/apps/_sdk/app.js` (337 KB) is exactly the kind of response that triggers this. This is a far more likely explanation for a `Failed to fetch dynamically imported module` error than any CSP/host-side behavior — the request may never have reliably reached the client. Fix: `chown -R www-data:www-data proxy_temp/` (adjust user/path to your setup).

### `client_body_buffer_size` default (8K) breaks app uploads for anything but the tiniest app

The Vault UI's "upload an app" flow (`POST /api/vault/apps`, `apps.vue`) sends the whole folder as one JSON body — file paths + base64 content. OpenResty's default `client_body_buffer_size` is 8K on x86-64, and by default no location block overrides it for `/api/vault/apps` specifically — it falls through to the generic `/api/vault/` catch-all, which also doesn't set one. A **4-file, ~8.5 KB-raw** test app already produces an ~11.6 KB JSON payload, comfortably over that limit. Once the body exceeds the buffer, OpenResty spills it to a temp file and `ngx.req.get_body_data()` returns `nil`; `api_serve.lua` falls back to `raw = "{}"`, so `payload.app_name` disappears and the request hits the exact same `invalid_app_name` branch as an actually-malformed name — a confusing error that has nothing to do with the name itself. Any real multi-file app (even a few small CSS/JS files) would trivially hit this. Fix: add a dedicated `location = /api/vault/apps { client_max_body_size 5M; client_body_buffer_size 5M; ... }` (matching the 5 MB total-content cap `api_serve.lua` already enforces internally) to your vhost config — see `server/openresty/vhost.conf.template` in this repo, which already has this fix.

---

## No server→app push — only polling

Checked before building `kunstwerk-live` (below): the SDK's type defs
(`app.d.ts`, `app-bridge.d.ts`, `events.d.ts`, `spec.types.d.ts`) expose no
per-resource subscribe/push mechanism — `notifications/resources/list_changed`
is host-wide ("the *list* changed"), not a way to push new content into an
already-open resource, and `registerAppResource()` doesn't wire it up anyway.
`soul-mcp` itself has no SSE/WebSocket channel from server to an open app. An
already-shown MCP App is a static page that can only *pull* (`callServerTool`
on user interaction, or a self-scheduled `setInterval`/poll loop) — nothing
today lets the server push a frame into it unprompted. Any "live" UI in this
project is therefore polling dressed up as live, not real push.

## `kunstwerk-live` — spinner, then the finished result

`shared/apps/kunstwerk-live/` shows a work the way an image/video
generation result is normally shown: a spinner while it's not ready yet,
then just the finished result — no status text, no input field, nothing
else in the UI. First version animated a stroke-by-stroke replay (client-
side reconstruction of stroke geometry); scrapped after live use — read as
noisy rather than useful, and could never be pixel-accurate (no brush
texture, `reflect` mirroring, blend modes, or the real signature font —
those only exist inside `dispatchStrokeStyle()` at render time). Second
version returned the actual rendered PNG as base64 — pixel-identical, no
approximation. `soul_draw`'s own tool response already returns its image
inline (most hosts render `type:"image"` content automatically) — the
spinner moment barely exists for `soul_draw` alone, it renders in
milliseconds. The response shape (`{state, kind, ...}`) is designed to also
cover a genuinely async source — a `mode:"image-to-video"` generation
spread across multiple tool calls, where a spinner actually earns its keep
— but this repo doesn't carry that paid-API tool, so `soul_draw_snapshot`
here only ever returns `kind:"image"`; the same `app.mjs` runs unchanged.
`canvas_id` optional; omitted, resolves to whichever canvas's PNG has the
newest mtime, so the app can show "whatever's being worked on" with zero
input. Poll interval: 1.5s while nothing exists yet, 4s once something is
already showing (background refresh for further progress on the same
work). Installed for all souls via the same `update.sh` step 5b loop as
show-social-chat/show-agent-chat.

## Design Decisions

| Decision | Chosen | Rejected | Reason |
|---|---|---|---|
| App registration timing | Eager, at MCP connection setup, for every own/wired app | Lazy, register on first `wired_list_apps` call | `server.mjs` builds a new stateless `McpServer` per connection — anything registered mid-call is gone before the next request |
| SDK delivery | Host requests `/apps/_sdk/app.js` from us over the network | Bundle the SDK inline into every app's `index.html` | Keeps app authors from needing to vendor the SDK themselves; costs a network round-trip per app load, which is the thing that occasionally fails |
| `<base>`-tag workaround scope | Hard-rewrite only the literal `/apps/_sdk/app.js` string found in served HTML | Try to rewrite arbitrary import paths inside separately-loaded `app.js`/`app.mjs` files too | Not reachable from server-side HTML text processing at all — those resolve at the browser's module layer using the script's own fetched URL, which is a different (and for now working, once `<base>` or its rewrite gets the *outer* HTML right) resolution path |
| Interactive test apps | Worth keeping around as a real, permanent-ish experiment tool (multiple mechanisms side by side, visible diagnostics) | A one-shot throwaway like `iframe-probe` | Ongoing value for testing new hosts/regressions — a pure pass/fail diagnostic answers less than one that exercises the actual interaction surface |
