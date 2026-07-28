/**
 * gatekeeper_proxy — generische, soul_id-parametrisierte Tools für eine
 * "Gatekeeper"-Soul (jede Soul mit nicht-leerer wired_souls.json, siehe
 * lib/wired_souls.mjs). Registriert nur EINMAL, unabhängig davon wie viele
 * Souls verdrahtet sind — welche Souls erreichbar sind und mit welchem
 * Scope steuert allein der pro Soul hinterlegte Service-Token.
 *
 * Kein eigener Auth-Code: jeder gespeicherte Token durchläuft ganz normal
 * /api/soul bzw. /api/vault/* über vault_auth.lua — exakt derselbe Pfad,
 * den der Token-Owner auch selbst (z.B. via ElevenLabs) nutzen würde.
 */

import { z } from 'zod';

const BASE_URL = process.env.BASE_URL;

function lookup(wiredMap, soulId, permKey) {
  const entry = wiredMap[soulId];
  if (!entry) return { error: `Soul ${soulId} ist bei diesem Gatekeeper nicht verdrahtet.` };
  if (permKey && !entry.permissions?.[permKey]) {
    return { error: `Verdrahteter Token für ${soulId} erlaubt keinen Zugriff auf "${permKey}".` };
  }
  return { token: entry.token, nodeUrl: entry.node_url || null };
}

// nodeUrl gesetzt (Cross-Node-Wiring): Fetch gegen den Home-Node der
// verdrahteten Soul statt gegen den eigenen Node des Gatekeepers.
// Exportiert, weil peer_inbox.mjs/wired_shared_get denselben node_url-
// bewussten Fetch für direkte Soul-zu-Soul-Verbindungen braucht.
export async function fetchApi(path, token, nodeUrl) {
  const base = nodeUrl || BASE_URL;
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res;
}

