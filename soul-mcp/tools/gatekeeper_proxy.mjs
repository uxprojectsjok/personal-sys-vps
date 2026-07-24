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
  return { token: entry.token };
}

async function fetchApi(path, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
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
      const { token, error } = lookup(wiredMap, soul_id, permKey);
      if (error) return errResult(error);
      try {
        const res = await fetchApi(`/api/vault/${apiSegment}`, token);
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
      const { token, error } = lookup(wiredMap, soul_id, permKey);
      if (error) return errResult(error);
      try {
        const res  = await fetchApi(`/api/vault/${apiSegment}/${encodeURIComponent(filename)}`, token);
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

export function registerGatekeeperTools(server, wiredMap) {
  server.tool(
    'wired_soul_read',
    'Liest den vollständigen Soul-Inhalt (sys.md) einer beim Gatekeeper verdrahteten Soul. soul_id aus wire_status.',
    { soul_id: z.string().describe('soul_id der verdrahteten Soul') },
    async ({ soul_id }) => {
      const { token, error } = lookup(wiredMap, soul_id, 'soul');
      if (error) return errResult(error);
      try {
        const res  = await fetchApi('/api/soul', token);
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
      }));
      return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
    }
  );
}
