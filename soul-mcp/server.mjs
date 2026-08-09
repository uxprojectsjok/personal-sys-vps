/**
 * soul-mcp – MCP Server für SaveYourSoul
 *
 * Exponiert Soul-Daten als MCP-Tools für Claude.ai und Claude Desktop.
 * Kommuniziert ausschliesslich via HTTP mit SaveYourSoul API.
 * Kein gemeinsamer Code mit dem SaveYourSoul-Projekt.
 *
 * Endpunkte:
 *   POST /mcp                              – MCP Streamable HTTP (Haupt-Endpunkt)
 *   GET  /.well-known/oauth-authorization-server – OAuth Discovery
 *   GET  /oauth/authorize                  – Consent-Seite
 *   POST /oauth/authorize                  – Cert validieren + Code ausstellen
 *   POST /oauth/token                      – Code → Access Token
 */

import 'dotenv/config';
import { readFile, readdir, mkdir, stat, writeFile, unlink } from 'fs/promises';
import { randomUUID, randomBytes } from 'crypto';
import path from 'node:path';
import { spawn } from 'child_process';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const webpush  = _require('web-push');
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools, registerPaidTools, registerPeerTools, registerTrustRequestTools, registerWiredApps } from './tools/index.mjs';
import { registerSoulApps } from './tools/soul_apps.mjs';
import { loadConnected, saveConnected, createConnectionToken, revokeConnectionToken } from './lib/connected_souls.mjs';
import { loadWired, saveWired, loadWiredTo, saveWiredTo, checkOwnServiceToken, isGatekeeperEnabled, setGatekeeperEnabled, wireKey, loadAcceptedWired } from './lib/wired_souls.mjs';
import { loadFederated, saveFederated, authenticateFederatedCaller } from './lib/federated_gatekeepers.mjs';
import { registerGatekeeperTools, registerWireSearch, fetchApi, putApi, postApi } from './tools/gatekeeper_proxy.mjs';
import { registerPrompts } from './prompts/index.mjs';
import { oauthRouter } from './oauth.mjs';
import { loadCtx } from './lib/vault_fs.mjs';
import { runSoulDraw, formatSoulDrawSummary } from './tools/soul_draw.mjs';
import { register as registerSoulDiscoverLocal } from './tools/soul_discover_local.mjs';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { VerifyError, SettleError } from '@x402/core/types';
import { listVaultSharedFs, formatVaultSharedList } from './tools/vault_shared_list.mjs';
import {
  buildTermsPreviewPdf, buildTermsPreviewTxt,
  buildInvoicePdf, buildInvoiceTxt,
  buildWithdrawalNoticePdf, buildWithdrawalNoticeTxt,
  buildWaiverPdf, buildWaiverTxt,
  legalTextForChat, nextInvoiceNumber, sweepExpiredConsentTxt, consentPurchaseDir,
} from './lib/eu_withdrawal_terms.mjs';
import { computeDynamicUsdcPrice } from './lib/dynamic_pricing.mjs';
import {
  getListing as getSoulTransferListing,
  setListing as setSoulTransferListing,
  deactivateListing as deactivateSoulTransferListing,
  getActiveChallenge as getSoulTransferActiveChallenge,
  getChallenge as getSoulTransferChallenge,
  createChallenge as createSoulTransferChallenge,
  confirmationMessage as soulTransferConfirmationMessage,
  submitSignature as submitSoulTransferSignature,
  submitPayment as submitSoulTransferPayment,
  markCompleted as markSoulTransferCompleted,
  cancelChallenge as cancelSoulTransferChallenge,
  getOnChainOwner as getSoulTransferOnChainOwner,
} from './lib/soul_transfer.mjs';
import {
  getStatus as getX402AgentStatus,
  savePrivateKey as saveX402AgentKey,
  loadAccount as loadX402AgentAccount,
} from './lib/x402_agent_wallet.mjs';
import { getBalances as getX402AgentBalances, payX402 as payX402AsAgent } from './lib/x402_client.mjs';

// Hardening: a rejected promise anywhere in the process (observed cause: ethers'
// WebSocketProvider in soul_indexer.mjs internally rejecting on an RPC error —
// e.g. the public Polygon RPC's rate limit during eth_subscribe) crashes the
// entire service under Node's default unhandledRejection behavior, taking down
// every MCP tool (not just the blockchain indexer) until systemd restarts it.
// Log and keep running instead — the specific subscriber already has its own
// reconnect/backoff logic for the failures it knows how to recover from.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason?.message || reason);
});

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('BASE_URL is not set. Add it to your .env file.');

// EU withdrawal-rights consent flow — off by default, opt-in via init.sh
// ("Set up EU consumer rights?") / EU_CONSUMER_RIGHTS in soul-mcp/.env.
const EU_CONSUMER_RIGHTS = process.env.EU_CONSUMER_RIGHTS === 'true';

// ── CORS ──────────────────────────────────────────────────────────────────
// Claude.ai und Claude Desktop rufen den MCP-Server von deren Backend aus auf.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const SCOPES = ['soul', 'audio', 'images', 'video', 'context', 'network'];

// ── OAuth Discovery (RFC 8414) ────────────────────────────────────────────
app.get('/.well-known/oauth-authorization-server', (_req, res) => {
  res.json({
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/oauth/authorize`,
    token_endpoint: `${BASE_URL}/oauth/token`,
    registration_endpoint: `${BASE_URL}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: SCOPES,
    token_endpoint_auth_methods_supported: ['none'],
  });
});

// ── Protected Resource Metadata (RFC 8707) – Claude.ai nutzt diesen Endpoint ──
// Liest Zahlungsinfos aus api_context.json für die 401-Antwort
async function loadPaymentHint(soulId) {
  try {
    let id = soulId;
    if (!id) {
      const dirs = await readdir(SOULS_DIR).catch(() => []);
      id = dirs.find(d => /^[a-f0-9-]{36}$/i.test(d)) ?? null;
    }
    if (!id) return null;
    const raw = await readFile(`${SOULS_DIR}${id}/api_context.json`, 'utf8');
    const ctx = JSON.parse(raw);
    const a = ctx.amortization;
    if (!a?.enabled) return null;
    const base    = parseFloat(a.price_usdc) || 0;
    const dynamic = a.dynamic_pricing === true;
    let usdcCurrent = base;
    if (dynamic) {
      // Gleiche Formel wie soul_price.lua
      const ANCHOR_COEFF = 0.1, AGE_COEFF = 0.01, DEMAND_COEFF = 0.05;
      let anchorCount = 0, chainAgeDays = 0, buyers30d = 0;
      try {
        const ahRaw = await readFile(`${SOULS_DIR}${id}/anchor_history.json`, 'utf8');
        const hist = JSON.parse(ahRaw);
        if (Array.isArray(hist)) {
          anchorCount = hist.length;
          if (hist[0]?.ts) {
            const genesis = new Date(hist[0].ts).getTime();
            if (!isNaN(genesis)) chainAgeDays = (Date.now() - genesis) / 86_400_000;
          }
        }
      } catch { /* keine anchor_history → base */ }
      try {
        const dlRaw  = await readFile(`${SOULS_DIR}${id}/demand_log.json`, 'utf8');
        const dlog   = JSON.parse(dlRaw);
        const cutoff = Date.now() / 1000 - 30 * 86400;
        if (Array.isArray(dlog)) buyers30d = dlog.filter(e => (e.ts || 0) > cutoff).length;
      } catch { /* kein demand_log → 0 */ }
      if (anchorCount > 0 || buyers30d > 0) {
        const mult = 1 + anchorCount * ANCHOR_COEFF + chainAgeDays * AGE_COEFF + buyers30d * DEMAND_COEFF;
        usdcCurrent = Math.max(base, Math.round(base * mult * 1000000) / 1000000);
      }
    }
    return {
      price_usdc:      a.price_usdc ?? '0',
      usdc_current:    usdcCurrent.toFixed(6),
      dynamic_pricing: dynamic,
      // Bei aktivem EU_CONSUMER_RIGHTS erst nach Zustimmung nennen (siehe soul_preview.lua) —
      // dieser Hint erscheint sonst schon in der 401-Antwort auf einen nicht-authentifizierten
      // /mcp-Zugriff, also VOR jeder Consent-Interaktion.
      wallet:          EU_CONSUMER_RIGHTS ? '' : (a.wallet ?? ''),
      consent_required: EU_CONSUMER_RIGHTS,
      pay_endpoint:    `${BASE_URL}/api/soul/pay/x402`,
      price_endpoint:  `${BASE_URL}/api/soul/price`,
    };
  } catch { return null; }
}

// Sowohl /mcp-Variante als auch Basis-URL werden abgefragt
app.get('/.well-known/oauth-protected-resource', async (req, res) => {
  const hint = await loadPaymentHint(req.query.soul_id ?? null);
  res.json({
    resource: `${BASE_URL}/mcp`,
    authorization_servers: [BASE_URL],
    scopes_supported: SCOPES,
    bearer_methods_supported: ['header'],
    ...(hint ? { x_payment: hint } : {}),
  });
});
app.get('/.well-known/oauth-protected-resource/mcp', async (req, res) => {
  const hint = await loadPaymentHint(req.query.soul_id ?? null);
  res.json({
    resource: `${BASE_URL}/mcp`,
    authorization_servers: [BASE_URL],
    scopes_supported: SCOPES,
    bearer_methods_supported: ['header'],
    ...(hint ? { x_payment: hint } : {}),
  });
});
app.get('/.well-known/oauth-protected-resource/mcp/discover', async (req, res) => {
  const hint = await loadPaymentHint(req.query.soul_id ?? null);
  res.json({
    resource: `${BASE_URL}/mcp/discover`,
    authorization_servers: [BASE_URL],
    scopes_supported: SCOPES,
    bearer_methods_supported: ['header'],
    ...(hint ? { x_payment: hint } : {}),
  });
});

// ── OAuth ─────────────────────────────────────────────────────────────────
app.use('/oauth', oauthRouter);

// ── MCP Streamable HTTP ───────────────────────────────────────────────────

async function unauthorized(res, soulId, resourceMetadataPath = '/.well-known/oauth-protected-resource') {
  res.setHeader(
    'WWW-Authenticate',
    `Bearer resource_metadata="${BASE_URL}${resourceMetadataPath}"`
  );
  const hint = await loadPaymentHint(soulId ?? null);
  const priceNote = hint
    ? (hint.dynamic_pricing ? hint.usdc_current + ' USDC (dynamic, call ' + hint.price_endpoint + ' for live quote)' : hint.price_usdc + ' USDC')
    : null;
  const message = !hint
    ? 'Authorization required.'
    : hint.consent_required
    ? `Payment required (${priceNote}). This soul enforces EU withdrawal-rights consent before revealing a payment target — call POST /api/soul/terms/show first (or show_withdrawal_terms if you already hold an MCP session for this node).`
    : `Payment required. Pay ${priceNote} to wallet ${hint.wallet} via the x402 protocol at ${hint.pay_endpoint} (402 challenge -> signed EIP-3009 retry) to receive an access token.`;
  return res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message, ...(hint ? { payment: hint } : {}) },
    id: null,
  });
}

// Wird beim MCP-Handshake (initialize) an den Client übergeben — anders als
// server.prompt() (muss der Client explizit aufrufen) landet das laut MCP-Spec
// automatisch im Kontext der KI, direkt beim Verbinden, bevor irgendein Tool
// aufgerufen wird. Nur für Owner-Tokens relevant (verified-Gate sitzt in
// vault_auth.lua, gilt nicht für paid/peer-Tokens).
const OWNER_INSTRUCTIONS = [
  'At the start of a new conversation, call soul_read first.',
  'If the result says verification is required (mentions verify_identity),',
  'call verify_identity immediately and do not attempt any other tool until',
  'it reports verified=true. This is a one-time confirmation per connection —',
  'once verified, proceed normally without repeating it.',
  'Never guess or estimate a date/timestamp for a permanent write (soul_write,',
  'mind_write, or any other tool) from conversational context — that produces',
  'wrong dates. Tools that need a timestamp generate it themselves server-side',
  '(session_end, peer_send, mind_write on Self-Reflection); for anything else',
  'that would need one, ask the user rather than estimating.',
].join(' ');

// Registriert die wired_*-Proxy-Tools (gatekeeper_proxy.mjs) für EINE Soul,
// basierend auf connected_souls.json (direkte Soul-zu-Soul-Verbindungen) —
// registerGatekeeperTools() vergibt feste Tool-Namen (wired_soul_read, ...)
// und darf pro Verbindung nur EINMAL aufgerufen werden, sonst wirft die SDK
// wegen doppeltem Tool-Namen. Jede Soul mit akzeptierten Verbindungen bekommt
// automatisch Lesezugriff auf sie.
async function registerConnectionProxyTools(server, soulId, callerToken = null) {
  // Gatekeeper-Funktion global ausgeschaltet → bereits verdrahtete Souls
  // bleiben in wired_souls.json gespeichert, werden aber nicht mehr als
  // Tools angeboten. connected_souls.json (direkte Soul-Verbindungen) ist
  // ein separates Feature und bleibt vom Schalter unberührt.
  const gkEnabled = await isGatekeeperEnabled(soulId);
  // wired_souls.json kann pro soul_id mehrere Einträge haben (verschiedene
  // physische Node-Instanzen derselben Identität, siehe wireKey()) — die
  // KI-Tools hier sind aber pro soul_id parametrisiert und kennen kein "von
  // welchem Node", also auf eine kanonische Verbindung je soul_id reduzieren
  // (zuletzt verdrahtete gewinnt). Die volle, ungekürzte Liste bleibt in
  // GET /mcp/discover/wired für die Settings-UI erhalten.
  const wiredAll = gkEnabled ? await loadWired(soulId) : {};
  // acceptedRaw: gefiltert (accepted-only), aber NICHT kanonisiert — behält
  // jede physische Instanz unter ihrem eigenen wireKey()-Schlüssel, damit
  // gatekeeper_proxy.mjs' Tools per optionalem node_url-Parameter gezielt
  // EINE von mehreren Verbindungen zur selben soul_id ansprechen können
  // (live aufgetreten: zwei Wires zur selben soul_id waren über soul_id
  // allein nicht mehr unterscheidbar). wired: kanonisiert für den
  // Standardfall ohne node_url-Angabe (zuletzt verdrahtete gewinnt).
  const acceptedRaw = {};
  const wired = {};
  for (const [key, entry] of Object.entries(wiredAll)) {
    // Cross-node-Wires warten auf Owner-Bestätigung (siehe POST /mcp/discover/
    // wire) — erst nach Accept KI-seitig nutzbar. Altbestand ohne status-Feld
    // gilt als bereits akzeptiert.
    if (entry.status && entry.status !== 'accepted') continue;
    const sid = entry.soul_id || key.split('@')[0];
    const normalized = { ...entry, soul_id: sid };
    acceptedRaw[key] = normalized;
    if (!wired[sid] || entry.wired_at > wired[sid].wired_at) wired[sid] = normalized;
  }
  const connectedAll = await loadConnected(soulId);
  const connected = Object.fromEntries(
    Object.entries(connectedAll)
      .filter(([, e]) => e.status === 'accepted')
      // connected_souls.json nutzt "outbound_token" (das WIR präsentieren,
      // wenn WIR die Gegenseite abfragen) — gatekeeper_proxy.mjs' lookup()
      // erwartet einheitlich "token".
      .map(([remoteId, e]) => [remoteId, { ...e, token: e.outbound_token }])
  );
  // wired_souls.json (dieses Feature) und connected_souls.json (Stage-A
  // Soul-zu-Soul-Verbindungen) sind zwei unabhängige Systeme, die für
  // dieselbe soul_id gleichzeitig einen Eintrag haben können — ein blindes
  // {...wired, ...connected} ließe "connected" immer gewinnen, unabhängig
  // davon welche Verbindung tatsächlich neuer/aktiver ist (live so
  // aufgetreten: ein wired_soul_write landete über die ältere connected-
  // Verbindung auf dem falschen Node). Stattdessen: die jeweils zuletzt
  // hergestellte/akzeptierte Verbindung gewinnt, gleiches Prinzip wie bei
  // mehreren wired-Instanzen derselben soul_id.
  function mergeByRecency(wiredSource, connectedSource) {
    const out = { ...wiredSource };
    for (const [sid, entry] of Object.entries(connectedSource)) {
      const existingTs = out[sid]?.wired_at || out[sid]?.accepted_at || 0;
      const newTs       = entry.accepted_at || entry.requested_at || 0;
      if (!out[sid] || newTs > existingTs) out[sid] = entry;
    }
    return out;
  }
  const merged    = mergeByRecency(wired, connected);
  const mergedRaw = mergeByRecency(acceptedRaw, connected);
  // Föderierte Gatekeeper (federated_gatekeepers.json) erweitern die
  // Reichweite der wired_*-Tools um deren eigene wired Souls (1 Hop, siehe
  // resolveCandidates() in gatekeeper_proxy.mjs) — geladen für JEDE Soul,
  // nicht nur "echte" Gatekeeper, exakt wie wired/connected oben; für Souls
  // ohne eigene Föderationen ist die Datei einfach leer, keine
  // Sonderbehandlung nötig.
  const fed = await loadFederated(soulId);
  // gkEnabled allein reicht schon: "ich bin Gatekeeper" ist eine bewusste
  // Einstellung dieser Soul, kein Live-Zustand, der davon abhängt, ob gerade
  // irgendwer verdrahtet ist — die Tools (wire_status etc.) müssen sichtbar
  // sein, sobald der Schalter an ist, auch mit leerer wired_souls.json (z.B.
  // direkt nach dem ersten Einschalten, oder nachdem Aus die letzte
  // Verbindung beendet hat). connected_souls.json bleibt zusätzlich sein
  // eigenes, vom Schalter unabhängiges Feature (siehe Kommentar oben).
  if (gkEnabled || Object.keys(merged).length > 0 || Object.keys(fed).length > 0) {
    registerGatekeeperTools(server, merged, callerToken, mergedRaw, fed);
  }
  return { wired, connected, fed };
}

async function handleMcp(req, res) {
  const token = extractToken(req);
  const soulIdParam = req.query.soul_id ?? null;
  if (!token) return unauthorized(res, soulIdParam);

  // Token-Typ erkennen:
  //   service_token → "{64hex}"        — OAuth-Inhaber, voller Zugang
  //   pol_access    → "{48hex}"        — bezahlter externer Agent, nur agent_tools
  //   peer_cert     → "{uuid}.{32hex}" — whitelisted Soul, alle Tools
  const isPaidToken = /^[0-9a-f]{48}$/i.test(token) && !token.includes('.');
  const isPeerToken = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{32}$/i.test(token);

  const server = new McpServer(
    { name: 'soul-mcp', version: '1.0.0' },
    (!isPaidToken && !isPeerToken) ? { instructions: OWNER_INSTRUCTIONS } : undefined
  );

  if (isPaidToken) {
    // pol_access_token validieren + agent_tools laden
    const paid = await validatePolToken(token);
    if (!paid.ok) {
      const hint = await loadPaymentHint(soulIdParam);
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`);
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: paid.error || 'pol_access_token ungültig oder abgelaufen. Neue Zahlung erforderlich.', ...(hint ? { payment: hint } : {}) },
        id: null,
      });
    }
    registerPaidTools(server, token, paid.agent_tools || [], paid.soul_id);
  } else if (isPeerToken) {
    // Peer-Soul-Cert — prüfen ob soul_id in trusted_souls der Ziel-Soul
    const peerSoulId   = token.split('.')[0];
    const peerCert     = token.split('.')[1];
    const targetSoulId = req.query.soul_id || null;

    // Owner-Check ZUERST: {uuid}.{32hex} ist auch das Format des Owner-Soul-Certs
    // (dokumentierter MCP-Verbindungsweg, siehe dev-docs "3 · MCP-Client: Soul-Cert
    // + Soul-ID" — Alternative zum service_token). Ohne diesen Check würde sich ein
    // Owner mit dem eigenen soul_id.cert fälschlich als ungetrusteter Peer verbinden
    // und nur request_trust/-status statt vollem Zugang (inkl. beme_chat) bekommen —
    // kryptografisch gültiger Cert für peerSoulId beweist Eigentümerschaft für GENAU
    // diese soul_id, ganz ohne einen zusätzlichen Abgleich gegen eine unabhängig
    // aufgelöste "erwartete" soul_id (frühere Version verlangte das zusätzlich über
    // ownerCandidateId = ?soul_id= || resolveSingleSoulId() — auf einem Multi-Hoster
    // ohne ?soul_id= lieferte resolveSingleSoulId() bei >1 Soul immer null, wodurch
    // ein technisch gültiger Self-Cert nie erkannt wurde und die Verbindung mit
    // "Multi-Hoster: ?soul_id= Parameter erforderlich" scheiterte, obwohl der Cert
    // die soul_id längst eindeutig trägt und beweist — live so aufgetreten).
    const isSelfCert = await verifyPeerCert(peerSoulId, peerCert, null);

    if (isSelfCert) {
      registerTools(server, token, peerSoulId);
      await registerSoulApps(server, peerSoulId);
      await registerConnectionProxyTools(server, peerSoulId, token);
    } else {
      const trusted = await checkTrustedSoul(peerSoulId, peerCert, targetSoulId);
      if (trusted?.error === 'soul_id_required') {
        res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`);
        return res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Multi-Hoster: ?soul_id= Parameter erforderlich (z.B. /mcp?soul_id=<ziel-soul-id>).' },
          id: null,
        });
      }
      if (trusted && !trusted.error) {
        // Ziel-soul_id auflösen (wird für Filesystem-Reads in registerPeerTools benötigt)
        registerPeerTools(server, token, [], trusted.soul_id);
      } else {
        // Nicht (mehr) in der Whitelist — trotzdem prüfen ob der Cert kryptografisch
        // zur eigenen soul_id passt. Falls ja: nur request_trust/-status freigeben,
        // damit sich Fremde für die Aufnahme in trusted_souls bewerben können,
        // statt komplett abgewiesen zu werden.
        const resolvedTargetId = targetSoulId || await resolveSingleSoulId();
        const certOk = resolvedTargetId && await verifyPeerCert(peerSoulId, peerCert, null);
        if (resolvedTargetId && certOk) {
          registerTrustRequestTools(server, peerSoulId, resolvedTargetId, PORT);
        } else {
          res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`);
          return res.status(401).json({
            jsonrpc: '2.0',
            error: { code: -32001, message: 'Cert ungültig oder Soul unbekannt.' },
            id: null,
          });
        }
      }
    }
  } else {
    // Plain Service-Token: eindeutig per Reverse-Lookup zuordnen, bevor auf
    // ?soul_id= oder die Single-Soul-Heuristik zurückgefallen wird.
    let ownerSoulId = await findSoulByServiceToken(token);
    const dirs     = ownerSoulId ? null : await readdir(SOULS_DIR).catch(() => []);
    const soulDirs = dirs ? dirs.filter(d => /^[a-f0-9-]{36}$/i.test(d)) : null;
    if (ownerSoulId) {
      // RFC 8707 Resource Indicator: ein per /oauth/authorize mit resource=
      // ausgestellter Token ist an GENAU einen Endpunkt gebunden (/mcp oder
      // /mcp/discover) — verhindert, dass ein für /mcp autorisierter Token
      // (z.B. schmal für eine einzelne Drittintegration gedacht) auch an
      // /mcp/discover repliziert werden kann und dort plötzlich Zugriff auf
      // alle gewirten/verbundenen Souls bekommt. Ungebundene Tokens (kein
      // resource-Feld — z.B. manuell in Settings→API erzeugte) bleiben wie
      // bisher an beiden Endpunkten gültig.
      const boundResource = await getServiceTokenResource(ownerSoulId, token);
      if (boundResource && boundResource !== `${BASE_URL}/mcp`) {
        res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`);
        return res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Token ist an eine andere Resource gebunden (RFC 8707) — für /mcp neu autorisieren.' },
          id: null,
        });
      }
    } else if (soulIdParam && soulDirs.includes(soulIdParam)) {
      ownerSoulId = soulIdParam;
    } else if (soulDirs.length === 1) {
      ownerSoulId = soulDirs[0];
    } else if (soulDirs.length > 1) {
      // Multi-Hoster mit >1 Soul und keinem/ungültigem ?soul_id= — dieselbe
      // Ambiguität wie im Peer-Cert-Zweig oben, dieselbe Fehlermeldung statt
      // stillschweigend die (alphabetisch) erste Soul zu liefern.
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`);
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Multi-Hoster: ?soul_id= Parameter erforderlich (z.B. /mcp?soul_id=<ziel-soul-id>).' },
        id: null,
      });
    } else {
      ownerSoulId = null;
    }
    registerTools(server, token, ownerSoulId);
    if (ownerSoulId) {
      await registerSoulApps(server, ownerSoulId);
      await registerConnectionProxyTools(server, ownerSoulId, token);
    }
  }

  registerPrompts(server);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  res.on('close', async () => {
    try { await transport.close(); await server.close(); } catch { /* cleanup */ }
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[MCP] Request-Fehler:', err.message);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Interner Fehler.' },
        id: null,
      });
    }
  }
}

app.get('/mcp',    handleMcp);
app.post('/mcp',   handleMcp);
app.delete('/mcp', handleMcp);

// Bundled connector endpoint: authenticates the caller (self-cert or service
// token, same formats as /mcp) and registers soul_discover_local (node
// directory) PLUS, if the caller is a Gatekeeper soul, its own full owner
// toolset (soul_read/write, chat, mind, ...) PLUS the generic soul_id-
// parametrised proxy tools for every soul wired/connected/federated to it —
// a single connector (this endpoint + the caller's cert/OAuth token) for the
// Gatekeeper's own tools, the node directory, and every soul it bundles.
const DISCOVER_RESOURCE_PATH = '/.well-known/oauth-protected-resource/mcp/discover';

async function handleMcpDiscover(req, res) {
  const token = extractToken(req);
  const soulIdParam = req.query.soul_id ?? null;
  if (!token) return unauthorized(res, soulIdParam, DISCOVER_RESOURCE_PATH);

  let gkSoulId = null;

  if (token.includes('.')) {
    // Self-cert Format ({soul_id}.{cert}) — direkter curl/Wire-Zugriff mit
    // dem eigenen Soul-Cert, keine ?soul_id= nötig, steckt schon im Token.
    const [certSoulId, gkCert] = token.split('.');
    if (certSoulId && gkCert && await verifyPeerCert(certSoulId, gkCert, null)) {
      gkSoulId = certSoulId;
    } else {
      return unauthorized(res, soulIdParam, DISCOVER_RESOURCE_PATH);
    }
  } else {
    // Plain Service-Token (aus dem OAuth-Flow, z.B. Claude.ai-Connector) —
    // trägt keine soul_id, wird aber eindeutig per Reverse-Lookup zugeordnet
    // (der Token lebt in genau einer Soul's authorized_services.json); Fallback
    // auf ?soul_id=/Single-Soul-Heuristik nur falls der Lookup nichts findet.
    // Die eigentliche Token-Prüfung passiert lazily pro Tool-Aufruf über den
    // bestehenden vault_auth-Pfad.
    gkSoulId = await findSoulByServiceToken(token);
    if (gkSoulId) {
      // RFC 8707 — Gegenstück zum Check in handleMcp(): ein für /mcp
      // ausgestellter Token darf nicht an /mcp/discover repliziert werden
      // und dort das gebündelte Gatekeeper-Toolset freischalten.
      const boundResource = await getServiceTokenResource(gkSoulId, token);
      if (boundResource && boundResource !== `${BASE_URL}/mcp/discover`) {
        return unauthorized(res, soulIdParam, DISCOVER_RESOURCE_PATH);
      }
    }
    if (!gkSoulId) {
      const dirs     = await readdir(SOULS_DIR).catch(() => []);
      const soulDirs = dirs.filter(d => /^[a-f0-9-]{36}$/i.test(d));
      if (soulIdParam && soulDirs.includes(soulIdParam)) {
        gkSoulId = soulIdParam;
      } else if (soulDirs.length === 1) {
        gkSoulId = soulDirs[0];
      } else if (soulDirs.length > 1) {
        res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${BASE_URL}${DISCOVER_RESOURCE_PATH}"`);
        return res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Multi-Hoster: ?soul_id= Parameter erforderlich (z.B. /mcp/discover?soul_id=<ziel-soul-id>).' },
          id: null,
        });
      } else {
        return unauthorized(res, soulIdParam, DISCOVER_RESOURCE_PATH);
      }
    }
  }

  const server = new McpServer({ name: 'soul-mcp-discover', version: '1.0.0' });
  registerSoulDiscoverLocal(server);

  // A Gatekeeper soul is a full soul with its own mind.md/context — expose its
  // normal owner toolset (soul_read, beme_chat, context_get, mind_read, ...) too,
  // not just the wired-souls proxy, so it can actually reason over its own
  // configuration instead of being a dumb router.
  registerTools(server, token, gkSoulId);
  await registerSoulApps(server, gkSoulId);
  const { wired, fed } = await registerConnectionProxyTools(server, gkSoulId, token);
  if (Object.keys(wired).length > 0) {
    await registerWiredApps(server, wired);
  }
  if (Object.keys(wired).length > 0 || Object.keys(fed).length > 0) {
    registerWireSearch(server, gkSoulId, wired, fed);
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  res.on('close', async () => {
    try { await transport.close(); await server.close(); } catch { /* cleanup */ }
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[MCP Discover] Request-Fehler:', err.message);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Interner Fehler.' },
        id: null,
      });
    }
  }
}

