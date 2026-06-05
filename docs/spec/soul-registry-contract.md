# SoulRegistry Contract

**Network:** Polygon Mainnet (chainId: 137)  
**Address:** `0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B`  
**Deployer:** `uxprojects-jok.eth`  
**Deployed:** 2026-04-04  
**Version:** 1.0.0  
**License:** MIT  

---

## Prinzip

Speichert ausschließlich Hashes — kein Klartext, kein Name, kein Inhalt.  
Jede Soul die verankert wird erhält einen kryptografischen Echtheitsbeweis auf der Blockchain.  
App-agnostisch — jede Anwendung kann ankern.

---

## Konstanten

| Name | Wert | Bedeutung |
|------|------|-----------|
| `anchorFee` | 0.5 POL | Gebühr pro Anker (änderbar via `setFee`) |
| `MAX_ANCHORS_PER_SOUL` | 365 | Max. Anker pro Soul gesamt |
| `COOLDOWN_SECONDS` | 1 day | Rate-Limit: 1 Anker pro Soul pro Tag |

---

## Öffentliche Funktionen

### `anchor(soulId, contentHash, sessionCount)` — payable
Verankert eine Soul on-chain.

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `soulId` | `bytes32` | `keccak256(soul_id UUID)` |
| `contentHash` | `bytes32` | `sha256(sys.md Vollinhalt)` |
| `sessionCount` | `uint32` | Anzahl echter Sessions (informativ) |

- Erster Anker: registriert `msg.sender` als Eigentümer der Soul
- Weitere Anker: nur der registrierte Eigentümer darf ankern
- Zahlung: mind. `anchorFee` in POL mitsenden

---

### `verify(soulId, contentHash)` — view
Prüft ob ein Content-Hash jemals für diese Soul verankert wurde.  
Kein Wallet nötig, kostenlos.

**Returns:** `(bool found, uint256 timestamp, uint32 sessions)`

---

### `getHistory(soulId)` — view
Gibt die komplette Anker-Historie einer Soul zurück.  
Kein Wallet nötig, kostenlos.

**Returns:** `Anchor[]` — Array aus `{contentHash, timestamp, sessionCount}`

---

### `getAnchorCount(soulId)` — view
Anzahl der Anker-Einträge für eine Soul.

---

### `nextAnchorAllowed(soulId)` — view
Wann darf diese Soul das nächste Mal verankert werden?  
`0` = sofort möglich, sonst Unix-Timestamp.

---

### `soulOwner(soulId)` — view
Wallet-Adresse des registrierten Eigentümers dieser Soul.

---

### `transferSoul(soulId, newOwner)`
Transferiert das Eigentum an einer Soul.  
Nur der aktuelle Eigentümer darf transferieren.  
Basis für zukünftiges Seelen-Transfer-Feature.

---

## Admin-Funktionen (nur Contract-Owner)

| Funktion | Beschreibung |
|----------|--------------|
| `setFee(fee)` | Anker-Gebühr ändern (in POL wei) |
| `withdraw()` | Gesammelte Fees auszahlen |
| `pause()` | Contract stoppen |
| `unpause()` | Contract wieder aktivieren |
| `proposeOwnership(newOwner)` | 2-Schritt Ownership-Transfer starten |
| `acceptOwnership()` | Ownership-Transfer bestätigen |

---

## Verifikation ohne SYS (in 30 Jahren)

```
1. sys.md lokal öffnen
2. sha256(sys.md) lokal berechnen → contentHash
3. keccak256(soul_id UUID) berechnen → soulId
4. getHistory(soulId) aufrufen
5. Übereinstimmung mit contentHash = Soul existierte authentisch zu diesem Zeitpunkt
```

---

## ABI (minimal)

```json
[
  "function anchor(bytes32 soulId, bytes32 contentHash, uint32 sessionCount) payable",
  "function verify(bytes32 soulId, bytes32 contentHash) view returns (bool found, uint256 timestamp, uint32 sessions)",
  "function getHistory(bytes32 soulId) view returns (tuple(bytes32 contentHash, uint256 timestamp, uint32 sessionCount)[])",
  "function getAnchorCount(bytes32 soulId) view returns (uint256)",
  "function nextAnchorAllowed(bytes32 soulId) view returns (uint256)",
  "function soulOwner(bytes32 soulId) view returns (address)",
  "function transferSoul(bytes32 soulId, address newOwner)",
  "function setFee(uint256 fee)",
  "function withdraw()",
  "function pause()",
  "function unpause()",
  "event Anchored(bytes32 indexed soulId, bytes32 indexed contentHash, uint32 sessionCount, uint256 timestamp)",
  "event SoulTransferred(bytes32 indexed soulId, address indexed from, address indexed to)"
]
```

---

## Explorer

[0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B auf Polygonscan](https://polygonscan.com/address/0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B)
