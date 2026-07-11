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

    // Schutz gegen RPC-Lag: register-anchor schreibt den TX sofort nach dem Broadcast,
    // getHistory() liest aber nur bestätigten Contract-Zustand — kurz nach einem frischen
    // Anchor kann die On-Chain-Abfrage den Eintrag noch nicht sehen. Ohne diesen Schutz
    // überschreibt genau dieser Merge dann den gerade erst korrekt geschriebenen lokalen
    // Eintrag mit einer unvollständigen Rekonstruktion (tx geht verloren).
    // Lokale Einträge mit echtem TX, die im On-Chain-Ergebnis nicht auftauchen, bleiben
    // erhalten statt verworfen zu werden.
    const knownTx = new Set(history.map(h => h.tx).filter(Boolean));
    for (const local of localHistory) {
      if (local.tx && !knownTx.has(local.tx)) {
        history.push({ tx: local.tx, ts: local.ts, size: local.size ?? 0, ...(local.block && { block: local.block }) });
        knownTx.add(local.tx);
      }
    }
    history.sort((a, b) => new Date(a.ts || 0) - new Date(b.ts || 0));

    // Genesis markieren
    history.forEach(e => delete e.genesis);
    if (history.length > 0) history[0].genesis = true;

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

  // Visibility: soul_discover sucht via eth_getLogs — publicnode limitiert auf ~10k Blocks ≈ 11 Tage.
  // Wer länger nicht geankert hat, taucht im Event-Search nicht mehr auf.
  const DISCOVER_WINDOW_DAYS = 11;
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;
  const lastTs = lastEntry ? new Date(lastEntry.ts || 0).getTime() : 0;
  const daysSinceLast = lastTs > 0 ? (Date.now() - lastTs) / 86_400_000 : null;

  let visibilityZone = 'unknown';
  if (daysSinceLast !== null) {
    if (daysSinceLast < DISCOVER_WINDOW_DAYS)       visibilityZone = 'discoverable';
    else if (daysSinceLast < DISCOVER_WINDOW_DAYS * 2) visibilityZone = 'fading';
    else                                              visibilityZone = 'invisible';
  }

  process.stdout.write(JSON.stringify({
    ...metrics,
    last_anchor_ts:      lastEntry?.ts ?? null,
    days_since_last_anchor: daysSinceLast !== null ? Math.round(daysSinceLast * 10) / 10 : null,
    visibility_zone:     visibilityZone,
    discover_window_days: DISCOVER_WINDOW_DAYS,
  }));
} catch (err) {
  process.stdout.write(JSON.stringify({ error: err.message, anchor_count: history.length }));
  process.exit(1);
}
