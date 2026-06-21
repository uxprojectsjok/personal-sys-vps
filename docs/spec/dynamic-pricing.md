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
multiplier = 1 + (anchor_count × 0.1) + (chain_age_days × 0.01) + (buyers_30d × 0.05)
price      = max(base, round(base × multiplier, 4 decimals))
```

| Variable          | Source                                                          |
|-------------------|-----------------------------------------------------------------|
| `base`            | `amort.pol_per_request` (owner-set, in POL)                    |
| `anchor_count`    | Number of entries in `anchor_history.json`                      |
| `chain_age_days`  | Days since genesis anchor timestamp                             |
| `buyers_30d`      | Unique paid token issuances in the last 30 days (`demand_log.json`) |

### Example

Owner sets base = `0.001` POL.  
Soul has 85 anchors. Genesis was 78 days ago. 4 buyers in the last 30 days.

```
multiplier = 1 + (85 × 0.1) + (78 × 0.01) + (4 × 0.05)
           = 1 + 8.5 + 0.78 + 0.20
           = 10.48

price = 0.001 × 10.48 = 0.0105 POL
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
  "pol_required": "0.0105",
  "base_price": "0.0010",
  "dynamic": true,
  "multiplier": 10.48,
  "anchor_count": 85,
  "chain_age_days": 78.0,
  "buyers_30d": 4,
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

## Demand-Based Pricing

### Problem

A Soul that is actively used by many buyers is more valuable than one that has never been accessed. The chain age and anchor count reflect *maturity* — but not *current demand*. A freshly viral Soul should command a higher price even before it accumulates many anchors.

### Solution: buyers_30d

Every time a buyer successfully receives a `pol_access_token` via `POST /api/soul/pay`, a timestamped entry is appended to `demand_log.json`:

```json
[
  { "ts": 1750000000, "tx": "0xabc..." },
  { "ts": 1750086400, "tx": "0xdef..." }
]
```

`GET /api/soul/price` counts entries where `ts > now − 30 days` → `buyers_30d`.  
Each additional buyer in the window adds **5%** to the multiplier (`DEMAND_COEFF = 0.05`).

Entries older than 30 days are purged automatically when the demand log is next written.

### Demand Log Storage

```
/var/lib/sys/souls/{soul_id}/demand_log.json
```

- Written by `soul_pay.lua` on every successful token issuance
- Read by `soul_price.lua` on every price call
- Entries older than 30 days are pruned on write (no separate cleanup job)
- Not exposed publicly; included in `buyers_30d` field of `/api/soul/price` response

### Effect

| buyers_30d | Demand contribution |
|---|---|
| 0 | +0.00 (no signal yet) |
| 1 | +0.05 |
| 5 | +0.25 |
| 10 | +0.50 |
| 20 | +1.00 |

Combined with anchor and age factors, a high-demand Soul with a mature chain can command multiples of its base price automatically.

---

## Pricing Protocol Constants

The formula coefficients are **protocol constants** — every node running the same SYS version uses the same values. The source of truth is a single file:

```
shared/constants/pricing.js        ← edit here
shared/constants/pricing_params.json  ← generated, committed, deployed to server
/var/lib/sys/config/pricing_params.json  ← runtime location (Lua reads this)
```

Current coefficients:

| Constant | Value | Effect |
|---|---|---|
| `ANCHOR_COEFF` | 0.1 | +10% per Polygon anchor |
| `AGE_COEFF` | 0.01 | +1% per day of chain age |
| `DEMAND_COEFF` | 0.05 | +5% per buyer in last 30 days |
| `QUOTE_TTL_SEC` | 300 | Price lock valid for 5 minutes |

To update coefficients:
1. Edit `shared/constants/pricing.js`
2. Run `node utils/gen-pricing-params.mjs` → regenerates JSON
3. Commit both files → all nodes update on next `git pull` / `init.sh`

`init.sh` copies `pricing_params.json` to `/var/lib/sys/config/` on every install.  
Lua falls back to hardcoded v1 defaults if the file is missing.

**Phase 2 (future):** When `SoulRegistry.sol` is next upgraded, bake these coefficients  
into the contract so they are on-chain verifiable without a software update.

---

## Implementation

| File | Role |
|------|------|
| `shared/constants/pricing.js` | Source of truth — coefficients and TTL |
| `shared/constants/pricing_params.json` | Generated JSON, committed to repo |
| `utils/gen-pricing-params.mjs` | Regenerates JSON from JS constants |
| `lua/soul_price.lua` | Reads pricing_params.json + demand_log.json, calculates price, generates quote |
| `lua/soul_pay.lua` | Reads pricing_params.json, validates quote_id, writes demand_log.json |
| `lua/soul_amortization.lua` | Persists `dynamic_pricing` flag on PUT |
| `app/components/AgentMarketplacePanel.vue` | Toggle + live price display |
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
