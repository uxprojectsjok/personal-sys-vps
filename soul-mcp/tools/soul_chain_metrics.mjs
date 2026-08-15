import { getJson } from '../lib/api.mjs';

// /api/soul/chain-metrics ist bewusst öffentlich/unauthentifiziert (Daten
// liegen ohnehin on-chain, siehe soul_chain_metrics.lua) — kein
// access_by_lua_file davor, also bleibt ngx.ctx.soul_id dort IMMER leer.
// Ohne einen expliziten ?soul_id=-Query-Parameter fällt der Lua-Endpunkt auf
// seinen "Single-Hoster"-Fallback zurück (erste Soul in SOULS_DIR laut ls,
// alphabetisch) — auf einem Multi-Soul-Node wie diesem liefert das dann
// STILLSCHWEIGEND die Chain-Metriken einer FREMDEN Soul zurück, nicht die der
// aufrufenden. Live gefunden (2026-08-15): KRO (f0aad283…) bekam ohne diesen
// Parameter anchor_count:0/knowledge_blocks:0, obwohl die echte Genesis
// Chain 5 Anker und 196 KB zeigt — weil "97c8841a…" alphabetisch vor
// "f0aad283…" kommt und zufällig keine eigenen Anchors hat.
export function register(server, token, soulId) {
  server.tool(
    'soul_chain_metrics',
    'Liest die Genesis-Chain-Metriken der Soul: Chain Age in Polygon-Blöcken und human-readable Zeit, Knowledge Blocks (gewichteter Wissenswert: Größe × Alter), Anchor-Anzahl, Genesis-Block und -Zeitstempel. Gibt sofort Auskunft über den on-chain Wissenswert ohne den vollen Maturity-Report zu laden.',
    {},
    async () => {
      let metrics;
      try {
        const qs = soulId ? `?soul_id=${encodeURIComponent(soulId)}` : '';
        metrics = await getJson(`/api/soul/chain-metrics${qs}`, token);
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
