#!/usr/bin/env node
// soul_chain_metrics_cli.mjs  <soul_id>
// Liest anchor_history.json und berechnet Chain Metrics via Polygon RPC.
// Wird von soul_chain_metrics.lua per io.popen() aufgerufen.

import { readFile } from 'node:fs/promises';
import { getChainMetrics } from './lib/blockchain.mjs';

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

try {
  const metrics = await getChainMetrics(history);
  process.stdout.write(JSON.stringify(metrics));
} catch (err) {
  process.stdout.write(JSON.stringify({ error: err.message, anchor_count: history.length }));
  process.exit(1);
}
