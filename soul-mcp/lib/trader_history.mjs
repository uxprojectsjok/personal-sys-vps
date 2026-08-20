/**
 * trader_history.mjs — Aktions-Historie für "Letzte Aktionen" auf der
 * Trader-Seite (Steuer-Übersicht/CSV-Export). Gleiches Muster wie
 * wired_souls.mjs' gatekeeper_config.json: eine flache JSON-Datei pro Soul,
 * kein DB-Layer nötig für diese Größenordnung.
 *
 * WERT (EUR, für die Anzeige/Steuerhistorie) wird beim Schreiben der Aktion
 * mit-gespeichert (Kurs zum Zeitpunkt der Aktion), nicht später aus dem
 * aktuellen Kurs nachgerechnet — sonst stimmt die Steuerhistorie nicht
 * (siehe Trader-Penpot-Board-Notiz). `usd` bleibt daneben als reiner
 * interner Wert für das Tageslimit (trader_config.mjs dailyLimitUsd) —
 * nicht für die Anzeige.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { SOULS_DIR } from './vault_fs.mjs';

function historyPath(soulId) {
  return `${SOULS_DIR}${soulId}/trader_history.json`;
}

export async function getHistory(soulId) {
  try {
    const raw = await readFile(historyPath(soulId), 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * entry: { action, amount, usd, eur, status, txHash?, blockNumber?,
 *          balanceBefore?, balanceAfter?, interestAccruedAtAction?,
 *          symbol?, principal? }
 * date/id werden hier gesetzt, nicht vom Aufrufer.
 *
 * - `symbol` + signiertes `principal` (Dezimalstring, + bei Einzahlung,
 *   - bei Abhebung): Grundlage für getNetPrincipal() unten.
 * - `blockNumber`/`balanceBefore`/`balanceAfter`: aToken-Rohdaten, exakt an
 *   den Tx-Block gebunden (aave_client.mjs supply()/withdraw()) — später per
 *   Polygonscan-Ausdruck bei genau diesem Block nachprüfbar.
 * - `interestAccruedAtAction`: kumulierte Zinsen bis unmittelbar vor dieser
 *   Aktion (balanceBefore minus Netto-Einzahlung vor dieser Aktion) — fest,
 *   nicht live nachgerechnet wie die Live-Anzeige auf der Trader-Seite.
 */
export async function appendAction(soulId, entry) {
  const history = await getHistory(soulId);
  const record = { id: randomUUID(), date: new Date().toISOString(), ...entry };
  history.unshift(record);
  await mkdir(`${SOULS_DIR}${soulId}`, { recursive: true });
  await writeFile(historyPath(soulId), JSON.stringify(history), 'utf8');
  return record;
}

/** Netto-Einzahlung (Summe aller signierten `principal`-Werte) für ein
 * Symbol — nur erfolgreiche Einträge zählen. Rundungsreste/negative Werte
 * (z.B. durch mehrere Teilabhebungen) bleiben roh, Aufrufer entscheidet
 * über Anzeige (z.B. Math.max(0, ...) fürs "Zinsen bisher"-Delta). */
export async function getNetPrincipal(soulId, symbol) {
  const history = await getHistory(soulId);
  return history
    .filter(a => a.status === 'erfolgreich' && a.symbol === symbol && a.principal != null)
    .reduce((sum, a) => sum + Number(a.principal), 0);
}
