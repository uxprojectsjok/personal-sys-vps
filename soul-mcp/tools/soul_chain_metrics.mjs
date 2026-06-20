import { getJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'soul_chain_metrics',
    'Liest die Genesis-Chain-Metriken der Soul: Chain Age in Polygon-Blöcken und human-readable Zeit, Knowledge Blocks (gewichteter Wissenswert: Größe × Alter), Anchor-Anzahl, Genesis-Block und -Zeitstempel. Gibt sofort Auskunft über den on-chain Wissenswert ohne den vollen Maturity-Report zu laden.',
    {},
    async () => {
      let metrics;
      try {
        metrics = await getJson('/api/soul/chain-metrics', token);
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            available: false,
            message: 'Chain-Metriken nicht verfügbar. Entweder wurde noch kein Anchor auf Polygon registriert, oder der Endpunkt ist nicht erreichbar.',
            error: err?.message ?? String(err),
          }, null, 2) }],
        };
      }

      if (!metrics || metrics.anchor_count === 0) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            available: false,
            anchor_count: 0,
            message: 'Noch kein Blockchain-Anchor registriert. Der erste Anchor wird zum Genesis-Anchor.',
          }, null, 2) }],
        };
      }

      const result = {
        available: true,
        genesis: {
          block:  metrics.genesis_block,
          ts:     metrics.genesis_ts,
          tx:     metrics.genesis_tx,
        },
        chain_age: {
          blocks: metrics.chain_age_blocks,
          days:   metrics.chain_age_days,
          human:  metrics.chain_age_human,
        },
        knowledge_blocks: metrics.knowledge_blocks,
        anchor_count:     metrics.anchor_count,
        current_block:    metrics.current_block,
        is_genesis_soul:  metrics.anchor_count === 1,
      };

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}
