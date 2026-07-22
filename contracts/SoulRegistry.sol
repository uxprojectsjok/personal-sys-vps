// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * SoulRegistry – Plattformunabhängige Echtheitszertifizierung für SaveYourSoul
 *
 * PRINZIP:
 *   Jede echte SYS-Seele kann on-chain verankert werden.
 *   On-chain gespeichert werden ausschließlich Hashes – kein Klartext, kein Name, kein Inhalt.
 *
 * EIGENTUM:
 *   Wer eine Soul zuerst verankert, wird ihr Eigentümer on-chain.
 *   Nur der Eigentümer kann weitere Anker setzen oder das Eigentum transferieren.
 *   Basis für zukünftiges "Seelenverkäufer"-Feature.
 *
 * VERIFIKATION OHNE SYS (in 30 Jahren):
 *   1. soul.md lokal öffnen
 *   2. sha256(soul.md) lokal berechnen
 *   3. keccak256(soul_id) berechnen
 *   4. getHistory(keccak256(soul_id)) aufrufen → Anker-Historie
 *   5. Übereinstimmung mit sha256 = Seele existierte authentisch zu diesem Zeitpunkt
 *
 * DEPLOYMENT:
 *   Polygon Mainnet (chainId: 137) – geringe Gas-Kosten (~$0.01–0.05 pro Anker)
 *   Polygon Amoy Testnet (chainId: 80002) – für Entwicklung kostenlos
 *
 * SECURITY:
 *   - Custom Errors (EIP-838, 0.8.4+): gas-effizient, typsicher
 *   - Rate-Limiting: max. 1 Anker pro soul_id pro Tag (Griefing-Schutz)
 *   - Soul-Eigentum: nur registrierter Eigentümer kann ankern/transferieren
 *   - Pausierbar: Owner kann Contract im Notfall stoppen
 *   - 2-Schritt Ownership-Transfer: verhindert Verlust durch Tippfehler
 *   - call() statt transfer() für ETH-Auszahlungen (EIP-1884-sicher)
 *
 * v1.1.0 ÄNDERUNG GEGENÜBER v1.0.0 (0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B):
 *   - MAX_ANCHORS_PER_SOUL (365, hartes Lifetime-Limit) entfernt.
 *     Grund: der Anchor ist zum Lebenszeichen geworden – ohne regelmäßiges
 *     Anchoring gilt eine Soul als inaktiv/tot. Ein hartes Lifetime-Limit
 *     hätte jede kontinuierlich aktive Soul nach spätestens 365 täglichen
 *     Ankern permanent gesperrt (MaxAnchorsReached, kein Weg zurück ohne
 *     Contract-Redeploy). Das widerspricht dem Liveness-Modell direkt.
 *   - COOLDOWN_SECONDS (1 Tag) bleibt unverändert – reines Anti-Spam/
 *     Gas-Griefing-Limit, kein Lifetime-Cap, kollidiert nicht mit
 *     kontinuierlichem täglichem Anchoring.
 *   - Diese Version verwendet eine eigene, neue Contract-Adresse. Bestehende
 *     Anker-Historie auf v1.0.0 wird NICHT automatisch übernommen – jede
 *     Soul muss auf dieser Adresse neu ankern. Siehe docs/spec/soul-registry-contract.md.
 */
