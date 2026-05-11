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
import { readFile, readdir } from 'fs/promises';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools, registerPaidTools, registerPeerTools } from './tools/index.mjs';
import { registerPrompts } from './prompts/index.mjs';
import { oauthRouter } from './oauth.mjs';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('BASE_URL is not set. Add it to your .env file.');

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
// Sowohl /mcp-Variante als auch Basis-URL werden abgefragt
app.get('/.well-known/oauth-protected-resource', (_req, res) => {
  res.json({
    resource: `${BASE_URL}/mcp`,
    authorization_servers: [BASE_URL],
    scopes_supported: SCOPES,
    bearer_methods_supported: ['header'],
  });
});
app.get('/.well-known/oauth-protected-resource/mcp', (_req, res) => {
  res.json({
    resource: `${BASE_URL}/mcp`,
    authorization_servers: [BASE_URL],
    scopes_supported: SCOPES,
    bearer_methods_supported: ['header'],
  });
});

// ── OAuth ─────────────────────────────────────────────────────────────────
app.use('/oauth', oauthRouter);

// ── MCP Streamable HTTP ───────────────────────────────────────────────────

function unauthorized(res) {
  // RFC 8707: resource_metadata zeigt auf Protected Resource Metadata (nicht Authorization Server)
  res.setHeader(
    'WWW-Authenticate',
    `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`
  );
  return res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'Authorization required.' },
    id: null,
  });
}

async function handleMcp(req, res) {
  const token = extractToken(req);
  if (!token) return unauthorized(res);

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
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`);
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: paid.error || 'pol_access_token ungültig oder abgelaufen. Neue Zahlung erforderlich.' },
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
    if (!trusted || trusted.error) {
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`);
      const msg = trusted?.error === 'soul_id_required'
        ? 'Multi-Hoster: ?soul_id= Parameter erforderlich (z.B. /mcp?soul_id=<ziel-soul-id>).'
        : 'Soul nicht in der Whitelist. Kontakt zum Soul-Inhaber aufnehmen.';
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: msg },
        id: null,
      });
    }
    // Ziel-soul_id auflösen (wird für Filesystem-Reads in registerPeerTools benötigt)
    const resolvedTargetId = trusted.soul_id;
    registerPeerTools(server, token, [], resolvedTargetId);
  } else {
    registerTools(server, token);
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
import { writeFile }   from 'fs/promises';
import { decryptIfNeeded, encryptBuf, loadVaultMeta, SOULS_DIR } from './lib/vault_fs.mjs';
import { ethers }      from 'ethers';

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// POST /internal/run-tool — führt ein Soul-Tool server-seitig aus (In-App-Chat)
// Kein Auth nötig — nur localhost erreichbar, soul_cert wird vom Nginx-Proxy vorab geprüft.
app.post('/internal/run-tool', express.json({ limit: '2mb' }), async (req, res) => {
  const { tool, input = {} } = req.body;
  if (!tool) return res.status(400).json({ error: 'tool erforderlich' });

  try {
    const dirs     = await readdir(SOULS_DIR).catch(() => []);
    const soulId   = dirs.find(d => /^[a-f0-9-]{36}$/i.test(d));
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

        // Aligned mit soul_write.mjs updateSection (multiline, trailing spaces, create-if-missing)
        const re = new RegExp(
          `(^## ${escapeRegex(section)}[ \\t]*\\n)([\\s\\S]*?)(?=^## |\\s*$)`,
          'm'
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

      default:
        return res.status(400).json({ error: `Unbekanntes Tool: ${tool}` });
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
          // Tags als durchsuchbare keyvalues (tag_0, tag_1, …)
          ...((Array.isArray(meta.tags) ? meta.tags : [])
            .slice(0, 8)
            .reduce((acc, t, i) => { acc[`tag_${i}`] = t; return acc; }, {})),
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
      const text = await response.text();
      return res.status(response.status).json({ error: 'Pinata-Fehler', detail: text });
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

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3098', 10);
app.listen(PORT, '127.0.0.1', async () => {
  console.log(`soul-mcp läuft auf 127.0.0.1:${PORT}`);
  // Indexer non-blocking starten — Discovery ist sofort verfügbar, wächst im Hintergrund
  startIndexer().catch(e => console.error('[soul-index] Start-Fehler:', e.message));
  console.log(`MCP-Endpunkt: ${BASE_URL}/mcp`);
  console.log(`OAuth: ${BASE_URL}/oauth/authorize`);
});

// ── Helpers ────────────────────────────────────────────────────────────────
function extractToken(req) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  return null;
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
    const base = peerEndpoint ? peerEndpoint.replace(/\/$/, '') : 'http://127.0.0.1';
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
    const res = await fetch(
      `http://127.0.0.1/internal/validate-pol-token?token=${encodeURIComponent(token)}`,
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
