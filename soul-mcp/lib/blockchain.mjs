/**
 * Polygon Blockchain – Soul-Verifikation und Discovery
 * Liest SoulRegistry Contract (read-only, kein Wallet nötig).
 */

import { ethers } from 'ethers';

const IPFS_GATEWAYS = [
  cid => `https://gateway.pinata.cloud/ipfs/${cid}`,
  cid => `https://ipfs.io/ipfs/${cid}`,
  cid => `https://cloudflare-ipfs.com/ipfs/${cid}`,
  cid => `https://dweb.link/ipfs/${cid}`,
];

async function fetchIpfsJson(cid) {
  for (const gwFn of IPFS_GATEWAYS) {
    try {
      const gw = gwFn(cid);
      const r  = await fetch(gw, { signal: AbortSignal.timeout(8_000) });
      if (r.ok) return { json: await r.json(), gw };
    } catch { /* nächster Gateway */ }
  }
  return null;
}

const NETWORKS = {
  amoy: {
    rpc: 'https://rpc-amoy.polygon.technology',
    name: 'Polygon Amoy Testnet',
    explorer: 'https://amoy.polygonscan.com',
  },
  main: {
    rpc: 'https://polygon-bor-rpc.publicnode.com',
    name: 'Polygon Mainnet',
    explorer: 'https://polygonscan.com',
  },
};

const CONTRACT_ADDRESS = '0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
// SoulRegistry v1.0.0 – Polygon Mainnet – deployed 2026-04-04
const DEPLOY_BLOCK = 83_500_000;
// Marker appended to anchor() calldata to embed discovery metadata
const SYS_MARKER = '\x00SYS1\x00';

const ABI = [
  'function getHistory(bytes32 soulId) view returns (tuple(bytes32 contentHash, uint256 timestamp, uint32 sessionCount)[])',
  'function soulOwner(bytes32 soulId) view returns (address)',
  'function verify(bytes32 soulId, bytes32 contentHash) view returns (bool found, uint256 timestamp, uint32 sessions)',
  'event Anchored(bytes32 indexed soulId, bytes32 indexed contentHash, uint32 sessionCount, uint256 timestamp)',
];

let _provider = null;

function getProvider() {
  if (_provider) return _provider;
  const net = NETWORKS[process.env.POLYGON_NETWORK] ?? NETWORKS.main;
  _provider = new ethers.JsonRpcProvider(net.rpc);
  return _provider;
}

export function soulIdToBytes32(soulId) {
  return ethers.keccak256(ethers.toUtf8Bytes(soulId));
}

// ── Discovery cache (TTL 5 min) ───────────────────────────────────────────────
let _discoverCache = null;
let _discoverCacheTs = 0;
const DISCOVER_TTL = 5 * 60 * 1000;

// ── TxHash-Discovery cache (TTL 5 min, key = sorted txHashes joined) ─────────
const _txCache = new Map(); // key → { ts, souls[] }

/**
 * Queries Anchored events from the SoulRegistry contract in parallel chunks.
 * Returns deduplicated map: soulIdBytes32 → latest event.
 *
 * Public Polygon RPCs (publicnode.com etc.) limit eth_getLogs to ~10k blocks.
 * We use CHUNK=5000 and scan only the most recent RECENT_WINDOW blocks so that
 * the fallback full-scan stays within the 30-second tool timeout.
 */
const CHUNK         = 5_000;
const RECENT_WINDOW = 500_000;

async function fetchAnchoredEvents(provider, contract) {
  const current   = await provider.getBlockNumber();
  const fromBlock = Math.max(DEPLOY_BLOCK, current - RECENT_WINDOW);
  const filter    = contract.filters.Anchored();
  const chunks    = [];
  for (let from = fromBlock; from <= current; from += CHUNK) {
    chunks.push([from, Math.min(from + CHUNK - 1, current)]);
  }

  const allEvents = [];
  for (let i = 0; i < chunks.length; i += 5) {
    const batch = chunks.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(([f, t]) => contract.queryFilter(filter, f, t)),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') allEvents.push(...r.value);
    }
  }

  // Sort ascending by block so latest event always wins in the map
  allEvents.sort((a, b) => a.blockNumber - b.blockNumber || a.transactionIndex - b.transactionIndex);

  // Three maps: latest event (for metadata), count (anchor_count), first (anchor_span)
  const latestMap = new Map();
  const countMap  = new Map();
  const firstMap  = new Map();
  for (const ev of allEvents) {
    const sid = ev.args.soulId;
    latestMap.set(sid, ev);
    countMap.set(sid, (countMap.get(sid) ?? 0) + 1);
    if (!firstMap.has(sid)) firstMap.set(sid, ev);
  }
  return { latestMap, countMap, firstMap };
}

