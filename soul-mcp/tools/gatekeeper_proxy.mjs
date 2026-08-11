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
import { wireKey, getSelfToken } from '../lib/wired_souls.mjs';
import { updateSection, checkMessageProtocolViolation } from './soul_write.mjs';
import { parseSocialMessages, appendToBlock, buildMsgEntry, SOCIAL_START, SOCIAL_END, AGENT_START, AGENT_END } from '../lib/peer_messages.mjs';
import { loadCtx } from '../lib/vault_fs.mjs';
import { loadFederated } from '../lib/federated_gatekeepers.mjs';
import { withWriteLock, writeLockKey } from '../lib/write_lock.mjs';

const BASE_URL = process.env.BASE_URL;

// wiredMap: kanonisiert, soul_id-keyed (eine Verbindung je soul_id, zuletzt
// verdrahtete gewinnt — siehe registerConnectionProxyTools in server.mjs).
// wiredRaw: ungekürzt, wireKey()-keyed — nötig um EINE bestimmte physische
// Instanz zu adressieren, falls dieselbe soul_id von mehreren Nodes
// gleichzeitig verdrahtet ist (live aufgetreten: zwei Wires zur selben
// soul_id waren über soul_id allein nicht mehr unterscheidbar). node_url
// optional — ohne Angabe wird wie bisher die kanonische Verbindung genutzt.
export function lookup(wiredMap, wiredRaw, soulId, permKey, nodeUrl) {
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

// err.code trägt (falls vorhanden) den maschinenlesbaren Fehlercode der
// Gegenseite (z.B. "target_not_wired" von /mcp/discover/federated/relay/*) —
// resolveCandidates()' Aufrufer nutzt das, um "dieser föderierte Gatekeeper
// kennt die Soul nicht" (nächsten Kandidaten probieren) von einem echten
// Fehler beim tatsächlich richtigen Kandidaten zu unterscheiden.
function apiError(status, data) {
  const err = new Error(data?.message || data?.error || `HTTP ${status}`);
  err.status = status;
  err.code   = data?.error;
  return err;
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
    throw apiError(res.status, err);
  }
  return res;
}

export async function putApi(path, token, nodeUrl, body) {
  const base = nodeUrl || BASE_URL;
  const res = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw apiError(res.status, data);
  }
  return data;
}

// Wie putApi, aber POST und ohne den {ok:true}-Envelope zu erwarten -- /api/beme
// antwortet bei Erfolg direkt mit {response, soul_name, model}, kein "ok"-Feld.
// Deutlich längeres Timeout als fetchApi/putApi (15s): beme.lua ruft serverseitig
// die Anthropic-API mit einem eigenen 60s-Budget auf, das muss hier durchpassen
// (auf beiden Hops bei einem föderierten Relay -- nginx' `location /mcp` erlaubt
// dafür bereits 300s proxy_read_timeout, siehe vhost.conf.template).
export async function postApi(path, token, nodeUrl, body) {
  const base = nodeUrl || BASE_URL;
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(65000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw apiError(res.status, data);
  }
  return data;
}

