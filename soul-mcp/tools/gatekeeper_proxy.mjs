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
import { wireKey } from '../lib/wired_souls.mjs';
import { updateSection, checkMessageProtocolViolation } from './soul_write.mjs';

const BASE_URL = process.env.BASE_URL;

// wiredMap: kanonisiert, soul_id-keyed (eine Verbindung je soul_id, zuletzt
// verdrahtete gewinnt — siehe registerConnectionProxyTools in server.mjs).
// wiredRaw: ungekürzt, wireKey()-keyed — nötig um EINE bestimmte physische
// Instanz zu adressieren, falls dieselbe soul_id von mehreren Nodes
// gleichzeitig verdrahtet ist (live aufgetreten: zwei Wires zur selben
// soul_id waren über soul_id allein nicht mehr unterscheidbar). node_url
// optional — ohne Angabe wird wie bisher die kanonische Verbindung genutzt.
function lookup(wiredMap, wiredRaw, soulId, permKey, nodeUrl) {
  let entry;
  if (nodeUrl) {
    const key = nodeUrl === BASE_URL ? soulId : wireKey(soulId, nodeUrl);
    entry = wiredRaw?.[key];
    if (!entry) {
      return { error: `Keine Verbindung zu ${soulId} über node_url "${nodeUrl}" gefunden — siehe wire_status für die tatsächlich vorhandenen node_url-Werte.` };
    }
  } else {
    entry = wiredMap[soulId];
    if (!entry) return { error: `Soul ${soulId} ist bei diesem Gatekeeper nicht verdrahtet.` };
  }
  if (permKey && !entry.permissions?.[permKey]) {
    return { error: `Verdrahteter Token für ${soulId} erlaubt keinen Zugriff auf "${permKey}".` };
  }
  // resolvedNodeUrl: immer ein echter Wert (nie null) für Anzeige/Logging —
  // dieselbe Regel wie überall sonst seit dem node_url-nie-null-Fix.
  return { token: entry.token, nodeUrl: entry.node_url || null, resolvedNodeUrl: entry.node_url || BASE_URL };
}

const NODE_URL_PARAM = z.string().optional().describe(
  'Optional: node_url aus wire_status/wire_search zur Disambiguierung, falls dieselbe soul_id von mehreren Nodes gleichzeitig verdrahtet ist. Ohne Angabe wird die zuletzt verdrahtete Verbindung verwendet.'
);

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

