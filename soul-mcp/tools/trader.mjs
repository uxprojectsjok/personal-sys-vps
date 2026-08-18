/**
 * trader.mjs — MCP-Tools für TILL/Trader (Yield + Prediction Markets),
 * damit der autonome Agent (sys-agent-run.sh, Tasks aus agent.md) dieselben
 * Aktionen ausführen kann wie die Trader-UI. Ruft dieselben Lib-Funktionen
 * direkt auf wie server.mjs's /internal/trader/*-Routen (aave_client.mjs,
 * polymarket_client.mjs, trader_history.mjs, trader_config.mjs) — eine
 * Business-Logik, zwei Zugänge (REST für den Browser, MCP für den Agenten).
 *
 * PRIVATE-REPO-ONLY. Nur in registerTools() (Owner-Toolset) registriert —
 * NIEMALS in registerPaidTools/registerPeerTools, damit zahlende/verdrahtete
 * externe Aufrufer diese Tools nie sehen.
 *
 * ZUSÄTZLICHER Identitäts-Gate für die drei geldbewegenden Tools UND jede
 * Sicherheits-AUFWEICHUNG (Notfall-Stopp aus, Tageslimit erhöhen, Token
 * freischalten): erfordert eine frische Verifizierungskette (Stufe "medium",
 * siehe lib/chain_gate.mjs — dieselbe Logik wie soul_chain_status). Das
 * bestehende trader_config.mjs assertActionAllowed() (Notfall-Stopp/
 * Tageslimit/erlaubte Token) prüft NUR die REST-Route zusätzlich nicht mit
 * Identität — hier schon, weil ein MCP-Aufruf auch von einem unbeaufsichtigt
 * laufenden Cron-Agenten ODER einem beliebigen anderen OAuth-autorisierten
 * externen MCP-Client kommen kann, nicht zwingend von einem gerade präsenten
 * Menschen wie bei der Browser-UI.
 */

import { z } from 'zod';
import { loadAccount as loadX402AgentAccount } from '../lib/x402_agent_wallet.mjs';
import { getPositions as getAaveYieldPositions, supply as aaveSupply, withdraw as aaveWithdraw, SUPPORTED_ASSETS as AAVE_SUPPORTED_ASSETS } from '../lib/aave_client.mjs';
import { getMarkets as getPolymarketMarkets, getPositions as getPolymarketPositions, getUsdceBalance as getPolymarketUsdceBalance, placeMarketOrder as placePolymarketOrder } from '../lib/polymarket_client.mjs';
import { getHistory as getTraderHistory, appendAction as appendTraderAction } from '../lib/trader_history.mjs';
import { getConfig as getTraderConfig, setKillSwitch as setTraderKillSwitch, setDailyLimit as setTraderDailyLimit, setAllowedToken as setTraderAllowedToken, getDailyUsedUsd as getTraderDailyUsedUsd, assertActionAllowed as assertTraderActionAllowed } from '../lib/trader_config.mjs';
import { qualifiesForTier } from '../lib/chain_gate.mjs';

const IDENTITY_TIER_REQUIRED = 'medium';

async function assertIdentityVerified(soulId) {
  const ok = await qualifiesForTier(soulId, IDENTITY_TIER_REQUIRED);
  if (!ok) {
    const err = new Error('identity_verification_required');
    err.userMessage = `Identitätsprüfung nötig (Stufe "${IDENTITY_TIER_REQUIRED}") — rufe zuerst verify_identity (methods: face_hq oder voice_hq) auf, und stelle sicher, dass mindestens ein Anker existiert (z.B. via soul_anchor_paypal_start). Prüfe mit soul_chain_status, welche Stufe aktuell erreicht ist.`;
    throw err;
  }
}

async function usdValueAtNow(coingeckoId, amount) {
  try {
    const { getPrices } = await import('../lib/x402_client.mjs');
    const prices = await getPrices([coingeckoId]);
    const price = prices?.[coingeckoId]?.usd;
    return price != null ? (Number(amount) * price).toFixed(2) : null;
  } catch {
    return null;
  }
}

function ok(data) { return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }; }
function fail(err) { return { content: [{ type: 'text', text: err.userMessage || err.message }], isError: true }; }

