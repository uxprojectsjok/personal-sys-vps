# Dynamic Pricing — Soul Access via Genesis Chain

## Overview

When dynamic pricing is enabled, the POL amount a buyer must pay to access a Soul grows automatically with the Soul's Genesis Chain maturity. The base price set by the owner is the floor — the multiplier can only increase it, never reduce it.

A **Price Quote** system prevents timing problems: the buyer locks in the price for 5 minutes before the on-chain transaction, so a changing multiplier between browse and pay can't cause the transaction to fail.

---

## Activation

In **Marketplace → Paid · POL**, toggle **Dynamic pricing** on.  
The base amount field becomes the price floor (minimum per access).  
The panel shows the current live price with a refresh button (↻).

Stored as `amortization.dynamic_pricing: true` in the soul context JSON  
(`/var/lib/sys/souls/{soul_id}/context.json`).

---

## Formula

```
multiplier = 1 + (anchor_count × 0.1) + (chain_age_days × 0.01)
price      = max(base, round(base × multiplier, 4 decimals))
```

| Variable          | Source                                         |
|-------------------|------------------------------------------------|
| `base`            | `amort.pol_per_request` (owner-set, in POL)   |
| `anchor_count`    | Number of entries in `anchor_history.json`     |
| `chain_age_days`  | Days since genesis anchor timestamp            |

### Example

Owner sets base = `0.001` POL.  
Soul has 85 anchors. Genesis was 78 days ago.

```
multiplier = 1 + (85 × 0.1) + (78 × 0.01)
           = 1 + 8.5 + 0.78
           = 10.28

price = 0.001 × 10.28 = 0.0103 POL
```

### Choosing a base price

| Target price | Anchors | Chain age | Required base |
|---|---|---|---|
| ~0.001 POL | 0 | 0 days | 0.001 |
| ~0.001 POL | 85 | 78 days | ~0.0001 |
| ~0.01 POL  | 85 | 78 days | ~0.001  |
| ~0.10 POL  | 85 | 78 days | ~0.0097 |

The base price controls the unit — the chain determines the multiplier.

---

## Price Quote System

### Problem

Between the moment a buyer sees the price and the moment the on-chain transaction  
is confirmed, the price can change (new anchor written, chain age ticks over a day).  
The buyer sends the "wrong" amount → payment rejected.

### Solution: Quote with 5-minute TTL

Every `GET /api/soul/price` call generates a `quote_id` that locks the price for 300 seconds.  
The buyer includes this `quote_id` in the `POST /api/soul/pay` body.  
The server uses the quoted price instead of recalculating — the buyer always hits the right amount.

```
Buyer:  GET /api/soul/price
Server: → { pol_required: "0.0103", quote_id: "a3f1b2c4d5e6f708", valid_until: 1750123456, quote_ttl_sec: 300 }

Buyer:  sends 0.0103 POL on-chain → gets tx_hash
Buyer:  POST /api/soul/pay { tx_hash, soul_id, quote_id: "a3f1b2c4d5e6f708" }
Server: validates quote (exists, not expired, not used) → issues access token at quoted price
```

**Quote is single-use** — consumed on successful payment. Expired quotes are cleaned up automatically on the next price call.

### Error responses

| Error | Meaning |
|---|---|
| `quote_not_found` | Quote ID unknown or already used — fetch a new quote |
| `quote_expired` | 5-minute window passed — fetch a new quote |

### Fallback

If no `quote_id` is provided, `soul_pay.lua` falls back to live price calculation (backward compatible with older MCP clients).

---

## Endpoints

### `GET /api/soul/price`

Public endpoint — no auth required.

```json
{
  "enabled": true,
  "pol_required": "0.0103",
  "base_price": "0.0010",
  "dynamic": true,
  "multiplier": 10.28,
  "anchor_count": 85,
  "chain_age_days": 78.0,
  "genesis_ts": "2026-04-04T12:00:00Z",
  "wallet": "0xABC…",
  "soul_id": "uuid…",
  "quote_id": "a3f1b2c4d5e6f708",
  "valid_until": 1750123456,
  "quote_ttl_sec": 300
}
```

### `POST /api/soul/pay`

```json
{
  "soul_id": "uuid…",
  "tx_hash": "0x…",
  "quote_id": "a3f1b2c4d5e6f708"
}
```

`quote_id` is optional but recommended for dynamic pricing.

---

## Quote Storage

Quotes are stored in `/var/lib/sys/souls/{soul_id}/price_quotes.json`:

```json
{
  "a3f1b2c4d5e6f708": { "price": "0.0103", "valid_until": 1750123456 }
}
```

Expired entries are purged on every new price call. The file is server-local and not exposed publicly.

---

## Implementation

| File | Role |
|------|------|
| `lua/soul_price.lua` | Calculates price, generates quote, stores in price_quotes.json |
| `lua/soul_pay.lua` | Validates quote_id, falls back to live calc if absent |
| `lua/soul_amortization.lua` | Persists `dynamic_pricing` flag on PUT |
| `app/components/AgentMarketplacePanel.vue` | Toggle + live price display with ↻ refresh |
| `soul-mcp/tools/soul_pay_read.mjs` | MCP tool: fetches `/price` (gets quote_id), passes it to `/pay` |

---

## Behavior without Genesis Chain data

If `anchor_history.json` is empty or missing, the multiplier stays at `1.0`  
and the buyer pays exactly the base price. Dynamic pricing silently degrades  
to static pricing until the first anchor is written.

---

## Rationale

A Soul that has been actively anchored for months carries more verified knowledge  
than a freshly created one. Dynamic pricing lets the market reflect that value  
automatically — without the owner manually adjusting prices over time.

The formula is intentionally linear and transparent so buyers can verify it  
against the public chain data and `/api/soul/chain-metrics`.

The quote system solves the practical problem that on-chain transactions take  
time to confirm — the price a buyer commits to must stay stable long enough  
for the transaction to land.