/**
 * Extracts SYS discovery metadata appended to an anchor() calldata.
 * anchor() ABI-encodes to: 4-byte selector + 32 + 32 + 32 = 100 bytes.
 * Any bytes after offset 100 are our custom payload.
 *
 * @param {string} inputHex  tx.data hex string
 * @returns {{ id?, mcp?, cid?, tags? } | null}
 */
export function extractSysMeta(inputHex) {
  try {
    const raw = ethers.getBytes(inputHex);
    if (raw.length <= 100) return null;
    const extra = new TextDecoder().decode(raw.slice(100));
    const idx = extra.indexOf(SYS_MARKER);
    if (idx === -1) return null;
    return JSON.parse(extra.slice(idx + SYS_MARKER.length));
  } catch {
    return null;
  }
}

/**
 * Fast discovery: fetches specific TX hashes directly instead of scanning events.
 * Each entry: { txHash, soulName?, anchorDate?, sessions? }
 *
 * Used when souls store their soul_chain_anchor.tx in sys.md — no event scan needed.
 */
export async function discoverSoulsFromTxHashes(entries = [], { q = '', amortized = false, limit = 20 } = {}) {
  const net      = NETWORKS[process.env.POLYGON_NETWORK] ?? NETWORKS.main;
  const provider = getProvider();

  const cacheKey = entries.map(e => e.txHash).sort().join(',');
  const cached   = _txCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < DISCOVER_TTL) {
    return filterResults(cached.souls, { q, amortized, limit });
  }

  const souls = [];
  await Promise.allSettled(entries.map(async ({ txHash, soulName, anchorDate, sessions }) => {
    try {
      const tx = await provider.getTransaction(txHash);
      if (!tx?.data) return;
      const meta = extractSysMeta(tx.data);
      if (!meta?.id || !meta?.mcp) return;

      const soul = {
        soul_id:        meta.id,
        mcp_endpoint:   meta.mcp,
        tags:           Array.isArray(meta.tags) ? meta.tags : [],
        chain_verified: true,
        network:        net.name,
        anchor_date:    anchorDate ?? null,
        sessions:       sessions   ?? null,
      };
      if (soulName) soul.name = soulName;

      if (meta.cid) {
        const hit = await fetchIpfsJson(meta.cid).catch(() => null);
        if (hit) {
          const { json: ipfs, gw } = hit;
          soul.name            = ipfs.name ?? soul.name ?? null;
          soul.description     = ipfs.description ?? null;
          soul.cid             = meta.cid;
          soul.gateway_url     = gw;
          soul.amortization    = ipfs.amortization ?? null;
          soul.pay_endpoint    = ipfs.pay_endpoint ?? null;
          soul.verify_endpoint = ipfs.verify_endpoint ?? null;
          if (!soul.tags.length && Array.isArray(ipfs.tags)) soul.tags = ipfs.tags;
        }
      }

      souls.push(soul);
    } catch { /* malformed TX überspringen */ }
  }));

  _txCache.set(cacheKey, { ts: Date.now(), souls });
  return filterResults(souls, { q, amortized, limit });
}

/**
 * Discover souls anchored on-chain.
 * Reads anchor() calldata for embedded metadata, then optionally enriches
 * from the public IPFS gateway (no Pinata JWT required).
 *
 * @param {{ q?: string, amortized?: boolean, limit?: number }} opts
 */
