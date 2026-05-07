/**
 * Polygon Blockchain – Soul-Verifikation und Discovery
 * Liest SoulRegistry Contract (read-only, kein Wallet nötig).
 */

import { ethers } from 'ethers';

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

/**
 * Queries all Anchored events from the SoulRegistry contract in parallel chunks.
 * Returns deduplicated map: soulIdBytes32 → latest event.
 */
async function fetchAnchoredEvents(provider, contract) {
  const current = await provider.getBlockNumber();
  const CHUNK = 100_000;
  const filter = contract.filters.Anchored();
  const chunks = [];
  for (let from = DEPLOY_BLOCK; from <= current; from += CHUNK) {
    chunks.push([from, Math.min(from + CHUNK - 1, current)]);
  }

  const allEvents = [];
  // Process in batches of 5 parallel requests
  for (let i = 0; i < chunks.length; i += 5) {
    const batch = chunks.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(([f, t]) => contract.queryFilter(filter, f, t)),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') allEvents.push(...r.value);
    }
  }

  // Deduplicate: keep latest event per soulId
  const map = new Map();
  for (const ev of allEvents) {
    map.set(ev.args.soulId, ev);
  }
  return map;
}

/**
 * Extracts SYS discovery metadata appended to an anchor() calldata.
 * anchor() ABI-encodes to: 4-byte selector + 32 + 32 + 32 = 100 bytes.
 * Any bytes after offset 100 are our custom payload.
 *
 * @param {string} inputHex  tx.data hex string
 * @returns {{ id?, mcp?, cid? } | null}
 */
function extractSysMeta(inputHex) {
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

  const eventMap = await fetchAnchoredEvents(provider, contract);

  // For each unique soul, read the tx calldata
  const souls = [];
  const txFetches = [...eventMap.values()].map(async (ev) => {
    try {
      const tx = await provider.getTransaction(ev.transactionHash);
      if (!tx?.data) return;
      const meta = extractSysMeta(tx.data);
      if (!meta?.id || !meta?.mcp) return;

      const soul = {
        soul_id:       meta.id,
        mcp_endpoint:  meta.mcp,
        sessions:      Number(ev.args.sessionCount),
        anchor_date:   new Date(Number(ev.args.timestamp) * 1000).toISOString().split('T')[0],
        chain_verified: true,
        network:       net.name,
      };

      // Enrich from IPFS public gateway if CID available
      if (meta.cid) {
        try {
          const gw = meta.cid.startsWith('Qm')
            ? `https://gateway.pinata.cloud/ipfs/${meta.cid}`
            : `https://ipfs.io/ipfs/${meta.cid}`;
          const r = await fetch(gw, { signal: AbortSignal.timeout(10000) });
          if (r.ok) {
            const ipfs = await r.json();
            soul.name           = ipfs.name ?? null;
            soul.cid            = meta.cid;
            soul.amortization   = ipfs.amortization ?? null;
            soul.pay_endpoint   = ipfs.pay_endpoint ?? null;
            soul.verify_endpoint = ipfs.verify_endpoint ?? null;
          }
        } catch { /* IPFS fetch failed, use chain-only data */ }
      }

      souls.push(soul);
    } catch { /* skip malformed tx */ }
  });

  await Promise.allSettled(txFetches);

  _discoverCache = souls;
  _discoverCacheTs = Date.now();

  return filterResults(souls, { q, amortized, limit });
}

function filterResults(souls, { q, amortized, limit }) {
  let res = souls;
  if (q) {
    const lq = q.toLowerCase();
    res = res.filter(s =>
      s.soul_id?.includes(lq) ||
      s.name?.toLowerCase().includes(lq) ||
      s.mcp_endpoint?.toLowerCase().includes(lq),
    );
  }
  if (amortized) {
    res = res.filter(s => s.amortization?.enabled === true);
  }
  return res.slice(0, limit);
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
