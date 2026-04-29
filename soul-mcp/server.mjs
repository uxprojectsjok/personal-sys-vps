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
import { readFile } from 'fs/promises';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools, registerPaidTools } from './tools/index.mjs';
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
  //   soul_cert  → "{uuid}.{32hex}"   — OAuth-Inhaber, voller Zugang
  //   pol_access → "{48hex}"          — bezahlter externer Agent, nur free_tools
  const isPaidToken = /^[0-9a-f]{48}$/i.test(token) && !token.includes('.');

  if (isPaidToken) {
    // pol_access_token validieren + free_tools laden
    const paid = await validatePolToken(token);
    if (!paid.ok) {
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`);
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: paid.error || 'pol_access_token ungültig oder abgelaufen. Neue Zahlung erforderlich.' },
        id: null,
      });
    }
    registerPaidTools(server, token, paid.free_tools || []);
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
import { ethers }      from 'ethers';

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

// ── Pinata JWT: .env hat Vorrang, Fallback auf /var/lib/sys/pinata_jwt ───────
async function getPinataJwt() {
  const envJwt = (process.env.PINATA_JWT || '').trim();
  if (envJwt) return envJwt;
  try {
    const jwt = await readFile('/var/lib/sys/pinata_jwt', 'utf8');
    return jwt.trim();
  } catch {
    return '';
  }
}

// ── IPFS-Pinning via Pinata (interner Endpoint) ───────────────────────────────
// POST /internal/pin-json  { soul_id, meta }
// Pinnt soul_meta JSON zu IPFS via Pinata API. Braucht PINATA_JWT in .env.
app.post('/internal/pin-json', async (req, res) => {
  const { soul_id, meta } = req.body;
  const jwt = await getPinataJwt();

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
        name:    `soul-${soul_id}`,
        keyvalues: {
          soul_id:    soul_id,
          schema:     'saveyoursoul/soul/1.0',
          registered: new Date().toISOString(),
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

// ── Soul-Discovery via Pinata-Verzeichnis ─────────────────────────────────────
// GET /internal/discover-souls?q=&amortized=&limit=
// Durchsucht Pinata nach allen gepinnten SYS-Souls.
// Optional: q (Name/soul_id Substring), amortized=true (nur zahlungspflichtige)
app.get('/internal/discover-souls', async (req, res) => {
  const jwt = await getPinataJwt();
  if (!jwt) {
    return res.status(503).json({
      error: 'pinata_not_configured',
      message: 'PINATA_JWT nicht gesetzt. Über /api/soul/pinata-config oder soul-mcp/.env konfigurieren.',
    });
  }

  const limit     = Math.min(parseInt(req.query.limit || '20', 10), 100);
  const amortized = req.query.amortized === 'true';
  const q         = (req.query.q || '').trim();

  try {
    // Pinata pinList API — nach schema filtern
    const params = new URLSearchParams({
      status:  'pinned',
      'metadata[keyvalues][schema]': JSON.stringify({
        value: 'saveyoursoul/soul/1.0',
        op:    'eq',
      }),
      pageLimit: String(limit),
    });

    if (q) {
      // Name-Filter: soul-{q}
      params.set('metadata[name]', `soul-${q}`);
    }

    const response = await fetch(
      `https://api.pinata.cloud/data/pinList?${params.toString()}`,
      { headers: { Authorization: `Bearer ${jwt}` } }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: 'Pinata-Fehler', detail: text });
    }

    const data  = await response.json();
    const rows  = data.rows || [];

    // Für jeden Pin: Metadaten vom Gateway laden
    const souls = await Promise.allSettled(
      rows.map(async (pin) => {
        const cid = pin.ipfs_pin_hash;
        try {
          const r = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`, {
            signal: AbortSignal.timeout(5000),
          });
          if (!r.ok) return null;
          const meta = await r.json();
          // amortized-Filter
          if (amortized && !(meta.amortization?.enabled === true)) return null;
          return {
            cid,
            ipfs_uri:       `ipfs://${cid}`,
            gateway_url:    `https://gateway.pinata.cloud/ipfs/${cid}`,
            soul_id:        meta.soul_id,
            name:           meta.name,
            mcp_endpoint:   meta.mcp_endpoint,
            pay_endpoint:   meta.pay_endpoint,
            soul_endpoint:  meta.soul_endpoint,
            verify_endpoint: meta.verify_endpoint,
            amortization:   meta.amortization ?? null,
            pinned_at:      pin.date_pinned,
          };
        } catch {
          return null;
        }
      })
    );

    const results = souls
      .map(r => r.status === 'fulfilled' ? r.value : null)
      .filter(Boolean);

    res.json({
      ok:     true,
      total:  data.count ?? results.length,
      souls:  results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3098', 10);
app.listen(PORT, '127.0.0.1', () => {
  console.log(`soul-mcp läuft auf 127.0.0.1:${PORT}`);
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
 * Validiert einen pol_access_token via internem OpenResty-Endpoint.
 * Gibt { ok, soul_id, free_tools } oder { ok: false, error } zurück.
 */
async function validatePolToken(token) {
  try {
    const res = await fetch(
      `http://127.0.0.1/internal/validate-pol-token?token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(3000) }
    );
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error };

    // free_tools aus api_context.json lesen
    const { readFile } = await import('fs/promises');
    const ctxPath = `/var/lib/sys/souls/${data.soul_id}/api_context.json`;
    try {
      const raw = await readFile(ctxPath, 'utf8');
      const ctx = JSON.parse(raw);
      const freeTools = ctx?.amortization?.free_tools || ['soul_read', 'verify_human', 'soul_maturity'];
      return { ok: true, soul_id: data.soul_id, free_tools: freeTools };
    } catch {
      return { ok: true, soul_id: data.soul_id, free_tools: ['soul_read', 'verify_human', 'soul_maturity'] };
    }
  } catch (err) {
    return { ok: false, error: `Validierung fehlgeschlagen: ${err.message}` };
  }
}