export async function discoverSouls({ q = '', amortized = false, limit = 20 } = {}) {
  const net = NETWORKS[process.env.POLYGON_NETWORK] ?? NETWORKS.main;
  const provider = getProvider();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  // Cache hit
  if (_discoverCache && Date.now() - _discoverCacheTs < DISCOVER_TTL) {
    return filterResults(_discoverCache, { q, amortized, limit });
  }

  const { latestMap, countMap, firstMap } = await fetchAnchoredEvents(provider, contract);

  // For each unique soul, read the latest tx calldata
  const souls = [];
  const txFetches = [...latestMap.entries()].map(async ([soulIdBytes, ev]) => {
    try {
      const tx = await provider.getTransaction(ev.transactionHash);
      if (!tx?.data) return;
      const meta = extractSysMeta(tx.data);
      if (!meta?.id || !meta?.mcp) return;

      const latestTs       = Number(ev.args.timestamp);
      const firstEv        = firstMap.get(soulIdBytes);
      const firstTs        = firstEv ? Number(firstEv.args.timestamp) : latestTs;
      const anchorCount    = countMap.get(soulIdBytes) ?? 1;
      const anchorSpanDays = Math.floor((latestTs - firstTs) / 86400);

      const soul = {
        soul_id:           meta.id,
        mcp_endpoint:      meta.mcp,
        sessions:          Number(ev.args.sessionCount),
        anchor_date:       new Date(latestTs * 1000).toISOString().split('T')[0],
        first_anchor_date: new Date(firstTs  * 1000).toISOString().split('T')[0],
        anchor_count:      anchorCount,
        anchor_span_days:  anchorSpanDays,
        chain_verified:    true,
        network:           net.name,
        tags:              Array.isArray(meta.tags) ? meta.tags : [],
      };

      // Enrich from IPFS public gateway if CID available
      if (meta.cid) {
        const hit = await fetchIpfsJson(meta.cid).catch(() => null);
        if (hit) {
          const { json: ipfs, gw } = hit;
          soul.name            = ipfs.name ?? null;
          soul.description     = ipfs.description ?? null;
          soul.cid             = meta.cid;
          soul.gateway_url     = gw;
          soul.amortization    = ipfs.amortization ?? null;
          soul.pay_endpoint    = ipfs.pay_endpoint ?? null;
          soul.verify_endpoint = ipfs.verify_endpoint ?? null;
          if (!soul.tags.length && Array.isArray(ipfs.tags)) soul.tags = ipfs.tags;
        }
      }

      souls.push(soul);
    } catch { /* skip malformed tx */ }
  });

  await Promise.allSettled(txFetches);

  _discoverCache = souls;
  _discoverCacheTs = Date.now();

  return filterResults(souls, { q, amortized, limit });
}

// Returns all on-chain soul origins without the sessions anti-fraud filter.
// Used by the scan aggregator to discover remote nodes even for freshly anchored souls.
export async function discoverRemoteOrigins() {
  const { souls } = await (async () => {
    if (_discoverCache && Date.now() - _discoverCacheTs < DISCOVER_TTL) return { souls: _discoverCache };
    const provider = getProvider();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    const { latestMap } = await fetchAnchoredEvents(provider, contract);
    const souls = [];
    await Promise.allSettled([...latestMap.entries()].map(async ([, ev]) => {
      try {
        const tx = await provider.getTransaction(ev.transactionHash);
        if (!tx?.data) return;
        const meta = extractSysMeta(tx.data);
        if (meta?.id && meta?.mcp) souls.push({ soul_id: meta.id, mcp_endpoint: meta.mcp });
      } catch {}
    }));
    return { souls };
  })();
  return souls;
}

function filterResults(souls, { q, amortized, limit }) {
  let res = souls;

  // Anti-fraud: mindestens 1 echte Session (Growth Chain) — leere Souls werden ausgeschlossen
  res = res.filter(s => (s.sessions ?? 0) >= 1);

  if (q) {
    const lq = q.toLowerCase();
    res = res.filter(s =>
      s.soul_id?.includes(lq) ||
      s.name?.toLowerCase().includes(lq) ||
      s.mcp_endpoint?.toLowerCase().includes(lq) ||
      s.description?.toLowerCase().includes(lq) ||
      s.tags?.some(t => t.toLowerCase().includes(lq)),
    );
  }
  if (amortized) {
    res = res.filter(s => s.amortization?.enabled === true);
  }

  // Sortierung: Sessions DESC (Aktivität), dann Anchor-Span DESC (Nachhaltigkeit)
  res.sort((a, b) => {
    const dSess = (b.sessions ?? 0) - (a.sessions ?? 0);
    if (dSess !== 0) return dSess;
    return (b.anchor_span_days ?? 0) - (a.anchor_span_days ?? 0);
  });

  return res.slice(0, limit);
}

// ── Chain Metrics ─────────────────────────────────────────────────────────────

/** Aktuellen Polygon-Block abrufen */
export async function getCurrentBlock() {
  return getProvider().getBlockNumber();
}

/**
 * Liest die komplette Anchor-Historie aus dem SoulRegistry-Contract.
 * Wird nach Soul-Import einmalig aufgerufen wenn anchor_history.json fehlt.
 * @param {string} soulId  UUID
 * @returns {Array<{ tx: null, ts: string, block: number, size: number, genesis?: true }> | null}
 */