async function putApi(path, token, nodeUrl, body) {
  const base = nodeUrl || BASE_URL;
  const res = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

function errResult(msg) {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

// BETA (wire_scanner): plain substring match, no ReDoS surface (same reasoning
// as useNetworkSearch.js's client-side search) -- returns null when no match
// so callers can filter without needing a separate "found?" check.
function extractSnippet(text, needle, context = 80) {
  const idx = text.toLowerCase().indexOf(needle);
  if (idx === -1) return null;
  const start = Math.max(0, idx - context);
  const end   = Math.min(text.length, idx + needle.length + context);
  const body  = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return (start > 0 ? '…' : '') + body + (end < text.length ? '…' : '');
}

// Trennt Herkunfts-Info (node_url) als eigenen Content-Block von der
// eigentlichen Nutzlast, statt sie in den Dokumenttext hineinzuschreiben —
// eine KI, die z.B. wired_soul_read-Ergebnisse zitiert/weiterverarbeitet,
// bekommt sonst ungewollt eine Metadaten-Zeile im echten sys.md-Inhalt.
function withNodeInfo(nodeUrl, ...blocks) {
  return { content: [{ type: 'text', text: `[node_url: ${nodeUrl}]` }, ...blocks] };
}

// Pro verdrahteter Instanz serialisiert (soul_id@node_url) — verhindert
// Race Conditions bei parallelen wired_soul_write-Aufrufen auf dieselbe
// Verbindung, gleiches Prinzip wie soul_write.mjs' withSoulLock.
const _writeQueues = new Map();
async function withWriteLock(key, fn) {
  const prev = _writeQueues.get(key) ?? Promise.resolve();
  let resolveCurrent;
  const current = new Promise(r => { resolveCurrent = r; });
  _writeQueues.set(key, prev.then(() => current));
  await prev;
  try { return await fn(); } finally { resolveCurrent(); }
}

// "wired_"-Präfix ist bewusst: /mcp/discover registriert für den Gatekeeper-Owner
// zusätzlich dessen eigenes normales Owner-Toolset (soul_read, context_get, ...,
// siehe server.mjs handleMcpDiscover) — ohne Präfix kollidieren die Tool-Namen
// mit den hier generischen, soul_id-parametrisierten Varianten für VERDRAHTETE
// Souls. "wired_context_get" ≠ "context_get" (Gatekeepers eigener Kontext).
function registerVaultTools(server, wiredMap, wiredRaw, kind, permKey, apiSegment) {
  server.tool(
    `wired_${kind}_list`,
    `Listet ${kind}-Dateien einer verdrahteten Soul (siehe wire_status).`,
    { soul_id: z.string().describe('soul_id der verdrahteten Soul'), node_url: NODE_URL_PARAM },
    async ({ soul_id, node_url }) => {
      const { token, nodeUrl, resolvedNodeUrl, error } = lookup(wiredMap, wiredRaw, soul_id, permKey, node_url);
      if (error) return errResult(error);
      try {
        const res = await fetchApi(`/api/vault/${apiSegment}`, token, nodeUrl);
        const data = await res.json();
        return { content: [{ type: 'text', text: JSON.stringify({ node_url: resolvedNodeUrl, ...data }, null, 2) }] };
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
      node_url: NODE_URL_PARAM,
    },
    async ({ soul_id, filename, node_url }) => {
      const { token, nodeUrl, resolvedNodeUrl, error } = lookup(wiredMap, wiredRaw, soul_id, permKey, node_url);
      if (error) return errResult(error);
      try {
        const res  = await fetchApi(`/api/vault/${apiSegment}/${encodeURIComponent(filename)}`, token, nodeUrl);
        const ctype = res.headers.get('content-type') || '';
        if (ctype.startsWith('text/') || ctype.includes('json')) {
          const text = await res.text();
          return withNodeInfo(resolvedNodeUrl, { type: 'text', text });
        }
        const buf = Buffer.from(await res.arrayBuffer());
        return { content: [{ type: 'text', text: `Binärdatei von ${resolvedNodeUrl} (${buf.length} Bytes, ${ctype}) — Direktzugriff nur über den REST-Endpoint möglich.` }] };
      } catch (err) {
        return errResult(`wired_${kind}_get fehlgeschlagen: ${err.message}`);
      }
    }
  );
}

export function registerGatekeeperTools(server, wiredMap, callerToken = null, wiredRaw = wiredMap) {
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
      const resolvedNodeUrl = entry.node_url || BASE_URL;
      try {
        const res = await fetch(`${resolvedNodeUrl}/api/vault/shared/${soul_id}/${encodeURIComponent(filename)}`, {
          headers: { Authorization: `Bearer ${bearer}` },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ctype = res.headers.get('content-type') || '';
        if (ctype.startsWith('text/') || ctype.includes('json')) {
          return withNodeInfo(resolvedNodeUrl, { type: 'text', text: await res.text() });
        }
        const buf = Buffer.from(await res.arrayBuffer());
        return { content: [{ type: 'text', text: `Binärdatei von ${resolvedNodeUrl} (${buf.length} Bytes, ${ctype}) — Direktzugriff nur über den REST-Endpoint möglich.` }] };
      } catch (err) {
        return errResult(`wired_shared_get fehlgeschlagen: ${err.message}`);
      }
    }
  );

  server.tool(
    'wired_soul_read',
    'Liest den vollständigen Soul-Inhalt (sys.md) einer beim Gatekeeper verdrahteten Soul. soul_id aus wire_status. Bei mehreren Verbindungen zur selben soul_id (siehe wire_status) node_url zur Disambiguierung angeben.',
    { soul_id: z.string().describe('soul_id der verdrahteten Soul'), node_url: NODE_URL_PARAM },
    async ({ soul_id, node_url }) => {
      const { token, nodeUrl, resolvedNodeUrl, error } = lookup(wiredMap, wiredRaw, soul_id, 'soul', node_url);
      if (error) return errResult(error);
      try {
        const res  = await fetchApi('/api/soul', token, nodeUrl);
        const text = await res.text();
        return withNodeInfo(resolvedNodeUrl, { type: 'text', text });
      } catch (err) {
        return errResult(`wired_soul_read fehlgeschlagen: ${err.message}`);
      }
    }
  );

  server.tool(
    'wired_soul_write',
    [
      'Schreibt Inhalt permanent in eine sys.md-Sektion einer verdrahteten Soul.',
      'Braucht "soul"-Permission (dieselbe wie wired_soul_read) — ein Token mit',
      'Lesezugriff auf den Soul-Inhalt hat serverseitig (api_context.lua) auch',
      'Schreibzugriff, das gilt hier identisch.',
      'Bei mehreren Verbindungen zur selben soul_id (siehe wire_status) node_url',
      'zur Disambiguierung angeben — sonst geht der Write an die zuletzt',
      'verdrahtete Verbindung.',
      '',
      'NIE für Nachrichten verwenden: "Social Sphere" wird generell abgelehnt —',
      'stattdessen peer_send, das baut den korrekten',
      '<!-- @msg {ISO-ts} {from} {to} {content} -->-Eintrag mit echtem',
      'Server-Zeitstempel. Ein handgetippter "<!-- @msg"-Marker in JEDER',
      'Sektion (auch Agent Sandbox) wird ebenfalls abgelehnt — das hat',
      'wiederholt zu protokollwidrigen Feldern geführt (falsche/geratene',
      'Timestamps, falsche from/to).',
      '',
      'WICHTIG — nie Datum/Uhrzeit raten: falls Inhalt ein Datum/eine Uhrzeit',
      'braucht und die nicht sicher aus verifiziertem Kontext bekannt ist',
      '(z.B. gerade per sys_time abgefragt), nicht schätzen — User fragen oder',
      'weglassen.',
    ].join('\n'),
    {
      soul_id: z.string().describe('soul_id der verdrahteten Soul'),
      section: z.string().min(1).max(200).regex(/^[^\n\r]+$/, 'Section name must not contain line breaks')
        .describe('Name der ## Sektion ohne "##", z.B. "Values & Beliefs"'),
      content: z.string().min(1).max(50000).describe(
        'Markdown-Inhalt. Nie ein Datum/einen Zeitstempel raten — weglassen oder User fragen, falls unsicher.'
      ),
      mode: z.enum(['replace', 'append', 'prepend'])
        .default('replace')
        .describe('replace = Sektion überschreiben | append = ans Ende anhängen | prepend = an den Anfang stellen'),
      node_url: NODE_URL_PARAM,
    },
    async ({ soul_id, section, content, mode, node_url }) => {
      const violation = checkMessageProtocolViolation(section, content);
      if (violation) return errResult(violation);
      const { token, nodeUrl, resolvedNodeUrl, error } = lookup(wiredMap, wiredRaw, soul_id, 'soul', node_url);
      if (error) return errResult(error);
      try {
        return await withWriteLock(`${soul_id}@${resolvedNodeUrl}`, async () => {
          const current = await (await fetchApi('/api/soul', token, nodeUrl)).text();
          const updated = updateSection(current, section, content, mode);
          await putApi('/api/context', token, nodeUrl, { soul_content: updated });
          return { content: [{ type: 'text', text: `Geschrieben bei ${soul_id} (${resolvedNodeUrl}), Sektion "${section}".` }] };
        });
      } catch (err) {
        return errResult(`wired_soul_write fehlgeschlagen: ${err.message}`);
      }
    }
  );

  registerVaultTools(server, wiredMap, wiredRaw, 'audio',   'audio',         'audio');
  registerVaultTools(server, wiredMap, wiredRaw, 'image',   'images',        'images');
  registerVaultTools(server, wiredMap, wiredRaw, 'video',   'video',         'video');
  registerVaultTools(server, wiredMap, wiredRaw, 'context', 'context_files', 'context');

  server.tool(
    'wire_status',
    'Listet alle beim Gatekeeper verdrahteten Souls und ihre erlaubten Scopes.',
    {},
    async () => {
      const list = Object.entries(wiredMap).map(([soul_id, e]) => ({
        soul_id,
        name: e.name,
        permissions: Object.keys(e.permissions || {}).filter(k => e.permissions[k]),
        // Immer der echte Node, nie null — same-node zeigt den eigenen
        // BASE_URL statt eines interpretationsbedürftigen null, damit ein
        // Vergleich zweier node_url-Werte allein schon die Frage beantwortet.
        node_url: e.node_url || BASE_URL,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
    }
  );

  // Target direction (2026-08-02, not yet acted on): wire_scanner stays
  // Gatekeeper-only, unlike wire_search below (planned to become a public AI
  // tool later). Keep it registered here, gated the same way as wire_status/
  // wired_* -- do not relax its auth if/when wire_search's changes.
  server.tool(
    'wire_scanner',
    'BETA: durchsucht den tatsächlichen Inhalt (sys.md + Context-Dateien) aller verdrahteten Souls nach einem Suchbegriff — anders als wire_status/wire_search (nur Namen/Metadaten). Nutzt exakt dieselben Scopes und Tokens wie wired_soul_read/wired_context_get, keine neue Berechtigung. Kann bei vielen verdrahteten Souls mit vielen Context-Dateien langsam sein (noch unoptimiert, kein soul_id-Filter in dieser Version).',
    { q: z.string().min(1).describe('Suchbegriff (Volltextsuche, Groß-/Kleinschreibung egal)') },
    async ({ q }) => {
      const needle  = q.toLowerCase();
      const results = [];

      for (const [soul_id, entry] of Object.entries(wiredMap)) {
        const resolvedNodeUrl = entry.node_url || BASE_URL;
        const perms = entry.permissions || {};

        if (perms.soul) {
          try {
            const text    = await (await fetchApi('/api/soul', entry.token, entry.node_url)).text();
            const snippet = extractSnippet(text, needle);
            if (snippet) results.push({ soul_id, name: entry.name, node_url: resolvedNodeUrl, source: 'sys.md', snippet });
          } catch { /* best-effort — skip this soul's sys.md, don't abort the scan */ }
        }

        if (perms.context_files) {
          try {
            const listData = await (await fetchApi('/api/vault/context', entry.token, entry.node_url)).json();
            const files = Array.isArray(listData.files) ? listData.files : [];
            for (const f of files) {
              const fname = f?.name;
              if (!fname) continue;
              try {
                const fText   = await (await fetchApi(`/api/vault/context/${encodeURIComponent(fname)}`, entry.token, entry.node_url)).text();
                const snippet = extractSnippet(fText, needle);
                if (snippet) results.push({ soul_id, name: entry.name, node_url: resolvedNodeUrl, source: `context:${fname}`, snippet });
              } catch { /* best-effort — skip this file, keep scanning the rest */ }
            }
          } catch { /* best-effort — skip context entirely for this soul */ }
        }
      }

      if (!results.length) {
        return { content: [{ type: 'text', text: `Keine Treffer für "${q}" in verdrahteten Souls.` }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }
  );
}

// Suche über eigene wired Souls PLUS 1 Hop tief über akzeptierte föderierte
// Gatekeeper (siehe Phase 4/3, project_sys_v2_vision Memory) — ergänzt
// wire_status (bleibt unverändert, einfache lokale Liste), ersetzt es nicht.
//
// Target direction (2026-08-02, not yet acted on): wire_search is planned to
// become a public AI tool later -- unlike wire_scanner (content search, see
// registerGatekeeperTools above), which stays Gatekeeper-only. Right now
// it's still gated the same way (registered only in handleMcpDiscover,
// requires the Gatekeeper's own cert/token) -- relaxing that is a deliberate,
// separate decision, not something to do incidentally alongside another fix.
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
          // Gatekeeper verdrahtet". node_url zeigt separat den echten Home-Node,
          // immer als echter Wert (same-node = eigener BASE_URL, nie null).
          node_url: e.node_url || BASE_URL,
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
