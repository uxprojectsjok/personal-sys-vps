/**
 * polymarket_client.mjs — Prediction-Markets-Anbindung für TILL/Trader.
 *
 * Kein Drittanbieter-SDK (@polymarket/clob-client) eingebunden — stattdessen
 * die Signier-/Auth-Mechanik direkt nachgebaut, exakt gegen den echten,
 * veröffentlichten Quellcode von @polymarket/clob-client@5.8.1 und
 * @polymarket/order-utils@3.0.1 abgeglichen (live von unpkg geladen und
 * gegengeprüft, nicht aus dem Gedächtnis rekonstruiert) — gleicher Stil wie
 * x402_client.mjs: direkter viem-Code statt Abstraktionsschicht, für volle
 * Kontrolle/Auditierbarkeit über Signier-Code, der echtes Geld bewegt.
 *
 * WICHTIG — noch nicht Ende-zu-Ende gegen eine echte Order getestet: die
 * Lese-Pfade (Märkte, Orderbuch, Positionen, USDC.e-Guthaben) sind live
 * verifiziert und funktionieren nachweislich. Der Schreib-Pfad
 * (placeMarketOrder) folgt exakt der oben verifizierten Spezifikation, aber
 * eine echte Order wurde hier bewusst NICHT plaziert (würde echtes Geld auf
 * einem noch ungetesteten Pfad riskieren). Vor dem ersten echten Einsatz:
 * mit einem kleinen Betrag selbst testen.
 *
 * Wichtigster Fund dieser Anbindung: Polymarkets Collateral-Token
 * ("USDC.e"/"USD Coin (PoS)", 0x2791Bca1...) ist NICHT dasselbe wie unsere
 * native USDC (0x3c499c54..., siehe x402_client.mjs) — live gegen zwei
 * unabhängige Quellen verifiziert: (1) beide Verträge direkt gelesen
 * (name() unterscheidet sich: "USD Coin" vs. "USD Coin (PoS)"), (2) die
 * Adresse 0x2791Bca1... exakt als MATIC_CONTRACTS.collateral in
 * @polymarket/clob-client's eigener config.js bestätigt. Ohne eigenen
 * Bridge/Swap-Schritt kann die bestehende Wallet nicht direkt wetten —
 * siehe getUsdceBalance() unten, wird vom Aufrufer vor jeder Wette geprüft.
 */

import { createPublicClient, http, formatUnits, parseUnits } from 'viem';
import { polygon } from 'viem/chains';
import crypto from 'crypto';

const RPC_URL   = 'https://polygon-bor-rpc.publicnode.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API  = 'https://clob.polymarket.com';
const DATA_API  = 'https://data-api.polymarket.com';
const CHAIN_ID  = 137;

// Live gegen @polymarket/clob-client@5.8.1/dist/config.js verifiziert
// (MATIC_CONTRACTS, siehe Kommentar oben).
const USDCE_ADDRESS       = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const EXCHANGE_ADDRESS    = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK_EXCHANGE   = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
const COLLATERAL_DECIMALS = 6;

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
];

let _publicClient = null;
function getPublicClient() {
  if (_publicClient) return _publicClient;
  _publicClient = createPublicClient({ chain: polygon, transport: http(RPC_URL) });
  return _publicClient;
}

/** Gibt das USDC.e-Guthaben der Wallet zurück — NICHT dasselbe wie das
 * native-USDC-Guthaben, das die Wallet-Seite zeigt (siehe Datei-Kommentar). */
export async function getUsdceBalance(address) {
  const raw = await getPublicClient().readContract({
    address: USDCE_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address],
  });
  return formatUnits(raw, COLLATERAL_DECIMALS);
}

/** Offene, aktive Märkte über die öffentliche Gamma-API — kein Auth nötig.
 * Live verifiziert (siehe PR-Historie). */
export async function getMarkets({ limit = 20, search } = {}) {
  const params = new URLSearchParams({ limit: String(limit), active: 'true', closed: 'false', order: 'volume24hr', ascending: 'false' });
  if (search) params.set('search', search);
  const res = await fetch(`${GAMMA_API}/markets?${params}`);
  if (!res.ok) throw new Error(`gamma_api_${res.status}`);
  const markets = await res.json();
  return markets.map(m => ({
    id: m.id,
    conditionId: m.conditionId,
    question: m.question,
    outcomes: JSON.parse(m.outcomes || '[]'),
    outcomePrices: JSON.parse(m.outcomePrices || '[]').map(Number),
    clobTokenIds: JSON.parse(m.clobTokenIds || '[]'),
    negRisk: !!m.negRisk,
    volume24hr: m.volume24hr,
    endDate: m.endDate,
  }));
}

