/**
 * Soul-Discovery-Index — lokaler WebSocket-Subscriber + inkrementeller Hintergrund-Scan.
 *
 * Architektur:
 *   - Jeder Node betreibt seinen eigenen Index (souverän, kein zentraler Betreiber)
 *   - WebSocket: neue Anchored-Events in Echtzeit (kein Polling)
 *   - Hintergrund-Scan: historische Events inkrementell, non-blocking
 *   - IPFS-Enrichment: einmalig beim Indexieren, gecacht
 *   - Index wird auf Disk persistiert (/var/lib/sys/soul_index.json)
 *
 * Im Index stehen ausschließlich Daten, die der Soul-Betreiber bewusst
 * öffentlich in den Anchor-Calldata und/oder IPFS eingebettet hat.
 */

import { ethers }                  from 'ethers';
import { readFile, writeFile }      from 'node:fs/promises';
import { extractSysMeta }           from './blockchain.mjs';

// ── Konstanten ────────────────────────────────────────────────────────────────

const CONTRACT_ADDRESS = '0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B';
const DEPLOY_BLOCK     = 83_500_000;
const INDEX_PATH       = '/var/lib/sys/soul_index.json';
const SCAN_CHUNK       = 5_000;   // Blöcke pro RPC-Request (innerhalb publicnode-Limits)
const SCAN_DELAY_MS    = 300;     // Pause zwischen Chunks — schont den RPC
const SAVE_INTERVAL_MS = 60_000;  // Disk-Sync alle 60s
const IPFS_TTL_MS      = 24 * 60 * 60 * 1000; // IPFS-Cache 24h

