# Genesis Chain

Jeder Blockchain-Anchor auf Polygon ist ein Wissenssnapshot der Soul.  
Der erste Anchor heißt **Genesis** — wie in der Blockchain-Tradition.  
Mit zunehmenden Anchors und wachsender Soul-Größe steigt der **Knowledge-Blocks-Wert** — ein wirtschaftlich relevantes Reifegewicht.

---

## Konzept

| Begriff | Bedeutung |
|---------|-----------|
| **Genesis** | Erster Anchor einer Soul auf Polygon — unveränderlicher Startpunkt |
| **Chain Age** | Anzahl Polygon-Blöcke seit Genesis (≈ 2 Blöcke/Sek) |
| **Knowledge Blocks** | Gewichteter Wissenswert: Größe × Alter jedes Anchors |
| **Anchor** | Ein `anchor()`-Call auf `SoulRegistry.sol` mit sha256(sys.md) |

Nur Hashes werden on-chain gespeichert — kein Klartext, kein Inhalt.  
Die Blockchain verhindert Fälschungen: jeder Anchor ist zeitgestempelt und unveränderlich.

---

## Datenfelder in sys.md

```yaml
soul_chain_anchor: '{"tx":"0x...","block":83500000,"ts":"2026-04-04T12:00:00Z","sessions":12}'
soul_anchor_history: '[{"tx":"0x...","ts":"2026-04-04T12:00:00Z","size":42000,"genesis":true},...]'
```

| Feld | Beschreibung |
|------|--------------|
| `soul_chain_anchor` | Letzter Anchor (JSON, inline) |
| `soul_anchor_history` | Alle Anchors (JSON-Array, inline) |

Jeder Eintrag in `soul_anchor_history`:

```json
{
  "tx":      "0xabc...",
  "ts":      "2026-04-04T12:00:00Z",
  "size":    42000,
  "block":   83500000,
  "genesis": true
}
```

`genesis: true` wird automatisch gesetzt wenn `soul_anchor_history` beim Schreiben leer ist.  
`block` ist optional — wird client-seitig per Receipt befüllt, serverseitig geschätzt falls fehlend.

---

## Server-Datei

```
/var/lib/sys/souls/{soul_id}/anchor_history.json
```

Plaintext-Kopie von `soul_anchor_history` — wird bei jedem `POST /api/soul/register-anchor` aktualisiert.  
Wird von `soul_chain_metrics_cli.mjs` gelesen (via Lua `io.popen()`).

---

## Knowledge-Blocks-Formel

```
KB = Σ ( size_kb × ( 1 + log₁₀( 1 + age_blocks / 43200 ) ) )
```

- `size_kb` — Soul-Größe in KB zum Zeitpunkt des Anchors
- `age_blocks` — `current_block − anchor_block`
- `43200` — Polygon-Blöcke pro halben Tag (≈ 6h)
- Ältere Anchors wiegen mehr, größere Anchors wiegen mehr
- Ergebnis: ganzzahlig gerundet

**Beispiel:** Soul 42 KB, Genesis vor 112.000 Blöcken (~0,65 Tage)

```
age_weight = 1 + log₁₀(1 + 112000 / 43200) = 1 + log₁₀(3,59) ≈ 1,555
KB = 42 × 1,555 ≈ 65
```

---

## Block-Schätzung

Falls `block` in einem Anchor-Eintrag fehlt, wird geschätzt:

```js
DEPLOY_BLOCK = 83_500_000        // 2026-04-04T00:00:00Z
DEPLOY_TS    = 1_775_260_800     // Unix

estimatedBlock = DEPLOY_BLOCK + (anchor_unix_ts - DEPLOY_TS) * 2
```

Polygon produziert ≈ 2 Blöcke/Sek → Schätzung ist auf Sekunden genau.

---

## API-Endpunkt

### `GET /api/soul/chain-metrics`

Auth: `soul_auth.lua` (service_token).

```json
{
  "genesis_block":    83500000,
  "genesis_ts":       "2026-04-04T12:00:00Z",
  "genesis_tx":       "0xabc...",
  "current_block":    83612000,
  "chain_age_blocks": 112000,
  "chain_age_days":   0.65,
  "chain_age_human":  "16 Stunden",
  "anchor_count":     3,
  "knowledge_blocks": 261
}
```

**Lua:** `lua/soul_chain_metrics.lua` — ruft `soul_chain_metrics_cli.mjs` per `io.popen()` auf.  
**Dev:** `server/api/soul/chain-metrics.get.js` — ruft `getChainMetrics()` aus `blockchain.mjs` direkt.

---

## Register-Anchor

### `POST /api/soul/register-anchor`

Bestehender Endpunkt, erweitert um:

```json
{
  "tx_hash":      "0x...",
  "block_number": 83500000,
  "soul_size":    42000,
  "date":         "2026-04-04",
  "sessions":     12
}
```

Schreibt `anchor_history.json` auf dem Server und setzt `genesis: true` beim ersten Eintrag.

---

## MCP Tools

### `soul_chain_metrics`

Dediziertes leichtgewichtiges Tool — kein voller Maturity-Report nötig.

```
soul_chain_metrics()
→ { genesis, chain_age, knowledge_blocks, anchor_count, current_block, is_genesis_soul }
```

### `soul_maturity`

Enthält `breakdown.detail.chain_metrics` — alle Chain-Metriken als Teil des Maturity-Reports.

---

## UI

| Seite | Was wird gezeigt |
|-------|-----------------|
| `anchor.vue` | Goldene Genesis-Card mit Chain Age, Knowledge Blocks, Anchor-Count |
| `maturity.vue` | Genesis-Chain-Panel unterhalb der 6 Stat-Cards |

Beide Komponenten nutzen `useChainAnchor.js` → `fetchChainMetrics()` und zeigen den Abschnitt nur wenn `anchor_count > 0`.

---

## Implementierte Dateien

| Datei | Beschreibung |
|-------|-------------|
| `soul-mcp/lib/blockchain.mjs` | `getCurrentBlock()`, `calcKnowledgeBlocks()`, `getChainMetrics()` |
| `soul-mcp/soul_chain_metrics_cli.mjs` | Node.js CLI für Lua-Aufruf |
| `soul-mcp/tools/soul_chain_metrics.mjs` | MCP Tool |
| `lua/soul_chain_metrics.lua` | Lua-Endpunkt |
| `lua/soul_register_anchor.lua` | Erweitert: `block_number`, `soul_size`, `anchor_history.json` |
| `server/api/soul/chain-metrics.get.js` | Dev-Mirror |
| `server/api/soul/register-anchor.post.js` | Dev-Mirror erweitert |
| `app/composables/useChainAnchor.js` | `chainMetrics`, `isGenesisSoul`, `fetchChainMetrics()` |
| `app/pages/anchor.vue` | Genesis-Card UI |
| `app/pages/maturity.vue` | Genesis-Chain-Panel |

---

## Verifikation

```
1. anchor_history.json lesen: /var/lib/sys/souls/{id}/anchor_history.json
2. genesis-Eintrag identifizieren (genesis: true)
3. GET /api/soul/chain-metrics aufrufen
4. knowledge_blocks + chain_age_blocks prüfen
5. Polygon: SoulRegistry.getHistory(keccak256(soul_id)) → on-chain Anchors vergleichen
```