app.get('/mcp/discover',  handleMcpDiscover);
app.post('/mcp/discover', handleMcpDiscover);

// ── Gatekeeper-Wiring (Soul → Gatekeeper, asymmetrisch, scope-begrenzt) ───────
// Verknüpft eine Soul mit einer anderen (der faktischen Gatekeeper-Soul):
// der Aufrufer beweist per eigenem Soul-Cert seine Identität und legt einen
// selbst erzeugten Service-Token vor (Settings→Services) — beides zusammen
// ist der Owner-Konsens. Funktioniert unabhängig vom Hosting-Modus dieses
// Nodes — jede Soul kann sich bei einem (ggf. entfernten) Gatekeeper
// einklinken, auch auf einem Single-Hoster-Node.
function parseOwnCertBearer(req) {
  const token = extractToken(req);
  if (!token || !token.includes('.')) return null;
  const [soulId, cert] = token.split('.');
  if (!soulId || !cert) return null;
  return { soulId, cert };
}

// Liest soul_name direkt aus /api/soul (lokal oder cross-node), mit dem
// bereits verifizierten eigenen Cert als Bearer. Best effort — liefert null
// statt zu werfen, der Aufrufer fällt dann auf den alten Namen zurück.
async function getCallerSoulName(soulId, cert, nodeUrl) {
  try {
    const base = nodeUrl || BASE_URL;
    const res = await fetch(`${base}/api/soul`, {
      headers: { Authorization: `Bearer ${soulId}.${cert}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const m = text.match(/soul_name:\s*(.+)/);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

// Löscht den wired_to.json-Eintrag der wired Soul für gatekeeperSoulId — damit
// eine Trennung auf BEIDEN Seiten als beendet gilt, nicht nur beim Gatekeeper
// selbst. Same-node: direkter Dateisystemzugriff. Cross-node: authentifizierter
// Server-zu-Server-Callback (Gegenstück: POST /mcp/discover/wired-to/remove
// unten) — gatekeeperCert ist der gerade LIVE vom Owner präsentierte Cert
// (aus derselben Anfrage, die die Trennung ausgelöst hat); der Server selbst
// hält keinen eigenen Cert vor und kann nicht autonom "als" die Gatekeeper-
// Soul auftreten (gleiches Prinzip wie beim Föderations-Handshake). Best
// effort im Cross-Node-Fall — ist die Gegenseite gerade nicht erreichbar,
// blockiert das nicht das eigene Trennen; wired_to.json ist ohnehin rein
// informativ, die echte Zugriffskontrolle steht in wired_souls.json.
async function notifyWiredToRemoval(gatekeeperSoulId, gatekeeperCert, wiredSoulId, wiredSoulNodeUrl) {
  if (wiredSoulNodeUrl) {
    try {
      await fetch(`${wiredSoulNodeUrl}/mcp/discover/wired-to/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gatekeeper_soul_id: gatekeeperSoulId,
          soul_id: wiredSoulId,
          cert: gatekeeperCert,
          node_url: BASE_URL,
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch { /* best effort — Gegenseite evtl. offline */ }
  } else {
    const wiredTo = await loadWiredTo(wiredSoulId);
    delete wiredTo[gatekeeperSoulId];
    await saveWiredTo(wiredSoulId, wiredTo);
  }
}

app.post('/mcp/discover/wire', async (req, res) => {
  const parsed = parseOwnCertBearer(req);
  if (!parsed) return res.status(401).json({ error: 'soul_cert_required' });
  const { soulId: callerSoulId, cert } = parsed;

  // node_url gesetzt = Cross-Node-Wiring: die wirende Soul lebt auf einem
  // anderen Node als dieser Gatekeeper. Cert- und Token-Nachweis laufen dann
  // per HTTP gegen den Home-Node der Soul statt lokalem Dateisystem-Read.
  const { gatekeeper_soul_id, service_token, name, node_url } = req.body || {};
  const callerNodeUrl = typeof node_url === 'string' && node_url.trim() ? node_url.trim().replace(/\/$/, '') : null;

  if (!(await verifyPeerCert(callerSoulId, cert, callerNodeUrl))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }

  if (!gatekeeper_soul_id || !service_token) {
    return res.status(400).json({ error: 'gatekeeper_soul_id und service_token erforderlich' });
  }
  if (gatekeeper_soul_id === callerSoulId && !callerNodeUrl) {
    return res.status(400).json({ error: 'self_wire_not_allowed', message: 'gatekeeper_soul_id darf nicht die eigene soul_id sein.' });
  }
  // gatekeeper_soul_id ist immer lokal — der Wire-Request geht immer AN den
  // Node des Gatekeepers, nur die wirende Soul (callerSoulId) kann fremd sein.
  const gkExists = await stat(`${SOULS_DIR}${gatekeeper_soul_id}`).then(s => s.isDirectory()).catch(() => false);
  if (!gkExists) {
    return res.status(404).json({ error: 'gatekeeper_soul_not_found', message: `Keine Soul mit ID "${gatekeeper_soul_id}" auf diesem Node.` });
  }
  if (!(await isGatekeeperEnabled(gatekeeper_soul_id))) {
    return res.status(403).json({ error: 'gatekeeper_disabled', message: 'Diese Soul hat die Gatekeeper-Funktion deaktiviert und nimmt aktuell keine neuen Wire-Anfragen an.' });
  }

  const svc = await checkOwnServiceToken(callerSoulId, service_token, callerNodeUrl);
  if (!svc) {
    return res.status(400).json({ error: 'service_token unbekannt — muss ein selbst erzeugter Token (Settings→Services) dieser Soul sein.' });
  }

  // Angezeigter Name: die tatsächliche soul_name der wirenden Soul, nicht der
  // (oft zweckbeschreibende) Name ihres Service-Tokens — der Gatekeeper soll
  // sehen WER sich verbindet, nicht WOFÜR die wirende Soul ihren Token
  // benannt hat. cert ist an dieser Stelle bereits via verifyPeerCert
  // geprüft, dieselbe Bearer-Form ist also legitim.
  const realSoulName = await getCallerSoulName(callerSoulId, cert, callerNodeUrl);

  // Same-node: Owner kontrolliert ohnehin jede Soul auf dem eigenen Node
  // direkt (Dateisystem, andere Admin-Wege) — sofort aktiv, wie bisher.
  // Cross-node: eine fremde Soul auf einem fremden Node könnte sich sonst
  // ohne jedes Zutun des Gatekeeper-Owners selbst einwirten — braucht eine
  // bewusste Bestätigung, analog zum Föderations-Accept-Flow.
  const isCrossNode = !!callerNodeUrl;
  const now = Math.floor(Date.now() / 1000);
  const wired = await loadWired(gatekeeper_soul_id);
  wired[wireKey(callerSoulId, callerNodeUrl)] = {
    soul_id: callerSoulId,
    token: service_token,
    permissions: svc.permissions,
    name: realSoulName || name || svc.name || callerSoulId,
    node_url: callerNodeUrl || undefined,
    wired_at: now,
    status: isCrossNode ? 'pending' : 'accepted',
    ...(isCrossNode ? {} : { accepted_at: now }),
  };
  await saveWired(gatekeeper_soul_id, wired);

  // Umgekehrter Eintrag auf der eigenen Soul — rein informativ, damit die
  // Settings-UI dieser Soul selbst anzeigen kann "mit X verbunden", ohne dass
  // man dafür in die (fremde) Gatekeeper-Soul wechseln müsste. Bei Cross-Node-
  // Wiring lebt callerSoulId auf einem ANDEREN Node als dieser Handler — kann
  // von hier aus gar nicht geschrieben werden (kein Dateisystemzugriff auf
  // fremde Nodes), also bewusst ausgelassen statt eines Fake-Best-Effort-Calls.
  if (!callerNodeUrl) {
    const wiredTo = await loadWiredTo(callerSoulId);
    wiredTo[gatekeeper_soul_id] = { wired_at: now, status: 'accepted', accepted_at: now };
    await saveWiredTo(callerSoulId, wiredTo);
  }

  res.json({ ok: true, gatekeeper_soul_id, soul_id: callerSoulId, permissions: svc.permissions, status: isCrossNode ? 'pending' : 'accepted' });
});

// Browser-seitiges Cross-Node-Wiring würde einen direkten fetch() auf ein
// fremdes Origin brauchen — verletzt die strikte connect-src-CSP
// (vhost.conf.template, 'self' + eine feste Allowlist bekannter Drittanbieter,
// niemals fremde SYS-Nodes, die es beliebig viele geben kann und die auf
// beliebigen Domains laufen). Deshalb läuft der eigentliche Cross-Node-Request
// hier server-seitig, exakt wie schon bei notifyWiredToRemoval()/Föderation:
// der Browser ruft nur die eigene Origin auf, der Server macht den echten
// Fetch zum fremden Gatekeeper-Node. Nebeneffekt, der eine bestehende Lücke
// schließt: anders als der reine /mcp/discover/wire-Handler (der bei Cross-
// Node-Aufrufen keinen Dateisystemzugriff auf die eigene Soul hat, weil der
// Request vom FREMDEN Node kommt) läuft dieser Handler hier auf dem eigenen
// Node der wirenden Soul — wired_to.json kann also auch im Cross-Node-Fall
// direkt geschrieben werden, statt wie bisher ganz auszufallen.
app.post('/mcp/discover/wire-out', async (req, res) => {
  const parsed = parseOwnCertBearer(req);
  if (!parsed) return res.status(401).json({ error: 'soul_cert_required' });
  if (!(await verifyPeerCert(parsed.soulId, parsed.cert, null))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }
  const { gatekeeper_soul_id, service_token, name, gatekeeper_node_url } = req.body || {};
  if (!gatekeeper_soul_id || !service_token || !gatekeeper_node_url) {
    return res.status(400).json({ error: 'gatekeeper_soul_id, service_token und gatekeeper_node_url erforderlich' });
  }
  const target = gatekeeper_node_url.trim().replace(/\/$/, '');

  let data;
  try {
    const fres = await fetch(`${target}/mcp/discover/wire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${parsed.soulId}.${parsed.cert}` },
      body: JSON.stringify({ gatekeeper_soul_id, service_token, name, node_url: BASE_URL }),
      signal: AbortSignal.timeout(10000),
    });
    data = await fres.json().catch(() => ({}));
    if (!fres.ok) return res.status(fres.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'gatekeeper_unreachable', message: err.message });
  }

  const wiredTo = await loadWiredTo(parsed.soulId);
  // wire-out ist per Definition immer cross-node — der Gatekeeper muss die
  // Anfrage erst bestätigen (siehe /mcp/discover/wire/:soul_id/accept),
  // bevor der Status hier (per Callback über /mcp/discover/wire/confirm)
  // auf accepted springt.
  wiredTo[gatekeeper_soul_id] = { wired_at: Math.floor(Date.now() / 1000), node_url: target, status: data.status || 'pending' };
  await saveWiredTo(parsed.soulId, wiredTo);

  res.json(data);
});

// Owner-Sicht auf die eigene wired_souls.json (Settings-UI "Wired Souls"-Tabelle).
app.get('/mcp/discover/wired', async (req, res) => {
  const parsed = parseOwnCertBearer(req);
  if (!parsed) return res.status(401).json({ error: 'soul_cert_required' });
  if (!(await verifyPeerCert(parsed.soulId, parsed.cert, null))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }
  const wired = await loadWired(parsed.soulId);
  // Volle Liste, nicht auf eine Verbindung je soul_id kanonisiert (anders als
  // registerConnectionProxyTools() für die KI-Tools) — dieselbe soul_id kann
  // hier mehrfach auftauchen, je einmal pro physischer Node-Instanz.
  const list = Object.entries(wired).map(([key, e]) => ({
    // Immer der echte Node, nie null — same-node zeigt den eigenen BASE_URL
    // statt eines interpretationsbedürftigen null.
    soul_id: e.soul_id || key.split('@')[0], name: e.name, permissions: e.permissions, wired_at: e.wired_at, node_url: e.node_url || BASE_URL,
    // Altbestand ohne status-Feld (vor diesem Feature) gilt als bereits
    // akzeptiert — sonst würden bestehende, aktiv genutzte Verbindungen
    // plötzlich als "wartet auf Bestätigung" erscheinen.
    status: e.status || 'accepted',
  }));
  res.json({ wired: list });
});

// Owner bestätigt eine ausstehende Cross-Node-Wire-Anfrage (same-node ist
// bereits bei der Anfrage selbst automatisch akzeptiert, siehe POST
// /mcp/discover/wire). node_url disambiguiert wie bei DELETE .../wire/:soul_id.
app.post('/mcp/discover/wire/:soul_id/accept', async (req, res) => {
  const parsed = parseOwnCertBearer(req);
  if (!parsed) return res.status(401).json({ error: 'soul_cert_required' });
  if (!(await verifyPeerCert(parsed.soulId, parsed.cert, null))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }
  const nodeUrlParam = typeof req.query.node_url === 'string' && req.query.node_url.trim()
    ? req.query.node_url.trim().replace(/\/$/, '')
    : null;
  const wired = await loadWired(parsed.soulId);
  const key   = wireKey(req.params.soul_id, nodeUrlParam);
  const entry = wired[key];
  if (!entry || entry.status !== 'pending') {
    return res.status(404).json({ error: 'no_pending_request' });
  }
  entry.status = 'accepted';
  entry.accepted_at = Math.floor(Date.now() / 1000);
  await saveWired(parsed.soulId, wired);

  // Best effort: die wirende Soul benachrichtigen, damit ihre eigene
  // wired_to.json ebenfalls auf accepted springt — analog zu
  // /mcp/discover/federated/:id/confirm. Schlägt das fehl, bleibt unsere
  // Seite trotzdem accepted; die Gegenseite zeigt bis zu einem erneuten
  // Abgleich weiterhin "pending" an, kein Rollback.
  if (entry.node_url) {
    try {
      await fetch(`${entry.node_url}/mcp/discover/wire/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gatekeeper_soul_id: parsed.soulId, soul_id: req.params.soul_id, cert: parsed.cert, node_url: BASE_URL }),
        signal: AbortSignal.timeout(8000),
      });
    } catch { /* best effort */ }
  }

  res.json({ ok: true, status: 'accepted' });
});

// Empfängt die Bestätigung einer zuvor gestellten Wire-Anfrage (server-to-
// server, wie /mcp/discover/federated/:id/confirm) — Gegenstück zum Callback
// oben.
app.post('/mcp/discover/wire/confirm', async (req, res) => {
  const { gatekeeper_soul_id, soul_id, cert, node_url } = req.body || {};
  if (!gatekeeper_soul_id || !soul_id || !cert || !node_url) {
    return res.status(400).json({ error: 'gatekeeper_soul_id, soul_id, cert und node_url erforderlich' });
  }
  const wiredTo = await loadWiredTo(soul_id);
  const entry = wiredTo[gatekeeper_soul_id];
  // Nur bestätigen was wir selbst angefragt hatten, gegen den node_url den
  // WIR gespeichert haben — verhindert dass eine fremde Partei von woanders
  // eine Bestätigung vortäuscht.
  if (!entry || entry.status !== 'pending' || entry.node_url !== node_url.replace(/\/$/, '')) {
    return res.status(404).json({ error: 'no_matching_pending_request' });
  }
  if (!(await verifyPeerCert(gatekeeper_soul_id, cert, node_url))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }
  entry.status = 'accepted';
  entry.accepted_at = Math.floor(Date.now() / 1000);
  await saveWiredTo(soul_id, wiredTo);
  res.json({ ok: true });
});

// Owner-Sicht auf die eigene wired_to.json (Settings-UI "Connected to"-Anzeige).
app.get('/mcp/discover/wired-to', async (req, res) => {
  const parsed = parseOwnCertBearer(req);
  if (!parsed) return res.status(401).json({ error: 'soul_cert_required' });
  if (!(await verifyPeerCert(parsed.soulId, parsed.cert, null))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }
  const wiredTo = await loadWiredTo(parsed.soulId);
  const list = Object.entries(wiredTo).map(([gatekeeper_soul_id, e]) => ({
    gatekeeper_soul_id, wired_at: e.wired_at, status: e.status || 'accepted',
  }));
  res.json({ wired_to: list });
});

// Gatekeeper-Funktion selbst an/aus — steuert, ob diese Soul überhaupt als
// Gatekeeper fungiert: neue Wire-Anfragen werden abgelehnt (403) und bereits
// verdrahtete Souls werden nicht mehr als Tools angeboten, solange aus.
// Konsolidiert: die Funktion darf nur noch über dieses bewusste Umschalten
// entstehen (kein impliziter Default mehr, siehe wired_souls.mjs). Konsequent
// heißt das auch: Ausschalten beendet bestehende Verbindungen wirklich, statt
// sie nur zu pausieren — siehe POST-Handler unten.
app.get('/mcp/discover/gatekeeper-config', async (req, res) => {
  const parsed = parseOwnCertBearer(req);
  if (!parsed) return res.status(401).json({ error: 'soul_cert_required' });
  if (!(await verifyPeerCert(parsed.soulId, parsed.cert, null))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }
  res.json({ enabled: await isGatekeeperEnabled(parsed.soulId) });
});

app.post('/mcp/discover/gatekeeper-config', async (req, res) => {
  const parsed = parseOwnCertBearer(req);
  if (!parsed) return res.status(401).json({ error: 'soul_cert_required' });
  if (!(await verifyPeerCert(parsed.soulId, parsed.cert, null))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled (boolean) erforderlich' });
  }

  if (!enabled) {
    // Aus heißt: die Verbindung darf nicht fortbestehen, solange der
    // Gatekeeper aus ist — jede aktuell verdrahtete Soul wird benachrichtigt
    // (same-node direkt, cross-node per Callback) und wired_souls.json wird
    // geleert statt nur ignoriert. Wieder-Einschalten setzt keine alten
    // Verbindungen zurück — jede Soul muss sich bewusst neu einwirten, exakt
    // dasselbe Prinzip wie beim Gatekeeper-Schalter selbst.
    const wired = await loadWired(parsed.soulId);
    for (const [key, entry] of Object.entries(wired)) {
      const wiredSoulId = entry.soul_id || key.split('@')[0];
      await notifyWiredToRemoval(parsed.soulId, parsed.cert, wiredSoulId, entry?.node_url || null);
    }
    await saveWired(parsed.soulId, {});
  }

  await setGatekeeperEnabled(parsed.soulId, enabled);
  res.json({ ok: true, enabled });
});

app.delete('/mcp/discover/wire/:soul_id', async (req, res) => {
  const parsed = parseOwnCertBearer(req);
  if (!parsed) return res.status(401).json({ error: 'soul_cert_required' });
  if (!(await verifyPeerCert(parsed.soulId, parsed.cert, null))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }
  // node_url disambiguiert, FALLS dieselbe soul_id mehrfach verdrahtet ist
  // (verschiedene physische Node-Instanzen, siehe wireKey()) — ohne Angabe
  // trifft der Aufruf nur den same-node-Eintrag (Standardfall, unverändertes
  // Verhalten für alle bisherigen Einträge).
  const nodeUrlParam = typeof req.query.node_url === 'string' && req.query.node_url.trim()
    ? req.query.node_url.trim().replace(/\/$/, '')
    : null;
  const wired = await loadWired(parsed.soulId);
  const key   = wireKey(req.params.soul_id, nodeUrlParam);
  const entry = wired[key];
  delete wired[key];
  await saveWired(parsed.soulId, wired);

  // Gegenseite mitpflegen (same-node direkt, cross-node per Callback), damit
  // die entfernte Soul nicht weiter "connected" anzeigt.
  if (entry) {
    await notifyWiredToRemoval(parsed.soulId, parsed.cert, req.params.soul_id, entry?.node_url || null);
  }

  res.json({ ok: true });
});

// Selbst-Trennen von der wiring-Soul-Seite (das Gegenstück zur obigen Route,
// die nur der Gatekeeper aufrufen kann): Bearer = eigener Soul-Cert der Soul,
// die sich getrennt trennen will. Cross-node-fähig seit /mcp/discover/wire-out
// auch cross-node wired_to.json-Einträge (mit node_url) tatsächlich anlegt —
// same-node direkter Dateisystemzugriff wie bisher, cross-node per Server-zu-
// Server-Callback (Gegenstück: POST /mcp/discover/wire-self-remove unten),
// aus demselben CSP-Grund wie bei /mcp/discover/wire-out: der Browser kann
// nicht direkt auf den fremden Gatekeeper-Node zugreifen.
app.delete('/mcp/discover/wired-to/:gatekeeper_soul_id', async (req, res) => {
  const parsed = parseOwnCertBearer(req);
  if (!parsed) return res.status(401).json({ error: 'soul_cert_required' });
  if (!(await verifyPeerCert(parsed.soulId, parsed.cert, null))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }

  const wiredTo = await loadWiredTo(parsed.soulId);
  const entry = wiredTo[req.params.gatekeeper_soul_id];
  delete wiredTo[req.params.gatekeeper_soul_id];
  await saveWiredTo(parsed.soulId, wiredTo);

  if (entry?.node_url) {
    try {
      await fetch(`${entry.node_url}/mcp/discover/wire-self-remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gatekeeper_soul_id: req.params.gatekeeper_soul_id,
          soul_id: parsed.soulId,
          cert: parsed.cert,
          node_url: BASE_URL,
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch { /* best effort — Gegenseite evtl. offline */ }
  } else {
    const wired = await loadWired(req.params.gatekeeper_soul_id);
    delete wired[parsed.soulId];
    await saveWired(req.params.gatekeeper_soul_id, wired);
  }

  res.json({ ok: true });
});

// Empfängt eine Selbst-Trennung einer fremden (cross-node) wirenden Soul —
// Gegenstück zum Cross-Node-Zweig oben. Server-to-server, kein eigener Cert-
// Bearer der Gatekeeper-Soul nötig: die wirende Soul beweist per eigenem
// Cert (gegen ihren eigenen node_url geprüft) dass sie wirklich sie selbst
// ist — dasselbe Cross-Node-Cert-Prinzip wie überall sonst in diesem Feature.
app.post('/mcp/discover/wire-self-remove', async (req, res) => {
  const { gatekeeper_soul_id, soul_id, cert, node_url } = req.body || {};
  if (!gatekeeper_soul_id || !soul_id || !cert || !node_url) {
    return res.status(400).json({ error: 'gatekeeper_soul_id, soul_id, cert und node_url erforderlich' });
  }
  if (!(await verifyPeerCert(soul_id, cert, node_url))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }
  const wired = await loadWired(gatekeeper_soul_id);
  delete wired[wireKey(soul_id, node_url)];
  await saveWired(gatekeeper_soul_id, wired);
  res.json({ ok: true });
});

// Empfängt eine Trennungs-Benachrichtigung eines fremden (cross-node)
// Gatekeepers — Gegenstück zu notifyWiredToRemoval() im Cross-Node-Fall.
// Server-to-server, kein eigener Cert-Bearer der empfangenden Soul nötig: der
// Gatekeeper beweist per eigenem Cert (gegen seinen eigenen node_url geprüft,
// exakt wie beim Cross-Node-Wiring/-Föderieren) dass er wirklich er selbst
// ist. wired_to.json ist rein informativ — die echte Zugriffskontrolle bleibt
// beim Gatekeeper in dessen eigener wired_souls.json.
app.post('/mcp/discover/wired-to/remove', async (req, res) => {
  const { gatekeeper_soul_id, soul_id, cert, node_url } = req.body || {};
  if (!gatekeeper_soul_id || !soul_id || !cert || !node_url) {
    return res.status(400).json({ error: 'gatekeeper_soul_id, soul_id, cert und node_url erforderlich' });
  }
  if (!(await verifyPeerCert(gatekeeper_soul_id, cert, node_url))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }
  const wiredTo = await loadWiredTo(soul_id);
  delete wiredTo[gatekeeper_soul_id];
  await saveWiredTo(soul_id, wiredTo);
  res.json({ ok: true });
});

// ── Gatekeeper-Föderation (gegenseitiges Einverständnis) ──────────────────────
// Zwei Gatekeeper-Souls, potenziell auf unterschiedlichen Nodes, verbinden sich
// symmetrisch — anders als Wire (Soul→Gatekeeper, asymmetrisch, scope-begrenzt).
// Kein neues Krypto-Primitiv: derselbe verifyPeerCert(..., node_url)-Cross-Node-
// Nachweis wie beim Cross-Node-Wiring, nur jetzt in beide Richtungen zwischen
// zwei Gatekeepern statt Soul→Gatekeeper. Beidseitige Zustimmung nötig
// (pending_in/pending_out/accept) — strukturell vorsichtiger als Wire's
// ursprüngliches Design (das inzwischen den gatekeeper_enabled-Schalter hat),
// deshalb hier von Anfang an ohne zusätzliche Absicherung sicher genug für
// das generische Template.

// Owner-initiiert: fragt bei einem fremden Gatekeeper eine Föderation an.
app.post('/mcp/discover/federate', async (req, res) => {
  const parsed = parseOwnCertBearer(req);
  if (!parsed) return res.status(401).json({ error: 'soul_cert_required' });
  const { soulId: callerSoulId, cert } = parsed;
  if (!(await verifyPeerCert(callerSoulId, cert, null))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }

  const { remote_soul_id, remote_node_url } = req.body || {};
  if (!remote_soul_id || !remote_node_url) {
    return res.status(400).json({ error: 'remote_soul_id und remote_node_url erforderlich' });
  }
  if (remote_soul_id === callerSoulId) {
    return res.status(400).json({ error: 'self_federate_not_allowed' });
  }
  const remoteBase = remote_node_url.replace(/\/$/, '');

  // Token, das WIR künftig als Bearer präsentieren, wenn WIR die Suche der
  // Gegenseite abfragen (siehe /mcp/discover/search) — an sie geschickt, damit
  // SIE ihn als eingehend gültig erkennt. Zertifikate sind nur in diesem
  // Moment verfügbar (der Owner hält gerade eine Bearer-Session), Tokens sind
  // dauerhaft — deshalb Token-Tausch statt wiederholtem Cert-Roundtrip später.
  const myInboundToken = randomBytes(32).toString('hex');

  let theirInboundToken;
  try {
    const fres = await fetch(`${remoteBase}/mcp/discover/federate/incoming`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gatekeeper_soul_id: remote_soul_id, soul_id: callerSoulId, cert, node_url: BASE_URL, token: myInboundToken }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await fres.json().catch(() => ({}));
    if (!fres.ok || !data.ok) {
      return res.status(400).json({ error: 'federate_request_failed', message: data.error || `HTTP ${fres.status}` });
    }
    theirInboundToken = data.token;
  } catch (err) {
    return res.status(502).json({ error: 'remote_unreachable', message: err.message });
  }

  const fed = await loadFederated(callerSoulId);
  fed[remote_soul_id] = {
    node_url: remoteBase,
    status: 'pending_out',
    requested_at: Math.floor(Date.now() / 1000),
    inbound_token: myInboundToken,     // Gegenseite präsentiert das, wenn SIE uns abfragt
    outbound_token: theirInboundToken, // wir präsentieren das, wenn WIR sie abfragen
  };
  await saveFederated(callerSoulId, fed);

  res.json({ ok: true, status: 'pending_out' });
});

// Empfängt eine Föderationsanfrage eines fremden Gatekeepers (server-to-server,
// kein eigener Cert-Bearer — die Identität steckt im Body und wird gegen den
// dort behaupteten node_url verifiziert, exakt wie beim Cross-Node-Wiring).
app.post('/mcp/discover/federate/incoming', async (req, res) => {
  const { gatekeeper_soul_id, soul_id, cert, node_url, token } = req.body || {};
  if (!gatekeeper_soul_id || !soul_id || !cert || !node_url || !token) {
    return res.status(400).json({ ok: false, error: 'gatekeeper_soul_id, soul_id, cert, node_url und token erforderlich' });
  }
  const gkExists = await stat(`${SOULS_DIR}${gatekeeper_soul_id}`).then(s => s.isDirectory()).catch(() => false);
  if (!gkExists) {
    return res.status(404).json({ ok: false, error: 'gatekeeper_soul_not_found' });
  }
  if (!(await verifyPeerCert(soul_id, cert, node_url))) {
    return res.status(401).json({ ok: false, error: 'invalid_cert' });
  }

  const myInboundToken = randomBytes(32).toString('hex');

  const fed = await loadFederated(gatekeeper_soul_id);
  fed[soul_id] = {
    node_url: node_url.replace(/\/$/, ''),
    status: 'pending_in',
    requested_at: Math.floor(Date.now() / 1000),
    inbound_token: myInboundToken, // Gegenseite präsentiert das, wenn SIE uns abfragt
    outbound_token: token,          // wir präsentieren das (von ihnen erhalten), wenn WIR sie abfragen
  };
  await saveFederated(gatekeeper_soul_id, fed);

  res.json({ ok: true, token: myInboundToken });
});

// Owner-Sicht auf die eigene federated_gatekeepers.json.
app.get('/mcp/discover/federated', async (req, res) => {
  const parsed = parseOwnCertBearer(req);
  if (!parsed) return res.status(401).json({ error: 'soul_cert_required' });
  if (!(await verifyPeerCert(parsed.soulId, parsed.cert, null))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }
  const fed = await loadFederated(parsed.soulId);
  const list = Object.entries(fed).map(([soul_id, e]) => ({
    soul_id, node_url: e.node_url, status: e.status, requested_at: e.requested_at, accepted_at: e.accepted_at || null,
  }));
  res.json({ federated: list });
});

// Owner bestätigt eine eingehende Föderationsanfrage.
app.post('/mcp/discover/federated/:remote_soul_id/accept', async (req, res) => {
  const parsed = parseOwnCertBearer(req);
  if (!parsed) return res.status(401).json({ error: 'soul_cert_required' });
  const { soulId: callerSoulId, cert } = parsed;
  if (!(await verifyPeerCert(callerSoulId, cert, null))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }

  const fed = await loadFederated(callerSoulId);
  const entry = fed[req.params.remote_soul_id];
  if (!entry || entry.status !== 'pending_in') {
    return res.status(404).json({ error: 'no_pending_request' });
  }
  entry.status = 'accepted';
  entry.accepted_at = Math.floor(Date.now() / 1000);
  await saveFederated(callerSoulId, fed);

  // Best effort: Gegenseite benachrichtigen, damit ihr pending_out ebenfalls
  // auf accepted springt. Schlägt das fehl, bleibt unsere Seite trotzdem
  // accepted — Asymmetrie bis zu einem erneuten Versuch, kein Rollback.
  try {
    await fetch(`${entry.node_url}/mcp/discover/federated/${req.params.remote_soul_id}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soul_id: callerSoulId, cert, node_url: BASE_URL }),
      signal: AbortSignal.timeout(10000),
    });
  } catch { /* best effort */ }

  res.json({ ok: true, status: 'accepted' });
});

// Empfängt die Bestätigung einer zuvor gestellten Föderationsanfrage
// (server-to-server, wie /federate/incoming).
app.post('/mcp/discover/federated/:local_soul_id/confirm', async (req, res) => {
  const { soul_id, cert, node_url } = req.body || {};
  if (!soul_id || !cert || !node_url) {
    return res.status(400).json({ ok: false, error: 'soul_id, cert und node_url erforderlich' });
  }
  const fed = await loadFederated(req.params.local_soul_id);
  const entry = fed[soul_id];
  // Nur bestätigen was wir selbst angefragt hatten, gegen den node_url den WIR
  // gespeichert haben — verhindert dass eine fremde Partei von woanders eine
  // Bestätigung vortäuscht.
  if (!entry || entry.status !== 'pending_out' || entry.node_url !== node_url.replace(/\/$/, '')) {
    return res.status(404).json({ ok: false, error: 'no_matching_pending_request' });
  }
  if (!(await verifyPeerCert(soul_id, cert, node_url))) {
    return res.status(401).json({ ok: false, error: 'invalid_cert' });
  }
  entry.status = 'accepted';
  entry.accepted_at = Math.floor(Date.now() / 1000);
  await saveFederated(req.params.local_soul_id, fed);
  res.json({ ok: true });
});

// Owner trennt/lehnt ab — funktioniert für pending_in, pending_out und accepted.
app.delete('/mcp/discover/federated/:remote_soul_id', async (req, res) => {
  const parsed = parseOwnCertBearer(req);
  if (!parsed) return res.status(401).json({ error: 'soul_cert_required' });
  if (!(await verifyPeerCert(parsed.soulId, parsed.cert, null))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }
  const fed = await loadFederated(parsed.soulId);
  const entry = fed[req.params.remote_soul_id];
  delete fed[req.params.remote_soul_id];
  await saveFederated(parsed.soulId, fed);

  if (entry?.node_url) {
    try {
      await fetch(`${entry.node_url}/mcp/discover/federated/${req.params.remote_soul_id}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soul_id: parsed.soulId, cert: parsed.cert, node_url: BASE_URL }),
        signal: AbortSignal.timeout(6000),
      });
    } catch { /* best effort */ }
  }
  res.json({ ok: true });
});

