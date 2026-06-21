#!/usr/bin/env node
// soul_chain_metrics_cli.mjs  <soul_id>
// Liest anchor_history.json und berechnet Chain Metrics via Polygon RPC.
// Wird von soul_chain_metrics.lua per io.popen() aufgerufen.
//
// Fallback nach Soul-Import (anchor_history.json fehlt oder leer):
//   Fragt den SoulRegistry-Contract direkt ab und schreibt anchor_history.json
//   mit den on-chain Daten — einmalig, danach wird die Datei gecacht.

import { readFile, writeFile } from 'node:fs/promises';
import { getChainMetrics, getOnChainGenesis, getOnChainHistory } from './lib/blockchain.mjs';

const soulId = process.argv[2];
if (!soulId) {
  process.stdout.write(JSON.stringify({ error: 'soul_id required' }));
  process.exit(1);
}

const histPath = `/var/lib/sys/souls/${soulId}/anchor_history.json`;
let history = [];
try {
  const raw = await readFile(histPath, 'utf8');
  history = JSON.parse(raw);
} catch { /* Datei existiert noch nicht */ }

// Fresh-Install / nach Soul-Import: anchor_history.json fehlt oder ist leer
// → on-chain Daten abrufen und lokal cachen
if (history.length === 0) {
  try {
    const onChain = await getOnChainHistory(soulId);
    if (onChain && onChain.length > 0) {
      history = onChain;
      await writeFile(histPath, JSON.stringify(history, null, 2)).catch(() => {});
    }
  } catch { /* RPC nicht erreichbar — anchor_count bleibt 0 */ }
} else {
  // Genesis-Datum korrigieren wenn nach Import falsch (Mai/Juni statt echtem Datum)
  const genesis = history.find(e => e.genesis) ?? history[0];
  if (genesis && !genesis.block && genesis.ts && (genesis.ts.startsWith('2026-05') || genesis.ts.startsWith('2026-06'))) {
    try {
      const fixed = await getOnChainGenesis(soulId);
      if (fixed) {
        genesis.ts    = fixed.ts;
        genesis.block = fixed.block;
        if (!genesis.genesis) genesis.genesis = true;
        await writeFile(histPath, JSON.stringify(history, null, 2)).catch(() => {});
      }
    } catch { /* weiter mit lokalem Wert */ }
  }
}

try {
  const metrics = await getChainMetrics(history);
  process.stdout.write(JSON.stringify(metrics));
} catch (err) {
  process.stdout.write(JSON.stringify({ error: err.message, anchor_count: history.length }));
  process.exit(1);
}
