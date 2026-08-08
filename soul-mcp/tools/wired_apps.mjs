// wired_apps.mjs
// Gatekeeper-Gegenstück zu soul_apps.mjs: macht die MCP Apps VERDRAHTETER
// Souls (siehe lib/wired_souls.mjs) über den Gatekeeper erreichbar — inklusive
// Cross-Node (die verdrahtete Soul kann auf einem anderen Node liegen, siehe
// Phase 1 der Föderation, node_url in wired_souls.json).
//
// WICHTIG: server.mjs erzeugt pro MCP-Verbindung eine NEUE McpServer-Instanz
// (stateless StreamableHTTPServerTransport, kein Session-Zusammenhang zwischen
// Requests) — ein Tool, das erst WÄHREND eines Tool-Aufrufs registriert wird,
// existiert für den Client schon nicht mehr, sobald der nächste Request eine
// neue Instanz aufbaut. Deshalb — anders als ein erster Entwurf, der Apps erst
// nach einem expliziten wired_list_apps-Aufruf registrierte — läuft die
// Registrierung hier EAGER, direkt beim Verbindungsaufbau, für JEDE
// verdrahtete Soul (analog zu soul_apps.mjs, das genauso beim Aufbau scannt).
// wired_list_apps bleibt als reines Auskunfts-Tool erhalten (menschlich
// lesbare Zusammenfassung), registriert aber selbst nichts mehr.

import { z } from 'zod';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { injectBaseTag } from '../lib/app_html.mjs';

const BASE_URL = process.env.BASE_URL;

function lookup(wiredMap, soulId, permKey) {
  const entry = wiredMap[soulId];
  if (!entry) return { error: `Soul ${soulId} ist bei diesem Gatekeeper nicht verdrahtet.` };
  if (permKey && !entry.permissions?.[permKey]) {
    return { error: `Verdrahteter Token für ${soulId} erlaubt keinen Zugriff auf "${permKey}".` };
  }
  return { token: entry.token, nodeUrl: entry.node_url || null };
}

async function fetchJson(base, path, token) {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function errResult(msg) {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

function registerWiredApp(server, soulId, appName, base, title, description, rawHtml) {
  const shortId     = soulId.slice(0, 8);
  const toolName    = `wired_app_${shortId}_${appName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const resourceUri = `ui://wired/${soulId}/${appName}/index.html`;
  // base = Herkunfts-Node der verdrahteten Soul (nicht der eigene BASE_URL
  // des Gatekeepers) — dort liegen style.css/app.js dieser App wirklich.
  const html = injectBaseTag(rawHtml, `${base}/apps/${soulId}/${appName}/`);

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    {
      mimeType: RESOURCE_MIME_TYPE,
      // CSP erlaubt den HERKUNFTS-Node (dort liegen style.css/app.js dieser
      // App, siehe soul_apps.mjs) — nicht den eigenen BASE_URL des Gatekeepers.
      // baseUriDomains: ohne die gilt der restriktive Default "base-uri 'self'"
      // (Sandbox-Origin des Hosts, nicht base), der injectBaseTag()s <base>-Tag
      // blockt — siehe ausführlicher Kommentar in soul_apps.mjs.
      _meta: { ui: { csp: { resourceDomains: [base], connectDomains: [base], baseUriDomains: [base] } } },
    },
    async () => ({
      contents: [{
        uri: resourceUri,
        mimeType: RESOURCE_MIME_TYPE,
        text: html,
        // Manche Hosts werten die CSP am gelesenen Content-Item aus, nicht nur
        // an der statischen Registrierung — siehe soul_apps.mjs-Kommentar.
        _meta: { ui: { csp: { resourceDomains: [base], connectDomains: [base], baseUriDomains: [base] } } },
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
      content: [{ type: 'text', text: `${title} geöffnet.` }],
    }),
  );
}

// Eager: für jede verdrahtete Soul mit "context_files"-Scope einmal
// /api/vault/apps abfragen und alle gefundenen Apps sofort registrieren.
// Ein Fehler bei einer Soul (nicht erreichbar, keine Apps, ...) darf die
// anderen nie beeinträchtigen.
export async function registerWiredApps(server, wiredMap) {
  const appsBySoul = {}; // für wired_list_apps' Text-Zusammenfassung

  await Promise.all(Object.entries(wiredMap).map(async ([soulId, entry]) => {
    if (!entry.permissions?.context_files) return;
    const base = entry.node_url || BASE_URL;
    try {
      const data = await fetchJson(base, '/api/vault/apps', entry.token);
      const apps = Array.isArray(data.apps) ? data.apps : [];
      appsBySoul[soulId] = apps;
      await Promise.all(apps.map(async (app) => {
        try {
          const detail = await fetchJson(base, `/api/vault/apps/${encodeURIComponent(app.name)}`, entry.token);
          if (typeof detail.html !== 'string' || !detail.html) return;
          const title = detail.title || app.name;
          // Mehrere verdrahtete Souls (oder der Gatekeeper selbst) können dieselbe
          // App unter demselben Namen/Titel installiert haben (z.B. show-social-chat
          // bei jeder Soul) — ohne Soul-Kennung im ANGEZEIGTEN Titel zeigt Claude.ai
          // mehrere identisch benannte Einträge in der Tool-Berechtigungsliste, nicht
          // unterscheidbar, obwohl der interne Tool-Name (unten) längst eindeutig ist.
          // Gleiches Prinzip wie bei der Passkey-Benennung.
          const qualifiedTitle = entry.name ? `${title} · ${entry.name}` : `${title} · ${soulId.slice(0, 8)}`;
          const description = detail.description || `Öffnet die App "${title}" von der verdrahteten Soul ${soulId}.`;
          registerWiredApp(server, soulId, app.name, base, qualifiedTitle, description, detail.html);
        } catch (err) {
          console.error(`[wired_apps] Fehler beim Laden von "${app.name}" (soul ${soulId}):`, err.message);
        }
      }));
    } catch {
      // Soul/Node nicht erreichbar oder keine Apps — einfach überspringen.
    }
  }));

  server.tool(
    'wired_list_apps',
    'Listet die MCP Apps einer beim Gatekeeper verdrahteten Soul. soul_id aus wire_status.',
    { soul_id: z.string().describe('soul_id der verdrahteten Soul') },
    async ({ soul_id }) => {
      const { error } = lookup(wiredMap, soul_id, 'context_files');
      if (error) return errResult(error);
      const apps = appsBySoul[soul_id] || [];
      if (!apps.length) {
        return { content: [{ type: 'text', text: 'Diese Soul hat keine Apps veröffentlicht (oder war beim Verbindungsaufbau nicht erreichbar).' }] };
      }
      const text = apps.map(a => `- ${a.name}${a.title && a.title !== a.name ? ` ("${a.title}")` : ''}${a.description ? `: ${a.description}` : ''}`).join('\n');
      return { content: [{ type: 'text', text: `Apps von ${soul_id}:\n${text}\n\nJede App ist als Tool "wired_app_..." verfügbar.` }] };
    }
  );
}
