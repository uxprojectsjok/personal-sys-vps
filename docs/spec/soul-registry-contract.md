# SoulRegistry Contract

`SoulRegistry.sol` is the on-chain anchoring contract every SYS node writes to — see [genesis-chain.md](genesis-chain.md) for the concept (Genesis, Chain Age, Knowledge Blocks) and [README: On-Chain Anchoring](../../README.md#on-chain-anchoring) for why every node must use the same contract address.

**Network:** Polygon Mainnet (chainId: 137)
**Address:** `0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B`
**Deployer:** `uxprojects-jok.eth`
**Deployed:** 2026-04-04
**Source verified:** 2026-06-05 (Polygonscan, exact match, v0.8.34)
**Version:** 1.0.0
**License:** MIT

---

## Verification

Function-level verification performed on 2026-06-05:

| Function | Status | Note |
|----------|--------|------|
| `withdraw()` | ✓ | 30.5 POL successfully paid out |
| `pause()` | ✓ | Contract paused |
| `unpause()` | ✓ | Contract reactivated |
| `setFee()` | ✓ | Set to 0.3 POL, reverted to 0.5 POL |
| `anchor()` | ✓ | 62 transactions on-chain, rate limit active |
| `acceptOwnership()` | — | Only relevant after proposeOwnership |
| `transferSoul()` | — | Only needed once the soul-transfer feature ships |

---

## Principle

Stores only hashes — no plaintext, no name, no content.
Every soul that anchors receives a cryptographic proof of authenticity on the blockchain.
App-agnostic — any application can anchor.

---

## Constants

| Name | Value | Meaning |
|------|-------|---------|
| `anchorFee` | 0.5 POL | Fee per anchor (changeable via `setFee`) |
| `MAX_ANCHORS_PER_SOUL` | 365 | Max. total anchors per soul |
| `COOLDOWN_SECONDS` | 1 day | Rate limit: 1 anchor per soul per day |

---

## Public Functions

### `anchor(soulId, contentHash, sessionCount)` — payable
Anchors a soul on-chain.

| Parameter | Type | Description |
|-----------|------|-------------|
| `soulId` | `bytes32` | `keccak256(soul_id UUID)` |
| `contentHash` | `bytes32` | `sha256(full sys.md content)` |
| `sessionCount` | `uint32` | Number of real sessions (informational) |

- First anchor: registers `msg.sender` as the soul's owner
- Subsequent anchors: only the registered owner may anchor
- Payment: at least `anchorFee` in POL must be sent

---

### `verify(soulId, contentHash)` — view
Checks whether a content hash was ever anchored for this soul.
No wallet needed, free.

**Returns:** `(bool found, uint256 timestamp, uint32 sessions)`

---

### `getHistory(soulId)` — view
Returns the complete anchor history of a soul.
No wallet needed, free.

**Returns:** `Anchor[]` — array of `{contentHash, timestamp, sessionCount}`

---

### `getAnchorCount(soulId)` — view
Number of anchor entries for a soul.

---

### `anchorFee()` — view
Current fee (in POL wei) required to call `anchor()`. Read fresh before every anchor call — `setFee()` can change it between transactions, and sending less than the current fee reverts with `InsufficientFee`.

---

### `nextAnchorAllowed(soulId)` — view
When can this soul next be anchored?
`0` = immediately, otherwise a Unix timestamp.

---

### `soulOwner(soulId)` — view
Wallet address of the soul's registered owner.

---

### `transferSoul(soulId, newOwner)`
Transfers ownership of a soul.
Only the current owner may transfer.
Foundation for a future soul-transfer feature.

---

## Admin Functions (contract owner only)

| Function | Description |
|----------|-------------|
| `setFee(fee)` | Change the anchor fee (in POL wei) |
| `withdraw()` | Withdraw collected fees |
| `pause()` | Stop the contract |
| `unpause()` | Reactivate the contract |
| `proposeOwnership(newOwner)` | Start a 2-step ownership transfer |
| `acceptOwnership()` | Confirm an ownership transfer |

> [!NOTE]
> These functions are a centralization point by design, not an oversight: a single owner wallet can change the fee, pause new anchors, or withdraw fees the contract has collected — `withdraw()` only reaches those collected fees, never a soul's own funds. Trusting this contract means trusting the current owner key; the contract's Solidity source isn't part of this repo (verify it directly on [Polygonscan](https://polygonscan.com/address/0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B#code) rather than taking this doc's word for exact pause/withdraw semantics). `proposeOwnership`/`acceptOwnership` exist so the owner key can be rotated or handed off without a contract redeploy.

---

## Custom Errors

| Error | Meaning |
|-------|---------|
| `RateLimitExceeded(nextAllowedAt)` | `anchor()` called before `COOLDOWN_SECONDS` since the last anchor has elapsed |
| `MaxAnchorsReached(max)` | Soul already has `MAX_ANCHORS_PER_SOUL` (365) anchors |
| `NotSoulOwner()` | Caller's wallet is not the soul's registered owner |
| `SoulNotRegistered()` | No genesis anchor exists yet for this `soulId` |
| `InsufficientFee(required, provided)` | `msg.value` sent with `anchor()` is below the current `anchorFee()` |
| `InvalidSoulId()` | `soulId` is zero or malformed |
| `InvalidContentHash()` | `contentHash` is zero or malformed |
| `ContractPaused()` | Contract is currently paused via `pause()` |

---

## Verification Without SYS (in 30 Years)

```
1. Open sys.md locally
2. Compute sha256(sys.md) locally → contentHash
3. Compute keccak256(soul_id UUID) → soulId
4. Call getHistory(soulId)
5. A match against contentHash proves the soul authentically existed at that point in time
```

---

## ABI (minimal)

```json
[
  "function anchor(bytes32 soulId, bytes32 contentHash, uint32 sessionCount) payable",
  "function verify(bytes32 soulId, bytes32 contentHash) view returns (bool found, uint256 timestamp, uint32 sessions)",
  "function getHistory(bytes32 soulId) view returns (tuple(bytes32 contentHash, uint256 timestamp, uint32 sessionCount)[])",
  "function getAnchorCount(bytes32 soulId) view returns (uint256)",
  "function anchorFee() view returns (uint256)",
  "function nextAnchorAllowed(bytes32 soulId) view returns (uint256)",
  "function soulOwner(bytes32 soulId) view returns (address)",
  "function transferSoul(bytes32 soulId, address newOwner)",
  "function setFee(uint256 fee)",
  "function withdraw()",
  "function pause()",
  "function unpause()",
  "event Anchored(bytes32 indexed soulId, bytes32 indexed contentHash, uint32 sessionCount, uint256 timestamp)",
  "event SoulTransferred(bytes32 indexed soulId, address indexed from, address indexed to)",
  "error RateLimitExceeded(uint256 nextAllowedAt)",
  "error MaxAnchorsReached(uint256 max)",
  "error NotSoulOwner()",
  "error SoulNotRegistered()",
  "error InsufficientFee(uint256 required, uint256 provided)",
  "error InvalidSoulId()",
  "error InvalidContentHash()",
  "error ContractPaused()"
]
```

---

## Explorer

[0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B on Polygonscan](https://polygonscan.com/address/0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B)
