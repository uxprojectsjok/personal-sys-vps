# Dynamic Pricing — Soul Access via Genesis Chain

## Overview

When dynamic pricing is enabled, the POL amount a buyer must pay to access a Soul grows automatically with the Soul's Genesis Chain maturity. The base price set by the owner is the floor — the multiplier can only increase it, never reduce it.

---

## Activation

In **Marketplace → Paid · POL**, toggle **Dynamic pricing** on.  
The base amount field becomes the price floor (minimum per access).

Stored as `amortization.dynamic_pricing: true` in the soul context JSON  
(`/var/lib/sys/souls/{soul_id}/context.json`).

---

## Formula

```
price = base × (1 + anchor_count × 0.1 + chain_age_days × 0.01)
price = max(base, round(price, 4 decimals))
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

## Endpoints

### `GET /api/soul/price`

Public endpoint — no auth required. Returns the current price for any buyer.

```json
{
  "soul_id": "abc123…",
  "price": "0.0103",
  "base_price": "0.0010",
  "currency": "POL",
  "dynamic": true,
  "multiplier": 10.28,
  "anchor_count": 85,
  "chain_age_days": 78.0
}
```

### `POST /api/soul/pay`

Initiates a payment session. The buyer pays the amount returned by `/price`.  
If `dynamic_pricing` is enabled, the price is recalculated at payment time from  
the current state of `anchor_history.json` — not from the value shown at browse time.

---

## Implementation

| File | Role |
|------|------|
| `lua/soul_price.lua` | `GET /api/soul/price` — reads anchor_history, calculates price |
| `lua/soul_pay.lua` | `POST /api/soul/pay` — same formula at transaction time |
| `lua/soul_amortization.lua` | Persists `dynamic_pricing` flag on PUT |
| `app/components/AgentMarketplacePanel.vue` | UI toggle |
| `soul-mcp/tools/soul_pay_read.mjs` | MCP tool: fetches `/price` first, shows buyer the current amount |

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
