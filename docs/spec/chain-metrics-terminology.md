# Chain Metrics Terminology

Naming/unit proposal for `/api/soul/chain-metrics` and everything built on it (`soul_chain_metrics`, `soul_maturity`'s chain breakdown, `anchor.vue`, `maturity.vue`). Decided 2026-08-15, before further maturity logic or UI gets built on top of the current, misleading field.

---

## Status

Proposal only — not yet implemented. Backend (`lib/blockchain.mjs`'s `getChainMetrics()`/`calcKnowledgeBlocks()`) and frontend (`anchor.vue`, `maturity.vue`) both still use the old naming/layout described below as "current."

---

## The problem

Two separate issues found while debugging a live discrepancy (KRO's `soul_chain_metrics` wrongly reporting `anchor_count: 0`, see the soul_id-fallback bug fix, same day):

1. **Chain age is currently displayed with the wrong quantity as primary.** `anchor.vue`/`maturity.vue` show `chain_age_blocks` (e.g. "1,370,590") as the large headline number, with `chain_age_human` ("~24 Tage") as small subtext.
2. **"Knowledge Blocks" implies something it isn't.** The field name and label suggest a *count* of discrete knowledge units. It's actually a continuous, weighted score.

## Why chain age should lead with days, not blocks

`chain_age_blocks` is `currentBlock - genesisBlock` — a raw on-chain difference. `chain_age_days` is *derived* from it via a **live-calibrated** conversion rate (`blocksPerDay`, computed from actual elapsed time vs. actual block progress since a fixed deploy reference — see `estimateBlock()`/`getChainMetrics()` in `lib/blockchain.mjs`). That calibration exists specifically because Polygon's block time isn't assumed constant.

Consequence: block count is the *less* stable quantity, not the more stable one. Two identical real-world durations can produce different block counts if Polygon's block production rate shifts in between (this has happened historically on Polygon PoS). Days, by construction, stay meaningful across that. The one real advantage blocks have is **independent verifiability** — "genesis block N, current block M" is a raw on-chain fact anyone can check against a block explorer without trusting our conversion code; "23.8 days" requires trusting our own calibration.

**Decision:** lead with days (semantic age), keep blocks as a secondary, explicitly-labeled "on-chain proof" — not the other way around.

## Why "Knowledge Blocks" is the more important fix

`calcKnowledgeBlocks()` (`lib/blockchain.mjs`):
```js
const ageWeight = 1 + Math.log10(1 + ageBlocks / BLOCKS_PER_HALF_DAY);
const sizeKb = (anchor.size ?? 0) / 1024;
return sum + sizeKb * ageWeight;
```
This sums `size_in_KB × ageWeight` across every anchor. `ageWeight` is a **dimensionless** multiplier (a slow-growing log factor, not a duration) — so the result's actual unit is *weighted kilobytes*, not "blocks" of anything, and not literally "KB·age" either (that would wrongly imply multiplying two dimensioned quantities; age here contributes only a unitless weight). Calling the result "196 Knowledge Blocks" reads as "196 discrete knowledge units," which is factually wrong — it's one continuous number that happens to scale with both how much content was anchored and how long ago.

**Decision:** rename away from "Blocks." Chosen: **"Knowledge Score"**, documented explicitly as an age-weighted KB value, not a count.

---

## Proposed terminology

| Concept | Current | Proposed | Notes |
|---|---|---|---|
| Semantic chain age | `chain_age_blocks` shown primary, `chain_age_human` as subtext | **`chain_age_days`** primary ("23.8 days") | Already computed today (`chain_age_days`), just needs to lead |
| On-chain proof | (implicitly primary via `chain_age_blocks`) | **`chain_age_blocks`**, labeled "On-chain Proof" / "Polygon Blocks", secondary | Same number, reframed as a receipt, not the headline |
| Anchor count | `anchor_count` | unchanged | Already an honest count, no issue |
| Weighted knowledge value | `knowledge_blocks` ("Knowledge Blocks") | **`knowledge_score`** ("Knowledge Score") | Same computation, renamed field + label; explicitly documented as age-weighted KB, not a count |

Example display, before/after:
```
Before                              After
Chain Age    1,370,590 Blocks       Chain Age       23.8 days
             ~24 Tage               On-chain Proof  1,370,590 Polygon Blocks
Knowledge    196 KB+                Knowledge Score 196  (age-weighted KB — see tooltip)
Anchors      5                      Anchors         5
```

---

## Scope if implemented

- `soul-mcp/lib/blockchain.mjs`: `getChainMetrics()` return shape — add/rename `knowledge_score` (keep `knowledge_blocks` as a deprecated alias for one release cycle if external consumers might read the raw JSON directly, or do a clean break since this is a young, internal-only field — TBD at implementation time).
- `soul-mcp/tools/soul_chain_metrics.mjs`, `soul-mcp/tools/soul_maturity.mjs`: pass the field through under the new name.
- `app/pages/anchor.vue`, `app/pages/maturity.vue`: swap which number is visually primary (days vs. blocks), relabel the knowledge metric, update i18n strings (`anchor.chain_age_label` and friends).
- Not a breaking change to `soul_maturity`'s actual **score** — this is presentation/naming only, the maturity scoring math (`herkunft`, `tiefe`, etc.) doesn't reference `knowledge_blocks` at all.

## Design Decisions

| Decision | Chosen | Rejected | Reason |
|---|---|---|---|
| Chain age primary unit | Days, blocks as secondary proof | Blocks primary (first instinct, reversed after reviewing the calibration code) | Block count depends on Polygon's block-time calibration; days is the more stable semantic quantity, blocks the more independently-verifiable one — different jobs, days wins as the headline |
| Knowledge metric unit label | "Knowledge Score" (age-weighted KB, documented) | "KB·age" as a formal unit | `ageWeight` is dimensionless (a log-scaled multiplier), not a duration — "KB·age" implies multiplying two dimensioned quantities, which isn't what the math does. "Score" avoids a false unit claim. |
| Knowledge metric unit label (2) | Rename away from "Blocks" entirely | Keep "Knowledge Blocks", just explain it better | The name itself is the problem — it reads as a count no matter how it's footnoted; renaming removes the false impression at the source |
