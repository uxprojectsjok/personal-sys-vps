// soul_apps.mjs
// MCP Apps (https://modelcontextprotocol.io/extensions/apps/overview): jede Soul kann
// eigene interaktive UI-Apps veröffentlichen, indem sie Dateien nach
// vault_shared/apps/{app-name}/ legt (manuell, kein Upload-Tool in v1 — siehe
// project_sys_v2_vision Memory). Diese Funktion scannt bei jeder MCP-Verbindung neu
// und registriert pro validem App-Ordner ein Tool + eine ui://-Resource.
//
// Struktur pro App:
//   vault_shared/apps/{app-name}/index.html   (Pflicht)
//   vault_shared/apps/{app-name}/style.css    (optional)
//   vault_shared/apps/{app-name}/app.js       (optional)
//   vault_shared/apps/{app-name}/manifest.json (optional: {title, description, initialData})
//
// index.html referenziert style.css/app.js über absolute URLs auf die
// GET /apps/:soul_id/:app_name/:filename-Route in server.mjs, nicht relativ —
// der Host rendert die ui://-Resource vermutlich ohne verlässliche
// relative-URL-Auflösung. Echte Funktionalität holt sich die App per
// app.callServerTool() aus dem eigenen JS gegen die bereits registrierten
// Soul-Tools (soul_read, context_get, ...) — der Opener-Tool-Handler hier
// bleibt bewusst dünn.

import { readFile, readdir, stat } from 'node:fs/promises';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { SOULS_DIR } from '../lib/vault_fs.mjs';
import { injectBaseTag } from '../lib/app_html.mjs';

const BASE_URL = process.env.BASE_URL;

const APP_NAME_RE = /^[a-z0-9_-]{1,64}$/;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB — großzügig für ein gebündeltes Snippet, kein Vollbrowser-Bundle

async function loadManifest(appDir) {
  try {
    const raw = await readFile(`${appDir}/manifest.json`, 'utf8');
    const data = JSON.parse(raw);
    return (data && typeof data === 'object') ? data : {};
  } catch {
    return {};
  }
}

async function validateApp(appDir) {
  const htmlPath = `${appDir}/index.html`;
  let st;
  try {
    st = await stat(htmlPath);
  } catch {
    return { ok: false, reason: 'index.html fehlt' };
  }
  if (!st.isFile() || st.size === 0) return { ok: false, reason: 'index.html leer' };
  if (st.size > MAX_HTML_BYTES) return { ok: false, reason: 'index.html zu groß' };

  const html = await readFile(htmlPath, 'utf8');
  // Nur ein grober "sieht aus wie MCP-lauffähiges HTML"-Check — kein
  // Sandboxing/Parsing nötig, es ist immer die eigene Soul auf dem eigenen Node.
  if (!/<!doctype html|<html/i.test(html.slice(0, 1024))) {
    return { ok: false, reason: 'index.html sieht nicht wie HTML aus' };
  }
  return { ok: true, html };
}

export async function registerSoulApps(server, soulId) {
  const appsDir = `${SOULS_DIR}${soulId}/vault_shared/apps`;
  let entries;
  try {
    entries = await readdir(appsDir, { withFileTypes: true });
  } catch {
    return; // kein apps/-Ordner — nichts zu tun
  }

  const seenToolNames = new Set();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const appName = entry.name;
    if (!APP_NAME_RE.test(appName)) continue; // unsicherer Name — überspringen

    const toolName = `app_${appName}`;
    if (seenToolNames.has(toolName)) continue; // Kollision — erste gewinnt
    const appDir = `${appsDir}/${appName}`;

    try {
      const validation = await validateApp(appDir);
      if (!validation.ok) continue;

      const manifest    = await loadManifest(appDir);
      const title        = typeof manifest.title === 'string' && manifest.title.trim() ? manifest.title.trim() : appName;
      const description  = typeof manifest.description === 'string' && manifest.description.trim()
        ? manifest.description.trim()
        : `Öffnet die App "${title}".`;
      const resourceUri  = `ui://${soulId}/${appName}/index.html`;
      // <base> macht relative Pfade (style.css, app.js, fetch(...)) im
      // App-Autor-Code unabhängig davon nutzbar, wie der Host die
      // ui://-Resource rendert — Autoren müssen keine absoluten URLs mehr
      // hardcoden (siehe injectBaseTag-Kommentar).
      const html = BASE_URL
        ? injectBaseTag(validation.html, `${BASE_URL}/apps/${soulId}/${appName}/`)
        : validation.html;

      // Sandbox-Rechte (Kamera/Mikrofon/Geolocation/Clipboard) sind Opt-in per
      // manifest.json — nur App-Autoren, die sie wirklich brauchen (z.B. eine
      // Kamera-basierte Verifizierungs-App), sollen sie anfordern, nicht
      // pauschal jede App. Erwartete Form in manifest.json (identisch zum
      // McpUiResourcePermissions-Schema des SDK — leeres Objekt = angefordert):
      //   "permissions": { "camera": {} }
      const permissions = (manifest.permissions && typeof manifest.permissions === 'object')
        ? manifest.permissions
        : undefined;

      registerAppResource(
        server,
        resourceUri,
        resourceUri,
        {
          mimeType: RESOURCE_MIME_TYPE,
          // baseUriDomains fehlte hier: ohne sie gilt laut Spec der restriktive
          // Default "base-uri 'self'" — 'self' ist der isolierte Sandbox-Origin
          // des Hosts, NICHT unsere Domain, also blockt das genau das <base>-Tag,
          // das injectBaseTag() oben injiziert (live in Claude.ai-Konsole
          // bestätigt: "Setting the document's base URI to '...' violates ...
          // base-uri 'self'"). Damit resolven alle relativen/root-relativen
          // Referenzen (u.a. der SDK-Import /apps/_sdk/app.js) gegen den
          // Sandbox-Origin statt gegen unsere Domain und schlagen fehl, noch
          // bevor App.connect() überhaupt laufen kann.
          _meta: BASE_URL ? { ui: { csp: { resourceDomains: [BASE_URL], connectDomains: [BASE_URL], baseUriDomains: [BASE_URL] }, ...(permissions ? { permissions } : {}) } } : undefined,
        },
        async () => ({
          contents: [{
            uri: resourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            // Manche Hosts (u.a. Claude) bevorzugen/erwarten die CSP direkt am
            // gelesenen Content-Item statt nur an der statischen
            // Registrierung — siehe registerAppResource-Doku: "content-item
            // value takes precedence". Beide Stellen zu setzen kostet nichts
            // und deckt beide Auswertungsreihenfolgen ab.
            ...(BASE_URL ? { _meta: { ui: { csp: { resourceDomains: [BASE_URL], connectDomains: [BASE_URL], baseUriDomains: [BASE_URL] }, ...(permissions ? { permissions } : {}) } } } : {}),
          }],
        }),
      );

      registerAppTool(
        server,
        toolName,
        {
          title,
          description,
          inputSchema: {},
          _meta: { ui: { resourceUri } },
        },
        async () => ({
          content: [{
            type: 'text',
            text: manifest.initialData !== undefined
              ? JSON.stringify(manifest.initialData)
              : `${title} geöffnet.`,
          }],
        }),
      );

      seenToolNames.add(toolName);
    } catch (err) {
      // Ein kaputter App-Ordner darf die Verbindung nie zum Absturz bringen.
      console.error(`[soul_apps] Fehler beim Registrieren von "${appName}" (soul ${soulId}):`, err.message);
    }
  }
}