export async function getOnChainHistory(soulId) {
  try {
    const ABI_GET = ['function getHistory(bytes32 soulId) view returns (tuple(bytes32 contentHash, uint256 timestamp, uint32 sessionCount)[])'];
    const { ethers: _e } = await import('ethers');
    const provider   = getProvider();
    const contract   = new _e.Contract(CONTRACT_ADDRESS, ABI_GET, provider);
    const soulBytes  = _e.keccak256(_e.toUtf8Bytes(soulId));
    const raw        = await contract.getHistory(soulBytes);
    if (!raw || !raw.length) return null;

    const current    = await provider.getBlockNumber();
    const DEPLOY_TS  = 1775260800;
    const nowUnix    = Math.floor(Date.now() / 1000);
    const bps        = Math.max(0.1, (current - DEPLOY_BLOCK) / Math.max(1, nowUnix - DEPLOY_TS));

    return raw.map((entry, i) => {
      const tsUnix = Number(entry.timestamp);
      const ts     = new Date(tsUnix * 1000).toISOString();
      const block  = Math.round(DEPLOY_BLOCK + (tsUnix - DEPLOY_TS) * bps);
      const obj    = { tx: null, ts, block, size: 0 };
      if (i === 0) obj.genesis = true;
      return obj;
    });
  } catch {
    return null;
  }
}

/**
 * Liest Genesis-Timestamp und Block direkt aus dem SoulRegistry-Contract.
 * Wird nach Soul-Import aufgerufen wenn anchor_history.json das Datum nicht korrekt hat.
 * @param {string} soulId  UUID
 * @returns {{ ts: string, block: number } | null}
 */
export async function getOnChainGenesis(soulId) {
  try {
    const ABI_GET = ['function getHistory(bytes32 soulId) view returns (tuple(bytes32 contentHash, uint256 timestamp, uint32 sessionCount)[])'];
    const { ethers: _e } = await import('ethers');
    const provider = getProvider();
    const contract = new _e.Contract(CONTRACT_ADDRESS, ABI_GET, provider);
    const soulBytes = _e.keccak256(_e.toUtf8Bytes(soulId));
    const history   = await contract.getHistory(soulBytes);
    if (!history || !history.length) return null;
    const first   = history[0];
    const tsUnix  = Number(first.timestamp);
    const ts      = new Date(tsUnix * 1000).toISOString();
    // Block schätzen: aus on-chain ts interpolieren
    const current = await provider.getBlockNumber();
    const DEPLOY_TS_UNIX = 1775260800; // 2026-04-04T00:00:00Z
    const nowUnix = Math.floor(Date.now() / 1000);
    const bps = Math.max(0.1, (current - DEPLOY_BLOCK) / Math.max(1, nowUnix - DEPLOY_TS_UNIX));
    const block = Math.round(DEPLOY_BLOCK + (tsUnix - DEPLOY_TS_UNIX) * bps);
    return { ts, block };
  } catch {
    return null;
  }
}

/**
 * Knowledge-Blocks-Wert: gewichtete Summe der Soul-Größen aller Anchors.
 * Ältere Anchors erhalten mehr Gewicht — je länger das Wissen verankert ist, desto wertvoller.
 * @param {Array<{ tx?, block?, size?, ts?, genesis? }>} anchorHistory
 * @param {number} currentBlock
 */
export function calcKnowledgeBlocks(anchorHistory, currentBlock) {
  if (!Array.isArray(anchorHistory) || !anchorHistory.length) return 0;
  // Kalibriere Blockrate dynamisch aus Ist-Zustand
  const DEPLOY_TS = 1775260800;
  const nowUnix   = Math.floor(Date.now() / 1000);
  const blocksPerSec = currentBlock
    ? Math.max(0.1, (currentBlock - DEPLOY_BLOCK) / Math.max(1, nowUnix - DEPLOY_TS))
    : 2;
  const BLOCKS_PER_HALF_DAY = Math.round(blocksPerSec * 43_200);
  const total = anchorHistory.reduce((sum, anchor) => {
    const ageBlocks = currentBlock - (anchor.block ?? estimateBlock(anchor.ts, currentBlock));
    const ageWeight = 1 + Math.log10(1 + Math.max(0, ageBlocks) / BLOCKS_PER_HALF_DAY);
    const sizeKb = (anchor.size ?? 0) / 1024;
    return sum + sizeKb * ageWeight;
  }, 0);
  return Math.round(total);
}

/**
 * Schätzt den Polygon-Block aus einem ISO-Timestamp.
 * Kalibriert dynamisch aus aktuellem Block + Deploy-Anker statt fester Rate.
 * @param {string} ts  ISO-Timestamp
 * @param {number} currentBlock  aktueller Block (für Live-Kalibrierung)
 */