/** Offene Positionen für eine Adresse — öffentliche Data-API, kein Auth. */
export async function getPositions(address) {
  const res = await fetch(`${DATA_API}/positions?user=${address}&sortBy=CURRENT&sortDirection=DESC`);
  if (!res.ok) throw new Error(`data_api_${res.status}`);
  const positions = await res.json();
  return positions.map(p => ({
    conditionId: p.conditionId,
    title: p.title,
    outcome: p.outcome,
    size: p.size,
    avgPrice: p.avgPrice,
    curPrice: p.curPrice,
    currentValue: p.currentValue,
    cashPnl: p.cashPnl,
  }));
}

async function getServerTime() {
  try {
    const res = await fetch(`${CLOB_API}/time`);
    if (res.ok) return Number((await res.text()).trim());
  } catch { /* fällt auf lokale Zeit zurück */ }
  return Math.floor(Date.now() / 1000);
}

// ── L1-Auth (EIP-712) — leitet einen L2-API-Key aus der Wallet-Signatur ab.
// Exakte Domain/Types/Message gegen @polymarket/clob-client@5.8.1/dist/
// signing/eip712.js + constants.js verifiziert (nicht die dortige, ungenutzte
// CLOB_TYPES-Konstante mit nur 3 Feldern — die tatsächlich ausgeführte
// Signier-Funktion nutzt 4 Felder inkl. nonce, siehe Datei-Kommentar oben).
async function signL1Auth(account, nonce, timestamp) {
  const domain = { name: 'ClobAuthDomain', version: '1', chainId: CHAIN_ID };
  const types = {
    ClobAuth: [
      { name: 'address', type: 'address' },
      { name: 'timestamp', type: 'string' },
      { name: 'nonce', type: 'uint256' },
      { name: 'message', type: 'string' },
    ],
  };
  const message = {
    address: account.address,
    timestamp: String(timestamp),
    nonce: BigInt(nonce),
    message: 'This message attests that I control the given wallet',
  };
  return account.signTypedData({ domain, types, primaryType: 'ClobAuth', message });
}

function l1Headers(account, signature, nonce, timestamp) {
  return {
    POLY_ADDRESS: account.address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: String(timestamp),
    POLY_NONCE: String(nonce),
  };
}

