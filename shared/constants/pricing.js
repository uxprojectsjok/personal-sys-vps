/**
 * SYS Pricing Protocol — v1
 *
 * Source of truth for the dynamic pricing formula.
 * All nodes running the same protocol version use these coefficients.
 *
 * Formula:  price = base × (1 + anchor_count × ANCHOR_COEFF + chain_age_days × AGE_COEFF + buyers_30d × DEMAND_COEFF)
 *           price = max(base, round(price, 4 decimals))
 *
 * To change coefficients: update here + run `node utils/gen-pricing-params.mjs` + commit both files.
 * When SoulRegistry.sol is next upgraded, bake these values into the contract (Phase 2).
 */

export const PRICING_VERSION = 1

/** Weight per Polygon anchor (adds 10% per anchor to the multiplier) */
export const ANCHOR_COEFF = 0.1

/** Weight per day of chain age (adds 1% per day to the multiplier) */
export const AGE_COEFF = 0.01

/** Weight per unique buyer in last 30 days (adds 5% per buyer to the multiplier) */
export const DEMAND_COEFF = 0.05

/** Quote TTL in seconds — how long a price lock stays valid */
export const QUOTE_TTL_SEC = 300

export default { version: PRICING_VERSION, anchor_coeff: ANCHOR_COEFF, age_coeff: AGE_COEFF, demand_coeff: DEMAND_COEFF, quote_ttl_sec: QUOTE_TTL_SEC }
