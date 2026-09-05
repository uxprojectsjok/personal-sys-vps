/**
 * aave_client.mjs — Yield-Anbindung für TILL/Trader: verleiht Guthaben aus
 * der bestehenden x402-Agent-Wallet (x402_agent_wallet.mjs) direkt an den
 * Aave-V3-Pool auf Polygon, verdient Zinsen ohne Markt-Timing.
 *
 * Kein externes SDK/API — reine viem-Contract-Calls, gleicher Stil wie
 * x402_client.mjs. Pool-Adresse UND alle drei unterstützten Reserven live
 * gegen den echten Vertrag verifiziert (getReservesList() enthält sie),
 * nicht aus dem Gedächtnis übernommen.
 */

import { createPublicClient, createWalletClient, http, formatUnits, parseUnits } from 'viem';
import { polygon } from 'viem/chains';

const RPC_URL = 'https://polygon-bor-rpc.publicnode.com';

// Live verifiziert: getReservesList() auf diesem Vertrag enthält unsere
// native USDC-Adresse (siehe x402_client.mjs) UND die separate USDC.e/
// "USDC (PoS)"-Adresse als jeweils eigene Reserve — zwei unterschiedliche,
// beide legitime Verträge, nicht dieselbe. Aave selbst nutzt hier unsere
// native USDC direkt, kein Bridging nötig.
const POOL_ADDRESS = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';

// Unterstützte Reserven — dieselben drei ERC20s, die die Wallet-Seite schon
// zeigt (siehe x402_client.mjs TOKENS), alle live gegen getReservesList()
// verifiziert. Natives POL fehlt bewusst: Aave braucht dafür die gewrappte
// WPOL-Variante (eigener deposit()/withdraw()-Schritt), noch nicht gebaut.
export const SUPPORTED_ASSETS = [
  { symbol: 'USDC',  address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6,  coingeckoId: 'usd-coin' },
  { symbol: 'WETH',  address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18, coingeckoId: 'weth' },
  { symbol: 'USDT0', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6,  coingeckoId: 'tether' },
];

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
];

// Aave v3 Pool-Interface — nur der Ausschnitt, den wir brauchen. Feld-
// Reihenfolge von getReserveData() live gegen den echten Vertrag geprüft
// (siehe Verifikations-Skript in der PR-Historie), nicht aus Doku kopiert
// ohne Gegenprobe.
const POOL_ABI = [
  { name: 'supply', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' }, { name: 'referralCode', type: 'uint16' },
    ], outputs: [] },
  { name: 'withdraw', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'to', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getReserveData', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [{
      name: '', type: 'tuple', components: [
        { name: 'configuration', type: 'tuple', components: [{ name: 'data', type: 'uint256' }] },
        { name: 'liquidityIndex', type: 'uint128' },
        { name: 'currentLiquidityRate', type: 'uint128' },
        { name: 'variableBorrowIndex', type: 'uint128' },
        { name: 'currentVariableBorrowRate', type: 'uint128' },
        { name: 'currentStableBorrowRate', type: 'uint128' },
        { name: 'lastUpdateTimestamp', type: 'uint40' },
        { name: 'id', type: 'uint16' },
        { name: 'aTokenAddress', type: 'address' },
        { name: 'stableDebtTokenAddress', type: 'address' },
        { name: 'variableDebtTokenAddress', type: 'address' },
        { name: 'interestRateStrategyAddress', type: 'address' },
        { name: 'accruedToTreasury', type: 'uint128' },
        { name: 'unbacked', type: 'uint128' },
        { name: 'isolationModeTotalDebt', type: 'uint128' },
      ],
    }],
  },
];

const RAY = 10n ** 27n; // Aave-Zinssätze sind Ray-fixed-point (27 Dezimalstellen)

let _publicClient = null;
function getPublicClient() {
  if (_publicClient) return _publicClient;
  _publicClient = createPublicClient({ chain: polygon, transport: http(RPC_URL) });
  return _publicClient;
}

function getWalletClient(account) {
  return createWalletClient({ account, chain: polygon, transport: http(RPC_URL) });
}

function findAsset(symbol) {
  const asset = SUPPORTED_ASSETS.find(a => a.symbol === symbol);
  if (!asset) throw new Error('unsupported_asset');
  return asset;
}

/**
 * Aktuelle Positionen über alle unterstützten Reserven: aToken-Guthaben
 * (= eingezahlt + aufgelaufene Zinsen, da Aave aTokens rebasend sind — der
 * reine Saldo-Anstieg gegenüber der ursprünglichen Einzahlung IST der
 * Zinsertrag, kein separater Buchungseintrag nötig) + aktuelle APY je
 * Reserve. "earned" wird hier NICHT mitgeliefert (wir kennen die ursprüngl.
 * Einzahlsumme nicht ohne eigene Buchhaltung) — der Aufrufer zeigt nur den
 * aktuellen aToken-Bestand, keine erfundene Differenz.
 */
