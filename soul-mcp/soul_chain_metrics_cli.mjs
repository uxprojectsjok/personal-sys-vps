#!/usr/bin/env node
// soul_chain_metrics_cli.mjs  <soul_id>
// Contract ist die einzige Wahrheit — immer on-chain abfragen.
// anchor_history.json dient nur als Fallback wenn RPC nicht erreichbar ist.
// Wird von soul_chain_metrics.lua per io.popen() aufgerufen.

import { readFile, writeFile } from 'node:fs/promises';
import { getChainMetrics, getOnChainHistory } from './lib/blockchain.mjs';

const soulId = process.argv[2];
if (!soulId) {
  process.stdout.write(JSON.stringify({ error: 'soul_id required' }));
  process.exit(1);
}

const histPath = `/var/lib/sys/souls/${soulId}/anchor_history.json`;

// Immer Contract fragen — das ist die validierte Blockchain-Wahrheit.
// Lokale TX-Hashes aus anchor_history.json einmergen (Contract gibt tx: null zurück).
let history = [];
let rpcOk = false;
try {
  const onChain = await getOnChainHistory(soulId);
  if (onChain && onChain.length > 0) {
    // Lokale TX-Hashes lesen und per Timestamp (±120s) einmergen
    let localHistory = [];
    try {
      const raw = await readFile(histPath, 'utf8');
      localHistory = JSON.parse(raw);
    } catch { /* kein lokales File — kein Problem */ }

    const localByTs = localHistory.map(e => ({
      ms: new Date(e.ts || 0).getTime(),
      tx: e.tx || null,
      size: e.size || 0,
    }));

    history = onChain.map(oc => {
      const ocMs = new Date(oc.ts || 0).getTime();
      const match = localByTs.find(l => l.ms && Math.abs(l.ms - ocMs) < 120_000);
      return {
        ...oc,
        tx:   match?.tx   ?? oc.tx   ?? null,
        size: match?.size ?? oc.size ?? 0,
      };
    });

    // Genesis markieren
    if (history.length > 0 && !history[0].genesis) history[0].genesis = true;

    await writeFile(histPath, JSON.stringify(history, null, 2)).catch(() => {});
    rpcOk = true;
  }
} catch { /* RPC nicht erreichbar → Fallback */ }

// Fallback: lokale Datei wenn RPC down
if (!rpcOk) {
  try {
    const raw = await readFile(histPath, 'utf8');
    history = JSON.parse(raw);
  } catch { /* komplett leer */ }
}

// Backfill: Einträge die aus on-chain Daten rekonstruiert wurden haben size=0.
// Der Blockchain-Contract speichert keine Soul-Größen. Einmalig mit aktueller
// Vault-Größe befüllen — konservative Näherung (soul war kleiner in der Vergangenheit,
// aber 0 ergibt knowledge_blocks=0 was noch ungenauer wäre).
const needsSizeBackfill = history.some(e => !e.size || e.size === 0);
if (needsSizeBackfill) {
  try {
    const { execSync } = await import('node:child_process');
    const vaultDir = `/var/lib/sys/souls/${soulId}/vault`;
    const duOut = execSync(`du -sb "${vaultDir}" 2>/dev/null || echo 0`, { encoding: 'utf8' });
    const totalSize = parseInt(duOut.trim()) || 0;
    if (totalSize > 0) {
      for (const e of history) {
        if (!e.size || e.size === 0) e.size = totalSize;
      }
      await writeFile(histPath, JSON.stringify(history, null, 2)).catch(() => {});
    }
  } catch { /* Vault nicht zugänglich — knowledge_blocks bleibt 0 */ }
}

try {
  const metrics = await getChainMetrics(history);
  process.stdout.write(JSON.stringify(metrics));
} catch (err) {
  process.stdout.write(JSON.stringify({ error: err.message, anchor_count: history.length }));
  process.exit(1);
}
