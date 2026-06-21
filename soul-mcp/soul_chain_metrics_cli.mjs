#!/usr/bin/env node
// soul_chain_metrics_cli.mjs  <soul_id>
// Liest anchor_history.json und berechnet Chain Metrics via Polygon RPC.
// Wird von soul_chain_metrics.lua per io.popen() aufgerufen.
//
// Genesis-Datum: wird beim ersten Aufruf nach einem frischen Deploy direkt
// on-chain aus dem SoulRegistry-Contract abgefragt und in anchor_history.json
// gecacht — damit das Datum nach Soul-Import immer korrekt ist.

import { readFile, writeFile } from 'node:fs/promises';
import { getChainMetrics, getOnChainGenesis } from './lib/blockchain.mjs';

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

// Wenn Genesis-Eintrag keinen Block hat (altes Format / nach Import),
// echten on-chain Timestamp nachladen und cachen.
const genesis = history.find(e => e.genesis) ?? history[0];
if (genesis && !genesis.block && (!genesis.ts || genesis.ts.startsWith('2026-05') || genesis.ts.startsWith('2026-06'))) {
  try {
    const onChainGenesis = await getOnChainGenesis(soulId);
    if (onChainGenesis) {
      genesis.ts    = onChainGenesis.ts;
      genesis.block = onChainGenesis.block;
      if (!genesis.genesis) genesis.genesis = true;
      // Gecacht in anchor_history.json schreiben
      await writeFile(histPath, JSON.stringify(history, null, 2)).catch(() => {});
    }
  } catch { /* RPC nicht erreichbar — weiter mit lokalem Wert */ }
}

try {
  const metrics = await getChainMetrics(history);
  process.stdout.write(JSON.stringify(metrics));
} catch (err) {
  process.stdout.write(JSON.stringify({ error: err.message, anchor_count: history.length }));
  process.exit(1);
}
