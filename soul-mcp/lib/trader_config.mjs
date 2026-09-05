/**
 * trader_config.mjs — Sicherheits-Einstellungen für TILL/Trader: Notfall-
 * Stopp, Tageslimit, erlaubte Yield-Token. Gleiches Muster wie
 * wired_souls.mjs' gatekeeper_config.json — flache JSON-Datei pro Soul.
 *
 * WICHTIG: diese Datei speichert nur die Einstellungen. Die eigentliche
 * DURCHSETZUNG (killSwitch/Tageslimit/erlaubte Token vor jeder Aktion
 * prüfen) passiert in server.mjs, direkt in den drei geldbewegenden Routen
 * (yield/supply, yield/withdraw, predictions/bet) — eine Einstellung hier
 * ohne die Prüfung dort wäre nur Deko, kein echter Schutz.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { SOULS_DIR } from './vault_fs.mjs';
import { getHistory } from './trader_history.mjs';

const DEFAULTS = {
  killSwitchActive: false,
  dailyLimitUsd: 50,
  allowedTokens: ['USDC', 'WETH'], // USDT0 bewusst nicht per Default (siehe Penpot-Vorlage)
};

function configPath(soulId) {
  return `${SOULS_DIR}${soulId}/trader_config.json`;
}

export async function getConfig(soulId) {
  try {
    const raw = await readFile(configPath(soulId), 'utf8');
    const data = JSON.parse(raw);
    return { ...DEFAULTS, ...(data && typeof data === 'object' ? data : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

async function saveConfig(soulId, cfg) {
  await mkdir(`${SOULS_DIR}${soulId}`, { recursive: true });
  await writeFile(configPath(soulId), JSON.stringify(cfg), 'utf8');
}

export async function setKillSwitch(soulId, active) {
  const cfg = await getConfig(soulId);
  cfg.killSwitchActive = !!active;
  await saveConfig(soulId, cfg);
  return cfg;
}

export async function setDailyLimit(soulId, limitUsd) {
  const cfg = await getConfig(soulId);
  cfg.dailyLimitUsd = Number(limitUsd);
  await saveConfig(soulId, cfg);
  return cfg;
}

export async function setAllowedToken(soulId, symbol, allowed) {
  const cfg = await getConfig(soulId);
  const set = new Set(cfg.allowedTokens);
  if (allowed) set.add(symbol); else set.delete(symbol);
  cfg.allowedTokens = [...set];
  await saveConfig(soulId, cfg);
  return cfg;
}

/** Summe der USD-Werte aller Aktionen seit Mitternacht UTC (Server-Zeit —
 * für ein Single-Owner-Tool bewusst einfach gehalten, keine Zeitzonen-
 * Auflösung pro Soul). */
export async function getDailyUsedUsd(soulId) {
  const history = await getHistory(soulId);
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  return history
    .filter(a => a.usd != null && new Date(a.date) >= todayStart)
    .reduce((sum, a) => sum + Number(a.usd), 0);
}

/**
 * Wirft mit einem sprechenden Fehler, wenn die geplante Aktion gegen eine
 * der drei Sicherheitsregeln verstößt — von den drei geldbewegenden Routen
 * VOR der eigentlichen On-Chain-/API-Aktion aufgerufen. symbol ist optional
 * (Prediction-Market-Wetten haben kein "erlaubtes Token"-Konzept, nur
 * Yield-Aktionen).
 */
export async function assertActionAllowed(soulId, { symbol, usd } = {}) {
  const cfg = await getConfig(soulId);
  if (cfg.killSwitchActive) {
    const err = new Error('kill_switch_active');
    err.userMessage = 'Notfall-Stopp ist aktiv — keine Aktionen möglich, bis er wieder deaktiviert wird.';
    throw err;
  }
  if (symbol && !cfg.allowedTokens.includes(symbol)) {
    const err = new Error('token_not_allowed');
    err.userMessage = `${symbol} ist nicht in den erlaubten Token — in Sicherheit freischalten.`;
    throw err;
  }
  if (usd != null) {
    const used = await getDailyUsedUsd(soulId);
    if (used + Number(usd) > cfg.dailyLimitUsd) {
      const err = new Error('daily_limit_exceeded');
      err.userMessage = `Tageslimit erreicht: ${used.toFixed(2)} von ${cfg.dailyLimitUsd} USD bereits genutzt.`;
      throw err;
    }
  }
}
