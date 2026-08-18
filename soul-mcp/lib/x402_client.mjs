/**
 * x402_client.mjs — makes the operator's own x402 test wallet (see
 * x402_agent_wallet.mjs) act as a real x402 PAYER: balance checks and actual
 * signed payments, using @x402/evm + viem directly instead of shelling out
 * to polygon-agent (removed in v1.0.56 — see its CHANGELOG entry for why).
 */

import { createPublicClient, http, formatUnits } from 'viem';
import { polygon } from 'viem/chains';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { wrapFetchWithPayment } from '@x402/fetch';

// Live gegen den echten Mainnet-Kontrakt verifiziert (name()->"USD Coin",
// version()->"2") — siehe lua/soul_pay_x402.lua, dieselbe Adresse.
const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const RPC_URL       = 'https://polygon-bor-rpc.publicnode.com';

// Token-Liste für die Guthaben-Anzeige (Wallet-Seite "Aktiver Token"-Chips).
// Adressen live gegen die echten Verträge verifiziert (name()/symbol()/
// decimals()), NICHT aus dem Gedächtnis übernommen — dabei eine echte
// Überraschung gefunden: der historische PoS-USDT-Vertrag (seit Jahren
// dieselbe Adresse, in jedem Wallet/DEX als "USDT" bekannt) berichtet
// inzwischen symbol()->"USDT0" statt "USDT" (Tethers LayerZero-Omnichain-
// Rebranding). Deshalb wird das Symbol hier bewusst LIVE vom Vertrag
// gelesen statt fest als String hinterlegt — bleibt automatisch korrekt bei
// künftigen Rebrandings, statt eine mögliche stille Fehlbezeichnung im Code
// einzufrieren. coingeckoId nur für die Preis-Anzeige (getPrices unten),
// hat nichts mit dem on-chain-Symbol zu tun.
const TOKENS = [
  { coingeckoId: 'usd-coin', address: USDC_ADDRESS, decimals: 6 },
  { coingeckoId: 'weth',     address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
  { coingeckoId: 'tether',   address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
];
// polygon.nativeCurrency.symbol ("POL") kommt aus viems eigener, gepflegter
// Chain-Definition — bewusst nicht hier separat hardcodiert.
const NATIVE_COINGECKO_ID = 'polygon-ecosystem-token';

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'symbol', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'string' }] },
];

let _publicClient = null;
function getPublicClient() {
  if (_publicClient) return _publicClient;
  _publicClient = createPublicClient({ chain: polygon, transport: http(RPC_URL) });
  return _publicClient;
}

// Liefert eine Liste { symbol, amount, coingeckoId, address? } — native POL
// zuerst, dann die ERC20-Token aus TOKENS in derselben Reihenfolge. amount
// ist bereits als Dezimal-String formatiert (formatUnits), nicht als
// Rohbetrag.
export async function getBalances(address) {
  const client = getPublicClient();
  const [polRaw, ...tokenReads] = await Promise.all([
    client.getBalance({ address }),
    ...TOKENS.flatMap(t => [
      client.readContract({ address: t.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
      client.readContract({ address: t.address, abi: ERC20_ABI, functionName: 'symbol' }),
    ]),
  ]);

  const balances = [{
    symbol: polygon.nativeCurrency.symbol,
    amount: formatUnits(polRaw, 18),
    coingeckoId: NATIVE_COINGECKO_ID,
  }];
  TOKENS.forEach((t, i) => {
    balances.push({
      symbol: tokenReads[i * 2 + 1],
      amount: formatUnits(tokenReads[i * 2], t.decimals),
      coingeckoId: t.coingeckoId,
      address: t.address,
    });
  });
  return balances;
}

// USD-Preise für die Anzeige (CoinGecko public API, kein Key nötig) — reine
// Zusatzinfo, ein Fehlschlag hier darf die eigentlichen (zuverlässigeren,
// direkt on-chain gelesenen) Guthaben nie unsichtbar machen. Bei Fehler
// leeres Objekt zurück, Aufrufer zeigt dann nur die rohen Token-Mengen ohne
// USD-Wert statt einen Fehler zu werfen.
export async function getPrices(coingeckoIds) {
  try {
    const ids = [...new Set(coingeckoIds)].join(',');
    if (!ids) return {};
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`);
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

/**
 * Zahlt eine x402-geschützte URL mit dem gespeicherten Operator-Key.
 * account kommt aus x402_agent_wallet.mjs (loadAccount()) — hier bewusst als
 * Parameter statt hier selbst geladen, damit dieses Modul den verschlüsselten
 * Schlüssel nie selbst anfasst (Trennung: wallet.mjs verwaltet den Key,
 * dieses Modul kennt nur das entschlüsselte viem-Account-Objekt zur Laufzeit).
 */
export async function payX402(account, { url, method = 'POST', body, headers }) {
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account, schemeOptions: { rpcUrl: RPC_URL } });
  // wrapFetchWithPayment wants the raw x402Client (it wraps it in its own
  // x402HTTPClient internally) — passing an already-wrapped x402HTTPClient
  // here silently breaks the retry-with-payment logic (its own
  // `instanceof x402HTTPClient` check fails across the two require()s of
  // @x402/core/client done by @x402/fetch vs. this file, so it double-wraps
  // instead of recognizing it, and the whole payment attempt gets skipped
  // without throwing — caught live: a real test payment came back as a
  // bare 402 with zero signing having happened at all).
  const fetchWithPay = wrapFetchWithPayment(fetch, client);
  const httpClient = new x402HTTPClient(client);

  const init = { method, headers: { 'Content-Type': 'application/json', ...(headers || {}) } };
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);

  const response = await fetchWithPay(url, init);
  const result = await httpClient.processResponse(response.clone());
  const responseBody = await response.json().catch(() => null);

  return {
    status: response.status,
    paymentStatus: result.paymentStatus,
    header: result.header,
    body: responseBody,
  };
}