// Empfängt eine Trennung von der Gegenseite (server-to-server, wie /confirm —
// dieselbe Cert-gegen-node_url-Prüfung, damit nicht irgendwer beliebige
// Föderationen fremder Souls durch gefälschte Disconnects kappen kann).
app.post('/mcp/discover/federated/:local_soul_id/disconnect', async (req, res) => {
  const { soul_id, cert, node_url } = req.body || {};
  if (!soul_id || !cert || !node_url) {
    return res.status(400).json({ ok: false, error: 'soul_id, cert und node_url erforderlich' });
  }
  const fed = await loadFederated(req.params.local_soul_id);
  const entry = fed[soul_id];
  if (!entry || entry.node_url !== node_url.replace(/\/$/, '')) {
    return res.status(404).json({ ok: false, error: 'no_matching_entry' });
  }
  if (!(await verifyPeerCert(soul_id, cert, node_url))) {
    return res.status(401).json({ ok: false, error: 'invalid_cert' });
  }
  delete fed[soul_id];
  await saveFederated(req.params.local_soul_id, fed);
  res.json({ ok: true });
});

// Suche über föderierte Gatekeeper — 1 Hop tief: liefert NUR die eigenen
// wired Souls dieses Gatekeepers, keine Weiterleitung an dessen eigene
// Föderationen — verhindert Anfrage-Explosion in einem Mesh ohne TTL. Auth
// per inbound_token (beim Federate ausgetauscht) statt Cert — Suche ist ein
// wiederkehrender Vorgang, kein einmaliger Owner-Vorgang, ein dauerhafter
// Token passt besser als ein Cert-Roundtrip pro Anfrage.
app.get('/mcp/discover/search', async (req, res) => {
  const { gatekeeper_soul_id, q } = req.query;
  const token = extractToken(req);
  if (!gatekeeper_soul_id || !token) {
    return res.status(400).json({ error: 'gatekeeper_soul_id (query) und Bearer-Token erforderlich' });
  }
  if (!(await authenticateFederatedCaller(gatekeeper_soul_id, token))) {
    return res.status(401).json({ error: 'not_federated' });
  }

  // Wie registerConnectionProxyTools(): pending Cross-Node-Wires (siehe POST
  // /mcp/discover/wire) sind für ein föderiertes Gegenüber noch unsichtbar,
  // und mehrere physische Instanzen derselben soul_id (siehe wireKey())
  // werden auf eine kanonische Verbindung reduziert.
  const { wired } = await loadAcceptedWired(gatekeeper_soul_id);
  const needle = (q || '').toLowerCase();
  const list = Object.values(wired)
    .filter((e) => !needle || (e.name || '').toLowerCase().includes(needle))
    .map((e) => ({
      soul_id: e.soul_id, name: e.name, permissions: Object.keys(e.permissions || {}).filter(k => e.permissions[k]),
      // Immer der echte Node, nie null.
      node_url: e.node_url || BASE_URL,
    }));
  res.json({ results: list });
});

// ── Föderierter Vault-Relay ────────────────────────────────────────────────
// Macht jedes wired_*-Tool (gatekeeper_proxy.mjs) für Souls nutzbar, die nicht
// bei UNS, sondern bei einem föderierten Gegenüber verdrahtet sind — nicht nur
// deren Namen (das leistet /mcp/discover/search schon), sondern echten
// Lese-/Schreibzugriff über exakt dieselben Scopes, die die Soul beim Wiring
// dem JEWEILS ANDEREN Gatekeeper gewährt hat. Wir selbst haben für diese Soul
// keinen Token — der föderierte Gatekeeper führt die eigentliche Aktion mit
// SEINEM gespeicherten Token aus und reicht nur das Ergebnis durch. 1 Hop,
// keine Weiterleitung an dessen eigene Föderationen (wie /mcp/discover/search).
//
// Konsent-Modell: das bestehende Wire-Opt-in EINER Soul zu einem Gatekeeper
// ist die einzige Zustimmung, die nötig ist — föderiert dieser Gatekeeper
// später mit einem anderen, wird die Soul automatisch darüber miterreichbar,
// ohne erneute Einzelzustimmung. Wer das nicht will, entwirtet sich
// (unwireSoul) oder der Gatekeeper-Owner trennt die Föderation.
//
// Auth identisch zu /mcp/discover/search: gatekeeper_soul_id (wessen wiredMap
// + Föderationsliste wir befragen) + Bearer inbound_token, gegen die EIGENE
// federated_gatekeepers.json geprüft — nicht gegen die des Aufrufers.
async function authenticateRelay(req, res) {
  const gatekeeperSoulId = req.query.gatekeeper_soul_id || req.body?.gatekeeper_soul_id;
  const targetSoulId     = req.query.target_soul_id || req.body?.target_soul_id;
  const token = extractToken(req);
  if (!gatekeeperSoulId || !targetSoulId || !token) {
    res.status(400).json({ error: 'gatekeeper_soul_id, target_soul_id und Bearer-Token erforderlich' });
    return null;
  }
  if (!(await authenticateFederatedCaller(gatekeeperSoulId, token))) {
    res.status(401).json({ error: 'not_federated' });
    return null;
  }
  const { wired } = await loadAcceptedWired(gatekeeperSoulId);
  const entry = wired[targetSoulId];
  if (!entry) {
    res.status(404).json({ error: 'target_not_wired' });
    return null;
  }
  return entry;
}

function relayCheckPerm(res, entry, permKey) {
  if (permKey && !entry.permissions?.[permKey]) {
    res.status(403).json({ error: 'permission_denied' });
    return false;
  }
  return true;
}

// Reicht Status/Content-Type/Body einer fetchApi()-Response 1:1 durch — der
// Relay-Aufrufer (gatekeeper_proxy.mjs) verarbeitet Text-/Binärinhalte genauso
// wie beim direkten Zugriff, soll also exakt dieselbe Response-Form sehen.
async function relayPipe(res, upstream) {
  const ctype = upstream.headers.get('content-type') || '';
  res.setHeader('Content-Type', ctype || 'application/octet-stream');
  res.send(Buffer.from(await upstream.arrayBuffer()));
}

app.get('/mcp/discover/federated/relay/soul', async (req, res) => {
  const entry = await authenticateRelay(req, res);
  if (!entry) return;
  if (!relayCheckPerm(res, entry, 'soul')) return;
  try {
    await relayPipe(res, await fetchApi('/api/soul', entry.token, entry.node_url));
  } catch (err) {
    res.status(err.status || 502).json({ error: err.code || 'upstream_failed', message: err.message });
  }
});

app.put('/mcp/discover/federated/relay/soul', async (req, res) => {
  const entry = await authenticateRelay(req, res);
  if (!entry) return;
  if (!relayCheckPerm(res, entry, 'soul')) return;
  const { soul_content } = req.body || {};
  if (typeof soul_content !== 'string') {
    return res.status(400).json({ error: 'soul_content erforderlich' });
  }
  try {
    await putApi('/api/context', entry.token, entry.node_url, { soul_content });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.code || 'upstream_failed', message: err.message });
  }
});

const RELAY_VAULT_KINDS = { audio: 'audio', images: 'images', video: 'video', context: 'context_files' };

app.get('/mcp/discover/federated/relay/vault/:kind', async (req, res) => {
  const permKey = RELAY_VAULT_KINDS[req.params.kind];
  if (!permKey) return res.status(400).json({ error: 'unknown_kind' });
  const entry = await authenticateRelay(req, res);
  if (!entry) return;
  if (!relayCheckPerm(res, entry, permKey)) return;
  try {
    await relayPipe(res, await fetchApi(`/api/vault/${req.params.kind}`, entry.token, entry.node_url));
  } catch (err) {
    res.status(err.status || 502).json({ error: err.code || 'upstream_failed', message: err.message });
  }
});

app.get('/mcp/discover/federated/relay/vault/:kind/:filename', async (req, res) => {
  const permKey = RELAY_VAULT_KINDS[req.params.kind];
  if (!permKey) return res.status(400).json({ error: 'unknown_kind' });
  const entry = await authenticateRelay(req, res);
  if (!entry) return;
  if (!relayCheckPerm(res, entry, permKey)) return;
  try {
    const path = `/api/vault/${req.params.kind}/${encodeURIComponent(req.params.filename)}`;
    await relayPipe(res, await fetchApi(path, entry.token, entry.node_url));
  } catch (err) {
    res.status(err.status || 502).json({ error: err.code || 'upstream_failed', message: err.message });
  }
});

// Kein permKey-Check — mirrort wired_shared_get() in gatekeeper_proxy.mjs,
// das ebenfalls nur einen bestehenden Wire-Eintrag voraussetzt, keinen
// bestimmten Scope (vault_shared ist die für Peer-Anhänge gedachte Ablage).
app.get('/mcp/discover/federated/relay/shared/:filename', async (req, res) => {
  const entry = await authenticateRelay(req, res);
  if (!entry) return;
  try {
    const path = `/api/vault/shared/${encodeURIComponent(entry.soul_id)}/${encodeURIComponent(req.params.filename)}`;
    await relayPipe(res, await fetchApi(path, entry.token, entry.node_url));
  } catch (err) {
    res.status(err.status || 502).json({ error: err.code || 'upstream_failed', message: err.message });
  }
});

// gatekeeper_soul_id/target_soul_id kommen hier aus dem Body (nicht Query) --
// authenticateRelay() liest ohnehin beide Quellen, und /api/beme hat schon
// einen JSON-Body (message/history/max_tokens), keine zusätzliche
// Query-String-Konstruktion auf der Aufrufer-Seite nötig (siehe bemeChat() in
// gatekeeper_proxy.mjs). permKey 'soul' -- gleicher Scope wie soul GET/PUT.
app.post('/mcp/discover/federated/relay/beme', async (req, res) => {
  const entry = await authenticateRelay(req, res);
  if (!entry) return;
  if (!relayCheckPerm(res, entry, 'soul')) return;
  const { message, history, max_tokens } = req.body || {};
  if (typeof message !== 'string' || !message) {
    return res.status(400).json({ error: 'message erforderlich' });
  }
  try {
    const data = await postApi('/api/beme', entry.token, entry.node_url, {
      message, history: Array.isArray(history) ? history : [], max_tokens,
    });
    res.json(data);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.code || 'upstream_failed', message: err.message });
  }
});

// ── Soul-zu-Soul-Verbindungen (gegenseitiges Einverständnis, cross-node) ──────
// Jede Soul kann das nutzen, nicht nur Gatekeeper — direkte, symmetrische
// Verbindung zwischen zwei beliebigen Souls, mit echten Vault-Permissions.
const CONN_PERMS = { soul: true, audio: true, video: true, images: true, context_files: true, network: true };
function sanitizePerms(input) {
  const perms = {};
  if (input && typeof input === 'object') {
    for (const k of Object.keys(input)) {
      if (CONN_PERMS[k] && input[k]) perms[k] = true;
    }
  }
  if (!Object.keys(perms).length) return { soul: true, context_files: true };
  return perms;
}

app.post('/mcp/connect', async (req, res) => {
  const parsed = parseOwnCertBearer(req);
  if (!parsed) return res.status(401).json({ error: 'soul_cert_required' });
  const { soulId: callerSoulId, cert } = parsed;
  if (!(await verifyPeerCert(callerSoulId, cert, null))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }

  const { remote_soul_id, remote_node_url, permissions, alias } = req.body || {};
  if (!remote_soul_id || !remote_node_url) {
    return res.status(400).json({ error: 'remote_soul_id und remote_node_url erforderlich' });
  }
  if (remote_soul_id === callerSoulId) {
    return res.status(400).json({ error: 'self_connect_not_allowed' });
  }
  const remoteBase = remote_node_url.replace(/\/$/, '');
  const grantedPerms = sanitizePerms(permissions);
  // Alias ist NICHT Teil des Austauschs — jede Seite nennt die andere wie sie
  // will, nicht wie die Gegenseite sich selbst nennt. Fallback: kurze soul_id.
  const myAlias = (typeof alias === 'string' && alias.trim()) ? alias.trim().slice(0, 64) : remote_soul_id.slice(0, 8);

  const myInboundToken = await createConnectionToken(callerSoulId, `Verbunden mit ${remote_soul_id}`, grantedPerms);

  let theirInboundToken;
  try {
    const fres = await fetch(`${remoteBase}/mcp/connect/incoming`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ local_soul_id: remote_soul_id, soul_id: callerSoulId, cert, node_url: BASE_URL, token: myInboundToken, permissions: grantedPerms }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await fres.json().catch(() => ({}));
    if (!fres.ok || !data.ok) {
      await revokeConnectionToken(callerSoulId, myInboundToken);
      return res.status(400).json({ error: 'connect_request_failed', message: data.error || `HTTP ${fres.status}` });
    }
    theirInboundToken = data.token;
  } catch (err) {
    await revokeConnectionToken(callerSoulId, myInboundToken);
    return res.status(502).json({ error: 'remote_unreachable', message: err.message });
  }

  const conn = await loadConnected(callerSoulId);
  conn[remote_soul_id] = {
    node_url: remoteBase,
    status: 'pending_out',
    requested_at: Math.floor(Date.now() / 1000),
    inbound_token: myInboundToken,
    outbound_token: theirInboundToken,
    permissions: grantedPerms,
    alias: myAlias,
  };
  await saveConnected(callerSoulId, conn);

  res.json({ ok: true, status: 'pending_out' });
});

app.post('/mcp/connect/incoming', async (req, res) => {
  // local_soul_id: die im Request adressierte lokale Soul — bei Soul-zu-Soul
  // gibt es (anders als beim Gatekeeper-Wire) keine feste "Gatekeeper"-Rolle,
  // der Absender muss die Ziel-soul_id also explizit mitschicken.
  const { local_soul_id, soul_id, cert, node_url, token, permissions } = req.body || {};
  if (!local_soul_id || !soul_id || !cert || !node_url || !token) {
    return res.status(400).json({ ok: false, error: 'local_soul_id, soul_id, cert, node_url und token erforderlich' });
  }
  const exists = await stat(`${SOULS_DIR}${local_soul_id}`).then(s => s.isDirectory()).catch(() => false);
  if (!exists) {
    return res.status(404).json({ ok: false, error: 'local_soul_not_found' });
  }
  if (!(await verifyPeerCert(soul_id, cert, node_url))) {
    return res.status(401).json({ ok: false, error: 'invalid_cert' });
  }

  const grantedPerms = sanitizePerms(permissions);
  const myInboundToken = await createConnectionToken(local_soul_id, `Verbunden mit ${soul_id}`, grantedPerms);

  const conn = await loadConnected(local_soul_id);
  conn[soul_id] = {
    node_url: node_url.replace(/\/$/, ''),
    status: 'pending_in',
    requested_at: Math.floor(Date.now() / 1000),
    inbound_token: myInboundToken,
    outbound_token: token,
    permissions: grantedPerms,
    // Vorläufiger Alias bis der Owner beim Annehmen einen eigenen vergibt
    // (siehe /mcp/connections/:id/accept) — kurze soul_id als Platzhalter.
    alias: soul_id.slice(0, 8),
  };
  await saveConnected(local_soul_id, conn);

  res.json({ ok: true, token: myInboundToken });
});

app.get('/mcp/connections', async (req, res) => {
  const parsed = parseOwnCertBearer(req);
  if (!parsed) return res.status(401).json({ error: 'soul_cert_required' });
  if (!(await verifyPeerCert(parsed.soulId, parsed.cert, null))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }
  const conn = await loadConnected(parsed.soulId);
  const list = Object.entries(conn).map(([soul_id, e]) => ({
    soul_id, node_url: e.node_url, status: e.status, alias: e.alias || soul_id.slice(0, 8),
    permissions: Object.keys(e.permissions || {}).filter(k => e.permissions[k]),
    requested_at: e.requested_at, accepted_at: e.accepted_at || null,
  }));
  res.json({ connections: list });
});

app.post('/mcp/connections/:remote_soul_id/accept', async (req, res) => {
  const parsed = parseOwnCertBearer(req);
  if (!parsed) return res.status(401).json({ error: 'soul_cert_required' });
  const { soulId: callerSoulId, cert } = parsed;
  if (!(await verifyPeerCert(callerSoulId, cert, null))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }

  const conn = await loadConnected(callerSoulId);
  const entry = conn[req.params.remote_soul_id];
  if (!entry || entry.status !== 'pending_in') {
    return res.status(404).json({ error: 'no_pending_request' });
  }
  const { alias } = req.body || {};
  if (typeof alias === 'string' && alias.trim()) entry.alias = alias.trim().slice(0, 64);
  entry.status = 'accepted';
  entry.accepted_at = Math.floor(Date.now() / 1000);
  await saveConnected(callerSoulId, conn);

  try {
    await fetch(`${entry.node_url}/mcp/connections/${req.params.remote_soul_id}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soul_id: callerSoulId, cert, node_url: BASE_URL }),
      signal: AbortSignal.timeout(10000),
    });
  } catch { /* best effort */ }

  res.json({ ok: true, status: 'accepted' });
});

app.post('/mcp/connections/:local_soul_id/confirm', async (req, res) => {
  const { soul_id, cert, node_url } = req.body || {};
  if (!soul_id || !cert || !node_url) {
    return res.status(400).json({ ok: false, error: 'soul_id, cert und node_url erforderlich' });
  }
  const conn = await loadConnected(req.params.local_soul_id);
  const entry = conn[soul_id];
  if (!entry || entry.status !== 'pending_out' || entry.node_url !== node_url.replace(/\/$/, '')) {
    return res.status(404).json({ ok: false, error: 'no_matching_pending_request' });
  }
  if (!(await verifyPeerCert(soul_id, cert, node_url))) {
    return res.status(401).json({ ok: false, error: 'invalid_cert' });
  }
  entry.status = 'accepted';
  entry.accepted_at = Math.floor(Date.now() / 1000);
  await saveConnected(req.params.local_soul_id, conn);
  res.json({ ok: true });
});

app.delete('/mcp/connections/:remote_soul_id', async (req, res) => {
  const parsed = parseOwnCertBearer(req);
  if (!parsed) return res.status(401).json({ error: 'soul_cert_required' });
  if (!(await verifyPeerCert(parsed.soulId, parsed.cert, null))) {
    return res.status(401).json({ error: 'invalid_cert' });
  }
  const conn = await loadConnected(parsed.soulId);
  const entry = conn[req.params.remote_soul_id];
  delete conn[req.params.remote_soul_id];
  await saveConnected(parsed.soulId, conn);
  if (entry?.inbound_token) await revokeConnectionToken(parsed.soulId, entry.inbound_token);

  if (entry?.node_url) {
    try {
      await fetch(`${entry.node_url}/mcp/connections/${req.params.remote_soul_id}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soul_id: parsed.soulId, cert: parsed.cert, node_url: BASE_URL }),
        signal: AbortSignal.timeout(6000),
      });
    } catch { /* best effort */ }
  }
  res.json({ ok: true });
});

