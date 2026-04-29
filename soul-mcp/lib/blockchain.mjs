/**
 * Polygon Blockchain – Soul-Verifikation
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

const ABI = [
  'function getHistory(bytes32 soulId) view returns (tuple(bytes32 contentHash, uint256 timestamp, uint32 sessionCount)[])',
  'function soulOwner(bytes32 soulId) view returns (address)',
  'function verify(bytes32 soulId, bytes32 contentHash) view returns (bool found, uint256 timestamp, uint32 sessions)',
];

let _provider = null;

function getProvider() {
  if (_provider) return _provider;
  const net = NETWORKS[process.env.POLYGON_NETWORK] ?? NETWORKS.amoy;
  _provider = new ethers.JsonRpcProvider(net.rpc);
  return _provider;
}

function soulIdToBytes32(soulId) {
  return ethers.keccak256(ethers.toUtf8Bytes(soulId));
}

/**
 * Prüft ob eine Soul auf der Blockchain verankert und damit als menschlich verifiziert ist.
 * @param {string} soulId  UUID der Soul
 * @returns {object} Verifikationsergebnis
 */
export async function verifyHuman(soulId) {
  const net = NETWORKS[process.env.POLYGON_NETWORK] ?? NETWORKS.amoy;

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