function estimateBlock(ts, currentBlock) {
  const DEPLOY_TS = 1775260800; // 2026-04-04T00:00:00Z
  if (!ts) return DEPLOY_BLOCK;
  const nowUnix   = Math.floor(Date.now() / 1000);
  // Tatsächliche Blockrate aus Ist-Zustand berechnen (statt feste 2/s-Annahme)
  const blocksPerSec = currentBlock
    ? Math.max(0.1, (currentBlock - DEPLOY_BLOCK) / Math.max(1, nowUnix - DEPLOY_TS))
    : 2;
  const unixTs = Math.floor(new Date(ts).getTime() / 1000);
  return DEPLOY_BLOCK + Math.max(0, Math.round((unixTs - DEPLOY_TS) * blocksPerSec));
}

function formatChainAge(days) {
  if (days < 1) return `${Math.round(days * 24)} Std.`;
  if (days < 30) return `${Math.round(days)} Tage`;
  if (days < 365) {
    const mo = Math.floor(days / 30);
    return `${mo} Monat${mo !== 1 ? 'e' : ''}`;
  }
  const yr = Math.floor(days / 365);
  const mo = Math.floor((days % 365) / 30);
  return mo > 0 ? `${yr} J., ${mo} Mo.` : `${yr} Jahr${yr !== 1 ? 'e' : ''}`;
}

/**
 * Berechnet alle Chain-Metrics für eine Soul.
 * @param {Array<{ tx?, block?, size?, ts?, genesis? }>} anchorHistory
 */
export async function getChainMetrics(anchorHistory) {
  const empty = {
    anchor_count: 0, genesis_block: null, genesis_ts: null, genesis_tx: null,
    current_block: null, chain_age_blocks: 0, chain_age_days: 0,
    chain_age_human: '—', knowledge_blocks: 0,
  };
  if (!Array.isArray(anchorHistory) || !anchorHistory.length) return empty;

  const currentBlock = await getProvider().getBlockNumber();
  const genesis = anchorHistory.find(a => a.genesis === true) ?? anchorHistory[0];
  const genesisBlock = genesis?.block ?? estimateBlock(genesis?.ts, currentBlock);
  const chainAgeBlocks = Math.max(0, currentBlock - genesisBlock);
  // Dynamische Blockrate für chain_age_days
  const DEPLOY_TS = 1775260800;
  const nowUnix = Math.floor(Date.now() / 1000);
  const blocksPerDay = Math.max(0.1, (currentBlock - DEPLOY_BLOCK) / Math.max(1, nowUnix - DEPLOY_TS)) * 86400;
  const chainAgeDays = chainAgeBlocks / blocksPerDay;

  return {
    genesis_block:    genesisBlock,
    genesis_ts:       genesis?.ts   ?? null,
    genesis_tx:       genesis?.tx   ?? null,
    current_block:    currentBlock,
    chain_age_blocks: chainAgeBlocks,
    chain_age_days:   Math.round(chainAgeDays * 10) / 10,
    chain_age_human:  formatChainAge(chainAgeDays),
    anchor_count:     anchorHistory.length,
    knowledge_blocks: calcKnowledgeBlocks(anchorHistory, currentBlock),
  };
}

/**
 * Prüft ob eine Soul auf der Blockchain verankert und damit als menschlich verifiziert ist.
 * @param {string} soulId  UUID der Soul
 * @returns {object} Verifikationsergebnis
 */
export async function verifyHuman(soulId) {
  const net = NETWORKS[process.env.POLYGON_NETWORK] ?? NETWORKS.main;

  try {
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, getProvider());
    const bytes32 = soulIdToBytes32(soulId);

    const [owner, history] = await Promise.all([
      contract.soulOwner(bytes32),
      contract.getHistory(bytes32),
    ]);

    const verified = owner !== ZERO_ADDRESS && history.length > 0;

    const anchors = history.map((a) => ({
      date: new Date(Number(a.timestamp) * 1000).toISOString().split('T')[0],
      sessions: Number(a.sessionCount),
      timestamp: Number(a.timestamp),
    }));

    return {
      verified,
      soul_id: soulId,
      wallet: verified ? owner : null,
      anchor_count: anchors.length,
      first_anchor: anchors[0]?.date ?? null,
      latest_anchor: anchors.at(-1)?.date ?? null,
      total_sessions: anchors.at(-1)?.sessions ?? 0,
      network: net.name,
      contract: CONTRACT_ADDRESS,
      explorer: verified
        ? `${net.explorer}/address/${CONTRACT_ADDRESS}`
        : null,
    };
  } catch (err) {
    return {
      verified: false,
      soul_id: soulId,
      error: err.message,
      network: net.name,
    };
  }
}