contract SoulRegistry {

    // ── Identität (on-chain, permanent lesbar auf Polygonscan) ───────────────

    string public constant NAME        = "SaveYourSoul";
    string public constant AUTHOR      = "Jan-Oliver Karo";
    string public constant DESCRIPTION = "Soul identity registry for SaveYourSoul";
    string public constant VERSION     = "1.1.0";

    // ── Konstanten ────────────────────────────────────────────────────────────

    uint256 public constant COOLDOWN_SECONDS = 1 days; // Rate-Limit: 1 Anker/Tag/Soul

    // ── Custom Errors (0.8.4+, ~50% günstiger als require-Strings) ────────────

    error NotOwner();
    error NotPendingOwner();
    error ContractPaused();
    error ContractNotPaused();
    error AlreadyPaused();
    error InsufficientFee(uint256 required, uint256 provided);
    error InvalidSoulId();
    error InvalidContentHash();
    error RateLimitExceeded(uint256 nextAllowedAt);
    error InvalidAddress();
    error NothingToWithdraw();
    error WithdrawFailed();
    error NotSoulOwner();          // Caller ist nicht Eigentümer dieser Soul
    error SoulNotRegistered();     // Soul wurde noch nie verankert
    error CannotTransferToSelf();  // Transfer an sich selbst verboten

    // ── Datenstrukturen ───────────────────────────────────────────────────────

    struct Anchor {
        bytes32 contentHash;   // sha256(soul.md) zum Zeitpunkt des Ankerns
        uint256 timestamp;     // block.timestamp (Unix-Sekunden, unveränderlich)
        uint32  sessionCount;  // Anzahl echter SYS-Sessions (informativ)
    }

    // keccak256(soul_id UUID) → Anker-Historie
    mapping(bytes32 => Anchor[]) private anchors;

    // Rate-Limiting: letzter Anker-Zeitstempel pro soul_id
    mapping(bytes32 => uint256) private lastAnchorTime;

    // Soul-Eigentum: wer hat die Soul zuerst verankert / wem gehört sie?
    // Ermöglicht zukünftigen Seelen-Transfer (Seelenverkäufer-Feature)
    mapping(bytes32 => address) public soulOwner;

    uint256 public anchorFee = 0.5 ether; // in POL (ehemals MATIC)
    bool    public paused;                // Default: false

    // ── Ownership (2-Schritt für Sicherheit) ─────────────────────────────────

    address public owner;
    address public pendingOwner;

    // ── Events (vollständig indexed für effizientes Log-Filtering) ────────────

    event Anchored(
        bytes32 indexed soulId,
        bytes32 indexed contentHash,
        uint32          sessionCount,
        uint256         timestamp
    );
    event SoulTransferred(
        bytes32 indexed soulId,
        address indexed from,
        address indexed to
    );
    event FeeUpdated(uint256 newFee);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event OwnershipTransferProposed(address indexed proposed);
    event OwnershipTransferred(address indexed previous, address indexed newOwner);

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ── Öffentliche Funktionen ────────────────────────────────────────────────

    /**
     * @notice Verankert eine Soul on-chain.
     * @dev    Erster Anker: registriert msg.sender als Eigentümer der Soul.
     *         Weitere Anker: nur der registrierte Eigentümer darf ankern.
     *         Rate-Limit: max. 1 Anker pro soul_id pro Tag.
     *         Kein Lifetime-Limit (siehe v1.1.0-Änderung oben) – Anchor ist
     *         ein kontinuierliches Lebenszeichen, nicht ein begrenztes Budget.
     * @param soulId        keccak256(soul_id UUID) – pseudonymer Identifier
     * @param contentHash   sha256(soul.md Vollinhalt) zum Zeitpunkt des Ankerns
     * @param sessionCount  Anzahl echter Sessions aus soul_growth_chain (informativ)
     */
    function anchor(
        bytes32 soulId,
        bytes32 contentHash,
        uint32  sessionCount
    ) external payable whenNotPaused {
        if (msg.value < anchorFee)
            revert InsufficientFee(anchorFee, msg.value);
        if (soulId == bytes32(0))
            revert InvalidSoulId();
        if (contentHash == bytes32(0))
            revert InvalidContentHash();

        uint256 nextAllowed = lastAnchorTime[soulId] + COOLDOWN_SECONDS;
        if (block.timestamp < nextAllowed)
            revert RateLimitExceeded(nextAllowed);

        // Eigentum: erster Anker registriert den Caller als Eigentümer
        if (soulOwner[soulId] == address(0)) {
            soulOwner[soulId] = msg.sender;
        } else if (soulOwner[soulId] != msg.sender) {
            revert NotSoulOwner();
        }

        lastAnchorTime[soulId] = block.timestamp;

        anchors[soulId].push(Anchor({
            contentHash:  contentHash,
            timestamp:    block.timestamp,
            sessionCount: sessionCount
        }));

        emit Anchored(soulId, contentHash, sessionCount, block.timestamp);
    }

    /**
     * @notice Transferiert das Eigentum an einer Soul an eine neue Adresse.
     * @dev    Nur der aktuelle Eigentümer darf transferieren.
     *         Basis für das zukünftige "Seelenverkäufer"-Feature.
     *         Der neue Eigentümer kann danach ankern und weiter transferieren.
     * @param soulId    keccak256(soul_id UUID) der zu transferierenden Soul
     * @param newOwner  Wallet-Adresse des neuen Eigentümers
     */
    function transferSoul(bytes32 soulId, address newOwner) external {
        if (soulOwner[soulId] == address(0)) revert SoulNotRegistered();
        if (soulOwner[soulId] != msg.sender)  revert NotSoulOwner();
        if (newOwner == address(0))            revert InvalidAddress();
        if (newOwner == msg.sender)            revert CannotTransferToSelf();

        address previous    = soulOwner[soulId];
        soulOwner[soulId]   = newOwner;

        emit SoulTransferred(soulId, previous, newOwner);
    }

    /**
     * @notice Prüft ob ein Content-Hash jemals für diese Soul verankert wurde.
     * @dev    Kein Wallet nötig – reine View-Funktion, kostenlos aufrufbar.
     *         Iteriert rückwärts → letzter (neuester) Treffer gewinnt.
     */
    function verify(
        bytes32 soulId,
        bytes32 contentHash
    ) external view returns (
        bool    found,
        uint256 timestamp,
        uint32  sessions
    ) {
        Anchor[] storage list = anchors[soulId];
        for (uint256 i = list.length; i > 0; i--) {
            if (list[i - 1].contentHash == contentHash) {
                return (true, list[i - 1].timestamp, list[i - 1].sessionCount);
            }
        }
        return (false, 0, 0);
    }

    /**
     * @notice Gibt die komplette Anker-Historie einer Soul zurück.
     */
    function getHistory(
        bytes32 soulId
    ) external view returns (Anchor[] memory) {
        return anchors[soulId];
    }

    /**
     * @notice Anzahl der Anker-Einträge für eine Soul.
     */
    function getAnchorCount(bytes32 soulId) external view returns (uint256) {
        return anchors[soulId].length;
    }

    /**
     * @notice Wann darf diese Soul das nächste Mal verankert werden?
     * @return 0 wenn sofort möglich, sonst Unix-Zeitstempel des nächsten erlaubten Ankerns
     */
    function nextAnchorAllowed(bytes32 soulId) external view returns (uint256) {
        uint256 next = lastAnchorTime[soulId] + COOLDOWN_SECONDS;
        return block.timestamp >= next ? 0 : next;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function pause() external onlyOwner {
        if (paused) revert AlreadyPaused();
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        if (!paused) revert ContractNotPaused();
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setFee(uint256 fee) external onlyOwner {
        anchorFee = fee;
        emit FeeUpdated(fee);
    }

    /**
     * @notice Zieht gesammelte Fees ab.
     * @dev    Verwendet call() statt transfer() – EIP-1884-sicher.
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NothingToWithdraw();
        (bool ok, ) = payable(owner).call{value: balance}("");
        if (!ok) revert WithdrawFailed();
    }

    /**
     * @notice 2-Schritt Ownership-Transfer für den Contract-Owner (SYS-Admin).
     *         Nicht zu verwechseln mit transferSoul() für Soul-Eigentümer.
     */
    function proposeOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferProposed(newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, pendingOwner);
        owner        = pendingOwner;
        pendingOwner = address(0);
    }

    /**
     * @dev Direktes POL-Senden ohne Funktionsaufruf wird abgelehnt.
     */
    receive() external payable {
        revert("Use anchor()");
    }
}