export async function getPositions(address) {
  const client = getPublicClient();
  const results = await Promise.all(SUPPORTED_ASSETS.map(async (asset) => {
    const reserve = await client.readContract({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: 'getReserveData', args: [asset.address] });
    const aTokenBalance = await client.readContract({ address: reserve.aTokenAddress, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] });
    const apy = Number(reserve.currentLiquidityRate) / Number(RAY) * 100;
    return {
      symbol: asset.symbol,
      address: asset.address,
      aTokenAddress: reserve.aTokenAddress,
      deposited: formatUnits(aTokenBalance, asset.decimals),
      apy: apy.toFixed(2),
      coingeckoId: asset.coingeckoId,
    };
  }));
  return results.filter(r => Number(r.deposited) > 0 || true); // alle Reserven zeigen (auch 0), Aufrufer entscheidet über Anzeige
}

/**
 * Zahlt `amountDecimalStr` von `symbol` in den Aave-Pool ein. Zwei
 * On-Chain-Transaktionen (approve, falls nötig, dann supply) — beide mit
 * demselben Account signiert, derselbe self-custodied Key wie überall sonst
 * in dieser Wallet. Wirft, wenn approve/supply revertet (z.B. zu wenig
 * Guthaben oder Gas) — Aufrufer (server.mjs-Route) fängt das ab.
 */
export async function supply(account, symbol, amountDecimalStr) {
  const asset = findAsset(symbol);
  const amount = parseUnits(amountDecimalStr, asset.decimals);
  const publicClient = getPublicClient();
  const walletClient = getWalletClient(account);

  const reserve = await publicClient.readContract({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: 'getReserveData', args: [asset.address] });
  const balanceBefore = await publicClient.readContract({
    address: reserve.aTokenAddress, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address],
  });

  const allowance = await publicClient.readContract({
    address: asset.address, abi: ERC20_ABI, functionName: 'allowance', args: [account.address, POOL_ADDRESS],
  });
  if (allowance < amount) {
    const approveHash = await walletClient.writeContract({
      address: asset.address, abi: ERC20_ABI, functionName: 'approve', args: [POOL_ADDRESS, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  const supplyHash = await walletClient.writeContract({
    address: POOL_ADDRESS, abi: POOL_ABI, functionName: 'supply', args: [asset.address, amount, account.address, 0],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: supplyHash });
  // Balance NACH der Tx erneut lesen statt "balanceBefore + amount" zu rechnen —
  // die Chain kennt den echten Wert, inkl. der paar Sekunden Zinsen, die
  // zwischen den beiden Reads zusätzlich aufgelaufen sind.
  const balanceAfter = await publicClient.readContract({
    address: reserve.aTokenAddress, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address],
  });
  return {
    txHash: supplyHash, status: receipt.status, blockNumber: receipt.blockNumber.toString(),
    balanceBefore: formatUnits(balanceBefore, asset.decimals), balanceAfter: formatUnits(balanceAfter, asset.decimals),
  };
}

/**
 * Hebt `amountDecimalStr` von `symbol` aus dem Aave-Pool ab. Kein approve
 * nötig (Aave verbrennt die aTokens direkt, keine Drittanbieter-Freigabe
 * erforderlich). amount === 'max' hebt den vollen aToken-Bestand ab
 * (Aave-Konvention: uint256.max als Betrag löst intern "alles" aus, exakter
 * als selbst den aktuellen Bestand zu lesen und zu senden — der wächst
 * zwischen Lesen und Senden minimal weiter).
 */
export async function withdraw(account, symbol, amountDecimalStr) {
  const asset = findAsset(symbol);
  const amount = amountDecimalStr === 'max' ? (2n ** 256n - 1n) : parseUnits(amountDecimalStr, asset.decimals);
  const publicClient = getPublicClient();
  const walletClient = getWalletClient(account);

  const reserve = await publicClient.readContract({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: 'getReserveData', args: [asset.address] });
  const balanceBefore = await publicClient.readContract({
    address: reserve.aTokenAddress, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address],
  });

  const hash = await walletClient.writeContract({
    address: POOL_ADDRESS, abi: POOL_ABI, functionName: 'withdraw', args: [asset.address, amount, account.address],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const balanceAfter = await publicClient.readContract({
    address: reserve.aTokenAddress, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address],
  });
  return {
    txHash: hash, status: receipt.status, blockNumber: receipt.blockNumber.toString(),
    balanceBefore: formatUnits(balanceBefore, asset.decimals), balanceAfter: formatUnits(balanceAfter, asset.decimals),
  };
}
