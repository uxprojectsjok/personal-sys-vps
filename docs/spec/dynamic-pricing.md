# Dynamic Pricing — Soul Access via Genesis Chain

## Overview

When dynamic pricing is enabled, the USDC amount a buyer must pay to access a Soul grows automatically with the Soul's Genesis Chain maturity. The base price set by the owner is the floor — the multiplier can only increase it, never reduce it.

Payment settles via **x402** (USDC on Polygon). There is no price-quote/TTL system: `soul_pay_x402.lua` computes the price fresh, server-side, at the moment of each 402 challenge and again when verifying the signed retry — no stale quote can ever be paid, so there's nothing to lock in advance.

---

## Activation

In **Marketplace → Paid · x402**, toggle **Dynamic pricing** on.
The base amount field (`price_usdc`) becomes the price floor (minimum per access).
The panel shows the current live price with a refresh button (↻), fetched from `GET /api/soul/price`.

Stored as `amortization.dynamic_pricing: true` in the soul context JSON
(`/var/lib/sys/souls/{soul_id}/api_context.json`).

---

## Formula

```
multiplier = 1 + (anchor_count × 0.1) + (chain_age_days × 0.01) + (buyers_30d × 0.05)
price      = max(base, round(base × multiplier, 6 decimals))
```

| Variable          | Source                                                          |
|-------------------|-----------------------------------------------------------------|
| `base`            | `amort.price_usdc` (owner-set, in USDC)                        |
| `anchor_count`    | Number of entries in `anchor_history.json`                      |
| `chain_age_days`  | Days since genesis anchor timestamp                             |
| `buyers_30d`      | Unique paid token issuances in the last 30 days (`demand_log.json`) |

### Example

Owner sets base = `0.05` USDC.
Soul has 85 anchors. Genesis was 78 days ago. 4 buyers in the last 30 days.

```
multiplier = 1 + (85 × 0.1) + (78 × 0.01) + (4 × 0.05)
           = 1 + 8.5 + 0.78 + 0.20
           = 10.48

price = 0.05 × 10.48 = 0.524000 USDC
```

The base price controls the unit — the chain determines the multiplier.

---

## Payment Flow (x402, no quote system)

### Why no quote/TTL system

The formula only changes over the course of hours/days (a new anchor, a day ticking over, a new buyer in the 30-day window) — never mid-request. `soul_pay_x402.lua` recomputes the price at 402-challenge time and again when verifying the buyer's signed authorization; both happen within the same short request, so there is no timing window for the price to drift between "buyer sees the price" and "buyer's signed authorization is checked." This replaces the older POL-era 5-minute quote-lock system, which existed to bridge the (much longer) time an on-chain transaction takes to confirm — x402's off-chain-signature-then-facilitator-settle model doesn't have that gap.

### Flow

```
Buyer:  POST /api/soul/pay/x402  (no payment proof)
Server: computes price fresh (see formula above)
        → 402 + PAYMENT-REQUIRED header (scheme, network, asset, amount, payTo)

Buyer:  signs an EIP-3009 transferWithAuthorization (EIP-712) for that amount
        → retries with PAYMENT-SIGNATURE header

Server: recomputes price fresh, checks it matches the signed amount
        → verifies + settles via the Polygon x402 facilitator (x402.polygon.technology)
        → appends to demand_log.json, usdc_earnings.json
        → issues access_token
```

---

## Demand-Based Pricing

### Problem

A Soul that is actively used by many buyers is more valuable than one that has never been accessed. The chain age and anchor count reflect *maturity* — but not *current demand*. A freshly viral Soul should command a higher price even before it accumulates many anchors.

### Solution: buyers_30d

Every time a buyer successfully receives an access token via `POST /api/soul/pay/x402`, a timestamped entry is appended to `demand_log.json`:

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

- Written by `soul_pay_x402.lua` on every successful token issuance
- Read by `soul_price.lua` (live-preview endpoint) and `soul_pay_x402.lua` (enforcement) on every price calculation
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

## Endpoints

### `GET /api/soul/price`

Public endpoint — no auth required. Currency-agnostic pricing *factors* for the Marketplace live-preview UI. This endpoint does not carry enforcement weight — `soul_pay_x402.lua` always recomputes the price itself server-side at payment time; nothing here is trusted blindly.

```json
{
  "enabled": true,
  "dynamic": true,
  "multiplier": 10.48,
  "wallet": "0xABC…",
  "token_duration": "1d",
  "anchor_count": 85,
  "chain_age_days": 78.0,
  "buyers_30d": 4,
  "genesis_ts": "2026-04-04T12:00:00Z",
  "soul_id": "uuid…"
}
```

### `POST /api/soul/pay/x402`

Standard x402 handshake — no SYS-specific request body. First call (no `PAYMENT-SIGNATURE` header) returns `402` with a `PAYMENT-REQUIRED` header describing `scheme`, `network` (`eip155:137`), `asset` (USDC contract), `amount`, and `payTo`. Retry with a `PAYMENT-SIGNATURE` header (signed EIP-3009 authorization) to receive an `access_token`.

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
| `shared/constants/pricing.js` | Source of truth — coefficients |
| `shared/constants/pricing_params.json` | Generated JSON, committed to repo |
| `utils/gen-pricing-params.mjs` | Regenerates JSON from JS constants |
| `lua/soul_price.lua` | Reads pricing_params.json + demand_log.json, returns pricing factors for the live-preview UI |
| `lua/soul_pay_x402.lua` | Reads pricing_params.json, computes price fresh at 402-challenge and retry time, writes demand_log.json + usdc_earnings.json |
| `lua/soul_amortization.lua` | Persists `dynamic_pricing` flag + `price_usdc` on PUT |
| `app/components/AgentMarketplacePanel.vue` | Toggle + live price display |

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

## History

Before x402 was added, the sole payment rail was a direct POL transfer on Polygon (`soul_pay.lua`, retired). That flow needed a 5-minute price-quote/TTL system (`quote_id`, `price_quotes.json`) to bridge the time an on-chain transaction takes to confirm — a buyer's on-chain amount had to match a price that was possibly minutes old. x402's signature-then-facilitator-settle model closes that gap (the server recomputes and checks the price within a single request), so the quote system was removed rather than ported.