function errResult(msg) {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

// "wired_"-Präfix ist bewusst: /mcp/discover registriert für den Gatekeeper-Owner
// zusätzlich dessen eigenes normales Owner-Toolset (soul_read, context_get, ...,
// siehe server.mjs handleMcpDiscover) — ohne Präfix kollidieren die Tool-Namen
// mit den hier generischen, soul_id-parametrisierten Varianten für VERDRAHTETE
// Souls. "wired_context_get" ≠ "context_get" (Gatekeepers eigener Kontext).
function registerVaultTools(server, wiredMap, kind, permKey, apiSegment) {
  server.tool(
    `wired_${kind}_list`,
    `Listet ${kind}-Dateien einer verdrahteten Soul (siehe wire_status).`,
    { soul_id: z.string().describe('soul_id der verdrahteten Soul') },
    async ({ soul_id }) => {
      const { token, nodeUrl, error } = lookup(wiredMap, soul_id, permKey);
      if (error) return errResult(error);
      try {
        const res = await fetchApi(`/api/vault/${apiSegment}`, token, nodeUrl);
        const data = await res.json();
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return errResult(`wired_${kind}_list fehlgeschlagen: ${err.message}`);
      }
    }
  );

  server.tool(
    `wired_${kind}_get`,
    `Liest eine einzelne ${kind}-Datei einer verdrahteten Soul.`,
    {
      soul_id:  z.string().describe('soul_id der verdrahteten Soul'),
      filename: z.string().describe('Dateiname, aus ' + `wired_${kind}_list`),
    },
    async ({ soul_id, filename }) => {
      const { token, nodeUrl, error } = lookup(wiredMap, soul_id, permKey);
      if (error) return errResult(error);
      try {
        const res  = await fetchApi(`/api/vault/${apiSegment}/${encodeURIComponent(filename)}`, token, nodeUrl);
        const ctype = res.headers.get('content-type') || '';
        if (ctype.startsWith('text/') || ctype.includes('json')) {
          const text = await res.text();
          return { content: [{ type: 'text', text }] };
        }
        const buf = Buffer.from(await res.arrayBuffer());
        return { content: [{ type: 'text', text: `Binärdatei (${buf.length} Bytes, ${ctype}) — Direktzugriff nur über den REST-Endpoint möglich.` }] };
      } catch (err) {
        return errResult(`wired_${kind}_get fehlgeschlagen: ${err.message}`);
      }
    }
  );
}

export function registerGatekeeperTools(server, wiredMap, callerToken = null) {
  server.tool(
    'wired_shared_get',
    'Lädt eine Datei aus vault_shared einer verdrahteten/verbundenen Soul (z.B. ein Dateianhang aus peer_send/peer_inbox).',
    {
      soul_id:  z.string().describe('soul_id der verdrahteten/verbundenen Soul'),
      filename: z.string().describe('Dateiname in deren vault_shared'),
    },
    async ({ soul_id, filename }) => {
      const entry = wiredMap[soul_id];
      if (!entry) return errResult(`Soul ${soul_id} ist bei dieser Soul nicht verdrahtet/verbunden.`);
      // Self-Cert-Session: eigenen Cert cross-node an die Ziel-Soul schicken
      // (dort verifiziert). Sonst: den beim Wire/Connect ausgetauschten
      // Token nutzen, den vault_shared_serve.lua seit dem Stage-A-Fix
      // ebenfalls akzeptiert (siehe project_sys_v2_vision Memory).
      const bearer = (callerToken && callerToken.includes('.')) ? callerToken : entry.token;
      if (!bearer) return errResult(`Kein nutzbarer Token für ${soul_id} vorhanden.`);
      try {
        const base = entry.node_url || BASE_URL;
        const res = await fetch(`${base}/api/vault/shared/${soul_id}/${encodeURIComponent(filename)}`, {
          headers: { Authorization: `Bearer ${bearer}` },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ctype = res.headers.get('content-type') || '';
        if (ctype.startsWith('text/') || ctype.includes('json')) {
          return { content: [{ type: 'text', text: await res.text() }] };
        }
        const buf = Buffer.from(await res.arrayBuffer());
        return { content: [{ type: 'text', text: `Binärdatei (${buf.length} Bytes, ${ctype}) — Direktzugriff nur über den REST-Endpoint möglich.` }] };
      } catch (err) {
        return errResult(`wired_shared_get fehlgeschlagen: ${err.message}`);
      }
    }
  );

  server.tool(
    'wired_soul_read',
    'Liest den vollständigen Soul-Inhalt (sys.md) einer beim Gatekeeper verdrahteten Soul. soul_id aus wire_status.',
    { soul_id: z.string().describe('soul_id der verdrahteten Soul') },
    async ({ soul_id }) => {
      const { token, nodeUrl, error } = lookup(wiredMap, soul_id, 'soul');
      if (error) return errResult(error);
      try {
        const res  = await fetchApi('/api/soul', token, nodeUrl);
        const text = await res.text();
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return errResult(`wired_soul_read fehlgeschlagen: ${err.message}`);
      }
    }
  );

  registerVaultTools(server, wiredMap, 'audio',   'audio',         'audio');
  registerVaultTools(server, wiredMap, 'image',   'images',        'images');
  registerVaultTools(server, wiredMap, 'video',   'video',         'video');
  registerVaultTools(server, wiredMap, 'context', 'context_files', 'context');

  server.tool(
    'wire_status',
    'Listet alle beim Gatekeeper verdrahteten Souls und ihre erlaubten Scopes.',
    {},
    async () => {
      const list = Object.entries(wiredMap).map(([soul_id, e]) => ({
        soul_id,
        name: e.name,
        permissions: Object.keys(e.permissions || {}).filter(k => e.permissions[k]),
        node_url: e.node_url || null,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
    }
  );
}

// Suche über eigene wired Souls PLUS 1 Hop tief über akzeptierte föderierte
// Gatekeeper (siehe Phase 4/3, project_sys_v2_vision Memory) — ergänzt
// wire_status (bleibt unverändert, einfache lokale Liste), ersetzt es nicht.
export function registerWireSearch(server, gatekeeperSoulId, wiredMap, fed) {
  server.tool(
    'wire_search',
    'Durchsucht eigene verdrahtete Souls UND (falls vorhanden) föderierte Gatekeeper nach Namen. Leeres q = alle.',
    { q: z.string().optional().describe('Suchbegriff gegen den Namen — leer für alle') },
    async ({ q } = {}) => {
      const needle = (q || '').toLowerCase();
      const local = Object.entries(wiredMap)
        .filter(([, e]) => !needle || (e.name || '').toLowerCase().includes(needle))
        .map(([soul_id, e]) => ({
          soul_id, name: e.name,
          permissions: Object.keys(e.permissions || {}).filter(k => e.permissions[k]),
          // "via" beschreibt den Suchweg (direkt verdrahtet vs. über Föderation
          // erreicht), nicht den physischen Node — eine cross-node verdrahtete
          // Soul ist trotzdem "local" im Sinne von "direkt bei diesem
          // Gatekeeper verdrahtet". node_url zeigt separat den echten Home-Node.
          node_url: e.node_url || null,
          via: 'local',
        }));

      const federated = Object.entries(fed).filter(([, e]) => e.status === 'accepted');
      const remoteResults = await Promise.all(federated.map(async ([fedSoulId, entry]) => {
        try {
          const url = `${entry.node_url}/mcp/discover/search?gatekeeper_soul_id=${encodeURIComponent(fedSoulId)}&q=${encodeURIComponent(q || '')}`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${entry.outbound_token}` },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return [];
          const data = await res.json();
          const results = Array.isArray(data.results) ? data.results : [];
          return results.map(r => ({ ...r, via: `federated:${fedSoulId}` }));
        } catch {
          return [];
        }
      }));

      const merged = [...local, ...remoteResults.flat()];
      if (!merged.length) {
        return { content: [{ type: 'text', text: needle ? `Keine Treffer für "${q}".` : 'Keine verdrahteten oder föderierten Souls verfügbar.' }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(merged, null, 2) }] };
    }
  );
}
