/**
 * trader_history.mjs — Aktions-Historie für "Letzte Aktionen" auf der
 * Trader-Seite (Steuer-Übersicht/CSV-Export). Gleiches Muster wie
 * wired_souls.mjs' gatekeeper_config.json: eine flache JSON-Datei pro Soul,
 * kein DB-Layer nötig für diese Größenordnung.
 *
 * WERT (USD) wird beim Schreiben der Aktion mit-gespeichert (Preis zum
 * Zeitpunkt der Aktion), nicht später aus dem aktuellen Kurs nachgerechnet —
 * sonst stimmt die Steuerhistorie nicht (siehe Trader-Penpot-Board-Notiz).
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
 * entry: { action, amount, usd, status, txHash? }
 * date/id werden hier gesetzt, nicht vom Aufrufer.
 */
export async function appendAction(soulId, entry) {
  const history = await getHistory(soulId);
  const record = { id: randomUUID(), date: new Date().toISOString(), ...entry };
  history.unshift(record);
  await mkdir(`${SOULS_DIR}${soulId}`, { recursive: true });
  await writeFile(historyPath(soulId), JSON.stringify(history), 'utf8');
  return record;
}