// ── Härtung: Limits ───────────────────────────────────────────────────────────
const MAX_SOULS        = 100_000; // OOM-Schutz gegen Spam-Anker
const MAX_STR          = 256;     // max. Zeichenlänge für String-Felder
const MAX_DESC         = 1_000;   // Beschreibung darf etwas länger sein
const MAX_TAGS         = 20;      // max. Tags pro Soul
const MAX_TAG_LEN      = 64;      // max. Länge eines einzelnen Tags
const UUID_RE          = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HTTPS_RE         = /^https:\/\/[a-z0-9][\w.-]+(:\d+)?(\/[\w./?=%&@#-]*)?$/i;
const CID_RE           = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/; // CIDv0 + CIDv1

// Bereinigt einen String: kürzt, entfernt Steuerzeichen
function str(v, max = MAX_STR) {
  if (typeof v !== 'string') return null;
  return v.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, max) || null;
}

// Bereinigt ein Tags-Array
function tags(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map(t => str(t, MAX_TAG_LEN))
    .filter(Boolean)
    .slice(0, MAX_TAGS);
}

// Validiert eine HTTPS-URL — verhindert SSRF mit file://, javascript:, etc.
function httpsUrl(v) {
  const s = str(v);
  return s && HTTPS_RE.test(s) ? s : null;
}

// Validiert IPFS-CID (CIDv0 oder CIDv1)
function validCid(v) {
  const s = str(v);
  return s && CID_RE.test(s) ? s : null;
}

const ABI = [
  'event Anchored(bytes32 indexed soulId, bytes32 indexed contentHash, uint32 sessionCount, uint256 timestamp)',
];

const NETWORKS = {
  amoy: {
    rpc: 'https://rpc-amoy.polygon.technology',
    wss: 'wss://polygon-amoy-bor-rpc.publicnode.com',
  },
  main: {
    rpc: 'https://polygon-bor-rpc.publicnode.com',
    wss: 'wss://polygon-bor-rpc.publicnode.com',
  },
};

// ── State ─────────────────────────────────────────────────────────────────────

const _souls  = new Map();   // soulIdBytes32 → IndexEntry
let _lastBlock = DEPLOY_BLOCK;
let _scanning  = false;
let _dirty     = false;
let _http      = null;
let _ws        = null;

// Sequentielle Event-Queue — verhindert RPC-Überlast bei Spam-Ankern
const _queue   = [];
let   _running = false;

async function enqueue(ev) {
  _queue.push(ev);
  if (_running) return;
  _running = true;
  while (_queue.length > 0) {
    const next = _queue.shift();
    await processEvent(next).catch(e => console.error('[soul-index] processEvent:', e.message));
  }
  _running = false;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNet() {
  return NETWORKS[process.env.POLYGON_NETWORK] ?? NETWORKS.main;
}

function getHttp() {
  if (!_http) _http = new ethers.JsonRpcProvider(getNet().rpc);
  return _http;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Disk-Persistenz ───────────────────────────────────────────────────────────

async function loadIndex() {
  try {
    const raw   = await readFile(INDEX_PATH, 'utf8');
    const saved = JSON.parse(raw);
    _lastBlock  = saved.lastBlock ?? DEPLOY_BLOCK;
    for (const [k, v] of Object.entries(saved.souls ?? {})) {
      _souls.set(k, v);
    }
    console.log(`[soul-index] Geladen: ${_souls.size} Souls, ab Block ${_lastBlock}`);
  } catch {
    console.log('[soul-index] Kein Index gefunden — starte neu.');
  }
}

async function saveIndex() {
  if (!_dirty) return;
  try {
    await writeFile(INDEX_PATH, JSON.stringify({
      lastBlock: _lastBlock,
      souls:     Object.fromEntries(_souls),
      savedAt:   new Date().toISOString(),
    }), 'utf8');
    _dirty = false;
  } catch (e) {
    console.error('[soul-index] Speichern fehlgeschlagen:', e.message);
  }
}

// ── IPFS-Enrichment ───────────────────────────────────────────────────────────

async function enrichFromIpfs(entry, rawCid) {
  const cid = validCid(rawCid);
  if (!cid) return; // kein gültiger CID — SSRF-Schutz

  try {
    const gw = cid.startsWith('Qm')
      ? `https://gateway.pinata.cloud/ipfs/${cid}`
      : `https://ipfs.io/ipfs/${cid}`;
    const r = await fetch(gw, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return;

    // Antwortgröße begrenzen — kein unkontrolliertes JSON parsen
    const raw = await r.text();
    if (raw.length > 64_000) return;
    const ipfs = JSON.parse(raw);

    // Alle String-Felder bereinigen bevor sie in den Index kommen
    const name    = str(ipfs.name);
    const desc    = str(ipfs.description, MAX_DESC);
    const payEp   = httpsUrl(ipfs.pay_endpoint);
    const verEp   = httpsUrl(ipfs.verify_endpoint);
    const ipfsTags = tags(ipfs.tags);

    if (name)    entry.name          = name;
    if (desc)    entry.description   = desc;
    if (payEp)   entry.pay_endpoint  = payEp;
    if (verEp)   entry.verify_endpoint = verEp;
    if (!entry.tags?.length && ipfsTags.length) entry.tags = ipfsTags;

    // Amortisierung: nur sichere Felder übernehmen
    if (ipfs.amortization && typeof ipfs.amortization === 'object') {
      entry.amortization = {
        enabled:         !!ipfs.amortization.enabled,
        pol_per_request: Number(ipfs.amortization.pol_per_request) || 0,
        wallet:          str(ipfs.amortization.wallet, 42) ?? null,
      };
    }

    entry.cid            = cid;
    entry.gateway_url    = gw;
    entry.ipfs_loaded_at = new Date().toISOString();
  } catch { /* IPFS temporär nicht erreichbar */ }
}

// ── Event verarbeiten ─────────────────────────────────────────────────────────

async function processEvent(ev) {
  const soulKey      = ev.args.soulId;
  const sessionCount = Number(ev.args.sessionCount);
  const timestamp    = Number(ev.args.timestamp);
  const blockNumber  = ev.blockNumber ?? ev.log?.blockNumber;

  // OOM-Schutz: Index-Größe deckeln
  if (!_souls.has(soulKey) && _souls.size >= MAX_SOULS) {
    console.warn('[soul-index] Index-Limit erreicht — Eintrag übersprungen.');
    return;
  }

  const tx = await getHttp().getTransaction(ev.transactionHash);
  if (!tx?.data) return;
  const meta = extractSysMeta(tx.data);
  if (!meta) return;

  // Pflichtfelder validieren
  const soulId = meta.id;
  const mcpEp  = httpsUrl(meta.mcp);
  if (!soulId || !UUID_RE.test(soulId) || !mcpEp) return; // ungültige/gefakte Metadaten

  const cleanTags  = tags(meta.tags);
  const anchorDate = new Date(timestamp * 1000).toISOString().split('T')[0];
  const existing   = _souls.get(soulKey);

  if (existing) {
    if (blockNumber && blockNumber <= existing.block_number) return;
    const firstTs = new Date(existing.first_anchor_date + 'T00:00:00Z').getTime() / 1000;
    existing.sessions         = sessionCount;
    existing.anchor_date      = anchorDate;
    existing.anchor_count     = (existing.anchor_count ?? 1) + 1;
    existing.anchor_span_days = Math.max(0, Math.floor((timestamp - firstTs) / 86400));
    existing.mcp_endpoint     = mcpEp;
    existing.tags             = cleanTags.length ? cleanTags : existing.tags;
    existing.tx_hash          = ev.transactionHash;
    if (blockNumber) existing.block_number = blockNumber;
    if (meta.cid && (!existing.ipfs_loaded_at ||
        Date.now() - new Date(existing.ipfs_loaded_at).getTime() > IPFS_TTL_MS)) {
      await enrichFromIpfs(existing, meta.cid);
    }
  } else {
    const entry = {
      soul_id:           soulId,
      mcp_endpoint:      mcpEp,
      tags:              cleanTags,
      sessions:          sessionCount,
      anchor_date:       anchorDate,
      first_anchor_date: anchorDate,
      anchor_count:      1,
      anchor_span_days:  0,
      tx_hash:           ev.transactionHash,
      block_number:      blockNumber ?? 0,
      indexed_at:        new Date().toISOString(),
    };
    if (meta.cid) await enrichFromIpfs(entry, meta.cid);
    _souls.set(soulKey, entry);
  }

  _dirty = true;
}

// ── WebSocket-Subscriber (Echtzeit) ───────────────────────────────────────────

function subscribeWs() {
  const net = getNet();
  if (!net.wss) return;

  try {
    _ws = new ethers.WebSocketProvider(net.wss);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, _ws);

    contract.on('Anchored', (...args) => {
      const ev = args[args.length - 1]; // letztes Argument ist das EventLog-Objekt
      enqueue(ev); // sequentielle Queue — kein concurrent RPC-Sturm
    });

    _ws.websocket.on('close', () => {
      console.log('[soul-index] WebSocket getrennt — reconnect in 15s');
      _ws = null;
      setTimeout(subscribeWs, 15_000);
    });

    console.log('[soul-index] WebSocket aktiv →', net.wss);
  } catch (e) {
    console.error('[soul-index] WebSocket-Fehler:', e.message, '— retry in 30s');
    setTimeout(subscribeWs, 30_000);
  }
}

// ── Inkrementeller Hintergrund-Scan (historisch) ──────────────────────────────

async function incrementalScan() {
  if (_scanning) return;
  _scanning = true;

  try {
    const provider = getHttp();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    const filter   = contract.filters.Anchored();
    const current  = await provider.getBlockNumber();

    if (_lastBlock >= current) {
      console.log('[soul-index] Scan aktuell — keine neuen Blöcke.');
      return;
    }

    console.log(`[soul-index] Scan ${_lastBlock} → ${current} (${current - _lastBlock} Blöcke, ~${Math.ceil((current - _lastBlock) / SCAN_CHUNK)} Chunks)`);

    for (let from = _lastBlock; from <= current; from += SCAN_CHUNK) {
      const to = Math.min(from + SCAN_CHUNK - 1, current);
      try {
        const events = await contract.queryFilter(filter, from, to);
        for (const ev of events) await processEvent(ev);
        _lastBlock = to + 1;
      } catch { /* Chunk überspringen — wird beim nächsten Neustart wieder versucht */ }
      await sleep(SCAN_DELAY_MS);
    }

    console.log(`[soul-index] Scan fertig. ${_souls.size} Souls indexiert.`);
    await saveIndex();
  } finally {
    _scanning = false;
  }
}

// ── Lokale chain_anchor.json als Seed laden ───────────────────────────────────
// Gibt eigene Soul sofort im Index — auch auf cold start, bevor der Scan durchläuft.

async function seedFromLocalAnchors() {
  const SOULS_DIR = '/var/lib/sys/souls/';
  try {
    const { readdir } = await import('node:fs/promises');
    const dirs = await readdir(SOULS_DIR);
    for (const dir of dirs.filter(d => /^[a-f0-9-]{36}$/i.test(d))) {
      try {
        const raw    = await readFile(`${SOULS_DIR}${dir}/chain_anchor.json`, 'utf8');
        const anchor = JSON.parse(raw);
        if (!anchor?.tx || _souls.has(dir)) continue;
        // Vorläufiger Eintrag — wird durch Scan verifiziert und ergänzt
        _souls.set(dir, {
          soul_id:           dir,
          mcp_endpoint:      null,
          tags:              Array.isArray(anchor.tags) ? anchor.tags : [],
          name:              anchor.name ?? null,
          sessions:          anchor.sessions ?? 1,
          anchor_date:       anchor.date ?? null,
          first_anchor_date: anchor.date ?? null,
          anchor_count:      1,
          anchor_span_days:  0,
          tx_hash:           anchor.tx,
          block_number:      0,
          indexed_at:        new Date().toISOString(),
          _preliminary:      true, // wird durch Scan überschrieben
        });
        _dirty = true;
      } catch { /* kein chain_anchor.json für diese Soul */ }
    }
  } catch { /* souls-Verzeichnis nicht vorhanden */ }
}

// ── Query-API ─────────────────────────────────────────────────────────────────

export function querySouls({ q = '', amortized = false, limit = 20 } = {}) {
  let results = [..._souls.values()].filter(s =>
    (s.sessions ?? 0) >= 1 && s.mcp_endpoint  // nur verifizierte Einträge
  );

  if (q) {
    const lq = q.toLowerCase();
    // Einzelne Wörter matchen — "full-stack entwickler" findet Souls mit Tag "full-stack"
    const words = lq.split(/\s+/).filter(Boolean);
    results = results.filter(s =>
      words.some(w =>
        s.soul_id?.includes(w) ||
        s.name?.toLowerCase().includes(w) ||
        s.mcp_endpoint?.toLowerCase().includes(w) ||
        s.description?.toLowerCase().includes(w) ||
        s.tags?.some(t => t.toLowerCase().includes(w))
      )
    );
  }

  if (amortized) {
    results = results.filter(s => s.amortization?.enabled === true);
  }

  results.sort((a, b) => {
    const ds = (b.sessions ?? 0) - (a.sessions ?? 0);
    if (ds !== 0) return ds;
    return (b.anchor_span_days ?? 0) - (a.anchor_span_days ?? 0);
  });

  return results.slice(0, limit);
}

export function indexStats() {
  return {
    souls:      _souls.size,
    lastBlock:  _lastBlock,
    scanning:   _scanning,
    wsActive:   _ws !== null,
  };
}

// ── Start ─────────────────────────────────────────────────────────────────────

export async function startIndexer() {
  await loadIndex();
  await seedFromLocalAnchors();
  subscribeWs();
  setInterval(saveIndex, SAVE_INTERVAL_MS);
  process.on('SIGTERM', saveIndex);
  process.on('SIGINT',  saveIndex);
  // Hintergrund-Scan nicht awaiten — non-blocking
  incrementalScan().catch(e => console.error('[soul-index] Scan-Fehler:', e.message));
}