export function register(server, soulId) {
  if (!soulId) return;

  // ── Lesend, kein Identitäts-Gate ─────────────────────────────────────────
  server.tool(
    'trader_yield_positions',
    'Yield (Aave V3) — aktuelle Positionen (eingezahlter Betrag, APY) über USDC/WETH/USDT0.',
    {},
    async () => {
      try {
        const account = await loadX402AgentAccount(soulId);
        if (!account) throw new Error('x402-Wallet nicht konfiguriert — erst in Settings/Wallet einen Private Key hinterlegen.');
        return ok(await getAaveYieldPositions(account.address));
      } catch (err) { return fail(err); }
    }
  );

  server.tool(
    'trader_markets',
    'Polymarket — offene, aktive Prediction-Markets durchsuchen (öffentliche Gamma-API, kein Wallet nötig).',
    { search: z.string().optional().describe('Freitextsuche'), limit: z.number().optional().describe('Standard 20') },
    async ({ search, limit }) => {
      try {
        return ok(await getPolymarketMarkets({ search, limit: limit || 20 }));
      } catch (err) { return fail(err); }
    }
  );

  server.tool(
    'trader_predictions_positions',
    'Polymarket — offene eigene Wetten + USDC.e-Guthaben (NICHT dasselbe Token wie natives USDC im Portfolio, siehe polymarket_client.mjs).',
    {},
    async () => {
      try {
        const account = await loadX402AgentAccount(soulId);
        if (!account) throw new Error('x402-Wallet nicht konfiguriert.');
        const [positions, usdceBalance] = await Promise.all([
          getPolymarketPositions(account.address),
          getPolymarketUsdceBalance(account.address),
        ]);
        return ok({ address: account.address, positions, usdceBalance });
      } catch (err) { return fail(err); }
    }
  );

  server.tool(
    'trader_history',
    'Letzte Aktionen (Yield-Ein-/Auszahlungen, Wetten) mit USD-Wert zum Zeitpunkt — für die Steuer-Übersicht.',
    {},
    async () => {
      try {
        return ok(await getTraderHistory(soulId));
      } catch (err) { return fail(err); }
    }
  );

  server.tool(
    'trader_safety_status',
    'Notfall-Stopp/Tageslimit/erlaubte Token — aktueller Stand.',
    {},
    async () => {
      try {
        const [config, dailyUsedUsd] = await Promise.all([getTraderConfig(soulId), getTraderDailyUsedUsd(soulId)]);
        return ok({ ...config, dailyUsedUsd });
      } catch (err) { return fail(err); }
    }
  );

  // ── Geldbewegend — assertActionAllowed (Notfall-Stopp/Limit/Token) UND
  // Identitäts-Gate (siehe Datei-Kommentar) ────────────────────────────────
  server.tool(
    'trader_yield_supply',
    [
      'Zahlt Guthaben aus der eigenen x402-Wallet in den Aave-V3-Pool ein (verleiht,',
      'verdient Zinsen). Bewegt echtes Geld — erfordert eine frische',
      'Identitätsprüfung (siehe verify_identity/soul_chain_status) UND respektiert',
      'Notfall-Stopp/Tageslimit/erlaubte Token (Trader-Seite → Sicherheit).',
    ].join('\n'),
    {
      symbol: z.enum(['USDC', 'WETH', 'USDT0']).describe('Welches Token'),
      amount: z.string().describe('Betrag als Dezimalstring, z.B. "10.5"'),
    },
    async ({ symbol, amount }) => {
      try {
        await assertIdentityVerified(soulId);
        const account = await loadX402AgentAccount(soulId);
        if (!account) throw new Error('x402-Wallet nicht konfiguriert.');
        const asset = AAVE_SUPPORTED_ASSETS.find(a => a.symbol === symbol);
        const usd = asset ? await usdValueAtNow(asset.coingeckoId, amount) : null;
        await assertTraderActionAllowed(soulId, { symbol, usd });
        const result = await aaveSupply(account, symbol, amount);
        await appendTraderAction(soulId, { action: `Yield · Aave ${symbol} eingezahlt`, amount: `${amount} ${symbol}`, usd, status: 'erfolgreich', txHash: result.txHash });
        return ok(result);
      } catch (err) { return fail(err); }
    }
  );

  server.tool(
    'trader_yield_withdraw',
    [
      'Hebt Guthaben aus dem Aave-V3-Pool zurück in die eigene x402-Wallet ab.',
      'Bewegt echtes Geld — erfordert eine frische Identitätsprüfung UND',
      'respektiert Notfall-Stopp/Tageslimit/erlaubte Token.',
    ].join('\n'),
    {
      symbol: z.enum(['USDC', 'WETH', 'USDT0']).describe('Welches Token'),
      amount: z.string().describe('Betrag als Dezimalstring, oder "max" für den vollen Bestand'),
    },
    async ({ symbol, amount }) => {
      try {
        await assertIdentityVerified(soulId);
        const account = await loadX402AgentAccount(soulId);
        if (!account) throw new Error('x402-Wallet nicht konfiguriert.');
        const asset = AAVE_SUPPORTED_ASSETS.find(a => a.symbol === symbol);
        let resolvedAmount = amount;
        if (amount === 'max' && asset) {
          const positions = await getAaveYieldPositions(account.address);
          resolvedAmount = positions.find(p => p.symbol === symbol)?.deposited || '0';
        }
        const usd = asset ? await usdValueAtNow(asset.coingeckoId, resolvedAmount) : null;
        await assertTraderActionAllowed(soulId, { symbol, usd });
        const result = await aaveWithdraw(account, symbol, amount);
        await appendTraderAction(soulId, { action: `Yield · Aave ${symbol} abgehoben`, amount: amount === 'max' ? `${symbol} (alles)` : `${amount} ${symbol}`, usd, status: 'erfolgreich', txHash: result.txHash });
        return ok(result);
      } catch (err) { return fail(err); }
    }
  );

  server.tool(
    'trader_place_bet',
    [
      'Platziert eine Market-Order (Fill-or-Kill) auf ein Polymarket-Outcome —',
      'siehe trader_markets für tokenId (clobTokenIds[0]=YES/[1]=NO) und aktuellen',
      'Preis (outcomePrices). Bewegt echtes Geld in USDC.e (NICHT natives USDC —',
      'prüfe trader_predictions_positions.usdceBalance vorher). Erfordert eine',
      'frische Identitätsprüfung UND respektiert Notfall-Stopp/Tageslimit.',
      '',
      'WARNUNG: der Order-Pfad wurde bisher nicht gegen eine echte Order',
      'getestet (nur die Auth-Signatur live verifiziert, siehe',
      'polymarket_client.mjs Datei-Kommentar) — erst mit kleinem Betrag prüfen.',
    ].join('\n'),
    {
      tokenId: z.string().describe('clobTokenIds[0] für YES, [1] für NO aus trader_markets'),
      usdcAmount: z.string().describe('Einsatz in USDC.e als Dezimalstring'),
      price: z.number().describe('outcomePrices[idx] aus trader_markets zum selben Index wie tokenId'),
      negRisk: z.boolean().optional().describe('negRisk-Feld aus dem Markt-Objekt'),
      question: z.string().optional().describe('Für die Historie: die Marktfrage'),
      outcome: z.enum(['Yes', 'No']).optional().describe('Für die Historie: gewählte Seite'),
    },
    async ({ tokenId, usdcAmount, price, negRisk, question, outcome }) => {
      try {
        await assertIdentityVerified(soulId);
        const account = await loadX402AgentAccount(soulId);
        if (!account) throw new Error('x402-Wallet nicht konfiguriert.');
        const balance = await getPolymarketUsdceBalance(account.address);
        if (Number(balance) < Number(usdcAmount)) {
          throw new Error(`USDC.e-Guthaben (${balance}) reicht nicht für Einsatz ${usdcAmount}.`);
        }
        await assertTraderActionAllowed(soulId, { usd: usdcAmount });
        const result = await placePolymarketOrder(account, { tokenId, side: 'BUY', usdcAmount, price, negRisk: !!negRisk });
        const label = question ? `Wette · ${question}${outcome ? ` (${outcome})` : ''}` : `Wette · ${tokenId.slice(0, 10)}…`;
        await appendTraderAction(soulId, { action: label, amount: `${usdcAmount} USDC.e`, usd: Number(usdcAmount).toFixed(2), status: 'erfolgreich' });
        return ok(result);
      } catch (err) { return fail(err); }
    }
  );

  // ── Sicherheits-Konfiguration — nur AUFWEICHENDE Änderungen brauchen den
  // Identitäts-Gate (Notfall-Stopp AUS, Limit ERHÖHEN, Token FREISCHALTEN);
  // verschärfende Änderungen (Stopp AN, Limit senken, Token sperren) sind
  // immer risikolos und laufen ohne zusätzliche Prüfung durch. ────────────
  server.tool(
    'trader_set_kill_switch',
    'Notfall-Stopp an/aus. AUSSCHALTEN erfordert eine frische Identitätsprüfung, EINSCHALTEN nicht.',
    { active: z.boolean().describe('true = Stopp aktiv (blockiert alle Trader-Aktionen), false = deaktiviert') },
    async ({ active }) => {
      try {
        if (!active) await assertIdentityVerified(soulId);
        return ok(await setTraderKillSwitch(soulId, active));
      } catch (err) { return fail(err); }
    }
  );

  server.tool(
    'trader_set_daily_limit',
    'Tageslimit (USD) setzen. Erhöhen erfordert eine frische Identitätsprüfung, senken nicht.',
    { limitUsd: z.number().min(0).describe('Neues Tageslimit in USD') },
    async ({ limitUsd }) => {
      try {
        const current = await getTraderConfig(soulId);
        if (limitUsd > current.dailyLimitUsd) await assertIdentityVerified(soulId);
        return ok(await setTraderDailyLimit(soulId, limitUsd));
      } catch (err) { return fail(err); }
    }
  );

  server.tool(
    'trader_set_allowed_token',
    'Ein Yield-Token freischalten/sperren. Freischalten erfordert eine frische Identitätsprüfung, sperren nicht.',
    { symbol: z.enum(['USDC', 'WETH', 'USDT0']), allowed: z.boolean() },
    async ({ symbol, allowed }) => {
      try {
        if (allowed) await assertIdentityVerified(soulId);
        return ok(await setTraderAllowedToken(soulId, symbol, allowed));
      } catch (err) { return fail(err); }
    }
  );
}
