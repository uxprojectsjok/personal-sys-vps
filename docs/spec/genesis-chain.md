# Genesis Chain

Every blockchain anchor on Polygon is a knowledge snapshot of a soul.
The first anchor is called **Genesis** — as in blockchain tradition.
As anchors accumulate and the soul grows, the **Knowledge Blocks** value rises — an economically relevant maturity weight.

---

## Concept

| Term | Meaning |
|------|---------|
| **Genesis** | First anchor of a soul on Polygon — immutable starting point |
| **Chain Age** | Number of Polygon blocks since Genesis (≈ 2 blocks/sec) |
| **Knowledge Blocks** | Weighted knowledge value: size × age of each anchor |
| **Anchor** | An `anchor()` call on `SoulRegistry.sol` with sha256(sys.md) |

Only hashes are stored on-chain — no plaintext, no content.
The blockchain prevents forgery: every anchor is timestamped and immutable.
Full contract spec — functions, constants, custom errors, ABI: [soul-registry-contract.md](soul-registry-contract.md).

---

## Data Fields in sys.md

```yaml
soul_chain_anchor: '{"tx":"0x...","block":83500000,"ts":"2026-04-04T12:00:00Z","sessions":12}'
soul_anchor_history: '[{"tx":"0x...","ts":"2026-04-04T12:00:00Z","size":42000,"genesis":true},...]'
```

| Field | Description |
|-------|-------------|
| `soul_chain_anchor` | Latest anchor (JSON, inline) |
| `soul_anchor_history` | All anchors (JSON array, inline) |

`soul_anchor_history` holds every anchor as an array, oldest first:

```json
[
  {
    "tx":      "0xabc123...",
    "ts":      "2026-04-04T12:00:00Z",
    "size":    42000,
    "block":   83500000,
    "genesis": true
  },
  {
    "tx":    "0xdef456...",
    "ts":    "2026-04-18T09:15:00Z",
    "size":  44500,
    "block": 83521200
  },
  {
    "tx":    "0x789abc...",
    "ts":    "2026-06-21T17:42:00Z",
    "size":  51200,
    "block": 83612800
  }
]
```

`genesis: true` is set automatically on the first entry only — when `soul_anchor_history` is empty at write time. Every later entry omits the field entirely (not `false`, simply absent).
`block` is optional — populated client-side from the transaction receipt, estimated server-side if missing.

---

## Server File

```
/var/lib/sys/souls/{soul_id}/anchor_history.json
```

Plaintext copy of `soul_anchor_history` — updated on every `POST /api/soul/register-anchor`.
Read by `soul_chain_metrics_cli.mjs` (via Lua `io.popen()`).

---

## Knowledge Blocks Formula

```
KB = Σ ( size_kb × ( 1 + log₁₀( 1 + age_blocks / 43200 ) ) )
```

- `size_kb` — soul size in KB at the time of anchoring
- `age_blocks` — `current_block − anchor_block`
- `43200` — Polygon blocks per half day (≈ 6h)
- Older anchors weigh more, larger anchors weigh more
- Result is rounded to an integer

**Example:** 42 KB soul, Genesis 112,000 blocks ago (~0.65 days)

```
age_weight = 1 + log₁₀(1 + 112000 / 43200) = 1 + log₁₀(3.59) ≈ 1.555
KB = 42 × 1.555 ≈ 65
```

---

## Block Estimation

If `block` is missing from an anchor entry, it is estimated:

```js
DEPLOY_BLOCK = 83_500_000        // 2026-04-04T00:00:00Z
DEPLOY_TS    = 1_775_260_800     // Unix

estimatedBlock = DEPLOY_BLOCK + (anchor_unix_ts - DEPLOY_TS) * 2
```

Polygon produces ≈ 2 blocks/sec → the estimate is accurate to the second.

---

## API Endpoint

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
  "chain_age_human":  "16 hours",
  "anchor_count":     3,
  "knowledge_blocks": 261
}
```

**Lua:** `lua/soul_chain_metrics.lua` — calls `soul_chain_metrics_cli.mjs` via `io.popen()`.
**Dev:** `server/api/soul/chain-metrics.get.js` — calls `getChainMetrics()` from `blockchain.mjs` directly.

---

## Register Anchor

### `POST /api/soul/register-anchor`

Existing endpoint, extended with:

```json
{
  "tx_hash":      "0x...",
  "block_number": 83500000,
  "soul_size":    42000,
  "date":         "2026-04-04",
  "sessions":     12
}
```

Writes `anchor_history.json` on the server and sets `genesis: true` on the first entry.

---

## MCP Tools

### `soul_chain_metrics`

A dedicated, lightweight tool — no full maturity report needed.

```
soul_chain_metrics()
→ { genesis, chain_age, knowledge_blocks, anchor_count, current_block, is_genesis_soul }
```

### `soul_maturity`

Includes `breakdown.detail.chain_metrics` — all chain metrics as part of the maturity report.

---

## UI

| Page | What is shown |
|------|---------------|
| `anchor.vue` | Golden Genesis card with chain age, knowledge blocks, anchor count |
| `maturity.vue` | Genesis Chain panel below the 6 stat cards |

Both components use `useChainAnchor.js` → `fetchChainMetrics()` and only render the section when `anchor_count > 0`.

---

## Implementation Files

| File | Description |
|------|-------------|
| `soul-mcp/lib/blockchain.mjs` | `getCurrentBlock()`, `calcKnowledgeBlocks()`, `getChainMetrics()` |
| `soul-mcp/soul_chain_metrics_cli.mjs` | Node.js CLI for the Lua call |
| `soul-mcp/tools/soul_chain_metrics.mjs` | MCP tool |
| `lua/soul_chain_metrics.lua` | Lua endpoint |
| `lua/soul_register_anchor.lua` | Extended: `block_number`, `soul_size`, `anchor_history.json` |
| `server/api/soul/chain-metrics.get.js` | Dev mirror |
| `server/api/soul/register-anchor.post.js` | Dev mirror, extended |
| `app/composables/useChainAnchor.js` | `chainMetrics`, `isGenesisSoul`, `fetchChainMetrics()` |
| `app/pages/anchor.vue` | Genesis card UI |
| `app/pages/maturity.vue` | Genesis Chain panel |

---

## Verification

```
1. Read anchor_history.json: /var/lib/sys/souls/{id}/anchor_history.json
2. Identify the genesis entry (genesis: true)
3. Call GET /api/soul/chain-metrics
4. Check knowledge_blocks + chain_age_blocks
5. Polygon: SoulRegistry.getHistory(keccak256(soul_id)) → compare against on-chain anchors
```
