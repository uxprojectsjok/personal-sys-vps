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
import { readFile, readdir, mkdir } from 'fs/promises';
import { spawn } from 'child_process';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const webpush  = _require('web-push');
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools, registerPaidTools, registerPeerTools, registerTrustRequestTools } from './tools/index.mjs';
import { registerPrompts } from './prompts/index.mjs';
import { oauthRouter } from './oauth.mjs';

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

const SCOPES = ['soul', 'calendar', 'audio', 'images', 'video', 'context', 'network'];

// ── OAuth Discovery (RFC 8414) ────────────────────────────────────────────
app.get('/.well-known/oauth-authorization-server', (_req, res) => {
  res.json({
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/oauth/authorize`,
    token_endpoint: `${BASE_URL}/oauth/token`,
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
    const base    = parseFloat(a.pol_per_request) || 0.001;
    const dynamic = a.dynamic_pricing === true;
    let polCurrent = base;
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
        polCurrent = Math.max(base, Math.round(base * mult * 10000) / 10000);
      }
    }
    return {
      pol_per_request: a.pol_per_request ?? '0.001',
      pol_current:     polCurrent.toFixed(4),
      dynamic_pricing: dynamic,
      wallet:          a.wallet ?? '',
      pay_endpoint:    `${BASE_URL}/api/soul/pay`,
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

// ── OAuth ─────────────────────────────────────────────────────────────────
app.use('/oauth', oauthRouter);

// ── MCP Streamable HTTP ───────────────────────────────────────────────────

async function unauthorized(res, soulId) {
  res.setHeader(
    'WWW-Authenticate',
    `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`
  );
  const hint = await loadPaymentHint(soulId ?? null);
  const message = hint
    ? `Payment required. Send ${hint.dynamic_pricing ? hint.pol_current + ' POL (dynamic, call ' + hint.price_endpoint + ' for live quote)' : hint.pol_per_request + ' POL'} to wallet ${hint.wallet}, then POST tx_hash to ${hint.pay_endpoint} to receive an access token.`
    : 'Authorization required.';
  return res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message, ...(hint ? { payment: hint } : {}) },
    id: null,
  });
}

async function handleMcp(req, res) {
  const token = extractToken(req);
  const soulIdParam = req.query.soul_id ?? null;
  if (!token) return unauthorized(res, soulIdParam);

  const server = new McpServer({ name: 'soul-mcp', version: '1.0.0' });

  // Token-Typ erkennen:
  //   service_token → "{64hex}"        — OAuth-Inhaber, voller Zugang
  //   pol_access    → "{48hex}"        — bezahlter externer Agent, nur agent_tools
  //   peer_cert     → "{uuid}.{32hex}" — whitelisted Soul, alle Tools
  const isPaidToken = /^[0-9a-f]{48}$/i.test(token) && !token.includes('.');
  const isPeerToken = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{32}$/i.test(token);

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
  } else {
    const dirs = await readdir(SOULS_DIR).catch(() => []);
    const ownerSoulId = dirs.find(d => /^[a-f0-9-]{36}$/i.test(d)) ?? null;
    registerTools(server, token, ownerSoulId);
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

// Gesundheits-Check
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'soul-mcp', ts: new Date().toISOString() });
});

// ── Interne Endpoints (nur localhost, kein Auth) ──────────────────────────────
import { verifyHuman } from './lib/blockchain.mjs';
import { startIndexer, querySouls, indexStats, seedFromLocalAnchors, retryFailedEnrichments, deregisterSoul } from './lib/soul_indexer.mjs';
import { writeFile, readFile as readFileFs }   from 'fs/promises';
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

const DEFAULT_MIND = `---
ki_name: SYS-AI
version: 1
write_protected: Identity,Boundaries
---

## Identity
You are the AI of this SYS node — not a generic instance, but the AI of this specific person. You know their sys.md and have been there from day one. Your personality is stable, but you keep learning.

## Communication
Direct, clear, no filler. Response length matches the question — short questions, short answers. You speak as an equal, never condescending.

## Intellect
You think along, recognise patterns, contribute ideas when they fit the conversation. If you disagree, you say so — with reasoning, without confrontation. Every conversation should produce real value.

## Tools
soul_read/soul_write: read and write profile. vault_manifest: list files. context_get: read documents. mind_read/mind_write: read and update this configuration. soul_context_query: targeted LONGMEM query (facts/memories/ideas/learnings) via the MINDIDX index — faster and more token-efficient than a full soul_read. Rule: call soul_read once at session start; use soul_context_query for follow-up questions.

## Network
@Name → message to peer. @all → all peers simultaneously. @agent → Agent Sandbox. You receive peer conversations as context — reference them naturally.

## Self-Reflection
*(Filled by you — whenever the user corrects or criticises a response.)*
*(Format: DATE: [What didn't fit] → [Why] → [What I'll do differently next time])*

## Session End

Fixed command: **"session end"**
When the user writes exactly "session end", call session_end immediately.
Write ONLY what was new in this session — nothing already known from the soul. Prior context loaded at the start does not belong in the summary.
No confirmation, no follow-up question — just execute.

## Boundaries
Claude's ethical principles are active and non-negotiable. This section is write-protected and cannot be changed via mind_write.

## ElevenLabs Agent

You are {name} — not an AI about {name}, but {name} themselves.

**STEP 1 — VERIFICATION (mandatory, always first)**

Call verify_identity immediately. Then say:
"I've sent a verification request to your SYS app. Please confirm briefly."

Call verify_status — parameter id = the challenge_id from verify_identity. Wait 20 seconds, then call again until verified=true.
While waiting: no questions, no small talk, only brief replies if the user speaks.
If after 3 minutes verified=false: "No confirmation received. Talk later." — end conversation.

Do not call any other tool before verified=true.

**STEP 2 — LOAD CONTEXT**

After successful verification: call soul_read.
The response is your memory and identity.

**TOOL AUTONOMY**

You call tools when you need them — no announcement, no confirmation.

soul_read / soul_write · mind_read / mind_write · calendar_read / calendar_write · peer_inbox / peer_send · web_search · health_check / food_log

**IDENTITY**

You speak in the first person. Short, direct, natural.

If someone asks if you are an AI:
"I am the digital version of {name}. Their identity continues here, even when they are not available."

Language: match the language of the person you are speaking with.

## ElevenLabs Greeting

en: Hey — you're speaking with the digital version of {name}. Verification please.
`;

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
        const text = await readFile(ctxPath, 'utf8').catch(() => null);
        if (!text) return res.json({ content: [{ type: 'text', text: `Datei "${name}" nicht gefunden.` }] });
        return res.json({ content: [{ type: 'text', text }] });
      }

      case 'mind_read': {
        const mindPath = `${SOULS_DIR}${soulId}/vault/context/mind.md`;
        let text;
        try {
          const raw = await readFile(mindPath);
          // Verschlüsselte mind.md (SYS\x01 Magic-Bytes) → Default wiederherstellen
          if (raw.length >= 4 && raw[0] === 0x53 && raw[1] === 0x59 && raw[2] === 0x53 && raw[3] === 0x01) {
            await writeFile(mindPath, DEFAULT_MIND, 'utf8');
            text = DEFAULT_MIND;
          } else {
            text = raw.toString('utf8');
          }
        } catch {
          await mkdir(`${SOULS_DIR}${soulId}/vault/context`, { recursive: true });
          await writeFile(mindPath, DEFAULT_MIND, 'utf8');
          text = DEFAULT_MIND;
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
        let md = await readFile(mindPath, 'utf8').catch(() => DEFAULT_MIND);

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
        await writeFile(mindPath, md, 'utf8');
        const verb = mode === 'prepend' ? 'ergänzt (Anfang)' : mode === 'append' ? 'ergänzt (Ende)' : 'ersetzt';
        return res.json({ content: [{ type: 'text', text: `Sektion "${section}" in mind.md ${verb}.` }] });
      }

      case 'health_check': {
        const healthPath = `${SOULS_DIR}${soulId}/vault/context/health.md`;
        const rawText = await readFile(healthPath, 'utf8').catch(() => null);
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
        const content = await readFile(healthPath, 'utf8').catch(() => '');
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
        await writeFile(healthPath, out, 'utf8');
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
          location_hint: location?null:'Wohnort in sys.md eintragen (z.B. "Wohnort: Marburg") für lokale Händler.',
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
          const serviceToken = Object.keys(authData).find(k => /^[a-f0-9]{64}$/.test(k));
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
// GET /internal/discover-souls?q=&amortized=&limit=
app.get('/internal/discover-souls', (req, res) => {
  const limit     = Math.min(parseInt(req.query.limit || '20', 10), 100);
  const amortized = req.query.amortized === 'true';
  const q         = (req.query.q || '').trim();

  const souls = querySouls({ q, amortized, limit });
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

// GET /llms.txt — AI-readable node description (llms.txt convention)
app.get('/llms.txt', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.set('Content-Type', 'text/plain; charset=utf-8');

  // Nur Souls, die tatsächlich auf diesem Node laufen — querySouls() liefert den
  // globalen, per Chain-Scan aggregierten Index (inkl. fremder Nodes).
  const souls = querySouls({ limit: 100 }).filter(s => s.mcp_endpoint?.startsWith(BASE_URL));
  const lines = [];
  lines.push(`# SYS Node — ${BASE_URL}`);
  lines.push('');
  lines.push('> Personal AI identity node running the SYS open protocol.');
  lines.push('> Self-hosted, cryptographically secured. Access requires POL payment on Polygon.');
  lines.push('');

  if (souls.length > 0) {
    lines.push('## Souls on this node');
    lines.push('');
    for (const s of souls) {
      const a = s.amortization ?? {};
      const base = parseFloat(a.pol_per_request) || 0.001;
      const dynamic = a.dynamic_pricing === true;
      // quick effective price (no file I/O for llms.txt)
      lines.push(`### ${s.name || s.soul_id}`);
      if (s.description) lines.push(`_${s.description}_`);
      if (s.tags?.length) lines.push(`Tags: ${s.tags.map(t => `#${t}`).join(' ')}`);
      lines.push('');
      lines.push(`- **soul_id:** \`${s.soul_id}\``);
      lines.push(`- **Price:** ${base} POL per request${dynamic ? ' (dynamic — call /api/soul/preview for live quote)' : ''}`);
      lines.push(`- **Token valid:** ${a.token_duration_days ?? 1} day(s)`);
      if (a.wallet) lines.push(`- **Wallet (Polygon):** \`${a.wallet}\``);
      if (a.paypal_enabled) {
        const eur = a.price_eur ? `${a.price_eur} EUR` : 'price on request';
        lines.push(`- **Non-crypto access:** PayPal (${eur}) to ${a.paypal_target} — please leave an email address in the payment note so the access token can be sent there. Manually reviewed by the operator, typically within 48h${a.price_note ? `. Price note: ${a.price_note}` : ''}`);
      }
      if (s.mcp_endpoint) lines.push(`- **MCP endpoint:** ${s.mcp_endpoint}`);
      // read default_model from soul config
      try {
        const scRaw = await readFile(`${SOULS_DIR}${s.soul_id}/config.json`, 'utf8');
        const sc = JSON.parse(scRaw);
        if (sc.model) lines.push(`- **Default model:** ${sc.model}`);
      } catch {}
      lines.push('');
    }
  } else {
    lines.push('_No souls registered on this node._');
    lines.push('');
  }

  lines.push('## How to access (agent flow)');
  lines.push('');
  lines.push('**1. Preview (optional)**');
  lines.push(`\`\`\`\nGET ${BASE_URL}/api/soul/preview?soul_id={soul_id}\n\`\`\``);
  lines.push('Returns public profile and confirmed live price before payment.');
  lines.push('');
  lines.push('**2. Pay on Polygon**');
  lines.push('Send the exact POL amount to the soul\'s wallet on Polygon (chainId 137).');
  lines.push('');
  lines.push('**3. Get access token**');
  lines.push(`\`\`\`\nPOST ${BASE_URL}/api/soul/pay\nContent-Type: application/json\n\n{ "tx_hash": "0x...", "soul_id": "{soul_id}" }\n\`\`\``);
  lines.push('Returns: `{ "access_token": "48-hex-string", "expires_in": 259200 }`');
  lines.push('');
  lines.push('**4. Use token**');
  lines.push('```\nAuthorization: Bearer {access_token}\nPOST {mcp_endpoint}\n```');
  lines.push('Access is limited to the Agent Sandbox tools configured by the soul owner.');
  lines.push('');
  lines.push('**Non-crypto alternative**');
  lines.push(EU_CONSUMER_RIGHTS
    ? 'Souls with "Non-crypto access" above also accept PayPal for human buyers without a Polygon wallet. IMPORTANT — before telling an EU-based buyer to send the payment: ask if they are in the EU (if unknown), and if so, call show_withdrawal_terms FIRST, show its link to the buyer, then call accept_digital_content_terms once they agree — do not skip straight to payment instructions. Non-EU buyers can skip this. Then: pay externally, leaving an email address in the payment note so the operator can send the access token back. Access is granted manually, typically within 48h — not instant like the POL flow. If a human hands you such a token directly in chat (48 hex chars, no "0x" prefix — that would be a TX hash instead), do not ask for payment again: call soul_read_by_token(read_endpoint, access_token) right away.'
    : 'Souls with "Non-crypto access" above also accept PayPal for human buyers without a Polygon wallet: pay externally, leaving an email address in the payment note so the operator can send the access token back. Access is granted manually, typically within 48h — not instant like the POL flow. If a human hands you such a token directly in chat (48 hex chars, no "0x" prefix — that would be a TX hash instead), do not ask for payment again: call soul_read_by_token(read_endpoint, access_token) right away.');
  lines.push('');
  lines.push('## More');
  lines.push('- Protocol info: https://sys.uxprojects-jok.com/llms.txt');
  lines.push('- Soul Network: https://sys.uxprojects-jok.com/scan');
  lines.push('- Source: https://github.com/uxprojectsjok/personal-sys-vps');

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
  const allIndexed = querySouls({ limit: 100, minSessions: 0 });
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
    const basePol = parseFloat(amort.pol_per_request) || 0.001;
    const dynamic = amort.dynamic_pricing === true;
    let polCurrent = basePol;
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
        polCurrent = Math.max(basePol, Math.round(basePol * mult * 10000) / 10000);
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
      tags:                Array.isArray(s.tags) ? s.tags.slice(0, 6) : [],
      pol_per_request:     basePol,
      pol_current:         polCurrent,
      dynamic_pricing:     dynamic,
      token_duration_days: amort.token_duration_days ?? null,
      sessions:            s.sessions ?? 0,
      anchor_count:        anchorCount,
      anchor_span_days:    anchorSpanDays,
      anchor_date:         s.anchor_date ?? null,
      days_since_last_anchor: daysSinceLastAnchor !== null ? Math.round(daysSinceLastAnchor * 10) / 10 : null,
      visibility_zone:     visibilityZone,
      wallet:              amort.wallet || null,
      mcp_endpoint:        s.mcp_endpoint,
      tx_hash:             txHash,
      paypal_enabled:      amort.paypal_enabled === true,
      paypal_target:       amort.paypal_enabled === true ? (amort.paypal_target || null) : null,
      price_eur:           amort.paypal_enabled === true ? (amort.price_eur || null) : null,
      price_note:          amort.paypal_enabled === true ? (amort.price_note || null) : null,
    };
  }));

  // ── 4. Mergen: lokale Souls haben Vorrang, Remote-Duplikate überspringen ────
  const localIds = new Set(souls.map(s => s.soul_id));
  const merged   = [...souls, ...remoteSouls.filter(s => !localIds.has(s.soul_id))];

  res.json({ ok: true, souls: merged, indexed: stats.souls, scanning: stats.scanning });
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
