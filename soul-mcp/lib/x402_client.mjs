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

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
];

let _publicClient = null;
function getPublicClient() {
  if (_publicClient) return _publicClient;
  _publicClient = createPublicClient({ chain: polygon, transport: http(RPC_URL) });
  return _publicClient;
}

export async function getBalances(address) {
  const client = getPublicClient();
  const [usdcRaw, polRaw] = await Promise.all([
    client.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
    client.getBalance({ address }),
  ]);
  return {
    usdc: formatUnits(usdcRaw, 6),
    pol: formatUnits(polRaw, 18),
  };
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