app.post('/mcp/connections/:local_soul_id/disconnect', async (req, res) => {
  const { soul_id, cert, node_url } = req.body || {};
  if (!soul_id || !cert || !node_url) {
    return res.status(400).json({ ok: false, error: 'soul_id, cert und node_url erforderlich' });
  }
  const conn = await loadConnected(req.params.local_soul_id);
  const entry = conn[soul_id];
  if (!entry || entry.node_url !== node_url.replace(/\/$/, '')) {
    return res.status(404).json({ ok: false, error: 'no_matching_entry' });
  }
  if (!(await verifyPeerCert(soul_id, cert, node_url))) {
    return res.status(401).json({ ok: false, error: 'invalid_cert' });
  }
  delete conn[soul_id];
  await saveConnected(req.params.local_soul_id, conn);
  if (entry.inbound_token) await revokeConnectionToken(req.params.local_soul_id, entry.inbound_token);
  res.json({ ok: true });
});

// ── MCP Apps: statische Assets (style.css, app.js, ...) ───────────────────────
// index.html einer App wird als ui://-Resource ausgeliefert (siehe soul_apps.mjs),
// referenziert CSS/JS aber über absolute URLs hierher, weil der Host die
// ui://-Resource vermutlich ohne verlässliche relative-URL-Auflösung rendert.
const APP_ASSET_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js':  'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

// Directory-Index für Browser-Aufrufe ohne Dateinamen (z.B. Vault-Apps-Tab
// "Öffnen"-Link → /apps/{soul_id}/{app_name}/): liefert eine SYS-Shell mit
// Header (Marke + Zurück-Button) und die eigentliche App in einem iframe
// (über die bestehende :filename-Route unten, unverändert) — sonst landet
// man beim Testen einer App auf einer nackten Content-Seite ohne jede
// Möglichkeit, zurück in den Vault zu kommen (Browser-Verlauf ist auf
// Mobile beim direkten Öffnen aus der App oft leer).
async function serveAppShell(req, res) {
  const { soul_id, app_name } = req.params;
  if (!/^[a-f0-9-]{36}$/i.test(soul_id)) return res.status(400).json({ error: 'invalid_soul_id' });
  if (!/^[a-z0-9_-]{1,64}$/i.test(app_name)) return res.status(400).json({ error: 'invalid_app_name' });

  const appDir   = path.resolve(`${SOULS_DIR}${soul_id}/vault_shared/apps/${app_name}`);
  const filePath = path.resolve(appDir, 'index.html');
  if (!filePath.startsWith(appDir + path.sep)) return res.status(400).json({ error: 'invalid_path' });

  try {
    await readFile(filePath, 'utf8'); // nur Existenzprüfung — Inhalt liefert das iframe selbst
  } catch {
    return res.status(404).json({ error: 'not_found' });
  }

  // Bewusst generisch (kein hartcodierter Betreibername) — läuft identisch
  // im öffentlichen Template-Repo. Hostname zeigt trotzdem eindeutig, auf
  // welcher Node man gerade eine App testet.
  const hostname = new URL(BASE_URL).hostname;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${app_name} — SYS</title>
<style>
  html,body{margin:0;height:100%;background:#0f0f0f;color:#e8e8e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden}
  .sys-app-header{position:fixed;top:0;left:0;right:0;height:52px;box-sizing:border-box;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 18px;border-bottom:1px solid #2a2a2a;background:rgba(15,15,15,.92);backdrop-filter:blur(8px)}
  .sys-app-brand{display:flex;flex-direction:column;gap:3px;line-height:1.2;min-width:0}
  .sys-app-brand-name{font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:700;letter-spacing:.04em;color:#e8e8e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sys-app-brand-host{font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.05em;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sys-app-back{flex:none;display:flex;align-items:center;gap:6px;background:none;border:1px solid #333;border-radius:6px;color:#ccc;cursor:pointer;padding:7px 12px;font-family:ui-monospace,Menlo,monospace;font-size:12px;text-decoration:none}
  .sys-app-back:hover{color:#fff;border-color:#6db89a}
  .sys-app-frame-wrap{position:absolute;top:52px;left:0;right:0;bottom:0}
  iframe{width:100%;height:100%;border:none;display:block;background:#fff}
</style>
</head>
<body>
  <div class="sys-app-header">
    <div class="sys-app-brand">
      <span class="sys-app-brand-name">SYS App — ${app_name}</span>
      <span class="sys-app-brand-host">${hostname}</span>
    </div>
    <a href="/" class="sys-app-back" id="sysAppBack">← Zurück</a>
  </div>
  <div class="sys-app-frame-wrap">
    <iframe src="./index.html" title="${app_name}" sandbox="allow-scripts allow-forms allow-same-origin allow-popups"></iframe>
  </div>
  <script>
    (function () {
      var btn = document.getElementById('sysAppBack');
      // history.back() bevorzugt (führt zurück zur bereits eingeloggten Vault-
      // Ansicht statt eines neuen, ungegateten Seitenaufrufs) — Fallback auf "/"
      // (nicht "/vault": das erzwingt bei fehlender Session einen Gate-
      // Redirect-Roundtrip, der clientseitig hängen bleiben kann) nur wenn
      // wirklich kein eigener Verlauf existiert (z.B. Direktlink ohne Vorseite).
      if (window.history.length > 1) {
        btn.addEventListener('click', function (e) { e.preventDefault(); window.history.back(); });
      }
    })();
  </script>
</body>
</html>`);
}
// Client-seitiges MCP-Apps-SDK, gebündelt (app-with-deps.js, keine losen
// Imports) — geteilt über alle Apps/Souls statt pro App dupliziert. Ohne
// App.connect() bleibt das iframe beim Host UNSICHTBAR (dokumentiertes
// SDK-Verhalten, siehe app.d.ts-Kommentar zu claude-ai-mcp#61/#149) — jede
// App MUSS dieses SDK importieren und connect() aufrufen, sonst zeigt der
// Host nur den Text-Fallback der Tool-Antwort. Vor den :soul_id-Routen
// registriert, damit "_sdk" nicht als Soul-ID durchgereicht wird.
app.get('/apps/_sdk/app.js', async (_req, res) => {
  try {
    const data = await readFile(path.resolve(import.meta.dirname, 'node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js'));
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    // Dynamic-import()/type=module-Fetches unterliegen immer CORS, unabhängig
    // von same-origin-Absicht — der Sandbox-Origin des Hosts (z.B.
    // https://{hash}.claudemcpcontent.com) ist fremd zu uns, und ohne diesen
    // Header schlägt das Laden mit "No 'Access-Control-Allow-Origin' header"
    // fehl (live in Claude.ai-Konsole bestätigt). Unbedenklich als "*": rein
    // öffentliches, unauthentifiziertes, identisches Bundle für alle.
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Claudes Sandbox-Origin (*.claudemcpcontent.com, pro Konversation
    // isoliert laut Spec) setzt vermutlich Cross-Origin-Embedder-Policy —
    // dann verlangt der Browser CORP auf jeder fremdgeladenen Ressource,
    // sonst wird das Laden verweigert (live beobachtet als
    // net::ERR_HTTP2_PROTOCOL_ERROR trotz 200 OK und CORS-Header).
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(data);
  } catch {
    res.status(404).json({ error: 'not_found' });
  }
});

app.get('/apps/:soul_id/:app_name', serveAppShell);
app.get('/apps/:soul_id/:app_name/', serveAppShell);

// Ganzer App-Ordner als ZIP — vor der generischen Wildcard-Route registriert,
// damit dieser literale Pfad Vorrang hat (Express matcht in Registrierreihenfolge).
app.get('/apps/:soul_id/:app_name/download.zip', (req, res) => {
  const { soul_id, app_name } = req.params;
  if (!/^[a-f0-9-]{36}$/i.test(soul_id)) return res.status(400).json({ error: 'invalid_soul_id' });
  if (!/^[a-z0-9_-]{1,64}$/i.test(app_name)) return res.status(400).json({ error: 'invalid_app_name' });

  const appDir = path.resolve(`${SOULS_DIR}${soul_id}/vault_shared/apps/${app_name}`);
  const zip = spawn('zip', ['-r', '-q', '-', '.'], { cwd: appDir });
  let started = false;
  zip.stdout.once('data', () => {
    started = true;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${app_name}.zip"`);
  });
  zip.stdout.pipe(res);
  zip.on('error', () => { if (!res.headersSent) res.status(500).json({ error: 'zip_failed' }); });
  zip.stderr.on('data', () => {}); // Puffer leeren, sonst blockiert der Child-Prozess
  zip.on('close', code => {
    if (!started && code !== 0 && !res.headersSent) res.status(404).json({ error: 'not_found' });
  });
});

app.get('/apps/:soul_id/:app_name/*', async (req, res) => {
  const { soul_id, app_name } = req.params;
  const filename = req.params[0]; // Wildcard-Rest — erlaubt Unterordner (z.B. assets/logo.png)
  if (!/^[a-f0-9-]{36}$/i.test(soul_id)) return res.status(400).json({ error: 'invalid_soul_id' });
  if (!/^[a-z0-9_-]{1,64}$/i.test(app_name)) return res.status(400).json({ error: 'invalid_app_name' });
  if (!filename || filename.includes('..')) return res.status(400).json({ error: 'invalid_filename' });
  for (const seg of filename.split('/')) {
    if (!/^[A-Za-z0-9_.-]{1,120}$/.test(seg)) return res.status(400).json({ error: 'invalid_filename' });
  }

  const appDir  = path.resolve(`${SOULS_DIR}${soul_id}/vault_shared/apps/${app_name}`);
  const filePath = path.resolve(appDir, filename);
  // Defense in depth über die Regex-Filter hinaus: aufgelöster Pfad muss
  // tatsächlich innerhalb des App-Ordners liegen.
  if (!filePath.startsWith(appDir + path.sep)) return res.status(400).json({ error: 'invalid_path' });

  try {
    const data = await readFile(filePath);
    const ext  = path.extname(filename).toLowerCase();
    res.setHeader('Content-Type', APP_ASSET_MIME[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    // Wie /apps/_sdk/app.js: App-Autoren referenzieren diese Route laut
    // ursprünglichem Design bewusst über absolute URLs (siehe Kommentar oben
    // in soul_apps.mjs) — Fetches/Modul-Importe von einem fremden
    // Sandbox-Origin aus brauchen dafür CORS, sonst schlägt das Laden fehl.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Einzeldatei-Download (Vault-Apps-Tab) statt Inline-Rendering fürs iframe.
    if (req.query.download !== undefined) {
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filename)}"`);
    }
    res.send(data);
  } catch {
    res.status(404).json({ error: 'not_found' });
  }
});

// Gesundheits-Check
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'soul-mcp', ts: new Date().toISOString() });
});

// ── Interne Endpoints (nur localhost, kein Auth) ──────────────────────────────
import { verifyHuman } from './lib/blockchain.mjs';
import { startIndexer, querySouls, indexStats, seedFromLocalAnchors, retryFailedEnrichments, deregisterSoul, reindexLocal, getIndexedSoul } from './lib/soul_indexer.mjs';
import { readFile as readFileFs }   from 'fs/promises';
import { decryptIfNeeded, encryptBuf, loadVaultMeta, SOULS_DIR } from './lib/vault_fs.mjs';
import { ethers }      from 'ethers';

// ── Web Push / VAPID ──────────────────────────────────────────────────────────
let vapidKeys = null;
try {
  vapidKeys = JSON.parse(await readFile('/var/lib/sys/vapid.json', 'utf8'));
  webpush.setVapidDetails(`mailto:admin@${new URL(BASE_URL).hostname}`, vapidKeys.publicKey, vapidKeys.privateKey);
} catch { /* Push disabled if keys missing */ }
import { herzActivate, herzDeactivate, herzStatus, herzForceTick, herzHeartbeat, herzForceCrystallize, herzEnsureAgentSocialBlocks } from './lib/herz.mjs';

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function ensureContextRegistered(soulId, filename) {
  const ctxPath = `${SOULS_DIR}${soulId}/api_context.json`;
  try {
    const raw = await readFileFs(ctxPath, 'utf8');
    const ctx = JSON.parse(raw);
    const sf  = ctx.synced_files = ctx.synced_files || {};
    const arr = Array.isArray(sf.context) ? sf.context : [];
    if (!arr.includes(filename)) {
      arr.push(filename);
      sf.context = arr;
      await writeFile(ctxPath, JSON.stringify(ctx), 'utf8');
    }
  } catch { /* nicht kritisch — Hauptaktion bereits abgeschlossen */ }
}

const MIND_WRITE_PROTECTED = new Set(['Identität', 'Grenzen', 'Identity', 'Boundaries']);

// Single Source of Truth: shared/constants/default_mind.md (siehe lua/default_mind.lua
// für das Lua-Äquivalent — beide lesen dieselbe von init.sh/update.sh deployte Datei).
let DEFAULT_MIND;
try {
  DEFAULT_MIND = await readFile('/var/lib/sys/config/default_mind.md', 'utf8');
} catch {
  DEFAULT_MIND = `---
ki_name: SYS-AI
version: 1
write_protected: Identity,Boundaries
---

## Identity
You are the AI of this SYS node — not a generic instance, but the AI of this specific person.

## Boundaries
Claude's ethical principles are active and non-negotiable. This section is write-protected and cannot be changed via mind_write.
`;
}