function errResult(msg) {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

// Ermittelt, WIE eine soul_id für ein wired_*-Tool erreicht wird: entweder
// direkt bei diesem Gatekeeper verdrahtet (wie bisher — ein lokaler Eintrag
// ist immer autoritativ/terminal, unabhängig davon ob der gewünschte Scope
// gewährt wurde, damit eine Soul, die zufällig gleichzeitig lokal UND über
// Föderation erreichbar wäre, nie über den jeweils anderen Weg den lokal
// gesetzten Scope umgeht), oder — nur falls hier überhaupt nicht verdrahtet —
// 1 Hop über jeden akzeptierten föderierten Gatekeeper (dieselbe Reichweite
// wie wire_search/wire_scanner), via dessen /mcp/discover/federated/relay/*.
// node_url-Disambiguierung (mehrere physische Instanzen derselben soul_id)
// ergibt nur lokal Sinn, bleibt dort unverändert.
//
// Rückgabe: Liste von Kandidaten, die der Aufrufer der Reihe nach probiert
// (siehe tryCandidates). Ein Kandidat trägt entweder `error` (terminal) oder
// `token`/`nodeUrl`/`resolvedNodeUrl` + optional `relay`
// ({gatekeeperSoulId, targetSoulId}, gesetzt wenn über Föderation erreicht).
function resolveCandidates(wiredMap, wiredRaw, fed, soulId, permKey, nodeUrl) {
  const localKey   = nodeUrl ? (nodeUrl === BASE_URL ? soulId : wireKey(soulId, nodeUrl)) : null;
  const localKnown = nodeUrl ? Boolean(wiredRaw?.[localKey]) : Boolean(wiredMap[soulId]);
  if (localKnown || nodeUrl) {
    return [{ ...lookup(wiredMap, wiredRaw, soulId, permKey, nodeUrl), relay: null }];
  }
  const partners = Object.entries(fed || {}).filter(([, e]) => e.status === 'accepted');
  if (!partners.length) {
    return [{ error: `Soul ${soulId} ist bei diesem Gatekeeper nicht verdrahtet.` }];
  }
  return partners.map(([fedSoulId, entry]) => ({
    token: entry.outbound_token,
    nodeUrl: entry.node_url,
    resolvedNodeUrl: entry.node_url,
    relay: { gatekeeperSoulId: fedSoulId, targetSoulId: soulId },
  }));
}

// Probiert `candidates` der Reihe nach durch. candidate.error → terminal
// (lokal nicht gefunden/kein Scope/keine Föderation vorhanden), sofort
// abbrechen. Sonst run(candidate) ausführen — wirft die Gegenseite
// "target_not_wired" (dieser föderierte Gatekeeper kennt die Soul selbst
// nicht), wird der nächste Kandidat probiert; jeder andere Fehler ist
// terminal (richtigen Kandidaten gefunden, aber ein echtes Problem, z.B.
// falscher Scope dort oder Ziel-Node nicht erreichbar).
async function tryCandidates(candidates, run) {
  let lastError = null;
  for (const c of candidates) {
    if (c.error) { lastError = c.error; continue; }
    try {
      return await run(c);
    } catch (err) {
      if (c.relay && err.code === 'target_not_wired') { lastError = err.message; continue; }
      throw err;
    }
  }
  throw new Error(lastError || 'nicht erreichbar');
}

function relayQS(relay) {
  return `gatekeeper_soul_id=${encodeURIComponent(relay.gatekeeperSoulId)}&target_soul_id=${encodeURIComponent(relay.targetSoulId)}`;
}
function soulPath(relay) {
  return relay ? `/mcp/discover/federated/relay/soul?${relayQS(relay)}` : '/api/soul';
}
function vaultListPath(relay, apiSegment) {
  return relay ? `/mcp/discover/federated/relay/vault/${apiSegment}?${relayQS(relay)}` : `/api/vault/${apiSegment}`;
}
function vaultGetPath(relay, apiSegment, filename) {
  return relay
    ? `/mcp/discover/federated/relay/vault/${apiSegment}/${encodeURIComponent(filename)}?${relayQS(relay)}`
    : `/api/vault/${apiSegment}/${encodeURIComponent(filename)}`;
}
function sharedPath(relay, soulId, filename) {
  return relay
    ? `/mcp/discover/federated/relay/shared/${encodeURIComponent(filename)}?${relayQS(relay)}`
    : `/api/vault/shared/${encodeURIComponent(soulId)}/${encodeURIComponent(filename)}`;
}
// Lokal: PUT /api/context (wie bisher). Über Föderation: PUT auf den
// Relay-Endpoint des föderierten Gatekeepers, der intern denselben
// /api/context-Call mit SEINEM gespeicherten Token für die Ziel-Soul macht.
async function writeSoulContent(candidate, soulContent) {
  if (candidate.relay) {
    return putApi('/mcp/discover/federated/relay/soul', candidate.token, candidate.nodeUrl, {
      gatekeeper_soul_id: candidate.relay.gatekeeperSoulId,
      target_soul_id: candidate.relay.targetSoulId,
      soul_content: soulContent,
    });
  }
  return putApi('/api/context', candidate.token, candidate.nodeUrl, { soul_content: soulContent });
}

// Wie writeSoulContent: lokal direkt /api/beme, über Föderation der Relay mit
// gatekeeper_soul_id/target_soul_id im selben Body statt in der Query -- /api/beme
// hat ohnehin schon einen JSON-Body, keine zusätzliche Query-String-Konstruktion nötig.
async function bemeChat(candidate, body) {
  if (candidate.relay) {
    return postApi('/mcp/discover/federated/relay/beme', candidate.token, candidate.nodeUrl, {
      gatekeeper_soul_id: candidate.relay.gatekeeperSoulId,
      target_soul_id: candidate.relay.targetSoulId,
      ...body,
    });
  }
  return postApi('/api/beme', candidate.token, candidate.nodeUrl, body);
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

// Gemeinsamer Schreib-Lock (lib/write_lock.mjs) — derselbe wie peer_send.mjs,
// soul_write.mjs, mind_write.mjs, context_write.mjs nutzen, damit Writes auf
// dieselbe Soul sich tatsächlich gegenseitig serialisieren, egal über
// welches Tool sie kommen (siehe Kommentar dort für den Live-Bug, der das
// nötig gemacht hat).
function writeLockKeyFor(soulId, c) {
  return c.relay ? `${soulId}@${c.relay.gatekeeperSoulId}` : writeLockKey(soulId, c.resolvedNodeUrl);
}

// "wired_"-Präfix ist bewusst: /mcp/discover registriert für den Gatekeeper-Owner
// zusätzlich dessen eigenes normales Owner-Toolset (soul_read, context_get, ...,
// siehe server.mjs handleMcpDiscover) — ohne Präfix kollidieren die Tool-Namen
// mit den hier generischen, soul_id-parametrisierten Varianten für VERDRAHTETE
// Souls. "wired_context_get" ≠ "context_get" (Gatekeepers eigener Kontext).
function registerVaultTools(server, wiredMap, wiredRaw, fed, kind, permKey, apiSegment) {
  server.tool(
    `wired_${kind}_list`,
    `Listet ${kind}-Dateien einer verdrahteten oder (1 Hop) über einen föderierten Gatekeeper erreichbaren Soul (siehe wire_status/wire_search).`,
    { soul_id: z.string().describe('soul_id der verdrahteten Soul'), node_url: NODE_URL_PARAM },
    async ({ soul_id, node_url }) => {
      const candidates = resolveCandidates(wiredMap, wiredRaw, fed, soul_id, permKey, node_url);
      try {
        return await tryCandidates(candidates, async (c) => {
          const data = await (await fetchApi(vaultListPath(c.relay, apiSegment), c.token, c.nodeUrl)).json();
          return { content: [{ type: 'text', text: JSON.stringify({ node_url: c.resolvedNodeUrl, ...data }, null, 2) }] };
        });
      } catch (err) {
        return errResult(`wired_${kind}_list fehlgeschlagen: ${err.message}`);
      }
    }
  );

  server.tool(
    `wired_${kind}_get`,
    `Liest eine einzelne ${kind}-Datei einer verdrahteten oder (1 Hop) über einen föderierten Gatekeeper erreichbaren Soul.`,
    {
      soul_id:  z.string().describe('soul_id der verdrahteten Soul'),
      filename: z.string().describe('Dateiname, aus ' + `wired_${kind}_list`),
      node_url: NODE_URL_PARAM,
    },
    async ({ soul_id, filename, node_url }) => {
      const candidates = resolveCandidates(wiredMap, wiredRaw, fed, soul_id, permKey, node_url);
      try {
        return await tryCandidates(candidates, async (c) => {
          const res  = await fetchApi(vaultGetPath(c.relay, apiSegment, filename), c.token, c.nodeUrl);
          const ctype = res.headers.get('content-type') || '';
          if (ctype.startsWith('text/') || ctype.includes('json')) {
            const text = await res.text();
            return withNodeInfo(c.resolvedNodeUrl, { type: 'text', text });
          }
          const buf = Buffer.from(await res.arrayBuffer());
          return { content: [{ type: 'text', text: `Binärdatei von ${c.resolvedNodeUrl} (${buf.length} Bytes, ${ctype}) — Direktzugriff nur über den REST-Endpoint möglich.` }] };
        });
      } catch (err) {
        return errResult(`wired_${kind}_get fehlgeschlagen: ${err.message}`);
      }
    }
  );
}

// Löst @peer-Empfänger im Gatekeeper-Kontext auf: alle anderen hier
// verdrahteten Souls (Geschwister) PLUS jede Soul, die über einen
// akzeptierten föderierten Partner erreichbar ist — dieselbe Reichweite wie
// wire_search/resolveGatekeeperPeers, hier für Nachrichtenversand statt
// Auflistung. excludeSoulId ist die Soul, die selbst gerade sendet (soll
// sich nicht selbst als Empfänger vorschlagen).
async function resolveGatekeeperRecipients(wiredMap, fed, excludeSoulId) {
  const candidates = Object.values(wiredMap)
    .filter(e => e.soul_id !== excludeSoulId)
    .map(e => ({ soul_id: e.soul_id, alias: e.name }));

  const federated = Object.entries(fed || {}).filter(([, e]) => e.status === 'accepted');
  await Promise.all(federated.map(async ([fedSoulId, entry]) => {
    try {
      const url = `${entry.node_url}/mcp/discover/search?gatekeeper_soul_id=${encodeURIComponent(fedSoulId)}&q=`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${entry.outbound_token}` }, signal: AbortSignal.timeout(8000) });
      const data = await res.json().catch(() => null);
      const results = Array.isArray(data?.results) ? data.results : [];
      for (const p of results) {
        if (p.soul_id !== excludeSoulId) candidates.push({ soul_id: p.soul_id, alias: p.name });
      }
    } catch { /* föderierter Partner nicht erreichbar — andere Kandidaten trotzdem nutzbar */ }
  }));

  return candidates;
}

export function registerGatekeeperTools(server, wiredMap, callerToken = null, wiredRaw = wiredMap, fed = {}, gatekeeperSoulId = null) {
  server.tool(
    'wired_shared_get',
    'Lädt eine Datei aus vault_shared einer verdrahteten/verbundenen Soul (z.B. ein Dateianhang aus peer_send/peer_inbox).',
    {
      soul_id:  z.string().describe('soul_id der verdrahteten/verbundenen Soul'),
      filename: z.string().describe('Dateiname in deren vault_shared'),
    },
    async ({ soul_id, filename }) => {
      const candidates = resolveCandidates(wiredMap, wiredRaw, fed, soul_id, null, null);
      try {
        return await tryCandidates(candidates, async (c) => {
          // Self-Cert-Session: eigenen Cert cross-node an die Ziel-Soul schicken
          // (dort verifiziert) — nur sinnvoll bei direktem Wiring, ein föderierter
          // Gatekeeper-Node kennt unseren Owner-Cert nicht. Sonst: den beim
          // Wire/Connect (lokal) bzw. bei der Föderation (relay) ausgetauschten
          // Token nutzen.
          const bearer = (!c.relay && callerToken && callerToken.includes('.')) ? callerToken : c.token;
          if (!bearer) throw Object.assign(new Error(`Kein nutzbarer Token für ${soul_id} vorhanden.`), { code: 'no_token' });
          const res = await fetchApi(sharedPath(c.relay, soul_id, filename), bearer, c.nodeUrl);
          const ctype = res.headers.get('content-type') || '';
          if (ctype.startsWith('text/') || ctype.includes('json')) {
            return withNodeInfo(c.resolvedNodeUrl, { type: 'text', text: await res.text() });
          }
          const buf = Buffer.from(await res.arrayBuffer());
          return { content: [{ type: 'text', text: `Binärdatei von ${c.resolvedNodeUrl} (${buf.length} Bytes, ${ctype}) — Direktzugriff nur über den REST-Endpoint möglich.` }] };
        });
      } catch (err) {
        return errResult(`wired_shared_get fehlgeschlagen: ${err.message}`);
      }
    }
  );

  server.tool(
    'wired_soul_read',
    'Liest den vollständigen Soul-Inhalt (sys.md) einer verdrahteten oder (1 Hop) über einen föderierten Gatekeeper erreichbaren Soul. soul_id aus wire_status/wire_search. Bei mehreren Verbindungen zur selben soul_id (siehe wire_status) node_url zur Disambiguierung angeben.',
    { soul_id: z.string().describe('soul_id der verdrahteten Soul'), node_url: NODE_URL_PARAM },
    async ({ soul_id, node_url }) => {
      const candidates = resolveCandidates(wiredMap, wiredRaw, fed, soul_id, 'soul', node_url);
      try {
        return await tryCandidates(candidates, async (c) => {
          const text = await (await fetchApi(soulPath(c.relay), c.token, c.nodeUrl)).text();
          return withNodeInfo(c.resolvedNodeUrl, { type: 'text', text });
        });
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
      const candidates = resolveCandidates(wiredMap, wiredRaw, fed, soul_id, 'soul', node_url);
      try {
        return await tryCandidates(candidates, async (c) => {
          return await withWriteLock(writeLockKeyFor(soul_id, c), async () => {
            const current = await (await fetchApi(soulPath(c.relay), c.token, c.nodeUrl)).text();
            const updated = updateSection(current, section, content, mode);
            await writeSoulContent(c, updated);
            const via = c.relay ? `, über föderierten Gatekeeper ${c.relay.gatekeeperSoulId}` : '';
            return { content: [{ type: 'text', text: `Geschrieben bei ${soul_id} (${c.resolvedNodeUrl}${via}), Sektion "${section}".` }] };
          });
        });
      } catch (err) {
        return errResult(`wired_soul_write fehlgeschlagen: ${err.message}`);
      }
    }
  );

  server.tool(
    'wired_beme_chat',
    [
      'Gespräch mit einer verdrahteten oder (1 Hop) über einen föderierten Gatekeeper',
      'erreichbaren Soul — die AI antwortet als DIESE Soul selbst, in erster Person,',
      'ohne sich als KI zu erkennen zu geben. Braucht "soul"-Permission (dieselbe wie',
      'wired_soul_read/write).',
      '',
      'Nutzt das eigene Anthropic-Setup der Ziel-Soul (deren konfigurierter API-Key',
      'und Modell), nicht das des Aufrufers -- Kosten fallen bei der Ziel-Soul an,',
      'genau wie bei ihrem eigenen beme_chat.',
      '',
      'history enthält bisherige Gesprächszüge (user/assistant), max_tokens begrenzt',
      'die Antwortlänge (default 1024, max 4096). Kann bei langen Antworten mehrere',
      'Sekunden dauern (Anthropic-Aufruf serverseitig bei der Ziel-Soul).',
    ].join('\n'),
    {
      soul_id: z.string().describe('soul_id der verdrahteten Soul'),
      message: z.string().min(1).max(8000).describe('Die Nachricht an die Soul'),
      history: z.array(
        z.object({
          role:    z.enum(['user', 'assistant']),
          content: z.string().max(8000),
        })
      ).max(20).optional().describe('Bisheriger Gesprächsverlauf (optional)'),
      max_tokens: z.number().int().min(64).max(4096).optional()
        .describe('Maximale Antwortlänge in Tokens (default 1024)'),
      node_url: NODE_URL_PARAM,
    },
    async ({ soul_id, message, history, max_tokens, node_url }) => {
      const candidates = resolveCandidates(wiredMap, wiredRaw, fed, soul_id, 'soul', node_url);
      try {
        return await tryCandidates(candidates, async (c) => {
          const data = await bemeChat(c, { message, history: history ?? [], max_tokens: max_tokens ?? 1024 });
          const speaker = data.soul_name || 'Soul';
          return withNodeInfo(c.resolvedNodeUrl, { type: 'text', text: `**${speaker}:** ${data.response}` });
        });
      } catch (err) {
        return errResult(`wired_beme_chat fehlgeschlagen: ${err.message}`);
      }
    }
  );

  server.tool(
    'wired_peer_send',
    [
      'Sendet eine @peer-Textnachricht im Namen EINER VERDRAHTETEN Soul, nicht',
      'im eigenen Namen des Gatekeepers — für den Bündel-Betrieb, bei dem',
      'mehrere Souls über einen einzigen Gatekeeper-Connector laufen und eine',
      'davon als Absender auftreten soll, nicht der Gatekeeper selbst.',
      'Beispiel: "sende von KRO eine Nachricht an Medienkommunikator: Hallo" →',
      'soul_id=<KROs soul_id>, to="Medienkommunikator", message="Hallo".',
    ].join('\n'),
    {
      soul_id: z.string().describe('soul_id der verdrahteten Soul, die als Absender auftritt'),
      to: z.string().min(1).max(200).describe('Empfänger: Peer-Name oder soul_id, "alle" für alle Peers, "community", "agent"'),
      message: z.string().min(1).max(5000).describe('Nachrichtentext'),
      node_url: NODE_URL_PARAM,
    },
    async ({ soul_id, to, message, node_url }) => {
      const candidates = resolveCandidates(wiredMap, wiredRaw, fed, soul_id, 'soul', node_url);
      try {
        return await tryCandidates(candidates, async (c) => {
          return await withWriteLock(writeLockKeyFor(soul_id, c), async () => {
            const toNorm = to.trim().toLowerCase();
            let toField;
            if (['alle', 'all', 'peer', 'peers'].includes(toNorm)) {
              toField = 'peer';
            } else if (toNorm === 'community') {
              toField = 'community';
            } else if (toNorm === 'agent') {
              toField = 'agent';
            } else {
              const recipCandidates = await resolveGatekeeperRecipients(wiredMap, fed, soul_id);
              const match = recipCandidates.find(({ soul_id: id, alias }) =>
                (alias || '').toLowerCase() === toNorm ||
                (alias || '').toLowerCase().startsWith(toNorm) ||
                id.toLowerCase().startsWith(toNorm)
              );
              if (!match) {
                const available = recipCandidates.map(x => x.alias).filter(Boolean).join(', ') || '(keine)';
                return errResult(`Peer "${to}" nicht gefunden.\nVerfügbare Peers: ${available}`);
              }
              toField = match.soul_id;
            }

            const fullMsg = message.trim();
            if (!fullMsg) return errResult('Leere Nachricht.');
            const ts = new Date().toISOString();
            const entryStr = buildMsgEntry(ts, 'me', toField, fullMsg);

            const current = await (await fetchApi(soulPath(c.relay), c.token, c.nodeUrl)).text();
            let updated = appendToBlock(current, SOCIAL_START, SOCIAL_END, entryStr);
            if (toField === 'agent' || toField === 'community') {
              updated = appendToBlock(updated, AGENT_START, AGENT_END, entryStr);
            }
            await writeSoulContent(c, updated);

            const recipientLabel =
              toField === 'peer'        ? 'alle Peers'
              : toField === 'community' ? 'Community'
              : toField === 'agent'     ? 'Agent-Sandbox'
              : `Peer ${to} (soul_id: ${toField})`;
            return { content: [{ type: 'text', text: `Gesendet von ${soul_id} an ${recipientLabel}.\n[${ts}] ${soul_id} → ${recipientLabel}\n${fullMsg}` }] };
          });
        });
      } catch (err) {
        return errResult(`wired_peer_send fehlgeschlagen: ${err.message}`);
      }
    }
  );

  server.tool(
    'wired_peer_inbox',
    [
      'Liest @peer-Textnachrichten im Namen EINER VERDRAHTETEN Soul, nicht des',
      'Gatekeepers selbst — das Gegenstück zu wired_peer_send für den',
      'gebündelten Mehrere-Souls-Betrieb.',
    ].join('\n'),
    {
      soul_id: z.string().describe('soul_id der verdrahteten Soul, deren Inbox gelesen wird'),
      days:   z.number().int().min(1).max(30).default(1).optional().describe('Nachrichten der letzten N Tage (default 1, max 30)'),
      from:   z.string().max(100).optional().describe('Nur Nachrichten von diesem Peer'),
      search: z.string().max(200).optional().describe('Volltextsuche im Nachrichteninhalt'),
      limit:  z.number().int().min(1).max(100).default(50).optional().describe('Maximale Anzahl Nachrichten (default 50)'),
      node_url: NODE_URL_PARAM,
    },
    async ({ soul_id, days = 1, from, search, limit = 50, node_url }) => {
      const candidates = resolveCandidates(wiredMap, wiredRaw, fed, soul_id, 'soul', node_url);
      try {
        return await tryCandidates(candidates, async (c) => {
          const allMsgs = [];

          // Eigene ausgehende Nachrichten dieser verdrahteten Soul.
          try {
            const ownMd = await (await fetchApi(soulPath(c.relay), c.token, c.nodeUrl)).text();
            for (const m of parseSocialMessages(ownMd)) {
              if (m.from === 'me') allMsgs.push({ ...m, outgoing: true, peer: null, from_label: null });
            }
          } catch { /* eigene sys.md nicht lesbar — Rest trotzdem versuchen */ }

          // Geschwister-Souls + Gatekeeper-eigene Broadcasts + föderierte
          // Partner — nur sinnvoll, wenn soul_id LOKAL bei diesem Gatekeeper
          // verdrahtet ist (c.relay gesetzt hieße: soul_id ist selbst nur
          // über Föderation erreicht, dann hat dieser Aufruf keine Tokens
          // für DEREN Netzwerk, nur für die Ziel-Soul selbst).
          if (!c.relay) {
            const candidateIds = [soul_id];
            await Promise.all(Object.values(wiredMap).map(async (entry) => {
              if (entry.soul_id === soul_id || !entry.permissions?.soul) return;
              try {
                const upstream = await fetchApi('/api/soul', entry.token, entry.node_url);
                const md = await upstream.text();
                const label = entry.name || entry.soul_id.slice(0, 8);
                for (const m of parseSocialMessages(md)) {
                  if (m.to === 'peer' || m.to === soul_id) {
                    allMsgs.push({ ...m, outgoing: false, peer: label, from_label: label });
                  }
                }
              } catch { /* Geschwister-Spoke nicht erreichbar — andere trotzdem versuchen */ }
            }));

            if (gatekeeperSoulId && gatekeeperSoulId !== soul_id) {
              try {
                const selfToken = await getSelfToken(gatekeeperSoulId);
                if (selfToken) {
                  const upstream = await fetchApi('/api/soul', selfToken, BASE_URL);
                  const md = await upstream.text();
                  const gkCtx = await loadCtx(gatekeeperSoulId).catch(() => null);
                  const label = gkCtx?.name || gatekeeperSoulId.slice(0, 8);
                  for (const m of parseSocialMessages(md)) {
                    if (m.from === 'me' && (m.to === 'peer' || m.to === soul_id)) {
                      allMsgs.push({ ...m, outgoing: false, peer: label, from_label: label });
                    }
                  }
                }
              } catch { /* Self-Token fehlt oder Gatekeeper-eigene sys.md nicht lesbar */ }

              const fedList = Object.entries(await loadFederated(gatekeeperSoulId)).filter(([, e]) => e.status === 'accepted');
              await Promise.all(fedList.map(async ([fedSoulId, entry]) => {
                try {
                  const url = `${entry.node_url}/mcp/discover/federated/relay/peer-outbox?gatekeeper_soul_id=${encodeURIComponent(fedSoulId)}&candidate_ids=${encodeURIComponent(candidateIds.join(','))}`;
                  const res = await fetch(url, { headers: { Authorization: `Bearer ${entry.outbound_token}` }, signal: AbortSignal.timeout(8000) });
                  const data = await res.json().catch(() => null);
                  if (data?.ok) {
                    for (const m of data.messages) {
                      allMsgs.push({ ...m, outgoing: false, peer: m.from_label, from_label: m.from_label });
                    }
                  }
                } catch { /* föderierter Partner nicht erreichbar — andere Quellen trotzdem versuchen */ }
              }));
            }
          }

          allMsgs.sort((a, b) => new Date(a.ts) - new Date(b.ts));

          const DAY_MS = 86400000;
          const cutoff = Date.now() - days * DAY_MS;
          let msgs = allMsgs.filter(m => new Date(m.ts).getTime() >= cutoff);
          const peerList = [...new Set(allMsgs.map(m => m.peer).filter(Boolean))].join(', ') || '(keine)';

          if (!msgs.length) {
            return { content: [{ type: 'text', text: `Keine Nachrichten der letzten ${days} Tag(e) für ${soul_id}.\nPeers: ${peerList}` }] };
          }
          if (from) {
            const q = from.toLowerCase();
            msgs = msgs.filter(m => m.peer?.toLowerCase().includes(q) || m.from_label?.toLowerCase().includes(q));
          }
          if (search) {
            const q = search.toLowerCase();
            msgs = msgs.filter(m => m.content?.toLowerCase().includes(q));
          }
          if (msgs.length > limit) msgs = msgs.slice(-limit);
          if (!msgs.length) {
            const desc = [from && `von "${from}"`, search && `mit "${search}"`].filter(Boolean).join(' ');
            return { content: [{ type: 'text', text: `Keine Nachrichten ${desc} (letzte ${days} Tage) für ${soul_id}.\nPeers: ${peerList}` }] };
          }

          const filterParts = [`letzte ${days} Tag(e)`, from && `von "${from}"`, search && `Suche: "${search}"`].filter(Boolean).join(' · ');
          const lines = [`${msgs.length} Nachricht(en) für ${soul_id} · ${filterParts}`, `Peers: ${peerList}`, ''];
          for (const m of msgs) {
            const date = m.ts ? m.ts.replace('T', ' ').slice(0, 16) + ' UTC' : '???';
            const direction = m.outgoing
              ? `${soul_id} → ${m.to === 'peer' ? 'alle' : m.to === 'community' ? 'Community' : m.to === 'agent' ? 'Agent' : (m.to ?? '').slice(0, 8)}`
              : (m.from_label || m.peer || '?');
            lines.push(`[${date}] ${direction}`, m.content ?? '', '');
          }
          return withNodeInfo(c.resolvedNodeUrl, { type: 'text', text: lines.join('\n') });
        });
      } catch (err) {
        return errResult(`wired_peer_inbox fehlgeschlagen: ${err.message}`);
      }
    }
  );

  registerVaultTools(server, wiredMap, wiredRaw, fed, 'audio',   'audio',         'audio');
  registerVaultTools(server, wiredMap, wiredRaw, fed, 'image',   'images',        'images');
  registerVaultTools(server, wiredMap, wiredRaw, fed, 'video',   'video',         'video');
  registerVaultTools(server, wiredMap, wiredRaw, fed, 'context', 'context_files', 'context');

  server.tool(
    'wire_status',
    'Listet alle DIREKT bei diesem Gatekeeper verdrahteten Souls und ihre erlaubten Scopes (nicht die föderiert erreichbaren — dafür wire_search, das lokale UND 1 Hop tief föderiert erreichbare Souls zusammen zeigt; alle wired_*-Tools funktionieren für beide Wege identisch).',
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

  // Target direction (2026-08-02): wire_scanner stays Gatekeeper-only (who may
  // CALL it), unlike wire_search below (planned to become a public AI tool
  // later) -- do not relax its auth if/when wire_search's changes. Its REACH
  // was separately extended the same day to also cover 1-hop federated
  // souls (see resolveCandidates), same principle as every other wired_*
  // tool -- that's an orthogonal axis (who may call it, vs. how far it sees).
  server.tool(
    'wire_scanner',
    'BETA: durchsucht den tatsächlichen Inhalt (sys.md + Context-Dateien) aller verdrahteten UND (1 Hop) über akzeptierte föderierte Gatekeeper erreichbaren Souls nach einem Suchbegriff — anders als wire_status/wire_search (nur Namen/Metadaten). Nutzt exakt dieselben Scopes und Tokens wie wired_soul_read/wired_context_get (föderiert: über den jeweiligen Gatekeeper-Relay), keine neue Berechtigung. Kann bei vielen Souls mit vielen Context-Dateien langsam sein (noch unoptimiert, kein soul_id-Filter in dieser Version).',
    { q: z.string().min(1).describe('Suchbegriff (Volltextsuche, Groß-/Kleinschreibung egal)') },
    async ({ q }) => {
      const needle  = q.toLowerCase();
      const results = [];

      async function scanSoul(soul_id, name, resolvedNodeUrl, perms, token, nodeUrl, relay) {
        const via = relay ? `federated:${relay.gatekeeperSoulId}` : 'local';
        if (perms.soul) {
          try {
            const text    = await (await fetchApi(soulPath(relay), token, nodeUrl)).text();
            const snippet = extractSnippet(text, needle);
            if (snippet) results.push({ soul_id, name, node_url: resolvedNodeUrl, source: 'sys.md', snippet, via });
          } catch { /* best-effort — skip this soul's sys.md, don't abort the scan */ }
        }

        if (perms.context_files) {
          try {
            const listData = await (await fetchApi(vaultListPath(relay, 'context'), token, nodeUrl)).json();
            const files = Array.isArray(listData.files) ? listData.files : [];
            for (const f of files) {
              const fname = f?.name;
              if (!fname) continue;
              try {
                const fText   = await (await fetchApi(vaultGetPath(relay, 'context', fname), token, nodeUrl)).text();
                const snippet = extractSnippet(fText, needle);
                if (snippet) results.push({ soul_id, name, node_url: resolvedNodeUrl, source: `context:${fname}`, snippet, via });
              } catch { /* best-effort — skip this file, keep scanning the rest */ }
            }
          } catch { /* best-effort — skip context entirely for this soul */ }
        }
      }

      for (const [soul_id, entry] of Object.entries(wiredMap)) {
        await scanSoul(soul_id, entry.name, entry.node_url || BASE_URL, entry.permissions || {}, entry.token, entry.node_url, null);
      }

      // 1 Hop über jeden akzeptierten föderierten Gatekeeper — dessen eigene
      // wired Souls per /mcp/discover/search auflisten (Namen+Scopes, kein
      // Content), dann jede über den Relay genauso scannen wie lokal.
      const partners = Object.entries(fed || {}).filter(([, e]) => e.status === 'accepted');
      for (const [fedSoulId, fedEntry] of partners) {
        let remoteWired = [];
        try {
          const url = `${fedEntry.node_url}/mcp/discover/search?gatekeeper_soul_id=${encodeURIComponent(fedSoulId)}`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${fedEntry.outbound_token}` },
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) {
            const data = await res.json();
            remoteWired = Array.isArray(data.results) ? data.results : [];
          }
        } catch { /* best-effort — skip this federated gatekeeper entirely */ }

        for (const r of remoteWired) {
          const perms = Object.fromEntries((r.permissions || []).map(p => [p, true]));
          const relay = { gatekeeperSoulId: fedSoulId, targetSoulId: r.soul_id };
          await scanSoul(r.soul_id, r.name, r.node_url, perms, fedEntry.outbound_token, fedEntry.node_url, relay);
        }
      }

      if (!results.length) {
        return { content: [{ type: 'text', text: `Keine Treffer für "${q}" in verdrahteten oder föderiert erreichbaren Souls.` }] };
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