// L2-HMAC — exakt gegen @polymarket/clob-client@5.8.1/dist/signing/hmac.js
// verifiziert: base64url(HMAC-SHA256(secret, timestamp+method+path[+body])),
// Secret kommt base64(url)-kodiert von Polymarket.
function l2Signature(secretB64, timestamp, method, requestPath, body) {
  const secret = Buffer.from(secretB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  let message = String(timestamp) + method + requestPath;
  if (body !== undefined) message += body;
  const sig = crypto.createHmac('sha256', secret).update(message).digest('base64');
  return sig.replace(/\+/g, '-').replace(/\//g, '_');
}

function l2Headers(account, creds, timestamp, method, requestPath, body) {
  return {
    POLY_ADDRESS: account.address,
    POLY_SIGNATURE: l2Signature(creds.secret, timestamp, method, requestPath, body),
    POLY_TIMESTAMP: String(timestamp),
    POLY_API_KEY: creds.key,
    POLY_PASSPHRASE: creds.passphrase,
  };
}

/**
 * Legt einen L2-API-Key für diese Wallet an (oder leitet den bestehenden neu
 * ab, falls schon einer existiert — derive-api-key ist idempotent, dieselbe
 * Wallet-Signatur führt deterministisch zu denselben Credentials). Wird pro
 * Bet-Platzierung neu aufgerufen statt gecacht — ein einzelner zusätzlicher
 * Request ist ihr Preis wert gegenüber eigener Persistenz-/Ablauf-Logik für
 * Credentials, die ohnehin bei jedem Aufruf deterministisch neu ableitbar
 * sind.
 */
export async function getApiCreds(account) {
  const timestamp = await getServerTime();
  const nonce = 0;
  const signature = await signL1Auth(account, nonce, timestamp);
  const headers = l1Headers(account, signature, nonce, timestamp);

  let res = await fetch(`${CLOB_API}/auth/api-key`, { method: 'POST', headers });
  let data = await res.json().catch(() => ({}));
  if (!res.ok || !data.apiKey) {
    res = await fetch(`${CLOB_API}/auth/derive-api-key`, { method: 'GET', headers });
    data = await res.json().catch(() => ({}));
    if (!res.ok || !data.apiKey) throw new Error(`polymarket_auth_failed_${res.status}`);
  }
  return { key: data.apiKey, secret: data.secret, passphrase: data.passphrase };
}

/**
 * Platziert eine Market-Order (Fill-or-Kill) für `usdcAmount` USDC.e auf
 * `tokenId` (das YES- oder NO-Outcome-Token aus clobTokenIds, siehe
 * getMarkets()). Order-Struct + EIP-712-Signatur exakt gegen
 * ExchangeOrderBuilder/getMarketOrderRawAmounts aus @polymarket/clob-client
 * verifiziert. Wirft bei jedem Fehler (Auth, Signatur, Ablehnung durch die
 * API) — Aufrufer (server.mjs-Route) fängt das ab, kein stiller Fehlschlag.
 *
 * NICHT selbst end-to-end gegen eine echte Order getestet (siehe
 * Datei-Kommentar oben) — vor Produktiveinsatz mit kleinem Betrag prüfen.
 */
export async function placeMarketOrder(account, { tokenId, side, usdcAmount, price, negRisk }) {
  if (side !== 'BUY' && side !== 'SELL') throw new Error('invalid_side');
  const sideNum = side === 'BUY' ? 0 : 1;

  // Betrag/Preis auf 2 bzw. 6 Nachkommastellen runden — dieselbe Rundung
  // wie getMarketOrderRawAmounts (ROUNDING_CONFIG["0.01"], der übliche
  // Tick-Size-Fall für die meisten Märkte).
  const rawMakerAmt = Math.floor(Number(usdcAmount) * 100) / 100;
  const rawTakerAmt = Math.round((rawMakerAmt / Number(price)) * 1e6) / 1e6;
  const makerAmount = parseUnits(rawMakerAmt.toFixed(2), COLLATERAL_DECIMALS).toString();
  const takerAmount = parseUnits(rawTakerAmt.toFixed(6), COLLATERAL_DECIMALS).toString();

  const exchangeContract = negRisk ? NEG_RISK_EXCHANGE : EXCHANGE_ADDRESS;
  const order = {
    salt: String(Math.round(Math.random() * Date.now())),
    maker: account.address,
    signer: account.address,
    taker: '0x0000000000000000000000000000000000000000',
    tokenId: String(tokenId),
    makerAmount,
    takerAmount,
    expiration: '0',
    nonce: '0',
    feeRateBps: '0',
    side: sideNum,
    signatureType: 0, // EOA
  };

  const domain = { name: 'Polymarket CTF Exchange', version: '1', chainId: CHAIN_ID, verifyingContract: exchangeContract };
  const types = {
    Order: [
      { name: 'salt', type: 'uint256' },
      { name: 'maker', type: 'address' },
      { name: 'signer', type: 'address' },
      { name: 'taker', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'makerAmount', type: 'uint256' },
      { name: 'takerAmount', type: 'uint256' },
      { name: 'expiration', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'feeRateBps', type: 'uint256' },
      { name: 'side', type: 'uint8' },
      { name: 'signatureType', type: 'uint8' },
    ],
  };
  const signature = await account.signTypedData({ domain, types, primaryType: 'Order', message: order });

  const creds = await getApiCreds(account);
  const body = JSON.stringify({
    deferExec: false,
    order: { ...order, signature },
    owner: creds.key,
    orderType: 'FOK',
  });
  const timestamp = await getServerTime();
  const headers = { ...l2Headers(account, creds, timestamp, 'POST', '/order', body), 'Content-Type': 'application/json' };

  const res = await fetch(`${CLOB_API}/order`, { method: 'POST', headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `order_rejected_${res.status}`);
  return data;
}