// POST /internal/run-tool — führt ein Soul-Tool server-seitig aus (In-App-Chat)
// Kein Auth nötig — nur localhost erreichbar, soul_cert wird vom Nginx-Proxy vorab geprüft.
app.post('/internal/run-tool', express.json({ limit: '2mb' }), async (req, res) => {
  const { tool, input = {} } = req.body;
  if (!tool) return res.status(400).json({ error: 'tool erforderlich' });

  try {
    const dirs     = await readdir(SOULS_DIR).catch(() => []);
    // Multi-hoster: soul_id kommt als X-Soul-Id Header (gesetzt von soul_auth.lua).
    // Fallback: erste Soul im Verzeichnis (Single-hoster / interne Aufrufe ohne Auth).
    const headerSoulId = req.headers['x-soul-id'];
    const soulId = (headerSoulId && /^[a-f0-9-]{36}$/i.test(headerSoulId))
      ? headerSoulId
      : dirs.find(d => /^[a-f0-9-]{36}$/i.test(d));
    if (!soulId) return res.status(404).json({ error: 'Keine Soul gefunden' });

    const { vaultKeyHex } = await loadVaultMeta(soulId);
    const soulPath = `${SOULS_DIR}${soulId}/sys.md`;

    switch (tool) {

      case 'soul_read': {
        const rawBuf = await readFile(soulPath);
        const text   = decryptIfNeeded(rawBuf, vaultKeyHex).toString('utf8');
        return res.json({ content: [{ type: 'text', text }] });
      }

      case 'soul_write': {
        const { section, content: newContent, mode = 'replace' } = input;
        if (!section || !newContent)
          return res.status(400).json({ error: 'section und content erforderlich' });

        const rawBuf       = await readFile(soulPath);
        const wasEncrypted = rawBuf.slice(0, 4).equals(Buffer.from([0x53, 0x59, 0x53, 0x01]));
        let   md           = decryptIfNeeded(rawBuf, vaultKeyHex).toString('utf8');

        // Aligned mit soul_write.mjs updateSection
        const re = new RegExp(
          `(## ${escapeRegex(section)}[ \\t]*\\n)([\\s\\S]*?)(?=\\n## |$)`
        );

        if (re.test(md)) {
          md = md.replace(re, (_, h, existing) => {
            const trim = existing.trim();
            let body;
            if (mode === 'prepend')     body = trim ? `${newContent}\n\n${trim}` : newContent;
            else if (mode === 'append') body = trim ? `${trim}\n\n${newContent}` : newContent;
            else                        body = newContent;
            return `${h}${body.trim()}\n\n`;
          });
        } else {
          // Sektion existiert nicht → am Ende anlegen
          md = md.trimEnd() + `\n\n## ${section}\n${newContent.trim()}\n`;
        }

        let writeBuf = Buffer.from(md, 'utf8');
        if (wasEncrypted && vaultKeyHex) writeBuf = encryptBuf(writeBuf, vaultKeyHex);
        await writeFile(soulPath, writeBuf);

        const verb = mode === 'prepend' ? 'ergänzt (Anfang)' : mode === 'append' ? 'ergänzt (Ende)' : 'ersetzt';
        return res.json({ content: [{ type: 'text', text: `Sektion "${section}" ${verb}.` }] });
      }

      // Ersetzt/fügt ein Feld im Klartextinhalt von sys.md ein (key: value — überall im Dokument)
      case 'soul_patch_field': {
        const { key: pfKey, value: pfVal } = input;
        if (!pfKey || pfVal === undefined)
          return res.status(400).json({ error: 'key und value erforderlich' });
        const rawBuf       = await readFile(soulPath);
        const wasEncrypted = rawBuf.slice(0, 4).equals(Buffer.from([0x53, 0x59, 0x53, 0x01]));
        let   md           = decryptIfNeeded(rawBuf, vaultKeyHex).toString('utf8');
        const re           = new RegExp(`(${pfKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:)[^\\n]*`, 'g');
        if (re.test(md)) {
          md = md.replace(re, `$1 ${pfVal}`);
        } else {
          // Nicht gefunden → ans Ende des Frontmatter oder des Dokuments
          const fmEnd = md.indexOf('\n---\n');
          if (fmEnd !== -1) md = md.slice(0, fmEnd) + `\n${pfKey}: ${pfVal}` + md.slice(fmEnd);
          else md = md.trimEnd() + `\n${pfKey}: ${pfVal}\n`;
        }
        let writeBuf = Buffer.from(md, 'utf8');
        if (wasEncrypted && vaultKeyHex) writeBuf = encryptBuf(writeBuf, vaultKeyHex);
        await writeFile(soulPath, writeBuf);
        return res.json({ content: [{ type: 'text', text: `${pfKey} aktualisiert.` }] });
      }

      // In-App-Chat-Gegenstück zum MCP-Tool soul_draw (siehe tools/soul_draw.mjs,
      // register()) — teilt sich die eigentliche Render-/Persistenz-Logik über
      // runSoulDraw(), nur die Response-Form unterscheidet sich: der In-App-Chat
      // (useClaude.js's executeTool()) liest ausschließlich content[0].text, ein
      // type:'image'-Block würde hier ungenutzt verworfen — deshalb reine
      // Textzusammenfassung statt des MCP-Pfads Bild+Text. Kein bearer-Token für
      // sharedFileUrl() verfügbar (dieser Endpunkt braucht laut obigem Kommentar
      // bewusst keine eigene Auth, der Proxy hat schon geprüft) — runSoulDraw()
      // behandelt token=null bereits als "keine externe View-URL bauen", die
      // vault-shared://-URL bleibt trotzdem nutzbar.
      case 'soul_draw': {
        const { canvas_id, width, height, background, strokes, description } = input;
        if (!canvas_id || !Array.isArray(strokes) || strokes.length === 0) {
          return res.status(400).json({ error: 'canvas_id und strokes (min. 1 Strich) erforderlich' });
        }
        const result = await runSoulDraw(soulId, null, { canvas_id, width, height, background, strokes, description });
        const text = formatSoulDrawSummary(canvas_id, strokes.length, result);
        return res.json({ content: [{ type: 'text', text }] });
      }

      // In-App-Chat-Gegenstück zu vault_shared_list (siehe tools/vault_shared_list.mjs) —
      // direkter Filesystem-Zugriff (listVaultSharedFs) statt des MCP-Pfads HTTP-
      // Roundtrip über /api/vault/shared-list, aus demselben Grund wie bei
      // soul_draw oben: kein Bearer-Token in diesem Endpunkt verfügbar/nötig.
      case 'vault_shared_list': {
        const { limit = 10 } = input;
        const files = await listVaultSharedFs(soulId);
        return res.json({ content: [{ type: 'text', text: formatVaultSharedList(files, limit) }] });
      }

      case 'vault_manifest': {
        const vaultDir = `${SOULS_DIR}${soulId}/vault/`;
        const files = [];
        async function scanDir(dir, prefix = '') {
          const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
          for (const e of entries) {
            if (e.isDirectory()) await scanDir(`${dir}${e.name}/`, `${prefix}${e.name}/`);
            else files.push(`${prefix}${e.name}`);
          }
        }
        await scanDir(vaultDir);
        const text = files.length ? files.join('\n') : 'Vault ist leer.';
        return res.json({ content: [{ type: 'text', text }] });
      }

      case 'context_get': {
        const { name } = input;
        if (!name) return res.status(400).json({ error: 'name erforderlich' });
        const ctxPath = `${SOULS_DIR}${soulId}/vault/context/${name}`;
        const rawCtxBuf = await readFile(ctxPath).catch(() => null);
        if (!rawCtxBuf) return res.json({ content: [{ type: 'text', text: `Datei "${name}" nicht gefunden.` }] });
        let text;
        try {
          const { vaultKeyHex: ctxVaultKeyHex } = await loadVaultMeta(soulId);
          text = decryptIfNeeded(rawCtxBuf, ctxVaultKeyHex).toString('utf8');
        } catch (err) {
          return res.json({ content: [{ type: 'text', text: `Datei "${name}" verschlüsselt, aber nicht lesbar: ${err.message}` }] });
        }
        return res.json({ content: [{ type: 'text', text }] });
      }

      case 'mind_read': {
        const mindPath = `${SOULS_DIR}${soulId}/vault/context/mind.md`;
        let text;
        let rawMind = null;
        try {
          rawMind = await readFile(mindPath);
        } catch {
          await mkdir(`${SOULS_DIR}${soulId}/vault/context`, { recursive: true });
          await writeFile(mindPath, DEFAULT_MIND, 'utf8');
          text = DEFAULT_MIND;
        }
        if (rawMind) {
          try {
            const { vaultKeyHex: mindVaultKeyHex } = await loadVaultMeta(soulId);
            text = decryptIfNeeded(rawMind, mindVaultKeyHex).toString('utf8');
          } catch {
            // Verschlüsselt, aber kein/ungültiger Vault-Key: Datei NICHT anfassen,
            // nur für diese eine Antwort auf das Default-Template zurückfallen.
            text = DEFAULT_MIND;
          }
        }
        return res.json({ content: [{ type: 'text', text }] });
      }

      case 'mind_write': {
        const { section, content: newContent, mode = 'replace' } = input;
        if (!section || !newContent)
          return res.status(400).json({ error: 'section und content erforderlich' });
        if (MIND_WRITE_PROTECTED.has(section))
          return res.status(403).json({ error: `Sektion "${section}" ist schreibgeschützt.` });

        const mindPath = `${SOULS_DIR}${soulId}/vault/context/mind.md`;
        const { vaultKeyHex: mwVaultKeyHex, cipherMode: mwCipherMode } = await loadVaultMeta(soulId);
        const rawMwBuf = await readFile(mindPath).catch(() => null);
        let md;
        if (!rawMwBuf) {
          md = DEFAULT_MIND;
        } else {
          try {
            md = decryptIfNeeded(rawMwBuf, mwVaultKeyHex).toString('utf8');
          } catch (err) {
            return res.status(403).json({ error: `mind.md verschlüsselt, aber Vault-Key nicht verfügbar: ${err.message}` });
          }
        }

        const re = new RegExp(
          `(## ${escapeRegex(section)}[ \\t]*\\n)([\\s\\S]*?)(?=\\n## |$)`
        );
        if (re.test(md)) {
          md = md.replace(re, (_, h, existing) => {
            const trim = existing.trim();
            let body;
            if (mode === 'prepend')     body = trim ? `${newContent}\n\n${trim}` : newContent;
            else if (mode === 'append') body = trim ? `${trim}\n\n${newContent}` : newContent;
            else                        body = newContent;
            return `${h}${body.trim()}\n\n`;
          });
        } else {
          md = md.trimEnd() + `\n\n## ${section}\n${newContent.trim()}\n`;
        }

        await mkdir(`${SOULS_DIR}${soulId}/vault/context`, { recursive: true });
        let mwOutBuf = Buffer.from(md, 'utf8');
        if (mwCipherMode === 'ciphered' && mwVaultKeyHex) mwOutBuf = encryptBuf(mwOutBuf, mwVaultKeyHex);
        await writeFile(mindPath, mwOutBuf);
        const verb = mode === 'prepend' ? 'ergänzt (Anfang)' : mode === 'append' ? 'ergänzt (Ende)' : 'ersetzt';
        return res.json({ content: [{ type: 'text', text: `Sektion "${section}" in mind.md ${verb}.` }] });
      }

      case 'health_check': {
        const healthPath = `${SOULS_DIR}${soulId}/vault/context/health.md`;
        const healthBuf = await readFile(healthPath).catch(() => null);
        let rawText = null;
        if (healthBuf) {
          const { vaultKeyHex } = await loadVaultMeta(soulId);
          try { rawText = decryptIfNeeded(healthBuf, vaultKeyHex).toString('utf8'); } catch { rawText = null; }
        }
        if (!rawText) {
          return res.json({ content: [{ type: 'text', text: JSON.stringify({
            available: false,
            message: 'health.md nicht gefunden. Aktivierung: bash /opt/sys/health-sync/install.sh',
          }, null, 2) }] });
        }
        // ── Parse ──────────────────────────────────────────────────────────────
        const parseBlock = (block, target) => {
          if (!block) return;
          for (const line of block.split('\n')) {
            if (/Resting HR/i.test(line)) { const m = line.match(/(\d+)\s*bpm/); if (m) target.resting_hr = +m[1]; }
            if (/Sleep/i.test(line)) { const h = line.match(/(\d+)h/); const mn = line.match(/(\d+)min/); if (h||mn) target.sleep_minutes = (h?+h[1]*60:0)+(mn?+mn[1]:0); }
            if (/Steps/i.test(line)) { const m = line.match(/([\d.]+)\s*\(avg\)/); if (m) target.steps = +m[1].replace(/\./g,''); }
            if (/Active days/i.test(line)) { const m = line.match(/(\d+)/); if (m) target.active_days = +m[1]; }
          }
        };
        const parsed = { source: null, last_sync: null, weekly: {}, monthly: {} };
        const sourceM = rawText.match(/^source:\s*(.+)$/m);
        const syncM   = rawText.match(/^last_sync:\s*(.+)$/m);
        if (sourceM) parsed.source    = sourceM[1].trim();
        if (syncM)   parsed.last_sync = syncM[1].trim();
        parseBlock(rawText.match(/## This Week[^\n]*\n([\s\S]*?)(?=\n##|$)/)?.[1], parsed.weekly);
        parseBlock(rawText.match(/## Monthly Summary[^\n]*\n([\s\S]*?)(?=\n##|$)/)?.[1], parsed.monthly);
        // ── Recent Activities ─────────────────────────────────────────────────
        const actBlock = rawText.match(/## Recent Activities\n([\s\S]*?)(?=\n##|$)/)?.[1] || '';
        const recent_activities = [];
        for (const line of actBlock.split('\n')) {
          const m = line.match(/^-\s+(\d{4}-\d{2}-\d{2})\s+(\S+)(.*)/);
          if (!m) continue;
          const rest = m[3];
          const durM  = rest.match(/(\d+)\s*min/);
          const distM = rest.match(/([\d.]+)\s*km/);
          const hrM   = rest.match(/♥\s*([\d.]+)/);
          recent_activities.push({
            date:         m[1],
            type:         m[2],
            duration_min: durM  ? +durM[1]  : null,
            distance_km:  distM ? +distM[1] : null,
            avg_hr:       hrM   ? +hrM[1]   : null,
          });
        }
        // ── Classify ───────────────────────────────────────────────────────────
        const classify = (v, ranges) => { if (v==null) return null; for (const r of ranges) if (v<=r.max) return {status:r.status,label:r.label,tip:r.tip}; return null; };
        const HR    = [{max:40,status:'very_low',label:'Sehr niedrig',tip:'Unter 40 bpm. Bei Schwindel ärztlich abklären.'},{max:60,status:'athletic',label:'Athletisch',tip:'Unter 60 bpm — gute kardiovaskuläre Fitness.'},{max:70,status:'good',label:'Gut',tip:'Guter Ruhepuls.'},{max:80,status:'normal',label:'Normal',tip:'Normaler Bereich.'},{max:100,status:'elevated',label:'Erhöht',tip:'Leicht erhöht. Ausdauertraining und Schlafhygiene helfen.'},{max:999,status:'high',label:'Hoch',tip:'Über 100 bpm — ärztliche Abklärung empfehlenswert.'}];
        const SL    = [{max:300,status:'critical',label:'Kritisch',tip:'Unter 5h — schweres Schlafdefizit.'},{max:360,status:'too_low',label:'Zu wenig',tip:'Unter 6h — unter der Mindestempfehlung.'},{max:420,status:'borderline',label:'Knapp',tip:'6–7h — Ziel: 7h+ für optimale Erholung.'},{max:540,status:'optimal',label:'Optimal',tip:'7–9h — idealer Bereich.'},{max:999,status:'long',label:'Viel',tip:'Über 9h.'}];
        const ST    = [{max:3000,status:'sedentary',label:'Sitzend',tip:'Unter 3.000 — sehr geringe Bewegung.'},{max:5000,status:'low',label:'Wenig aktiv',tip:'3.000–5.000 — unter dem Minimum.'},{max:7500,status:'moderate',label:'Mäßig aktiv',tip:'5.000–7.500 — Ziel: 7.500+/Tag.'},{max:10000,status:'active',label:'Aktiv',tip:'7.500–10.000 — empfohlener Bereich.'},{max:99999,status:'very_active',label:'Sehr aktiv',tip:'Über 10.000 — ausgezeichnet.'}];
        const AD    = [{min:0,max:1,status:'low',label:'Kaum aktiv'},{min:2,max:3,status:'moderate',label:'Mäßig'},{min:4,max:5,status:'good',label:'Gut'},{min:6,max:7,status:'great',label:'Ausgezeichnet'}];
        const SC    = {athletic:5,optimal:5,very_active:5,great:5,good:4,normal:3,active:3,moderate:3,borderline:2,low:2,elevated:1,too_low:1,sedentary:1,critical:0,high:0,very_low:0};
        const w = parsed.weekly, m = parsed.monthly;
        const hrCl = classify(w.resting_hr, HR), slCl = classify(w.sleep_minutes, SL), stCl = classify(w.steps, ST);
        const adCl = w.active_days != null ? AD.find(r => w.active_days >= r.min && w.active_days <= r.max) : null;
        const scores = [hrCl,slCl,stCl,adCl].filter(Boolean).map(c => SC[c.status]??2);
        const avg = scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : null;
        const overall = avg==null ? null : avg>=4.2 ? {status:'excellent',label:'Sehr gut'} : avg>=3.2 ? {status:'good',label:'Gut'} : avg>=2.0 ? {status:'fair',label:'Verbesserungspotenzial'} : {status:'poor',label:'Aufmerksamkeit empfohlen'};
        const ageDays = parsed.last_sync ? Math.floor((Date.now()-new Date(parsed.last_sync).getTime())/86400000) : null;
        let hrTrend = null;
        if (w.resting_hr!=null&&m.resting_hr!=null) { const d=w.resting_hr-m.resting_hr; hrTrend=d<=-3?'improving':d>=3?'worsening':'stable'; }
        const fmtSleep = v => v==null?null:`${Math.floor(v/60)}h ${v%60}min`;
        const fmtSteps = v => v==null?null:v.toLocaleString('de-DE');
        const tips = [hrCl,slCl,stCl].filter(c=>c&&!['athletic','optimal','very_active','good','active'].includes(c.status)).map(c=>c.tip);
        return res.json({ content: [{ type: 'text', text: JSON.stringify({
          available: true, source: parsed.source, last_sync: parsed.last_sync, data_age_days: ageDays, data_stale: ageDays!=null&&ageDays>9,
          weekly: { resting_hr:{value:w.resting_hr,unit:'bpm',formatted:w.resting_hr?`${w.resting_hr} bpm`:null,...(hrCl||{})}, sleep:{value:w.sleep_minutes,unit:'min',formatted:fmtSleep(w.sleep_minutes),...(slCl||{})}, steps:{value:w.steps,unit:'steps/day',formatted:fmtSteps(w.steps),...(stCl||{})}, active_days:{value:w.active_days,of:7,...(adCl||{})} },
          monthly: { resting_hr:{value:m.resting_hr,formatted:m.resting_hr?`${m.resting_hr} bpm`:null}, sleep:{value:m.sleep_minutes,formatted:fmtSleep(m.sleep_minutes)}, active_days:{value:m.active_days} },
          hr_trend: hrTrend, overall, tips,
          recent_activities,
        }, null, 2) }] });
      }

      case 'food_log': {
        const { name, rating, notes = '' } = input;
        if (!name) return res.status(400).json({ error: 'name erforderlich' });
        const r = (rating||'').toUpperCase().slice(0,1);
        if (!['A','B','C','D','E'].includes(r)) return res.status(400).json({ error: 'rating muss A–E sein' });
        const today        = new Date().toISOString().slice(0,10);
        const currentMonth = today.slice(0,7);
        const cleanNotes   = (notes||'').replace(/[\n\r]/g,' ').trim();
        const newEntry     = cleanNotes ? `- ${today} | ${r} | ${name} — ${cleanNotes}` : `- ${today} | ${r} | ${name}`;
        const healthPath   = `${SOULS_DIR}${soulId}/vault/context/health.md`;
        await mkdir(`${SOULS_DIR}${soulId}/vault/context`, { recursive: true });
        const healthRawBuf = await readFile(healthPath).catch(() => null);
        const { vaultKeyHex: foodVaultKeyHex } = await loadVaultMeta(soulId);
        const wasHealthEncrypted = !!healthRawBuf && healthRawBuf.slice(0, 4).equals(Buffer.from([0x53, 0x59, 0x53, 0x01]));
        const content = healthRawBuf ? decryptIfNeeded(healthRawBuf, foodVaultKeyHex).toString('utf8') : '';
        // Parse zones
        let head = '', foodLines = [], annualLines = [], zone = 'head';
        for (const line of (content+'\n').split('\n').slice(0,-1)) {
          if      (line==='## Food Log')       zone='food';
          else if (line==='## Annual Journal') zone='annual';
          else if (zone==='head')    head       += line+'\n';
          else if (zone==='food')    foodLines.push(line);
          else                       annualLines.push(line);
        }
        head = head.trimEnd();
        // Separate by month
        const thisMonth = [], past = {};
        for (const line of foodLines) {
          const mm = line.match(/^- (\d{4}-\d{2})-\d{2} \| [ABCDE] \|/);
          if (mm) { if (mm[1]===currentMonth) thisMonth.push(line); else { if(!past[mm[1]])past[mm[1]]=[]; past[mm[1]].push(line); } }
        }
        // Archive past months
        const newSummaries = [];
        for (const [month, lines] of Object.entries(past).sort().reverse()) {
          const counts={A:0,B:0,C:0,D:0,E:0}; const topMeals=[];
          for (const l of lines) { const rm=l.match(/\| ([ABCDE]) \|/); if(rm){counts[rm[1]]++; if('AB'.includes(rm[1])){const meal=l.replace(/^- \d{4}-\d{2}-\d{2} \| [ABCDE] \| /,'').split(' — ')[0].trim(); if(meal)topMeals.push(meal);}}}
          const total=Object.values(counts).reduce((a,b)=>a+b,0);
          if(total>0){const sc=(counts.A*5+counts.B*4+counts.C*3+counts.D*2+counts.E)/total; const avg=sc>=4.5?'A':sc>=3.5?'B':sc>=2.5?'C':sc>=1.5?'D':'E'; const seen=new Set(); const uniq=topMeals.filter(m=>seen.has(m)?false:seen.add(m)).slice(0,3); let hi=uniq.join(', ')||'–'; if(hi.length>70)hi=hi.slice(0,67)+'…'; newSummaries.push(`### ${month}\n- Food: ${avg} (avg) — ${counts.A}×A ${counts.B}×B ${counts.C}×C ${counts.D}×D ${counts.E}×E · ${total} meals\n- Top: ${hi}`);}
        }
        // Rebuild
        thisMonth.unshift(newEntry);
        let out = head+'\n\n## Food Log\n'+thisMonth.join('\n');
        out += '\n\n## Annual Journal';
        for (const s of newSummaries) out += '\n'+s;
        const existingAnnual = annualLines.join('\n').trim();
        if (existingAnnual) out += '\n'+existingAnnual;
        out += '\n';
        let healthOutBuf = Buffer.from(out, 'utf8');
        if (wasHealthEncrypted && foodVaultKeyHex) healthOutBuf = encryptBuf(healthOutBuf, foodVaultKeyHex);
        await writeFile(healthPath, healthOutBuf);
        await ensureContextRegistered(soulId, 'health.md');
        const msg = newSummaries.length>0
          ? `Eingetragen: ${newEntry}\n\nMonatswechsel: Vormonat ins Annual Journal archiviert.`
          : `Eingetragen: ${newEntry}`;
        return res.json({ content: [{ type: 'text', text: msg }] });
      }

      case 'shop_log': {
        const { name, category = 'Sonstiges', price, status = 'purchased', notes = '' } = input;
        if (!name) return res.status(400).json({ error: 'name erforderlich' });
        const VALID_CATS = ['Electronics','Kleidung','Sport','Wohnen','Bücher','Lebensmittel','Sonstiges'];
        const cat = VALID_CATS.includes(category) ? category : 'Sonstiges';
        const st  = status === 'wishlist' ? 'wishlist' : 'purchased';
        const today        = new Date().toISOString().slice(0,10);
        const currentMonth = today.slice(0,7);
        const currentYear  = today.slice(0,4);
        const priceStr     = (price != null && price !== '') ? ` | €${Number(price).toFixed(2)}` : '';
        const cleanNotes   = (notes||'').replace(/[\n\r]/g,' ').trim();
        const newEntry     = cleanNotes
          ? `- ${today} | ${st} | ${cat}${priceStr} | ${name} — ${cleanNotes}`
          : `- ${today} | ${st} | ${cat}${priceStr} | ${name}`;

        const shopPath = `${SOULS_DIR}${soulId}/vault/context/shopping.md`;
        await mkdir(`${SOULS_DIR}${soulId}/vault/context`, { recursive: true });
        const content = await readFile(shopPath, 'utf8').catch(() => '');

        let head='', wishlistLines=[], purchaseLines=[], annualLines=[], zone='head';
        for (const line of (content+'\n').split('\n').slice(0,-1)) {
          if      (line==='## Wishlist')                   zone='wishlist';
          else if (line==='## Recent Purchases')           zone='purchases';
          else if (line.startsWith('## Monthly Summary'))  zone='skip';
          else if (line.startsWith('## Annual Categories'))zone='annual';
          else if (zone==='head')      head+=line+'\n';
          else if (zone==='wishlist')  wishlistLines.push(line);
          else if (zone==='purchases') purchaseLines.push(line);
          else if (zone==='annual')    annualLines.push(line);
        }
        head = head.replace(/last_updated:.*\n/, `last_updated: ${today}\n`);
        if (!head.includes('last_updated')) head=head.trimEnd()+`\nlast_updated: ${today}\n`;

        if (st==='wishlist') {
          wishlistLines.unshift(newEntry);
        } else {
          wishlistLines = wishlistLines.filter(l => !l.toLowerCase().includes(name.toLowerCase()));
          purchaseLines.unshift(newEntry);
          purchaseLines = purchaseLines.filter(l=>l.trim()).slice(0,60);
        }

        const thisMoPurch = purchaseLines.filter(l=>l.match(new RegExp(`^- ${currentMonth}`))&&l.includes('| purchased |'));
        let monthlyContent = '_No entries yet._';
        if (thisMoPurch.length>0) {
          const cc={}; let tot=0,pc=0;
          for(const l of thisMoPurch){const cm=l.match(/\| purchased \| (\w+)/);if(cm)cc[cm[1]]=(cc[cm[1]]||0)+1;const pm=l.match(/€([\d.]+)/);if(pm){tot+=parseFloat(pm[1]);pc++;}}
          monthlyContent=Object.entries(cc).map(([c,n])=>`- ${c}: ${n}`).join('\n');
          if(pc>0)monthlyContent+=`\n- Total: €${tot.toFixed(2)}`;
        }
        const yrPurch=purchaseLines.filter(l=>l.match(new RegExp(`^- ${currentYear}`))&&l.includes('| purchased |'));
        let annualContent='_No entries yet._';
        if(yrPurch.length>0){const yc={};for(const l of yrPurch){const cm=l.match(/\| purchased \| (\w+)/);if(cm)yc[cm[1]]=(yc[cm[1]]||0)+1;}annualContent=Object.entries(yc).map(([c,n])=>`- ${c}: ${n}`).join('\n');}

        let out=head.trimEnd()+'\n\n## Wishlist\n'+(wishlistLines.filter(l=>l.trim()).join('\n')||'_Empty._');
        out+='\n\n## Recent Purchases\n'+(purchaseLines.filter(l=>l.trim()).join('\n')||'_No entries yet._');
        out+=`\n\n## Monthly Summary (${currentMonth})\n${monthlyContent}`;
        out+=`\n\n## Annual Categories (${currentYear})\n${annualContent}\n`;
        await writeFile(shopPath, out, 'utf8');
        await ensureContextRegistered(soulId, 'shopping.md');
        return res.json({ content: [{ type: 'text', text: `Eingetragen: ${newEntry}` }] });
      }

      case 'shop_check': {
        const shopPath = `${SOULS_DIR}${soulId}/vault/context/shopping.md`;
        const rawText  = await readFile(shopPath, 'utf8').catch(() => null);
        if (!rawText) {
          return res.json({ content: [{ type: 'text', text: JSON.stringify({
            available: false,
            message: 'shopping.md nicht gefunden. Noch kein Produkt erfasst.',
            tip: 'Foto eines Produkts schicken oder "ich möchte [X] kaufen" sagen.',
          }, null, 2) }] });
        }
        let location=null, locationFrom=null;
        try {
          const rawBuf  = await readFile(`${SOULS_DIR}${soulId}/sys.md`);
          const sysText = decryptIfNeeded(rawBuf, vaultKeyHex).toString('utf8');
          const locM    = sysText.match(/(?:Wohnort|Stadt|Standort|Location|wohnt in|lebt in)[:\s]+([^\n,\.]{2,40})/i);
          if (locM) { location=locM[1].trim(); locationFrom='sys.md'; }
        } catch {}
        function parseLine(l) {
          const m=l.match(/^-\s+(\d{4}-\d{2}-\d{2})\s+\|\s+(\w+)\s+\|\s+(\w+)(?:\s+\|\s+€([\d.]+))?\s+\|\s+(.+)$/);
          if(!m) return null;
          return {date:m[1],status:m[2],category:m[3],price:m[4]?parseFloat(m[4]):null,name:m[5].split(' — ')[0].trim(),notes:m[5].includes(' — ')?m[5].split(' — ').slice(1).join(' — '):null};
        }
        const wishlist=[], purchases=[];
        for(const l of (rawText.match(/## Wishlist\n([\s\S]*?)(?=\n##|$)/)?.[1]||'').split('\n')){const p=parseLine(l);if(p)wishlist.push(p);}
        for(const l of (rawText.match(/## Recent Purchases\n([\s\S]*?)(?=\n##|$)/)?.[1]||'').split('\n').slice(0,15)){const p=parseLine(l);if(p)purchases.push(p);}
        const syncM=rawText.match(/^last_updated:\s*(.+)$/m);
        const lastUpdated=syncM?syncM[1].trim():null;
        const ageDays=lastUpdated?Math.floor((Date.now()-new Date(lastUpdated).getTime())/86400000):null;
        const searchTips=location
          ?{local_stores:`"[Produkt] kaufen ${location}"`,price_compare:'"[Produkt] Preisvergleich"',online:'"[Produkt] günstig online kaufen"'}
          :{price_compare:'"[Produkt] Preisvergleich"',online:'"[Produkt] günstig online kaufen"'};
        return res.json({ content: [{ type: 'text', text: JSON.stringify({
          available:true, last_updated:lastUpdated, data_age_days:ageDays,
          location, location_from:locationFrom,
          location_hint: location?null:'Wohnort in sys.md eintragen (z.B. "Wohnort: Berlin") für lokale Händler.',
          wishlist, recent_purchases:purchases,
          monthly_summary: (rawText.match(/## Monthly Summary[^\n]*\n([\s\S]*?)(?=\n##|$)/)?.[1]||'').trim(),
          annual_categories: (rawText.match(/## Annual Categories[^\n]*\n([\s\S]*?)(?=\n##|$)/)?.[1]||'').trim(),
          search_tips: searchTips,
        }, null, 2) }] });
      }

      default: {
        // Generic MCP fallback: get soul's service token → call /mcp locally
        try {
          const authRaw = await readFile(`${SOULS_DIR}${soulId}/authorized_services.json`, 'utf8').catch(() => '{}');
          const authData = JSON.parse(authRaw);
          // Service-Token kann 64-Hex (klassisch) oder wh_... (ElevenLabs-Style,
          // siehe create_agent.lua webhook_token) sein -- die alte Hex-only-Regex
          // fand nie den ElevenLabs-Token, wodurch jeder Tool-Call, der hier statt
          // in einem der obigen case-Blöcke landet, mit 400 fehlschlug.
          const serviceToken = Object.keys(authData).find(k => /^([a-f0-9]{64}|wh_[a-f0-9]+)$/.test(k));
          if (!serviceToken) return res.status(400).json({ error: `Tool nicht verfügbar: ${tool}` });

          const mcpRes = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json, text/event-stream',
              'Authorization': `Bearer ${serviceToken}`,
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'tools/call',
              params: { name: tool, arguments: input },
              id: 1,
            }),
            signal: AbortSignal.timeout(25000),
          });

          const text = await mcpRes.text();
          // StreamableHTTP kann SSE oder JSON zurückgeben
          // JSON-Zeilen parsen: letzte gültige Zeile mit "result" oder "error" nehmen
          let result = null;
          for (const line of text.split('\n')) {
            const l = line.startsWith('data: ') ? line.slice(6) : line;
            if (!l.trim()) continue;
            try {
              const parsed = JSON.parse(l);
              if (parsed.result !== undefined || parsed.error !== undefined) result = parsed;
            } catch {}
          }
          if (!result) return res.status(502).json({ error: 'MCP-Antwort nicht parsebar' });
          if (result.error) return res.status(400).json({ error: result.error.message || JSON.stringify(result.error) });
          return res.json(result.result ?? { ok: true });
        } catch (e) {
          return res.status(500).json({ error: `Tool-Fallback-Fehler: ${e.message}` });
        }
      }
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Polygon-Provider (wiederverwendet aus blockchain.mjs Logik)
const NETWORKS = {
  amoy: { rpc: 'https://rpc-amoy.polygon.technology' },
  main: { rpc: 'https://polygon-bor-rpc.publicnode.com' },
};
function getProvider() {
  const net = NETWORKS[process.env.POLYGON_NETWORK] ?? NETWORKS.main;
  return new ethers.JsonRpcProvider(net.rpc);
}

// Soul-Verifikation
app.get('/internal/verify/:soul_id', async (req, res) => {
  const { soul_id } = req.params;
  if (!soul_id || !/^[a-f0-9-]{36}$/i.test(soul_id)) {
    return res.status(400).json({ error: 'Invalid soul_id' });
  }
  try {
    const result = await verifyHuman(soul_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POL-Transaktions-Verifikation
// POST /internal/verify-tx  { tx_hash, expected_to, min_pol }
app.post('/internal/verify-tx', async (req, res) => {
  const { tx_hash, expected_to, min_pol } = req.body;

  if (!tx_hash || !/^0x[0-9a-fA-F]{64}$/.test(tx_hash)) {
    return res.status(400).json({ error: 'Invalid tx_hash' });
  }
  if (!expected_to || !/^0x[0-9a-fA-F]{40}$/.test(expected_to)) {
    return res.status(400).json({ error: 'Invalid expected_to address' });
  }

  const minWei = ethers.parseEther(String(min_pol || '0.001'));

  try {
    const provider = getProvider();

    // TX + Receipt parallel abrufen
    const [tx, receipt] = await Promise.all([
      provider.getTransaction(tx_hash),
      provider.getTransactionReceipt(tx_hash),
    ]);

    if (!tx) {
      return res.status(404).json({ ok: false, reason: 'tx_not_found' });
    }

    // Mindestens 1 Bestätigung
    if (!receipt || receipt.status !== 1) {
      return res.status(422).json({ ok: false, reason: 'not_confirmed', confirmations: receipt?.confirmations ?? 0 });
    }

    // Empfänger prüfen (case-insensitive)
    if (!tx.to || tx.to.toLowerCase() !== expected_to.toLowerCase()) {
      return res.status(422).json({ ok: false, reason: 'wrong_recipient', got: tx.to, expected: expected_to });
    }

    // Betrag prüfen
    if (tx.value < minWei) {
      return res.status(422).json({
        ok: false,
        reason: 'insufficient_amount',
        got_pol:      ethers.formatEther(tx.value),
        required_pol: ethers.formatEther(minWei),
      });
    }

    const block = await provider.getBlock(receipt.blockNumber);

    res.json({
      ok:           true,
      tx_hash:      tx_hash,
      from:         tx.from,
      to:           tx.to,
      pol_amount:   ethers.formatEther(tx.value),
      block:        receipt.blockNumber,
      confirmed_at: block ? new Date(Number(block.timestamp) * 1000).toISOString() : null,
      network:      process.env.POLYGON_NETWORK ?? 'main',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── x402-Zahlungsverifikation (USDC auf Polygon) ──────────────────────────────
// Zweite, zusätzliche Zahlungsschiene neben der direkten POL-Überweisung oben —
// siehe lua/soul_pay.lua für Pricing/EU-Consent/Token-Ausstellung, die für beide
// Schienen identisch bleiben. Facilitator: Polygons eigener, produktionsreifer
// x402-Facilitator (kein Account/API-Key nötig — bewusst statt Coinbases
// CDP-Facilitator gewählt, siehe Plan). SYS verifiziert/settelt NIE selbst
// (kein Private Key mit Guthaben auf dem Server) — der Facilitator hält die
// Relayer-Wallets, SYS bleibt beim etablierten "nur lesen/verifizieren"-Modell.
const X402_NETWORKS = {
  amoy: {
    chain:       'eip155:80002',
    facilitator: 'https://x402-amoy.polygon.technology',
    usdc:        '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
  },
  main: {
    chain:       'eip155:137',
    facilitator: 'https://x402.polygon.technology',
    usdc:        '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
  },
};

function getX402Config() {
  return X402_NETWORKS[process.env.POLYGON_NETWORK] ?? X402_NETWORKS.main;
}

// USDC hat 6 Dezimalstellen (nicht 18 wie POL) — atomare Einheit für "amount".
function usdcToAtomic(usdc) {
  return String(Math.round(Number(usdc) * 1e6));
}

// POST /internal/verify-x402  { payment_header, expected_to, expected_amount_usdc }
// payment_header: base64-kodierter Inhalt des PAYMENT-SIGNATURE-Headers (PaymentPayload).
// expected_to / expected_amount_usdc: von soul_pay.lua bereits aufgelöst (Wallet,
// aktuelle Preis-Quote) — dieser Endpunkt verifiziert nur, entscheidet keine Preise.
app.post('/internal/verify-x402', async (req, res) => {
  const { payment_header, expected_to, expected_amount_usdc } = req.body;

  if (!payment_header || typeof payment_header !== 'string') {
    return res.status(400).json({ ok: false, reason: 'missing_payment_header' });
  }
  if (!expected_to || !/^0x[0-9a-fA-F]{40}$/.test(expected_to)) {
    return res.status(400).json({ ok: false, reason: 'invalid_expected_to' });
  }
  const expectedAmountAtomic = usdcToAtomic(expected_amount_usdc || '0');
  if (!(Number(expected_amount_usdc) > 0)) {
    return res.status(400).json({ ok: false, reason: 'invalid_expected_amount' });
  }

  let paymentPayload;
  try {
    paymentPayload = JSON.parse(Buffer.from(payment_header, 'base64').toString('utf8'));
  } catch {
    return res.status(400).json({ ok: false, reason: 'malformed_payment_header' });
  }

  const net = getX402Config();
  const accepted = paymentPayload?.accepted;

  // ── Defense in depth: Kernfelder selbst prüfen, bevor dem Facilitator vertraut
  // wird (gleiches Prinzip wie expected_to/min_pol bei /internal/verify-tx oben).
  if (!accepted || typeof accepted !== 'object') {
    return res.status(400).json({ ok: false, reason: 'missing_accepted_requirements' });
  }
  if (accepted.network !== net.chain) {
    return res.status(422).json({ ok: false, reason: 'wrong_network', got: accepted.network, expected: net.chain });
  }
  if (String(accepted.asset || '').toLowerCase() !== net.usdc.toLowerCase()) {
    return res.status(422).json({ ok: false, reason: 'wrong_asset', got: accepted.asset, expected: net.usdc });
  }
  if (String(accepted.payTo || '').toLowerCase() !== expected_to.toLowerCase()) {
    return res.status(422).json({ ok: false, reason: 'wrong_recipient', got: accepted.payTo, expected: expected_to });
  }
  if (BigInt(accepted.amount || '0') < BigInt(expectedAmountAtomic)) {
    return res.status(422).json({
      ok: false, reason: 'insufficient_amount',
      got_usdc_atomic: accepted.amount, required_usdc_atomic: expectedAmountAtomic,
    });
  }

  const facilitator = new HTTPFacilitatorClient({ url: net.facilitator });

  // verify()/settle() können statt eines {isValid:false}/{success:false}-Ergebnisses
  // auch eine VerifyError/SettleError WERFEN (live getestet: ein Payload mit
  // syntaktisch falscher Signatur/Nonce löst eine geworfene VerifyError aus, kein
  // normales Resultat-Objekt) — beide Formen separat abfangen, sonst würde ein
  // reiner Validierungsfehler fälschlich als "facilitator_unreachable" gemeldet.
  let verifyResult;
  try {
    verifyResult = await facilitator.verify(paymentPayload, accepted);
  } catch (err) {
    if (err instanceof VerifyError) {
      return res.status(422).json({ ok: false, reason: err.invalidReason || 'verify_failed', message: err.invalidMessage, payer: err.payer });
    }
    return res.status(502).json({ ok: false, reason: 'facilitator_unreachable', error: err.message });
  }
  if (!verifyResult.isValid) {
    return res.status(422).json({
      ok: false, reason: verifyResult.invalidReason || 'verify_failed',
      message: verifyResult.invalidMessage, payer: verifyResult.payer,
    });
  }

  try {
    const settleResult = await facilitator.settle(paymentPayload, accepted);
    if (!settleResult.success) {
      return res.status(422).json({
        ok: false, reason: settleResult.errorReason || 'settle_failed',
        message: settleResult.errorMessage, payer: settleResult.payer,
      });
    }

    res.json({
      ok:           true,
      tx_hash:      settleResult.transaction,
      from:         settleResult.payer,
      usdc_amount:  (Number(settleResult.amount ?? accepted.amount) / 1e6).toFixed(6),
      network:      settleResult.network,
      confirmed_at: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof SettleError) {
      return res.status(422).json({ ok: false, reason: err.errorReason || 'settle_failed', message: err.errorMessage, payer: err.payer });
    }
    res.status(502).json({ ok: false, reason: 'facilitator_unreachable', error: err.message });
  }
});

// POST /internal/x402-finalize-invoice  { soul_id, reference_id, usdc_amount, tx_hash, confirmed_at }
// Aufgerufen von soul_pay_x402.lua NACH bestätigtem Settlement (echter, on-chain
// verifizierter Betrag) — korrigiert Rechnung + Verzichtserklärung mit dem
// TATSÄCHLICH abgebuchten Betrag, falls er von der bei accept_digital_content_terms
// gezeigten Quote abweicht (dynamischer Preis kann zwischen Zustimmung und
// tatsächlicher Zahlung minimal driften — Anker/Nachfrage ändern sich). Ohne
// diesen Schritt könnte die Rechnung einen anderen Betrag zeigen als real
// abgebucht wurde — inakzeptabel für ein Dokument mit gesetzlicher Rechnungsnummer.
// no-op (200, nichts zu tun) wenn keine invoice_meta.json existiert — z.B. weil
// EU_CONSUMER_RIGHTS deaktiviert ist oder es sich um einen PayPal-Kauf handelt
// (dort ist der Preis nie dynamisch, siehe accept_digital_content_terms.mjs).
app.post('/internal/x402-finalize-invoice', async (req, res) => {
  const { soul_id: soulId, reference_id: referenceId, usdc_amount: usdcAmount, tx_hash: txHash, confirmed_at: confirmedAt } = req.body || {};
  if (typeof soulId !== 'string' || !soulId || typeof referenceId !== 'string' || !referenceId) {
    return res.status(400).json({ ok: false, error: 'soul_id_and_reference_id_required' });
  }
  if (!(Number(usdcAmount) > 0)) {
    return res.status(400).json({ ok: false, error: 'invalid_usdc_amount' });
  }

  const purchaseDir = consentPurchaseDir(soulId, referenceId);
  const metaPath     = `${purchaseDir}/finalize_pending.json`;
  let meta;
  try {
    meta = JSON.parse(await readFile(metaPath, 'utf8'));
  } catch {
    return res.json({ ok: true, corrected: false, reason: 'no_invoice_meta' });
  }

  try {
    const correctedFields = {
      ...meta,
      price: Number(usdcAmount).toFixed(6),
    };
    const [invoicePdf, waiverPdf] = await Promise.all([
      buildInvoicePdf(correctedFields),
      buildWaiverPdf(correctedFields),
    ]);
    await Promise.all([
      writeFile(`${purchaseDir}/rechnung.pdf`, invoicePdf),
      writeFile(`${purchaseDir}/rechnung.txt`, buildInvoiceTxt(correctedFields), 'utf8'),
      writeFile(`${purchaseDir}/verzichtserklaerung.pdf`, waiverPdf),
      writeFile(`${purchaseDir}/verzichtserklaerung.txt`, buildWaiverTxt(correctedFields), 'utf8'),
    ]);
    // Metadaten nicht mehr nötig nach erfolgreicher Korrektur — Aufräumen statt
    // unbegrenzt im Kaufordner anzusammeln (sweepExpiredConsentTxt kennt dieses
    // Dateiformat nicht, würde es also nie von selbst entfernen).
    await unlink(metaPath).catch(() => {});
    res.json({
      ok: true,
      corrected: true,
      quoted_price: meta.quotedPrice,
      final_price: correctedFields.price,
      price_changed: meta.quotedPrice !== correctedFields.price,
      tx_hash: txHash,
      confirmed_at: confirmedAt,
    });
  } catch (err) {
    // Fehlschlag hier darf die Zahlung selbst nicht rückgängig machen — der Käufer
    // hat bereits echt bezahlt und muss seinen access_token trotzdem bekommen.
    // soul_pay_x402.lua behandelt diesen Aufruf entsprechend als best-effort.
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── x402 Test-Wallet pro Soul (Settings → x402) ──────────────────────────────
// Per-soul seit 2026-07-29 (vorher node-global) — siehe lib/x402_agent_wallet.mjs.
// soul_id kommt vom Lua-Layer (bereits soul_auth.lua-geprüft), hier nur noch
// strukturell validiert (soulDir() in x402_agent_wallet.mjs wirft sonst).
// Nur über 127.0.0.1 erreichbar (kein öffentliches /api/*-Präfix), genau wie
// /internal/verify-x402 oben.
app.get('/internal/x402-agent/status', async (req, res) => {
  const soulId = req.query.soul_id;
  if (typeof soulId !== 'string' || !soulId) {
    return res.status(400).json({ ok: false, error: 'soul_id_required' });
  }
  try {
    res.json(await getX402AgentStatus(soulId));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/internal/x402-agent/key', async (req, res) => {
  const { soul_id: soulId, private_key } = req.body || {};
  if (typeof soulId !== 'string' || !soulId) {
    return res.status(400).json({ ok: false, error: 'soul_id_required' });
  }
  if (typeof private_key !== 'string' || !private_key.trim()) {
    return res.status(400).json({ ok: false, error: 'private_key_required' });
  }
  try {
    const address = await saveX402AgentKey(soulId, private_key);
    res.json({ ok: true, address });
  } catch (err) {
    if (err.message === 'invalid_private_key') {
      return res.status(400).json({ ok: false, error: 'invalid_private_key', message: 'Erwartet: 0x + 64 Hex-Zeichen.' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/internal/x402-agent/balance', async (req, res) => {
  const soulId = req.query.soul_id;
  if (typeof soulId !== 'string' || !soulId) {
    return res.status(400).json({ ok: false, error: 'soul_id_required' });
  }
  try {
    const account = await loadX402AgentAccount(soulId);
    if (!account) return res.status(404).json({ ok: false, error: 'not_configured' });
    const balances = await getX402AgentBalances(account.address);
    res.json({ ok: true, address: account.address, ...balances });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/internal/x402-agent/pay', async (req, res) => {
  const { soul_id: soulId, url, method, body, headers } = req.body || {};
  if (typeof soulId !== 'string' || !soulId) {
    return res.status(400).json({ ok: false, error: 'soul_id_required' });
  }
  if (typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ ok: false, error: 'url_required' });
  }
  try {
    const account = await loadX402AgentAccount(soulId);
    if (!account) return res.status(404).json({ ok: false, error: 'not_configured' });
    const result = await payX402AsAgent(account, { url, method, body, headers });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ── Pinata JWT: .env → soul-spezifisch → global → erster Soul im System ──────
async function getPinataJwt(soulId) {
  const envJwt = (process.env.PINATA_JWT || '').trim();
  if (envJwt) return envJwt;
  // Soul-spezifischer JWT (gesetzt via /api/soul/pinata-config)
  if (soulId) {
    try {
      const jwt = await readFile(`/var/lib/sys/souls/${soulId}/pinata_jwt`, 'utf8');
      const trimmed = jwt.trim();
      if (trimmed) return trimmed;
    } catch { /* not configured for this soul */ }
  }
  // Globaler Fallback (Legacy / Single-Node)
  try {
    const jwt = await readFile('/var/lib/sys/pinata_jwt', 'utf8');
    const trimmed = jwt.trim();
    if (trimmed) return trimmed;
  } catch { /* no global JWT */ }
  // Letzter Fallback: ersten verfügbaren soul-spezifischen JWT nehmen
  // (wichtig für discover-souls, das ohne soulId aufgerufen wird)
  try {
    const dirs = await readdir('/var/lib/sys/souls/');
    for (const dir of dirs) {
      try {
        const jwt = await readFile(`/var/lib/sys/souls/${dir}/pinata_jwt`, 'utf8');
        const trimmed = jwt.trim();
        if (trimmed) return trimmed;
      } catch { /* no JWT for this soul */ }
    }
  } catch { /* souls dir not accessible */ }
  return '';
}

// ── IPFS-Pinning via Pinata (interner Endpoint) ───────────────────────────────
// POST /internal/pin-json  { soul_id, meta }
// Pinnt soul_meta JSON zu IPFS via Pinata API. Braucht PINATA_JWT in .env.
app.post('/internal/pin-json', async (req, res) => {
  const { soul_id, meta } = req.body;
  const jwt = await getPinataJwt(soul_id);

  if (!jwt) {
    return res.status(503).json({
      error: 'pinata_not_configured',
      message: 'PINATA_JWT nicht gesetzt. Über /api/soul/pinata-config oder soul-mcp/.env konfigurieren.',
    });
  }
  if (!soul_id || !meta || typeof meta !== 'object') {
    return res.status(400).json({ error: 'soul_id und meta erforderlich' });
  }

  try {
    // ERC-8004 kompatibles Pinata-Metadata-Format
    const pinataBody = {
      pinataContent: {
        ...meta,
        // ERC-8004: AI-Agent-Discovery-Felder
        agent_type:     'soul',
        protocol:       'saveyoursoul/1.0',
        mcp_endpoint:   meta.mcp_endpoint,
        soul_endpoint:  meta.soul_endpoint,
        schema_version: 'ERC-8004/draft',
      },
      pinataMetadata: {
        name: meta.name ? `soul-${meta.name}` : `soul-${soul_id}`,
        keyvalues: {
          soul_id:    soul_id,
          schema:     'saveyoursoul/soul/1.0',
          registered: new Date().toISOString(),
          tags:       (Array.isArray(meta.tags) ? meta.tags : []).join(', '),
        },
      },
      pinataOptions: { cidVersion: 1 },
    };

    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify(pinataBody),
    });

    if (!response.ok) {
      let detail = await response.text();
      try { detail = JSON.parse(detail); } catch { /* keep as string */ }
      const msg = typeof detail === 'object' ? (detail.error?.details || detail.error?.reason || JSON.stringify(detail)) : detail;
      return res.status(response.status).json({ error: 'Pinata-Fehler', message: msg, detail });
    }

    const data = await response.json();
    res.json({
      ok:           true,
      cid:          data.IpfsHash,
      ipfs_uri:     `ipfs://${data.IpfsHash}`,
      gateway_url:  `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`,
      pinned_at:    new Date().toISOString(),
      soul_id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Soul sofort in Index aufnehmen nach register-anchor ──────────────────────
// POST /internal/seed-soul  { soul_id }
// Wird von register-anchor (Lua/Nitro) aufgerufen sobald chain_anchor.json geschrieben ist.
app.post('/internal/seed-soul', async (req, res) => {
  try {
    await seedFromLocalAnchors();
    retryFailedEnrichments().catch(() => {}); // IPFS sofort nachladen
    const stats = indexStats();
    res.json({ ok: true, indexed: stats.souls });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Soul aus Netzwerk abmelden (bei deinstall.sh) ────────────────────────────
// ── Herz — autonomes Trigger-System ──────────────────────────────────────────
// POST /internal/herz/toggle  { soul_id, active: bool }
app.post('/internal/herz/toggle', async (req, res) => {
  const { soul_id, active } = req.body || {};
  if (!soul_id) return res.status(400).json({ error: 'soul_id required' });
  const result = active ? herzActivate(soul_id) : herzDeactivate(soul_id);
  res.json(result);
});

// GET /internal/herz/status?soul_id=...
app.get('/internal/herz/status', (req, res) => {
  const soul_id = req.query.soul_id;
  if (!soul_id) return res.status(400).json({ error: 'soul_id required' });
  res.json(herzStatus(soul_id));
});

// POST /internal/herz/tick  { soul_id }  — manueller Trigger (Debug)
app.post('/internal/herz/tick', async (req, res) => {
  const { soul_id } = req.body || {};
  if (!soul_id) return res.status(400).json({ error: 'soul_id required' });
  await herzForceTick(soul_id);
  res.json({ ok: true });
});

// POST /internal/herz/crystallize  { soul_id }  — LONGMEM manuell kristallisieren
app.post('/internal/herz/crystallize', async (req, res) => {
  const { soul_id } = req.body || {};
  if (!soul_id) return res.status(400).json({ error: 'soul_id required' });
  await herzForceCrystallize(soul_id);
  res.json({ ok: true });
});

// POST /internal/herz/heartbeat  { soul_id }  — Session-Ping (alle 5 Min vom Chat)
app.post('/internal/herz/heartbeat', (req, res) => {
  const { soul_id } = req.body || {};
  if (!soul_id) return res.status(400).json({ error: 'soul_id required' });
  res.json(herzHeartbeat(soul_id));
});

// POST /internal/deregister-soul  { soul_id }
// POST /internal/reindex-local — erzwingt sofortiges Neu-Einlesen von api_context.json
// für eine bereits indizierte Soul (z.B. nach discoverable-/amortization-Änderung),
// statt auf den nächsten on-chain Anchor-Event zu warten. Kein Auth nötig — nur
// localhost erreichbar (gleiches Muster wie /internal/run-tool).
app.post('/internal/reindex-local', async (req, res) => {
  const { soul_id } = req.body || {};
  if (!soul_id || !/^[a-f0-9-]{36}$/i.test(soul_id)) {
    return res.status(400).json({ error: 'soul_id erforderlich' });
  }
  try {
    const updated = await reindexLocal(soul_id);
    res.json({ ok: true, updated, soul_id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/internal/deregister-soul', async (req, res) => {
  const { soul_id } = req.body || {};
  if (!soul_id || !/^[a-f0-9-]{36}$/i.test(soul_id)) {
    return res.status(400).json({ error: 'soul_id erforderlich' });
  }
  try {
    const removed = await deregisterSoul(soul_id);
    res.json({ ok: true, removed, soul_id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Debug: roher Index + Dateistatus für eine Soul ───────────────────────────
// GET /internal/debug-soul/:soul_id
app.get('/internal/debug-soul/:soul_id', async (req, res) => {
  const { soul_id } = req.params;
  if (!soul_id || !/^[a-f0-9-]{36}$/i.test(soul_id)) {
    return res.status(400).json({ error: 'Ungültige soul_id' });
  }
  const dir   = `/var/lib/sys/souls/${soul_id}`;
  const out   = { soul_id };
  // chain_anchor.json
  try { out.chain_anchor = JSON.parse(await readFile(`${dir}/chain_anchor.json`, 'utf8')); }
  catch (e) { out.chain_anchor = { error: e.message }; }
  // api_context.json (nur sichere Felder)
  try {
    const ctx = JSON.parse(await readFile(`${dir}/api_context.json`, 'utf8'));
    out.api_context = {
      enabled:            ctx.enabled,
      agent_registry_cid: ctx.agent_registry_cid,
      amortization:       ctx.amortization,
    };
  } catch (e) { out.api_context = { error: e.message }; }
  // Index-Eintrag
  const stats = indexStats();
  const souls = querySouls({ limit: 200 });
  out.index_entry = souls.find(s => s.soul_id === soul_id) ?? null;
  out.index_stats = stats;
  res.json(out);
});

// ── Soul-Discovery — liest aus lokalem WebSocket-Index (O(1)) ────────────────
// GET /internal/discover-souls?q=&amortized=&limit=&local=
app.get('/internal/discover-souls', (req, res) => {
  const limit     = Math.min(parseInt(req.query.limit || '20', 10), 100);
  const amortized = req.query.amortized === 'true';
  const q         = (req.query.q || '').trim();
  const local     = req.query.local === 'true';

  // querySouls() returns the global, cross-node chain-scanned index — same
  // mcp_endpoint-prefix filter /llms.txt uses (line ~1439 below) restricts to
  // souls actually running on this node, for soul_discover_local's public,
  // unauthenticated /mcp/discover endpoint.
  let souls = querySouls({ q, amortized, discoverableOnly: true, limit: local ? 100 : limit });
  if (local) souls = souls.filter(s => s.mcp_endpoint?.startsWith(BASE_URL)).slice(0, limit);
  const stats = indexStats();

  res.json({
    ok:       true,
    total:    souls.length,
    souls,
    source:   'local-index',
    indexing: stats.scanning,
    indexed:  stats.souls,
  });
});

// Direkter Datei-Lookup für /llms.txt?soul_id=X, wenn die Soul (noch) nicht im
// on-chain-Index steht (getIndexedSoul() liefert null) — analog zum Prinzip
// "bekannte soul_id umgeht den discoverable-Filter" (siehe soul_read_by_token,
// api/soul/preview): wer den soul_id schon kennt, bekommt trotzdem eine
// llms.txt für GENAU diese Soul, auch unangekert. Liest nur, was ohne
// Vault-Entschlüsselung verfügbar ist (verschlüsseltes sys.md → kein Name,
// kein Fehler) — bewusst best-effort, kein Auth-Bypass für echten Inhalt.
async function loadLocalSoulForLlms(soulId) {
  const dir = `${SOULS_DIR}${soulId}`;
  let name = null;
  try {
    const sys = await readFile(`${dir}/sys.md`, 'utf8');
    name = sys.match(/soul_name:\s*(.+)/)?.[1]?.trim()?.replace(/^["']|["']$/g, '') || null;
  } catch {
    return null; // keine sys.md → Soul existiert nicht auf diesem Node
  }
  let tags = [], description = null;
  try {
    const anchor = JSON.parse(await readFile(`${dir}/chain_anchor.json`, 'utf8'));
    tags = Array.isArray(anchor.tags) ? anchor.tags : [];
    description = anchor.description || null;
    name = anchor.name || name;
  } catch {}
  let amortization = {};
  try {
    const ctx = JSON.parse(await readFile(`${dir}/api_context.json`, 'utf8'));
    amortization = ctx.amortization || {};
  } catch {}
  return { soul_id: soulId, name, tags, description, amortization, mcp_endpoint: `${BASE_URL}/mcp?soul_id=${soulId}` };
}

// Nur Souls, die tatsächlich auf DIESEM Node laufen — getIndexedSoul()/
// querySouls() liefern den globalen, per Chain-Scan aggregierten Index
// (inkl. fremder Nodes); ein anderer Node beschreibt sich selbst über seine
// eigene /llms.txt, nicht über unsere.
async function loadSoulForLlms(soulId) {
  const idx = getIndexedSoul(soulId);
  if (idx && idx.mcp_endpoint?.startsWith(BASE_URL)) return idx;
  return loadLocalSoulForLlms(soulId);
}

// Network: jede Soul's eigene Verbindungen erweitern ihren effektiven Context
// über das eigene sys.md hinaus — nicht nur bei einem Gatekeeper. Aufgerufen
// pro Soul (node-weite Liste UND Soul-spezifische Ansicht), damit eine KI, die
// llms.txt liest (das Meta-Tag-Äquivalent für Agenten, erster Schritt Richtung
// echtem "SYS-Internet"), die höhere Wissensdichte einer gut vernetzten Soul
// erkennt — dieselbe Überlegung wie bei wire_search/wire_scanner. Drei
// Beziehungstypen, alle aus Daten, die wired_*/wire_search-Tools ohnehin lesen:
//   - Gatekeeper reach: Souls, die DIESE Soul selbst verdrahtet hat, + föderierte Gatekeeper (1 Hop)
//   - Wired to: Gatekeeper, bei denen DIESE Soul sich selbst eingewirtet hat (Umkehrung)
//   - Connected to: direkte, symmetrische Soul-zu-Soul-Verbindungen
// Gated auf: die REFERENZIERTE Soul muss unabhängig on-chain-discoverable sein
// (getIndexedSoul(...).discoverable !== false, dieselbe Flag wie überall sonst)
// — Wiring/Föderation/Connect ist Zustimmung zu authentifiziertem Tool-Zugriff,
// nicht automatisch Zustimmung, in diesem öffentlichen, unauthentifizierten
// Dokument namentlich genannt zu werden.
// Aktivitäts-Suffix (Sessions/letzter Anchor) aus dem on-chain-Index — ohne
// das kann eine KI nicht zwischen einer aktiv genutzten und einer toten/
// verwaisten Verbindung unterscheiden, reine Namen/Tags reichen dafür nicht.
function activitySuffix(idx) {
  const parts = [];
  if (idx.sessions) parts.push(`${idx.sessions} session(s)`);
  if (idx.anchor_date) parts.push(`last anchor ${String(idx.anchor_date).slice(0, 10)}`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

// Crawlbarer Link statt reiner Text-Erwähnung — ohne das kann eine KI eine
// Verbindung nur zur Kenntnis nehmen, nicht ihr folgen. node_url nie null
// (Konvention wie überall sonst: same-node zeigt BASE_URL statt null).
function llmsTxtLink(nodeUrl, soulId) {
  return `${nodeUrl || BASE_URL}/llms.txt?soul_id=${soulId}`;
}

async function pushSoulNetworkLines(lines, soulId) {
  const publicOf = (id) => {
    const idx = getIndexedSoul(id);
    return (idx && idx.discoverable !== false) ? idx : null;
  };

  const { wired: gkWired } = await loadAcceptedWired(soulId);
  const gkFed = await loadFederated(soulId);
  const wiredPublic = Object.values(gkWired)
    .map(e => ({ e, idx: publicOf(e.soul_id) }))
    .filter(({ idx }) => idx);
  const fedPublic = Object.entries(gkFed)
    .filter(([, e]) => e.status === 'accepted')
    .map(([fedSoulId, e]) => ({ fedSoulId, e, idx: publicOf(fedSoulId) }))
    .filter(({ idx }) => idx);
  if (wiredPublic.length || fedPublic.length) {
    lines.push(`- **Gatekeeper reach:** ${wiredPublic.length} wired soul(s) + ${fedPublic.length} federated Gatekeeper(s) (1 hop) — extends this soul's effective context/knowledge density beyond its own sys.md, reachable via wired_soul_read/wired_beme_chat/etc. once connected.`);
    for (const { e, idx } of wiredPublic) {
      const tags = idx.tags?.length ? ` — Tags: ${idx.tags.map(t => `#${t}`).join(' ')}` : '';
      lines.push(`  - Wired: ${idx.name || e.name || e.soul_id} (\`${e.soul_id}\`)${tags}${activitySuffix(idx)} — ${llmsTxtLink(e.node_url, e.soul_id)}`);
    }
    for (const { fedSoulId, e, idx } of fedPublic) {
      const tags = idx.tags?.length ? ` — Tags: ${idx.tags.map(t => `#${t}`).join(' ')}` : '';
      lines.push(`  - Federated Gatekeeper: ${idx.name || fedSoulId} (\`${fedSoulId}\`) @ ${e.node_url}${tags}${activitySuffix(idx)} — ${llmsTxtLink(e.node_url, fedSoulId)}`);
    }
  }

  const wiredTo = await loadWiredTo(soulId);
  const wiredToPublic = Object.entries(wiredTo)
    .filter(([, e]) => (e.status || 'accepted') === 'accepted')
    .map(([gkSoulId, e]) => ({ gkSoulId, e, idx: publicOf(gkSoulId) }))
    .filter(({ idx }) => idx);
  if (wiredToPublic.length) {
    lines.push(`- **Wired to:** bundled behind ${wiredToPublic.length} Gatekeeper(s) — those Gatekeepers' own AI sessions can reach this soul via wired_soul_read/wired_beme_chat/etc.`);
    for (const { gkSoulId, e, idx } of wiredToPublic) {
      const tags = idx.tags?.length ? ` — Tags: ${idx.tags.map(t => `#${t}`).join(' ')}` : '';
      lines.push(`  - Gatekeeper: ${idx.name || gkSoulId} (\`${gkSoulId}\`)${tags}${activitySuffix(idx)} — ${llmsTxtLink(e.node_url, gkSoulId)}`);
    }
  }

  const connected = await loadConnected(soulId);
  const connectedPublic = Object.entries(connected)
    .filter(([, e]) => e.status === 'accepted')
    .map(([peerSoulId, e]) => ({ peerSoulId, e, idx: publicOf(peerSoulId) }))
    .filter(({ idx }) => idx);
  if (connectedPublic.length) {
    lines.push(`- **Connected to:** ${connectedPublic.length} soul(s) directly (symmetric, no Gatekeeper in between).`);
    for (const { peerSoulId, e, idx } of connectedPublic) {
      const tags = idx.tags?.length ? ` — Tags: ${idx.tags.map(t => `#${t}`).join(' ')}` : '';
      lines.push(`  - ${idx.name || e.alias || peerSoulId} (\`${peerSoulId}\`)${tags}${activitySuffix(idx)} — ${llmsTxtLink(e.node_url, peerSoulId)}`);
    }
  }
}

// Restliche Soul-Felder (Preis/Wallet/Tools/Kontakt/PayPal/Endpoint/Modell) --
// identisch für die node-weite Liste und die Soul-spezifische Einzelansicht.
async function pushSoulFieldLines(lines, s) {
  const a = s.amortization ?? {};
  const base = parseFloat(a.price_usdc) || 0;
  const dynamic = a.dynamic_pricing === true;
  lines.push(`- **soul_id:** \`${s.soul_id}\``);
  // Activity: ohne sessions/anchor_date kann eine KI diese Soul nicht von
  // einer toten/verwaisten unterscheiden — dieselbe Info wie im Network-
  // Abschnitt pro Verbindung, hier für die Soul selbst.
  const selfActivity = activitySuffix(s).trim();
  if (selfActivity) lines.push(`- **Activity:** ${selfActivity.slice(1, -1)}`);
  lines.push(`- **Price:** ${base} USDC per request${dynamic ? ' (dynamic — call /api/soul/preview for live quote)' : ''}`);
  lines.push(`- **Token valid:** ${a.token_duration_days ?? 1} day(s)`);
  if (a.wallet) {
    lines.push(EU_CONSUMER_RIGHTS
      ? '- **Wallet (Polygon):** available — call show_withdrawal_terms(payment_method="x402") then accept_digital_content_terms to learn the address (shown only in the resulting invoice PDF)'
      : `- **Wallet (Polygon):** \`${a.wallet}\` — pay via x402 (402 challenge -> signed EIP-3009 retry)`);
  }
  if (Array.isArray(a.agent_tools) && a.agent_tools.length) {
    lines.push(`- **Tools after payment:** ${a.agent_tools.join(', ')}`);
  }
  if (a.trader_email) lines.push(`- **Contact:** ${a.trader_email} (typically replies within 48h)`);
  if (a.paypal_enabled) {
    const eur = a.price_eur ? `${a.price_eur} EUR` : 'price on request';
    lines.push(EU_CONSUMER_RIGHTS
      ? `- **Non-crypto access:** PayPal (${eur}) — call show_withdrawal_terms(payment_method="paypal") then accept_digital_content_terms to learn the target (shown only in the resulting invoice PDF)${a.price_note ? `. Price note: ${a.price_note}` : ''}`
      : `- **Non-crypto access:** PayPal (${eur}) to ${a.paypal_target} — please leave an email address in the payment note so the access token can be sent there. Manually reviewed by the operator, typically within 48h${a.price_note ? `. Price note: ${a.price_note}` : ''}`);
  }
  if (s.mcp_endpoint) lines.push(`- **MCP endpoint:** ${s.mcp_endpoint}`);
  try {
    const scRaw = await readFile(`${SOULS_DIR}${s.soul_id}/config.json`, 'utf8');
    const sc = JSON.parse(scRaw);
    if (sc.model) lines.push(`- **Default model:** ${sc.model}`);
  } catch {}
  // Gatekeeper role, stated explicitly -- distinct from "Tools after payment"
  // above (that's the paid-agent whitelist, agent_tools). These wired_*/wire_*
  // tools are NOT part of the anonymous paid-agent flow -- only an owner/peer/
  // service-token session (not a pol_access_token from x402/PayPal) gets them,
  // see registerConnectionProxyTools()'s call sites in this file. Stated here
  // so a crawling AI understands WHY this soul has elevated context/value
  // (see pushSoulNetworkLines above) without implying anonymous access to it.
  if (await isGatekeeperEnabled(s.soul_id)) {
    lines.push('- **Gatekeeper role:** wire_status, wire_search, wire_scanner, wired_soul_read, wired_soul_write, wired_beme_chat, wired_shared_get, wired_{audio,image,video,context}_list/get — available to an authenticated owner/peer/service-token session for this soul (not part of the anonymous paid-agent flow above).');
  }
  await pushSoulNetworkLines(lines, s.soul_id);
}

// "How to access" + "More" -- identisch für node-weite und Soul-spezifische
// llms.txt, nur dass die Soul-spezifische Fassung {soul_id} durch den echten
// Wert ersetzt (direkt nutzbar, kein Platzhalter-Rätselraten für eine KI, die
// eh schon genau diese eine Soul meint).
function pushAccessFlowLines(lines, soulIdExample) {
  const sid = soulIdExample || '{soul_id}';
  lines.push('## How to access (agent flow)');
  lines.push('');
  lines.push('**1. Preview (optional)**');
  lines.push(`\`\`\`\nGET ${BASE_URL}/api/soul/preview?soul_id=${sid}\n\`\`\``);
  lines.push('Returns public profile and confirmed live price before payment.');
  lines.push('');
  if (EU_CONSUMER_RIGHTS) {
    lines.push('**2. Consent first (EU withdrawal rights)**');
    lines.push('You do NOT have an /mcp session yet at this point (it always requires a token, and none');
    lines.push('exists before payment) — use the plain HTTP twins, not the MCP tool names, unless you');
    lines.push('already hold an owner/peer/paid token for this node:');
    lines.push(`\`\`\`\nPOST ${BASE_URL}/api/soul/terms/show\nContent-Type: application/json\n\n{ "soul_id": "${sid}", "payment_method": "x402" }\n\`\`\``);
    lines.push('Returns `{ terms_token, preview_url, preview_url_txt, terms_url, terms_url_txt, legal_text }`.');
    lines.push('Show preview_url (or preview_url_txt if you cannot render a PDF) to the buyer. Once they');
    lines.push('explicitly agree to both (a) immediate performance and (b) losing their 14-day withdrawal right:');
    lines.push(`\`\`\`\nPOST ${BASE_URL}/api/soul/terms/accept\nContent-Type: application/json\n\n{ "soul_id": "${sid}", "terms_token": "{from above}", "payment_method": "x402", "consent_immediate_performance": true, "consent_withdrawal_waiver": true }\n\`\`\``);
    lines.push('Returns `{ invoice: { download_url, download_url_txt }, withdrawal_notice: { download_url, download_url_txt },');
    lines.push('waiver: { download_url, download_url_txt }, reference_id, payment: { value: wallet }, invoice_number }`');
    lines.push('— three separate documents (invoice, withdrawal notice, waiver declaration). The wallet address AND');
    lines.push('a reference_id (UUID) are only revealed here, both required for step 4.');
    lines.push('(If you already have an MCP session on this node, the equivalent tools are show_withdrawal_terms');
    lines.push('and accept_digital_content_terms — same fields, same rules, EXCEPT they take no soul_id: they');
    lines.push(`always act on whichever soul YOUR session belongs to. To buy soul_id ${sid} specifically`);
    lines.push('while connected as a different soul, those tools will not work — use the plain HTTP endpoints');
    lines.push('above instead, which take soul_id explicitly and need no MCP session at all.)');
    lines.push('');
    lines.push('**3. Pay via x402 (USDC on Polygon, chainId 137)**');
    lines.push(`\`\`\`\nPOST ${BASE_URL}/api/soul/pay/x402\n\`\`\``);
    lines.push('Standard x402 handshake: call without a payment proof first → 402 response with a');
    lines.push('PAYMENT-REQUIRED header (amount, asset, payTo). Sign an EIP-3009 transferWithAuthorization');
    lines.push('and retry with a PAYMENT-SIGNATURE header — any x402-compliant client already knows this,');
    lines.push('no SYS-specific tool needed. Include `reference_id` from step 2 in the request body.');
    lines.push('Returns: `{ "access_token": "48-hex-string", "expires_in": 259200 }`. Without a valid reference_id');
    lines.push('from step 2 this call is rejected — the consent step cannot be skipped.');
    lines.push('');
  } else {
    lines.push('**2. Pay via x402 (USDC on Polygon, chainId 137)**');
    lines.push(`\`\`\`\nPOST ${BASE_URL}/api/soul/pay/x402\n\`\`\``);
    lines.push('Standard x402 handshake: call without a payment proof first → 402 response with a');
    lines.push('PAYMENT-REQUIRED header (amount, asset, payTo). Sign an EIP-3009 transferWithAuthorization');
    lines.push('and retry with a PAYMENT-SIGNATURE header — any x402-compliant client already knows this,');
    lines.push('no SYS-specific tool needed.');
    lines.push('');
    lines.push('**3. Get access token**');
    lines.push('Returns: `{ "access_token": "48-hex-string", "expires_in": 259200 }`');
    lines.push('');
  }
  lines.push('**4. Use token**');
  lines.push(`\`\`\`\nAuthorization: Bearer {access_token}\nPOST ${soulIdExample ? `${BASE_URL}/mcp?soul_id=${sid}` : '{mcp_endpoint}'}\n\`\`\``);
  lines.push('Access is limited to the Agent Sandbox tools configured by the soul owner.');
  lines.push('');
  lines.push('**Non-crypto alternative**');
  lines.push(EU_CONSUMER_RIGHTS
    ? 'Souls with "Non-crypto access" above also accept PayPal for human buyers without a Polygon wallet. IMPORTANT — before telling an EU-based buyer to send the payment: ask if they are in the EU (if unknown), and if so, call show_withdrawal_terms FIRST, show its link to the buyer, then call accept_digital_content_terms once they agree — do not skip straight to payment instructions. Non-EU buyers can skip this. Then: pay externally, leaving an email address in the payment note so the operator can send the access token back. Access is granted manually, typically within 48h — not instant like the x402 flow. If a human hands you such a token directly in chat (48 hex chars, no "0x" prefix — that would be a TX hash instead), do not ask for payment again: call soul_read_by_token(read_endpoint, access_token) right away.'
    : 'Souls with "Non-crypto access" above also accept PayPal for human buyers without a Polygon wallet: pay externally, leaving an email address in the payment note so the operator can send the access token back. Access is granted manually, typically within 48h — not instant like the x402 flow. If a human hands you such a token directly in chat (48 hex chars, no "0x" prefix — that would be a TX hash instead), do not ask for payment again: call soul_read_by_token(read_endpoint, access_token) right away.');
  lines.push('');
  lines.push('## More');
  lines.push('- Protocol info: https://sys.uxprojects-jok.com/llms.txt');
  lines.push('- Soul Network: https://sys.uxprojects-jok.com/scan');
  lines.push('- Source: https://github.com/uxprojectsjok/personal-sys-vps');
}

// GET /llms.txt — AI-readable node description (llms.txt convention), or with
// ?soul_id= a soul-specific document — same query-param scoping pattern as
// /mcp?soul_id=/api/soul/preview?soul_id= elsewhere in this protocol, so a
// soul has a stable, protocol-conform "own" llms.txt without a new path
// convention. A known soul_id bypasses the discoverable-index requirement
// (see loadSoulForLlms/loadLocalSoulForLlms) -- same precedent as direct
// soul_id lookups elsewhere (soul_read_by_token, api/soul/preview) -- only
// the Network section's REFERENCED third parties stay gated on their own
// discoverable flag.
app.get('/llms.txt', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.set('Content-Type', 'text/plain; charset=utf-8');

  const soulIdParam = req.query.soul_id;
  if (soulIdParam) {
    if (!/^[a-f0-9-]{36}$/i.test(soulIdParam)) {
      return res.status(400).send('Invalid soul_id.');
    }
    const s = await loadSoulForLlms(soulIdParam);
    if (!s) {
      return res.status(404).send(`No soul '${soulIdParam}' on this node. Node-wide info: ${BASE_URL}/llms.txt`);
    }
    const lines = [];
    lines.push(`# SYS Soul — ${s.name || s.soul_id}`);
    lines.push('');
    lines.push('> Personal AI identity running the SYS open protocol.');
    lines.push('> Self-hosted, cryptographically secured. Access via x402 (USDC on Polygon) or PayPal.');
    lines.push('');
    if (s.description) lines.push(`_${s.description}_`);
    if (s.tags?.length) lines.push(`Tags: ${s.tags.map(t => `#${t}`).join(' ')}`);
    lines.push('');
    await pushSoulFieldLines(lines, s);
    lines.push('');
    pushAccessFlowLines(lines, s.soul_id);
    return res.send(lines.join('\n'));
  }

  // Nur Souls, die tatsächlich auf diesem Node laufen — querySouls() liefert den
  // globalen, per Chain-Scan aggregierten Index (inkl. fremder Nodes).
  const souls = querySouls({ limit: 100, discoverableOnly: true }).filter(s => s.mcp_endpoint?.startsWith(BASE_URL));
  const lines = [];
  lines.push(`# SYS Node — ${BASE_URL}`);
  lines.push('');
  lines.push('> Personal AI identity node running the SYS open protocol.');
  lines.push('> Self-hosted, cryptographically secured. Access via x402 (USDC on Polygon) or PayPal.');
  lines.push('');
  lines.push('This node is operated independently. The operator is solely responsible for');
  lines.push('compliance with applicable law (GDPR, TMG/DDG, etc.) on this node, including');
  lines.push('a legal notice and privacy policy if required by their jurisdiction.');
  lines.push('SYS provides infrastructure, not legal services.');
  lines.push('');

  if (souls.length > 0) {
    lines.push('## Souls on this node');
    lines.push('');
    for (const s of souls) {
      lines.push(`### ${s.name || s.soul_id}`);
      if (s.description) lines.push(`_${s.description}_`);
      if (s.tags?.length) lines.push(`Tags: ${s.tags.map(t => `#${t}`).join(' ')}`);
      lines.push('');
      lines.push(`Own llms.txt: ${BASE_URL}/llms.txt?soul_id=${s.soul_id}`);
      lines.push('');
      await pushSoulFieldLines(lines, s);
      lines.push('');
    }
  } else {
    lines.push('_No souls registered on this node._');
    lines.push('');
  }

  pushAccessFlowLines(lines, null);

  res.send(lines.join('\n'));
});

// GET /api/soul/scan — öffentliches Soul-Verzeichnis (Protokoll-Bestandteil)
// Gibt nur Daten zurück die bereits on-chain öffentlich sind (Polygon-Calldata).
// Aggregiert lokale Souls + alle Remote-Nodes die per eth_getLogs entdeckt werden.
// Jeder SYS-Node exponiert diesen Endpoint — der Origin aus meta.mcp (Calldata)
// wird als Node-URL verwendet. Kein sys.md-Lookup nötig.
const SCAN_ANCHOR_COEFF = 0.1, SCAN_AGE_COEFF = 0.01, SCAN_DEMAND_COEFF = 0.05;

// Remote-Scan-Cache: verhindert hammering anderer Nodes (5-min TTL)
const _remoteScanCache = new Map(); // origin → { ts, souls[] }
const REMOTE_SCAN_TTL  = 5 * 60 * 1000;

app.get('/api/soul/scan', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const stats = indexStats();
  const ownOrigin = new URL(BASE_URL).origin;

  // ── 1. Alle indizierten Souls holen und in lokal / remote aufteilen ─────────
  // Der soul_indexer (WebSocket, inkrementell) findet alle on-chain Souls.
  // Remote-Souls haben keinen lokalen Vault — wir fetchen deren Scan-Endpoint.
  const allIndexed = querySouls({ limit: 100, minSessions: 0, discoverableOnly: true });
  const localSoulIds = new Set();
  const remoteOrigins = new Map(); // origin → Set<soul_id>
  for (const s of allIndexed) {
    try {
      const origin = new URL(s.mcp_endpoint).origin;
      if (origin === ownOrigin) {
        localSoulIds.add(s.soul_id);
      } else {
        if (!remoteOrigins.has(origin)) remoteOrigins.set(origin, new Set());
        remoteOrigins.get(origin).add(s.soul_id);
      }
    } catch { localSoulIds.add(s.soul_id); }
  }

  // ── 2. Remote-Scan-Endpoints parallel fetchen (5s timeout) ────────────────
  const remoteSouls = [];
  await Promise.allSettled([...remoteOrigins.entries()].map(async ([origin, soulIds]) => {
    const cached = _remoteScanCache.get(origin);
    let data;
    if (cached && Date.now() - cached.ts < REMOTE_SCAN_TTL) {
      data = cached.souls;
    } else {
      try {
        const r = await fetch(`${origin}/api/soul/scan`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) return;
        const json = await r.json();
        data = json.souls || [];
        _remoteScanCache.set(origin, { ts: Date.now(), souls: data });
      } catch { return; }
    }
    for (const soul of data) {
      if (soulIds.has(soul.soul_id)) remoteSouls.push(soul);
    }
  }));

  // ── 3. Lokale Souls (bestehende File-basierte Anreicherung) ────────────────
  const souls = await Promise.all(allIndexed.filter(s => localSoulIds.has(s.soul_id)).map(async s => {
    let txHash = s.tx_hash || null;
    let anchorCount = s.anchor_count ?? 0;
    let anchorSpanDays = s.anchor_span_days ?? 0;
    let anchorHistory = [];
    if (s.soul_id) {
      try {
        const raw = await readFile(`${SOULS_DIR}${s.soul_id}/anchor_history.json`, 'utf8');
        anchorHistory = JSON.parse(raw);
        if (anchorHistory.length > anchorCount) anchorCount = anchorHistory.length;
        if (!txHash) {
          const last = [...anchorHistory].reverse().find(e => e.tx);
          if (last?.tx) txHash = last.tx;
        }
        if (anchorSpanDays === 0 && anchorHistory.length >= 2) {
          const dates = anchorHistory.map(e => e.ts || e.date || e.created_at).filter(Boolean).sort();
          if (dates.length >= 2) {
            const ms = new Date(dates[dates.length - 1]) - new Date(dates[0]);
            anchorSpanDays = Math.round(ms / 86400000);
          }
        }
      } catch {}
    }

    // Effective live price (same formula as loadPaymentHint)
    const amort = s.amortization ?? {};
    const baseUsdc = parseFloat(amort.price_usdc) || 0;
    const dynamic = amort.dynamic_pricing === true;
    let usdcCurrent = baseUsdc;
    if (dynamic) {
      let chainAgeDays = 0, buyers30d = 0;
      if (anchorHistory[0]?.ts) {
        const genesis = new Date(anchorHistory[0].ts).getTime();
        if (!isNaN(genesis)) chainAgeDays = (Date.now() - genesis) / 86_400_000;
      }
      if (s.soul_id) {
        try {
          const dlRaw = await readFile(`${SOULS_DIR}${s.soul_id}/demand_log.json`, 'utf8');
          const dlog = JSON.parse(dlRaw);
          const cutoff = Date.now() / 1000 - 30 * 86400;
          if (Array.isArray(dlog)) buyers30d = dlog.filter(e => (e.ts || 0) > cutoff).length;
        } catch {}
      }
      if (anchorCount > 0 || buyers30d > 0) {
        const mult = 1 + anchorCount * SCAN_ANCHOR_COEFF + chainAgeDays * SCAN_AGE_COEFF + buyers30d * SCAN_DEMAND_COEFF;
        usdcCurrent = Math.max(baseUsdc, Math.round(baseUsdc * mult * 1000000) / 1000000);
      }
    }

    const DISCOVER_WINDOW_DAYS = 11;
    const lastAnchorEntry = anchorHistory.length > 0 ? anchorHistory[anchorHistory.length - 1] : null;
    const lastAnchorTs = lastAnchorEntry ? new Date(lastAnchorEntry.ts || lastAnchorEntry.date || 0).getTime() : 0;
    const daysSinceLastAnchor = lastAnchorTs > 0 ? (Date.now() - lastAnchorTs) / 86_400_000 : null;
    const visibilityZone = daysSinceLastAnchor === null ? 'unknown'
      : daysSinceLastAnchor < DISCOVER_WINDOW_DAYS ? 'discoverable'
      : daysSinceLastAnchor < DISCOVER_WINDOW_DAYS * 2 ? 'fading'
      : 'invisible';

    return {
      soul_id:             s.soul_id,
      name:                s.name || s.soul_id?.slice(0, 8),
      description:         s.description ? s.description.slice(0, 120) : '',
      tags:                Array.isArray(s.tags) ? s.tags : [],
      price_usdc:          baseUsdc,
      usdc_current:        usdcCurrent,
      dynamic_pricing:     dynamic,
      token_duration_days: amort.token_duration_days ?? null,
      sessions:            s.sessions ?? 0,
      anchor_count:        anchorCount,
      anchor_span_days:    anchorSpanDays,
      anchor_date:         s.anchor_date ?? null,
      days_since_last_anchor: daysSinceLastAnchor !== null ? Math.round(daysSinceLastAnchor * 10) / 10 : null,
      visibility_zone:     visibilityZone,
      // Bei aktivem EU_CONSUMER_RIGHTS werden Zahlungsziele (Wallet-Adresse,
      // PayPal-Link) erst nach show_withdrawal_terms/accept_digital_content_terms
      // genannt (im Consent-PDF) — hier nur noch ein Verfügbarkeits-Flag, damit
      // die Homepage-Methods-Pille weiterhin funktioniert, ohne das Ziel selbst
      // vorab öffentlich zu zeigen.
      wallet:              EU_CONSUMER_RIGHTS ? null : (amort.wallet || null),
      wallet_available:    !!amort.wallet,
      mcp_endpoint:        s.mcp_endpoint,
      tx_hash:             txHash,
      agent_tools:         Array.isArray(amort.agent_tools) ? amort.agent_tools : [],
      contact_email:       amort.trader_email || null,
      paypal_enabled:      amort.paypal_enabled === true,
      paypal_target:       (amort.paypal_enabled === true && !EU_CONSUMER_RIGHTS) ? (amort.paypal_target || null) : null,
      price_eur:           amort.paypal_enabled === true ? (amort.price_eur || null) : null,
      price_note:          amort.paypal_enabled === true ? (amort.price_note || null) : null,
      consent_required:    EU_CONSUMER_RIGHTS,
    };
  }));

  // ── 4. Mergen: lokale Souls haben Vorrang, Remote-Duplikate überspringen ────
  const localIds = new Set(souls.map(s => s.soul_id));
  const merged   = [...souls, ...remoteSouls.filter(s => !localIds.has(s.soul_id))];

  res.json({ ok: true, souls: merged, indexed: stats.souls, scanning: stats.scanning });
});

// ── Cross-Node-Proxy für Browser-seitige Discovery ────────────────────────────
// scanner.vue/useNetworkSearch.js entdecken zur Laufzeit beliebige, vorher
// unbekannte SYS-Nodes (per Chain-Scan bzw. /api/soul/scan) und wollen deren
// /api/soul/scan bzw. /llms.txt direkt aus dem Browser abfragen. CSP's
// connect-src ist aber eine feste, statische Allowlist — kann unmöglich jeden
// erst zur Laufzeit entdeckten Node enthalten. Server-zu-Server-Fetches
// unterliegen keiner CSP (reines Browser-Konzept), deshalb übernimmt dieser
// Node stellvertretend den eigentlichen Cross-Origin-Call und liefert
// same-origin zurück — exakt dasselbe Muster wie beim Cross-Node-Wire-out
// (siehe app/composables/useGatekeeper.js' wireToGatekeeper()-Kommentar).
//
// Kein offener Proxy: nur GET, nur zwei fest verdrahtete Zielpfade, origin
// muss https:// sein und darf nicht auf offensichtlich internes/privates Netz
// zeigen (SSRF-Schutz) — strenger als der bestehende /api/soul/scan-Aggregator
// oben, dessen Origins ausschließlich aus bereits on-chain-validierten
// mcp_endpoint-Werten kommen, nicht aus rohem, unauthentifiziertem Nutzer-Input
// wie hier (origin kommt direkt aus dem Query-Parameter).
const PROXY_BLOCKED_HOST_RE = /^(localhost$|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:|\[?fe80:)/i;
function proxyableOrigin(originStr) {
  let u;
  try { u = new URL(String(originStr || '')); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  if (PROXY_BLOCKED_HOST_RE.test(u.hostname)) return null;
  return u.origin;
}

async function proxyGet(req, res, path, contentType) {
  const origin = proxyableOrigin(req.query.origin);
  if (!origin) return res.status(400).json({ error: 'invalid_origin' });
  try {
    const r = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(8000) });
    const text = await r.text();
    res.status(r.status);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=300');
    // Obergrenze statt unbegrenzter Weiterleitung — ein fremder Node könnte
    // sonst über diesen Proxy beliebig große Antworten an jeden Besucher
    // ausliefern lassen.
    res.send(text.slice(0, 2_000_000));
  } catch (err) {
    res.status(502).json({ error: 'upstream_unreachable', message: err.message });
  }
}

app.get('/api/proxy/llms-txt',  (req, res) => proxyGet(req, res, '/llms.txt', 'text/plain; charset=utf-8'));
app.get('/api/proxy/soul-scan', (req, res) => proxyGet(req, res, '/api/soul/scan', 'application/json'));

// ── EU-Widerrufsrecht-Flow als reines REST-API (kein MCP-Client nötig) ────────
// Gleiche Logik/Gates wie show_withdrawal_terms.mjs / accept_digital_content_terms.mjs
// (MCP-Tools, für KI-Chat-Clients), hier zusätzlich als plain-HTTP-Endpoints,
// damit z.B. die Homepage (scan.vue, kein MCP-Client) denselben Pflicht-Consent-
// Flow vor Anzeige des Zahlungsziels durchlaufen kann.
// Plain-HTTP-Zwilling der show_withdrawal_terms-MCP-Tool-Logik — für externe
// Agenten, die noch KEINE /mcp-Session haben (die verlangt immer einen Token,
// den es vor der ersten Zahlung noch nicht gibt). soul_preview.lua verweist
// genau hierher.
app.post('/api/soul/terms/show', async (req, res) => {
  if (!EU_CONSUMER_RIGHTS) {
    return res.status(404).json({ error: 'not_enabled', message: 'Dieser Node hat EU_CONSUMER_RIGHTS nicht aktiviert.' });
  }
  const { soul_id, payment_method } = req.body || {};
  if (!soul_id || !['paypal', 'x402'].includes(payment_method)) {
    return res.status(400).json({ error: 'soul_id und payment_method ("paypal"|"x402") erforderlich' });
  }
  try {
    const ctx   = await loadCtx(soul_id);
    const amort = ctx.amortization || {};
    const walletAvailable = amort.enabled === true && typeof amort.wallet === 'string' && amort.wallet.startsWith('0x');
    const paypalAvailable = amort.paypal_enabled === true;
    const x402Available   = walletAvailable && typeof amort.price_usdc === 'string' && Number(amort.price_usdc) > 0;

    if (payment_method === 'paypal' && !paypalAvailable) {
      return res.status(402).json({ error: 'Diese Soul akzeptiert aktuell keinen PayPal-Zahlungsweg.' });
    }
    if (payment_method === 'x402' && !x402Available) {
      return res.status(402).json({ error: 'Diese Soul akzeptiert aktuell keinen x402-Zahlungsweg (kein USDC-Preis hinterlegt).' });
    }

    const termsToken = randomUUID();
    const tokenDurationDays = amort.token_duration_days || 1;
    // Siehe /api/soul/terms/accept: für x402 den aktuellen dynamischen Preis
    // zeigen (gleiche Formel wie soul_pay_x402.lua beim Settlement), sonst
    // zeigt die Vorabinformation einen anderen Betrag als tatsächlich
    // abgebucht wird (derselbe Bug wie zuvor bei der Rechnung, hier nur an
    // einer weiteren Stelle unkorrigiert geblieben).
    let previewPrice;
    let previewBasePrice = null;
    const previewDynamicPricing = payment_method === 'x402' && amort.dynamic_pricing === true;
    if (payment_method === 'x402') {
      previewBasePrice = Number(amort.price_usdc) || 0;
      previewPrice = previewDynamicPricing
        ? (await computeDynamicUsdcPrice(soul_id, previewBasePrice)).toFixed(6)
        : (amort.price_usdc || '?');
    } else {
      previewPrice = amort.price_eur || '?';
    }
    const previewFields = {
      termsToken,
      soulName: ctx.name || soul_id.slice(0, 8),
      soulId: soul_id,
      price:    previewPrice,
      basePrice: previewBasePrice,
      dynamicPricing: previewDynamicPricing,
      currency: payment_method === 'x402' ? 'USDC' : 'EUR',
      target:   amort.paypal_link || amort.paypal_email || '(nicht konfiguriert)',
      wallet:   amort.wallet || '',
      paymentMethod: payment_method,
      traderName:      amort.trader_name || '',
      traderAddress:   amort.trader_address || '',
      traderEmail:     amort.trader_email || '',
      traderLegalForm: amort.trader_legal_form || '',
      traderVatNote:   amort.trader_vat_note || '',
      traderLegalFooter: amort.trader_legal_footer || '',
      tokenDurationDays,
    };
    const previewPdf = await buildTermsPreviewPdf(previewFields);
    const previewTxt = buildTermsPreviewTxt(previewFields);
    // Ein Ordner pro Kauf/Referenz-ID, siehe show_withdrawal_terms.mjs/consentPurchaseDir.
    const purchaseDir = consentPurchaseDir(soul_id, termsToken);
    await mkdir(purchaseDir, { recursive: true });
    await writeFile(`${purchaseDir}/vorabinformation.pdf`, previewPdf);
    await writeFile(`${purchaseDir}/vorabinformation.txt`, previewTxt, 'utf8');
    await writeFile(`${purchaseDir}/meta.json`, JSON.stringify({
      created_at: new Date().toISOString(),
      payment_method,
    }), 'utf8');

    sweepExpiredConsentTxt(soul_id, tokenDurationDays).catch(() => {});

    res.json({
      ok: true,
      terms_token: termsToken,
      preview_url:     `${BASE_URL}/api/vault/consent/${soul_id}/${termsToken}/vorabinformation.pdf`,
      preview_url_txt: `${BASE_URL}/api/vault/consent/${soul_id}/${termsToken}/vorabinformation.txt`,
      terms_url:     `${BASE_URL}/agb`,
      terms_url_txt: `${BASE_URL}/agb.txt`,
      legal_text: legalTextForChat(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/soul/terms/accept', async (req, res) => {
  if (!EU_CONSUMER_RIGHTS) {
    return res.status(404).json({ error: 'not_enabled', message: 'Dieser Node hat EU_CONSUMER_RIGHTS nicht aktiviert.' });
  }
  const {
    soul_id, terms_token, payment_method,
    consent_immediate_performance, consent_withdrawal_waiver, contact_note,
  } = req.body || {};

  if (!soul_id || !terms_token || !['paypal', 'x402'].includes(payment_method)) {
    return res.status(400).json({ error: 'soul_id, terms_token und payment_method ("paypal"|"x402") erforderlich' });
  }
  if (!consent_immediate_performance || !consent_withdrawal_waiver) {
    return res.status(400).json({
      error: 'Kauf erst nach beiden ausdrücklichen Einwilligungen möglich: ' +
        'consent_immediate_performance UND consent_withdrawal_waiver müssen true sein.',
    });
  }

  try {
    const ctx   = await loadCtx(soul_id);
    const amort = ctx.amortization || {};
    const walletAvailable = amort.enabled === true && typeof amort.wallet === 'string' && amort.wallet.startsWith('0x');
    const paypalAvailable = amort.paypal_enabled === true;
    const x402Available   = walletAvailable && typeof amort.price_usdc === 'string' && Number(amort.price_usdc) > 0;

    if (payment_method === 'paypal' && !paypalAvailable) {
      return res.status(402).json({ error: 'Diese Soul akzeptiert aktuell keinen PayPal-Zahlungsweg.' });
    }
    if (payment_method === 'x402' && !x402Available) {
      return res.status(402).json({ error: 'Diese Soul akzeptiert aktuell keinen x402-Zahlungsweg (kein USDC-Preis hinterlegt).' });
    }

    const purchaseDir = consentPurchaseDir(soul_id, terms_token);
    const previewPath = `${purchaseDir}/vorabinformation.pdf`;
    try {
      await stat(previewPath);
    } catch {
      return res.status(404).json({
        error: 'Ungültiger oder unbekannter terms_token. Zuerst /api/soul/terms/show aufrufen.',
      });
    }

    const target = amort.paypal_link || amort.paypal_email || '(nicht konfiguriert)';
    const wallet  = amort.wallet || '';
    // Siehe accept_digital_content_terms.mjs: für x402 den aktuellen dynamischen
    // Preis zeigen (gleiche Formel wie soul_pay_x402.lua beim Settlement), sonst
    // zeigt die Rechnung einen anderen Betrag als tatsächlich abgebucht wird.
    let price;
    let basePrice = null;
    const dynamicPricing = payment_method === 'x402' && amort.dynamic_pricing === true;
    if (payment_method === 'x402') {
      basePrice = Number(amort.price_usdc) || 0;
      price = dynamicPricing
        ? (await computeDynamicUsdcPrice(soul_id, basePrice)).toFixed(6)
        : (amort.price_usdc || '?');
    } else {
      price = amort.price_eur || '?';
    }
    const currency = payment_method === 'x402' ? 'USDC' : 'EUR';
    const now = new Date();
    const timestampDisplay = now.toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZoneName: 'short',
    });

    // Einmal ziehen, an PDF UND TXT weiterreichen — siehe accept_digital_content_terms.mjs,
    // gleiches "lückenlos fortlaufend"-Argument (§ 14 Abs. 4 Nr. 4 UStG).
    const invoiceNumber = await nextInvoiceNumber(soul_id, amort.trader_name || '');
    const invoiceDate   = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });

    const sharedFields = {
      soulName: ctx.name || soul_id.slice(0, 8),
      soulId: soul_id,
      price,
      basePrice,
      dynamicPricing,
      currency,
      target,
      wallet,
      paymentMethod: payment_method,
      contactNote: contact_note || '',
      timestamp: timestampDisplay,
      referenceId: terms_token,
      traderName:      amort.trader_name || '',
      traderAddress:   amort.trader_address || '',
      traderEmail:     amort.trader_email || '',
      traderLegalForm: amort.trader_legal_form || '',
      traderVatNote:   amort.trader_vat_note || '',
      traderLegalFooter: amort.trader_legal_footer || '',
      invoiceNumber,
      invoiceDate,
    };

    // Feste, sprechende Dateinamen statt weiterer Zufalls-UUIDs — siehe
    // accept_digital_content_terms.mjs für die ausführliche Begründung. Landen
    // im selben Ordner wie die Vorabinformation (purchaseDir), die dabei
    // unangetastet bestehen bleibt (eigenständiges Vorab-Dokument).
    const [invoicePdf, withdrawalPdf, waiverPdf] = await Promise.all([
      buildInvoicePdf(sharedFields),
      buildWithdrawalNoticePdf(sharedFields),
      buildWaiverPdf(sharedFields),
    ]);
    await Promise.all([
      writeFile(`${purchaseDir}/rechnung.pdf`, invoicePdf),
      writeFile(`${purchaseDir}/rechnung.txt`, buildInvoiceTxt(sharedFields), 'utf8'),
      writeFile(`${purchaseDir}/widerrufsbelehrung.pdf`, withdrawalPdf),
      writeFile(`${purchaseDir}/widerrufsbelehrung.txt`, buildWithdrawalNoticeTxt(sharedFields), 'utf8'),
      writeFile(`${purchaseDir}/verzichtserklaerung.pdf`, waiverPdf),
      writeFile(`${purchaseDir}/verzichtserklaerung.txt`, buildWaiverTxt(sharedFields), 'utf8'),
    ]);
    await writeFile(`${purchaseDir}/meta.json`, JSON.stringify({
      created_at: new Date().toISOString(),
      payment_method,
      invoice_number: invoiceNumber,
      accepted_at: timestampDisplay,
    }), 'utf8');

    // Siehe accept_digital_content_terms.mjs: Metadaten für die Rechnungskorrektur
    // nach echtem x402-Settlement (/internal/x402-finalize-invoice, aufgerufen von
    // soul_pay_x402.lua). PayPal-Preise sind nie dynamisch, brauchen das nicht.
    if (payment_method === 'x402') {
      await writeFile(`${purchaseDir}/finalize_pending.json`, JSON.stringify({
        quotedPrice: price, ...sharedFields,
      }), 'utf8');
    }

    res.json({
      ok: true,
      invoice: {
        download_url:     `${BASE_URL}/api/vault/consent/${soul_id}/${terms_token}/rechnung.pdf`,
        download_url_txt: `${BASE_URL}/api/vault/consent/${soul_id}/${terms_token}/rechnung.txt`,
      },
      withdrawal_notice: {
        download_url:     `${BASE_URL}/api/vault/consent/${soul_id}/${terms_token}/widerrufsbelehrung.pdf`,
        download_url_txt: `${BASE_URL}/api/vault/consent/${soul_id}/${terms_token}/widerrufsbelehrung.txt`,
      },
      waiver: {
        download_url:     `${BASE_URL}/api/vault/consent/${soul_id}/${terms_token}/verzichtserklaerung.pdf`,
        download_url_txt: `${BASE_URL}/api/vault/consent/${soul_id}/${terms_token}/verzichtserklaerung.txt`,
      },
      reference_id: terms_token,
      payment: payment_method === 'x402'
        ? { method: 'x402', label: 'Wallet-Adresse (Polygon, USDC via x402)', value: wallet }
        : { method: 'paypal', label: 'PayPal-Zahlungsziel', value: target },
      price,
      currency,
      invoice_number: invoiceNumber,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Soul Transfer (Eigentumsübertragung, kostenlos oder Verkauf) ────────────
// Siehe lib/soul_transfer.mjs für die volle Begründung. Owner-Endpoints
// (Listing verwalten, Übertragung abschließen) per Bearer soul_cert — dieselbe
// Selbst-Cert-Prüfung wie im /mcp-Handler (verifyPeerCert), kein Umweg über
// Lua nötig, da hier ohnehin schon alles in Node läuft (ethers-Signatur- und
// Zahlungsprüfung). Käufer-Endpoints bewusst öffentlich, ohne Session — exakt
// dasselbe Prinzip wie /api/soul/terms/show|accept: ein fremder Agent kennt
// keine Session auf diesem Node.

async function requireSoulOwner(req, res, expectedSoulId) {
  const token = extractToken(req);
  if (!token || !token.includes('.')) {
    res.status(401).json({ error: 'soul_cert erforderlich' });
    return false;
  }
  const [soulId, cert] = token.split('.');
  if (soulId !== expectedSoulId) {
    res.status(403).json({ error: 'soul_cert gehört zu einer anderen Soul' });
    return false;
  }
  const ok = await verifyPeerCert(soulId, cert, null);
  if (!ok) {
    res.status(401).json({ error: 'Ungültiger soul_cert' });
    return false;
  }
  return true;
}

app.get('/api/soul/transfer/listing', async (req, res) => {
  const soulId = req.query.soul_id;
  if (!soulId) return res.status(400).json({ error: 'soul_id erforderlich' });
  if (!(await requireSoulOwner(req, res, soulId))) return;
  try {
    const [listing, challenge, onChainOwner] = await Promise.all([
      getSoulTransferListing(soulId),
      getSoulTransferActiveChallenge(soulId),
      getSoulTransferOnChainOwner(soulId).catch(() => null),
    ]);
    res.json({ ok: true, listing, challenge, on_chain_owner: onChainOwner });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/soul/transfer/listing', async (req, res) => {
  const soulId = req.body?.soul_id;
  if (!soulId) return res.status(400).json({ error: 'soul_id erforderlich' });
  if (!(await requireSoulOwner(req, res, soulId))) return;
  try {
    const { mode, price_usdc, duration_hours } = req.body || {};
    const listing = await setSoulTransferListing(soulId, {
      mode, priceUsdc: price_usdc, durationHours: duration_hours,
    });
    res.json({ ok: true, listing });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/soul/transfer/listing', async (req, res) => {
  const soulId = req.query.soul_id;
  if (!soulId) return res.status(400).json({ error: 'soul_id erforderlich' });
  if (!(await requireSoulOwner(req, res, soulId))) return;
  try {
    const listing = await deactivateSoulTransferListing(soulId);
    res.json({ ok: true, listing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/soul/transfer/complete', async (req, res) => {
  const soulId = req.body?.soul_id;
  if (!soulId) return res.status(400).json({ error: 'soul_id erforderlich' });
  if (!(await requireSoulOwner(req, res, soulId))) return;
  try {
    const { challenge_id, transfer_tx_hash } = req.body || {};
    if (!challenge_id) return res.status(400).json({ error: 'challenge_id erforderlich' });
    const challenge = await markSoulTransferCompleted(soulId, challenge_id, transfer_tx_hash);
    res.json({ ok: true, challenge });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

app.post('/api/soul/transfer/cancel', async (req, res) => {
  const soulId = req.body?.soul_id;
  if (!soulId) return res.status(400).json({ error: 'soul_id erforderlich' });
  if (!(await requireSoulOwner(req, res, soulId))) return;
  try {
    const challenge = await cancelSoulTransferChallenge(soulId, req.body?.challenge_id);
    res.json({ ok: true, challenge });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Käufer-seitig, öffentlich (kein Soul-Cert nötig) ────────────────────────

app.post('/api/soul/transfer/challenge', async (req, res) => {
  const soulId = req.body?.soul_id;
  if (!soulId) return res.status(400).json({ error: 'soul_id erforderlich' });
  try {
    const [challenge, listing] = await Promise.all([
      createSoulTransferChallenge(soulId),
      getSoulTransferListing(soulId),
    ]);
    res.json({
      ok: true,
      challenge_id: challenge.challenge_id,
      mode: challenge.mode,
      price_usdc: challenge.price_usdc,
      expires_at: challenge.expires_at,
      status: challenge.status,
      confirmation_message: soulTransferConfirmationMessage(soulId, challenge.challenge_id),
      accept_url: `${BASE_URL}/accept-transfer?soul_id=${soulId}&challenge_id=${challenge.challenge_id}`,
      seller_wallet: listing?.active ? await getSoulTransferOnChainOwner(soulId).catch(() => null) : null,
    });
  } catch (err) {
    if (err.code === 'no_active_listing') {
      return res.status(404).json({ error: 'no_active_listing', message: 'Diese Soul hat aktuell kein aktives Transfer-Angebot.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/soul/transfer/status', async (req, res) => {
  const { soul_id: soulId, challenge_id: challengeId } = req.query;
  if (!soulId || !challengeId) return res.status(400).json({ error: 'soul_id und challenge_id erforderlich' });
  try {
    const challenge = await getSoulTransferChallenge(soulId, challengeId);
    if (!challenge) return res.status(404).json({ error: 'challenge_not_found' });
    const [sellerWallet, ctx] = await Promise.all([
      getSoulTransferOnChainOwner(soulId).catch(() => null),
      loadCtx(soulId).catch(() => null),
    ]);
    res.json({
      ok: true,
      challenge,
      confirmation_message: soulTransferConfirmationMessage(soulId, challengeId),
      seller_wallet: sellerWallet,
      soul_name: ctx?.name || soulId.slice(0, 8),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/soul/transfer/sign', async (req, res) => {
  const { soul_id: soulId, challenge_id: challengeId, wallet, signature } = req.body || {};
  if (!soulId || !challengeId || !wallet || !signature) {
    return res.status(400).json({ error: 'soul_id, challenge_id, wallet und signature erforderlich' });
  }
  try {
    const challenge = await submitSoulTransferSignature(soulId, challengeId, wallet, signature);
    res.json({ ok: true, challenge });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

app.post('/api/soul/transfer/pay', async (req, res) => {
  const { soul_id: soulId, challenge_id: challengeId, tx_hash: txHash } = req.body || {};
  if (!soulId || !challengeId || !txHash) {
    return res.status(400).json({ error: 'soul_id, challenge_id und tx_hash erforderlich' });
  }
  try {
    const challenge = await submitSoulTransferPayment(soulId, challengeId, txHash);
    res.json({ ok: true, challenge });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

// POST /internal/generate-prompts — regeneriert prompts.md in allen Soul-Vaults
// Wird vom Vault-Explorer nach dem Sync aufgerufen.
app.post('/internal/generate-prompts', async (_req, res) => {
  const PROJECT_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
  const script = `${PROJECT_ROOT}/utils/generate-prompts.mjs`;
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn('node', [script], { cwd: PROJECT_ROOT, stdio: 'pipe' });
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
      proc.on('error', reject);
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Web Push Endpoints ────────────────────────────────────────────────────────

// POST /internal/push-subscribe  { soul_id, subscription }
app.post('/internal/push-subscribe', express.json({ limit: '16kb' }), async (req, res) => {
  const { soul_id, subscription } = req.body || {};
  if (!soul_id || !subscription?.endpoint) return res.status(400).json({ error: 'soul_id + subscription erforderlich' });
  const subsFile = `${SOULS_DIR}${soul_id}/push_subscriptions.json`;
  let subs = [];
  try { subs = JSON.parse(await readFile(subsFile, 'utf8')); } catch { /* new file */ }
  const exists = subs.some(s => s.endpoint === subscription.endpoint);
  if (!exists) {
    subs.push(subscription);
    await writeFile(subsFile, JSON.stringify(subs), 'utf8');
  }
  res.json({ ok: true });
});

// POST /internal/send-push  { soul_id, title, body, url }
app.post('/internal/send-push', express.json({ limit: '4kb' }), async (req, res) => {
  if (!vapidKeys) return res.json({ ok: false, error: 'vapid not configured' });
  const { soul_id, title = 'SYS', body = '', url = '/connection' } = req.body || {};
  if (!soul_id) return res.status(400).json({ error: 'soul_id erforderlich' });
  const subsFile = `${SOULS_DIR}${soul_id}/push_subscriptions.json`;
  let subs = [];
  try { subs = JSON.parse(await readFile(subsFile, 'utf8')); } catch { return res.json({ ok: true, sent: 0 }); }
  const payload = JSON.stringify({ title, body, url });
  let sent = 0, dead = [];
  for (const sub of subs) {
    try { await webpush.sendNotification(sub, payload); sent++; }
    catch (e) { if (e.statusCode === 410 || e.statusCode === 404 || e.statusCode === 403) dead.push(sub.endpoint); }
  }
  if (dead.length) {
    const alive = subs.filter(s => !dead.includes(s.endpoint));
    await writeFile(subsFile, JSON.stringify(alive), 'utf8');
  }
  res.json({ ok: true, sent });
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3098', 10);
app.listen(PORT, '127.0.0.1', async () => {
  console.log(`soul-mcp läuft auf 127.0.0.1:${PORT}`);
  startIndexer().catch(e => console.error('[soul-index] Start-Fehler:', e.message));
  console.log(`MCP-Endpunkt: ${BASE_URL}/mcp`);
  console.log(`OAuth: ${BASE_URL}/oauth/authorize`);
  // LONGMEM-Bootstrap: Souls mit pending-Flag einmalig kristallisieren
  bootstrapLongmem().catch(e => console.error('[longmem-bootstrap] Fehler:', e.message));
  // AGENT/SOCIAL-Bootstrap: Fehlende Blöcke in v1-Souls einmalig einfügen
  bootstrapAgentSocial().catch(e => console.error('[agent-social-bootstrap] Fehler:', e.message));
});

async function bootstrapLongmem() {
  const { readdir, stat, unlink } = await import('fs/promises');
  let souls;
  try { souls = await readdir(SOULS_DIR); } catch { return; }

  for (const soulId of souls) {
    const flagPath = `${SOULS_DIR}${soulId}/.longmem_bootstrap_pending`;
    try { await stat(flagPath); } catch { continue; } // kein Flag → überspringen

    console.log(`[longmem-bootstrap] Starte Kristallisation für ${soulId}...`);
    try {
      await herzForceCrystallize(soulId);
      await unlink(flagPath);
      console.log(`[longmem-bootstrap] ${soulId} ✓`);
    } catch (e) {
      console.warn(`[longmem-bootstrap] ${soulId} Fehler: ${e.message}`);
    }
    // Kurze Pause zwischen Souls — API nicht überlasten
    await new Promise(r => setTimeout(r, 3000));
  }
}

async function bootstrapAgentSocial() {
  const { readdir, stat, unlink } = await import('fs/promises');
  let souls;
  try { souls = await readdir(SOULS_DIR); } catch { return; }

  for (const soulId of souls) {
    if (!/^[a-f0-9-]{36}$/i.test(soulId)) continue;
    const flagPath = `${SOULS_DIR}${soulId}/.agent_social_bootstrap_pending`;
    try { await stat(flagPath); } catch { continue; }

    console.log(`[agent-social-bootstrap] Migriere ${soulId}...`);
    try {
      const result = await herzEnsureAgentSocialBlocks(soulId);
      await unlink(flagPath);
      console.log(`[agent-social-bootstrap] ${soulId} ✓ changed=${result.changed}`);
    } catch (e) {
      console.warn(`[agent-social-bootstrap] ${soulId} Fehler: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

// Ein plain Service-Token (kein soul_id.cert) lebt bereits eindeutig in genau
// einer Soul's authorized_services.json — Reverse-Lookup statt Angewiesenheit
// auf ?soul_id= oder eine "genau 1 Soul auf dem Node"-Heuristik, die bricht
// sobald ein zweiter Soul-Ordner existiert (gleiches Muster wie
// check_service_token() in vault_auth.lua).
async function findSoulByServiceToken(token) {
  const dirs     = await readdir(SOULS_DIR).catch(() => []);
  const soulDirs = dirs.filter(d => /^[a-f0-9-]{36}$/i.test(d));
  for (const id of soulDirs) {
    try {
      const raw  = await readFile(`${SOULS_DIR}${id}/authorized_services.json`, 'utf8');
      const svcs = JSON.parse(raw);
      if (svcs && Object.prototype.hasOwnProperty.call(svcs, token)) return id;
    } catch { /* Datei fehlt/ungültig — nächste Soul */ }
  }
  return null;
}

// Liest das resource-Feld (RFC 8707) eines Service-Tokens — gesetzt nur für
// Tokens, die über /oauth/authorize mit resource= angefragt wurden (siehe
// oauth.mjs). null/undefined bedeutet "ungebunden", nicht "kein Zugriff".
async function getServiceTokenResource(soulId, token) {
  try {
    const raw  = await readFile(`${SOULS_DIR}${soulId}/authorized_services.json`, 'utf8');
    const svcs = JSON.parse(raw);
    return svcs?.[token]?.resource || null;
  } catch {
    return null;
  }
}

function extractToken(req) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  return null;
}

/**
 * Löst die einzige Soul auf diesem Node auf (Personal-Mode). Gibt null zurück
 * wenn keine oder mehrere Souls vorhanden sind (Multi-Hoster braucht ?soul_id=).
 */
async function resolveSingleSoulId() {
  try {
    const dirs = await readdir('/var/lib/sys/souls/');
    const soulDirs = dirs.filter(d => /^[a-f0-9-]{36}$/i.test(d));
    return soulDirs.length === 1 ? soulDirs[0] : null;
  } catch {
    return null;
  }
}

/**
 * Prüft ob peerSoulId in trusted_souls der Ziel-Soul steht und verifiziert den Cert.
 * Same-Server: Cert-Check via lokaler /api/soul/verify-peer-cert Endpoint.
 * Cross-Domain: Cert-Check via remote Endpoint (gespeichert im trusted_souls Eintrag).
 */
async function checkTrustedSoul(peerSoulId, peerCert, targetSoulId) {
  try {
    let soulId = targetSoulId;
    if (!soulId) {
      const dirs = await readdir('/var/lib/sys/souls/');
      const soulDirs = dirs.filter(d => /^[a-f0-9-]{36}$/i.test(d));
      if (soulDirs.length === 0) return null;
      if (soulDirs.length > 1) return { error: 'soul_id_required' };
      soulId = soulDirs[0];
    }
    if (!soulId) return null;

    const raw = await readFile(`/var/lib/sys/souls/${soulId}/api_context.json`, 'utf8');
    const ctx = JSON.parse(raw);
    const trusted = ctx?.amortization?.trusted_souls || [];

    // Eintrag finden: plain UUID (same-server) oder {soul_id, endpoint} (cross-domain)
    const entry = trusted.find(t =>
      t === peerSoulId || (typeof t === 'object' && t?.soul_id === peerSoulId)
    );
    if (!entry) return null;

    // Cert kryptografisch prüfen
    const peerEndpoint = typeof entry === 'object' ? entry.endpoint : null;
    const certOk = await verifyPeerCert(peerSoulId, peerCert, peerEndpoint);
    if (!certOk) return null;

    const agentTools = ctx?.amortization?.agent_tools?.length
      ? ctx.amortization.agent_tools
      : (ctx?.amortization?.free_tools?.length ? ctx.amortization.free_tools : ['soul_read', 'verify_human', 'soul_maturity']);
    return { soul_id: soulId, agent_tools: agentTools };
  } catch {
    return null;
  }
}

/**
 * Verifiziert einen soul_cert via /api/soul/verify-peer-cert.
 * peerEndpoint = null  → lokaler Call (same-server, http://127.0.0.1)
 * peerEndpoint = URL   → Remote-Call zum Home-Node des Peers (cross-domain)
 */
async function verifyPeerCert(soulId, cert, peerEndpoint) {
  try {
    // 127.0.0.1 ohne Host-Header trifft den nginx default_server (return 444) —
    // BASE_URL statt Loopback verwenden, damit der Vhost korrekt geroutet wird.
    const base = peerEndpoint ? peerEndpoint.replace(/\/$/, '') : BASE_URL;
    const url  = `${base}/api/soul/verify-peer-cert?soul_id=${encodeURIComponent(soulId)}&cert=${encodeURIComponent(cert)}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data = await res.json().catch(() => ({}));
    return data.ok === true;
  } catch {
    return false;
  }
}

/**
 * Validiert einen pol_access_token via internem OpenResty-Endpoint.
 * Gibt { ok, soul_id, agent_tools } oder { ok: false, error } zurück.
 */
async function validatePolToken(token) {
  try {
    // Über den dedizierten internen Listener (127.0.0.1:8081, kein TLS/Vhost-Routing
    // nötig) statt über den öffentlichen Vhost — soul_pol_validate.lua prüft zusätzlich
    // remote_addr==127.0.0.1, ein Umweg über BASE_URL würde daran scheitern.
    const res = await fetch(
      `http://127.0.0.1:8081/internal/validate-pol-token?token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(3000) }
    );
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error };

    // agent_tools aus api_context.json lesen
    const { readFile } = await import('fs/promises');
    const ctxPath = `/var/lib/sys/souls/${data.soul_id}/api_context.json`;
    try {
      const raw = await readFile(ctxPath, 'utf8');
      const ctx = JSON.parse(raw);
      const agentTools = ctx?.amortization?.agent_tools?.length
        ? ctx.amortization.agent_tools
        : (ctx?.amortization?.free_tools || ['soul_read', 'verify_human', 'soul_maturity']);
      return { ok: true, soul_id: data.soul_id, agent_tools: agentTools };
    } catch {
      return { ok: true, soul_id: data.soul_id, agent_tools: ['soul_read', 'verify_human', 'soul_maturity'] };
    }
  } catch (err) {
    return { ok: false, error: `Validierung fehlgeschlagen: ${err.message}` };
  }
}
