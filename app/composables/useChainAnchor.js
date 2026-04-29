// app/composables/useChainAnchor.js
// Polygon-Blockchain-Anker für Soul-Echtheitszertifikate
//
// Wallet: Reown AppKit (WalletConnect v2) – Desktop + Mobile
// Kein window.ethereum nötig – funktioniert mit MetaMask Mobile, Rainbow, Coinbase, ...

import { ref, computed, onMounted, onUnmounted } from "vue";
import {
  BrowserProvider,
  JsonRpcProvider,
  Contract,
  keccak256,
  toUtf8Bytes,
} from "ethers";
import { createAppKit } from "@reown/appkit";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { polygon, polygonAmoy } from "@reown/appkit/networks";
import { updateFrontmatterField } from "#shared/utils/soulParser.js";
import { useSoul } from "./useSoul.js";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  KONFIGURATION                                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// Native-Token: Polygon hat MATIC → POL umbenannt (seit Oktober 2024, gilt auch auf Amoy)
const POL = { name: "POL", symbol: "POL", decimals: 18 };

const NETWORKS = {
  amoy: {
    chainId: 80002n,
    chainIdHex: "0x13882",
    rpc: "https://rpc-amoy.polygon.technology",
    explorer: "https://amoy.polygonscan.com",
    name: "Polygon Amoy Testnet",
    nativeCurrency: POL,
    appKitNetwork: polygonAmoy,
  },
  main: {
    chainId: 137n,
    chainIdHex: "0x89",
    rpc: "https://polygon-bor-rpc.publicnode.com",
    explorer: "https://polygonscan.com",
    name: "Polygon Mainnet",
    nativeCurrency: POL,
    appKitNetwork: polygon,
  },
};

// ▼ HIER wechseln: "amoy" (Test) ↔ "main" (Production)
const ACTIVE_NETWORK = NETWORKS.main;

// SoulRegistry v1.0.0 – Polygon Mainnet – deployed 2026-04-04
const CONTRACT_ADDRESS = "0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B";

const POLYGON_RPC = ACTIVE_NETWORK.rpc;

// Mehrere öffentliche RPCs – race() nimmt den schnellsten
const POLYGON_RPCS_MAIN = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://rpc.ankr.com/polygon",
];
const POLYGON_RPCS_AMOY = [
  "https://rpc-amoy.polygon.technology",
];
const READ_RPCS = ACTIVE_NETWORK.chainId === 137n ? POLYGON_RPCS_MAIN : POLYGON_RPCS_AMOY;

const ANCHOR_FEE_WEI = 500_000_000_000_000_000n;

const ABI = [
  "function anchor(bytes32 soulId, bytes32 contentHash, uint32 sessionCount) payable",
  "function transferSoul(bytes32 soulId, address newOwner)",
  "function verify(bytes32 soulId, bytes32 contentHash) view returns (bool found, uint256 timestamp, uint32 sessions)",
  "function getHistory(bytes32 soulId) view returns (tuple(bytes32 contentHash, uint256 timestamp, uint32 sessionCount)[])",
  "function nextAnchorAllowed(bytes32 soulId) view returns (uint256)",
  "function soulOwner(bytes32 soulId) view returns (address)",
  "function anchorFee() view returns (uint256)",
  "event Anchored(bytes32 indexed soulId, bytes32 indexed contentHash, uint32 sessionCount, uint256 timestamp)",
  "event SoulTransferred(bytes32 indexed soulId, address indexed from, address indexed to)",
  "error RateLimitExceeded(uint256 nextAllowedAt)",
  "error MaxAnchorsReached(uint256 max)",
  "error NotSoulOwner()",
  "error SoulNotRegistered()",
  "error InsufficientFee(uint256 required, uint256 provided)",
  "error InvalidSoulId()",
  "error InvalidContentHash()",
  "error ContractPaused()",
];

// ── Fehler-Parser ─────────────────────────────────────────────────────────
// Wandelt rohe ethers/EIP-1193 Fehler in klare deutsche Nutzertexte um.
// WICHTIG: Contract Custom-Errors VOR INSUFFICIENT_FUNDS prüfen –
// Mobile Wallets (MetaMask) liefern bei Reverts oft "insufficient funds"
// als generischen Fehler, auch wenn der echte Grund ein Rate-Limit ist.
function parseContractError(e, context = "") {
  // ① User hat in der Wallet abgelehnt
  if (
    e.code === 4001 ||
    e.code === "ACTION_REJECTED" ||
    e.info?.error?.code === 4001 ||
    /user (rejected|denied)/i.test(e.message ?? "")
  ) {
    return "Abgebrochen – du hast die Transaktion in der Wallet abgelehnt.";
  }

  // ② Contract Custom-Errors (VOR INSUFFICIENT_FUNDS – Mobile gibt sonst falschen Fehler)
  const name = e.revert?.name ?? e.errorName ?? e.data?.errorName;
  if (name === "RateLimitExceeded") {
    const ts = Number(e.revert?.args?.[0] ?? e.errorArgs?.[0] ?? 0);
    if (ts) {
      const diffMs = ts * 1000 - Date.now();
      const diffH = Math.max(0, Math.ceil(diffMs / 3_600_000));
      const diffMin = Math.max(0, Math.ceil(diffMs / 60_000));
      const until = new Date(ts * 1000).toLocaleString("de-DE");
      const left = diffH >= 1 ? `noch ${diffH} Std.` : `noch ${diffMin} Min.`;
      return `Rate-Limit (${left}) – nächster Anker möglich: ${until}`;
    }
    return "Rate-Limit aktiv – bitte etwas später erneut versuchen.";
  }
  if (name === "NotSoulOwner") {
    return "Diese Wallet ist nicht der eingetragene Eigentümer dieser Soul. Richtige Wallet verbinden?";
  }
  if (name === "MaxAnchorsReached") {
    return "Maximale Ankeranzahl (365) für dieses Jahr erreicht.";
  }
  if (name === "InsufficientFee") {
    const req = e.revert?.args?.[0] ?? e.errorArgs?.[0];
    return `Fee zu gering${req ? ` (erwartet: ${(Number(req) / 1e18).toFixed(4)} POL)` : ""}. Seite neu laden und erneut versuchen.`;
  }
  if (name === "ContractPaused") {
    return "Smart Contract ist derzeit pausiert – bitte später erneut versuchen.";
  }
  if (name === "SoulNotRegistered") {
    return "Diese Soul-ID ist noch nicht on-chain registriert. Bitte zuerst verankern.";
  }
  if (name === "InvalidSoulId" || name === "InvalidContentHash") {
    return "Interne Daten ungültig – Soul neu laden (F5) und erneut versuchen.";
  }

  // ④ CALL_EXCEPTION / missing revert data
  // Polygon Amoy RPC gibt oft keine revert-data zurück → Custom-Error nicht dekodierbar.
  // Häufigste Ursache auf Amoy: RPC-Instabilität des Testnets.
  if (
    e.code === "CALL_EXCEPTION" ||
    /missing revert data/i.test(e.message ?? "")
  ) {
    return (
      "Polygon Amoy hat die Transaktion ohne Fehlerdetail abgelehnt.\n" +
      "Wahrscheinlichste Ursache: RPC-Instabilität des Testnets → 1–2 Min. warten und erneut versuchen.\n" +
      "Weitere mögliche Ursachen:\n" +
      "→ Zu wenig POL (mind. 0,5 POL + Gas)\n" +
      "→ Rate-Limit (24h) noch nicht abgelaufen – 'Echtheit verifizieren' zeigt den Anker-Status"
    );
  }

  // ④b Nicht genug POL/Gas – erst HIER prüfen, NACHDEM Custom-Errors ausgeschlossen wurden
  // (Mobile Wallets kodieren Reverts manchmal als "insufficient funds")
  if (
    e.code === "INSUFFICIENT_FUNDS" ||
    /insufficient funds/i.test(e.message ?? "")
  ) {
    return (
      `Nicht genug POL auf ${ACTIVE_NETWORK.name}.\n` +
      "Mindestens 0,5 POL + Gas-Gebühr erforderlich. Bitte Konto aufladen."
    );
  }

  // ⑤ Netzwerk / Timeout
  if (
    /could not detect network|network changed|timeout|TIMEOUT/i.test(
      e.message ?? "",
    )
  ) {
    return (
      "Netzwerkfehler nach Chain-Wechsel.\n" +
      "→ Wallet trennen → Seite neu laden → erneut verbinden."
    );
  }

  // ⑥ Fallback – roh, aber begrenzt
  const raw = e.shortMessage ?? e.reason ?? e.message ?? "Unbekannter Fehler";
  return (
    (raw.length > 220 ? raw.slice(0, 220) + "…" : raw) +
    (context ? ` [${context}]` : "")
  );
}

// ── AppKit Singleton ───────────────────────────────────────────────────────
// Wird beim ersten connectWallet()-Aufruf initialisiert (client-only)
let _appKit = null;

function getOrInitAppKit(projectId) {
  if (_appKit) return _appKit;
  if (typeof window === "undefined") return null;
  _appKit = createAppKit({
    adapters: [new EthersAdapter()],
    networks: [ACTIVE_NETWORK.appKitNetwork],
    defaultNetwork: ACTIVE_NETWORK.appKitNetwork,
    projectId,
    metadata: {
      name: "SaveYourSoul",
      description: "Eine KI, die wirklich weiß, wer du bist.",
      url: window.location.origin,
      icons: [window.location.origin + "/logo.png"],
    },
    features: {
      email: false,
      socials: false,
      onramp: false,
      swaps: false,
    },
    // Eigene Font-Familie: verhindert, dass AppKit KHTeka von fonts.reown.com lädt
    // (erspart 16 CSP-Violations + Abhängigkeit von externem CDN)
    themeVariables: {
      "--w3m-font-family": "Inter, system-ui, sans-serif",
    },
  });
  return _appKit;
}

// Liest die verbundene Wallet-Adresse aus dem AppKit-Instance (public API)
function readAddress() {
  const caip = _appKit?.getCaipAddress();
  if (!caip) return "";
  // Format: "eip155:137:0xABC..." → "0xABC..."
  return caip.split(":").pop() ?? "";
}

// Liest den aktuellen EIP-1193 Provider aus dem AppKit-Instance (public API)
function readProvider() {
  return _appKit?.getWalletProvider() ?? null;
}

// Liest den Netzwerk-Namen aus der CAIP-Adresse
function readNetwork() {
  const caip = _appKit?.getCaipAddress();
  const netId = caip?.split(":")?.[1];
  if (netId === "80002") return "Polygon Amoy";
  if (netId === "137") return "Polygon";
  return netId ? `Chain ${netId}` : "";
}

// ── Singleton-State ────────────────────────────────────────────────────────
const walletAddress = ref("");
const currentNetwork = ref("");
const isConnected = ref(false);
const isAnchoring = ref(false);
const isTransferring = ref(false);
const isProvingIdentity = ref(false);
const anchorError = ref("");
const verifyError = ref("");

export function useChainAnchor() {
  const { soulContent, soulMeta, save } = useSoul();

  // AppKit initialisieren + persistente State-Subscriptions (client-only via onMounted)
  // Strategie: Alle State-Updates laufen über persistente Subscriptions – nicht über
  // temporäre Promises in connectWallet(). Das macht Mobile-App-Switch robust.
  onMounted(async () => {
    const config = useRuntimeConfig();
    const kit = getOrInitAppKit(config.public.walletConnectProjectId);
    if (!kit) return;

    // Mobile braucht länger: WalletConnect liest localStorage + WC-Session-Restore
    const isMobileRestore = typeof navigator !== "undefined" &&
      /iPhone|iPad|Android/i.test(navigator.userAgent);
    await new Promise((r) => setTimeout(r, isMobileRestore ? 1_500 : 600));

    // Initialen State setzen (z.B. nach Seiten-Reload mit bestehender Session)
    function syncState() {
      const addr = readAddress();
      const prov = readProvider();
      if (addr && prov) {
        walletAddress.value = addr;
        currentNetwork.value = readNetwork();
        isConnected.value = true;
      }
    }
    syncState();

    // Account-Subscription: connect / disconnect / wallet-switch
    // walletAddress immer setzen sobald caip bekannt – auch wenn Provider noch nicht
    // bereit ist (Provider-Subscription setzt isConnected wenn Provider folgt).
    const unsubChain = kit.subscribeAccount((account) => {
      const caip = account?.caipAddress;
      if (caip) {
        walletAddress.value = caip.split(":").pop() ?? "";
        currentNetwork.value = readNetwork();
        if (readProvider()) isConnected.value = true;
      } else {
        walletAddress.value = "";
        currentNetwork.value = "";
        isConnected.value = false;
      }
    });

    // Provider-Subscription: EIP-1193 Provider erscheint/verschwindet
    const unsubProvider = kit.subscribeProviders((providers) => {
      const p = providers?.["eip155"];
      if (!p) {
        walletAddress.value = "";
        currentNetwork.value = "";
        isConnected.value = false;
      } else {
        syncState();
      }
    });

    // visibilitychange: Mobile kehrt nach App-Switch (MetaMask) zurück
    // Zuverlässiger als AppKit-Events, die während Background-Phase fehlen können.
    function onVisibility() {
      if (document.visibilityState === "visible") syncState();
    }
    document.addEventListener("visibilitychange", onVisibility);

    onUnmounted(() => {
      unsubChain?.();
      unsubProvider?.();
      document.removeEventListener("visibilitychange", onVisibility);
    });
  });

  // ── Provider-Helfer ────────────────────────────────────────────────────────

  function getSignerProvider() {
    const provider = readProvider();
    if (!provider) throw new Error("Kein Wallet verbunden.");
    return new BrowserProvider(provider);
  }

  function getReadProvider() {
    const provider = readProvider();
    return provider
      ? new BrowserProvider(provider)
      : new JsonRpcProvider(POLYGON_RPC);
  }

  // Async-Variante: nimmt den schnellsten verfügbaren öffentlichen RPC
  async function getReadProviderFast() {
    const provider = readProvider();
    if (provider) return new BrowserProvider(provider);
    return getFastReadProvider();
  }

  // ── Wallet ────────────────────────────────────────────────────────────────

  // Öffnet das AppKit-Modal. State-Updates laufen über die persistenten
  // onMounted-Subscriptions – kein eigenes Warten / Promise nötig.
  async function connectWallet() {
    if (typeof window === "undefined") return;
    if (isConnected.value) return;
    anchorError.value = "";
    const config = useRuntimeConfig();
    const kit = getOrInitAppKit(config.public.walletConnectProjectId);
    if (!kit) {
      anchorError.value = "AppKit konnte nicht initialisiert werden.";
      return;
    }
    try {
      await kit.open();
    } catch {
      // open() kann auf manchen Mobile-Browsern werfen – ignorieren
    }
  }

  // ── Wallet disconnect ─────────────────────────────────────────────────────

  async function disconnectWallet() {
    try {
      await _appKit?.disconnect();
    } catch {
      /* ignorieren */
    }
    walletAddress.value = "";
    currentNetwork.value = "";
    isConnected.value = false;
    anchorError.value = "";
  }

  // ── Netzwerk-Guard ────────────────────────────────────────────────────────
  // Stellt sicher dass Wallet auf dem richtigen Chain ist.
  // Gibt einen FRISCHEN BrowserProvider zurück (wichtig nach Chain-Wechsel!).
  async function ensureCorrectNetwork(browserProvider) {
    const network = await browserProvider.getNetwork();
    if (network.chainId === ACTIVE_NETWORK.chainId) return browserProvider;

    try {
      await browserProvider.send("wallet_switchEthereumChain", [
        { chainId: ACTIVE_NETWORK.chainIdHex },
      ]);
    } catch (switchErr) {
      // EIP-3326: Chain nicht bekannt → hinzufügen
      const code = switchErr?.code ?? switchErr?.info?.error?.code;
      if (code === 4902) {
        try {
          await browserProvider.send("wallet_addEthereumChain", [
            {
              chainId: ACTIVE_NETWORK.chainIdHex,
              chainName: ACTIVE_NETWORK.name,
              nativeCurrency: ACTIVE_NETWORK.nativeCurrency,
              rpcUrls: [ACTIVE_NETWORK.rpc],
              blockExplorerUrls: [ACTIVE_NETWORK.explorer],
            },
          ]);
        } catch {
          throw new Error(
            `Netzwerk „${ACTIVE_NETWORK.name}" konnte nicht hinzugefügt werden.\n` +
              "Bitte manuell in der Wallet-App hinzufügen.",
          );
        }
      } else if (code === 4001) {
        throw new Error(
          "Netzwerkwechsel abgelehnt – bitte in der Wallet bestätigen.",
        );
      } else {
        throw new Error(
          `Wechsel auf „${ACTIVE_NETWORK.name}" fehlgeschlagen.\n` +
            "Bitte Netz manuell in der Wallet-App wechseln.",
        );
      }
    }

    // Provider nach Chain-Wechsel warten (Mobile braucht mehr Zeit nach App-Switch)
    const isMobileSwitch = typeof navigator !== "undefined" &&
      /iPhone|iPad|Android/i.test(navigator.userAgent);
    await new Promise((r) => setTimeout(r, isMobileSwitch ? 2_500 : 1_000));

    // FRESH provider – der alte BrowserProvider-Handle ist nach dem Switch stale
    // Retry bis zu 6× mit 500ms Pausen auf Mobile (App-Switch + WC-Sync dauert)
    const retries = isMobileSwitch ? 6 : 3;
    const retryDelay = isMobileSwitch ? 500 : 300;
    let freshRaw = null;
    for (let attempt = 0; attempt < retries; attempt++) {
      freshRaw = readProvider();
      if (freshRaw) break;
      if (attempt < retries - 1) await new Promise((r) => setTimeout(r, retryDelay));
    }
    if (!freshRaw) {
      throw new Error(
        "Wallet-Provider nach Netzwerkwechsel verloren.\n" +
          "→ Wallet trennen → Seite neu laden → erneut verbinden.",
      );
    }
    return new BrowserProvider(freshRaw);
  }

  // Signer mit 60s-Timeout – verhindert ewiges Hängen auf Mobile
  async function withSigner(provider) {
    return Promise.race([
      provider.getSigner(),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "Wallet antwortet nicht (Timeout 60s).\n" +
                  "→ MetaMask / Wallet-App öffnen und Transaktion bestätigen, dann erneut versuchen.",
              ),
            ),
          60_000,
        ),
      ),
    ]);
  }

  // Schnellster Read-Provider: race über alle RPCs, erster der antwortet gewinnt
  async function getFastReadProvider() {
    if (READ_RPCS.length === 1) return new JsonRpcProvider(READ_RPCS[0]);
    return Promise.any(
      READ_RPCS.map(async (url) => {
        const p = new JsonRpcProvider(url);
        await p.getBlockNumber(); // Liveness-Check
        return p;
      })
    ).catch(() => new JsonRpcProvider(POLYGON_RPC)); // Fallback
  }

  // Polling-Fallback für tx.wait() – Mobile-sicher via öffentlichem RPC
  // (WalletConnect-Verbindung kann nach App-Switch unterbrochen sein)
  async function pollTxReceipt(txHash, maxMs = 240_000, intervalMs = 2_000) {
    const rpcProvider = await getFastReadProvider();
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      try {
        const receipt = await rpcProvider.getTransactionReceipt(txHash);
        if (receipt) {
          if (receipt.status === 0) throw new Error("TX_REVERTED");
          return true; // bestätigt
        }
      } catch (e) {
        if (e.message === "TX_REVERTED") throw e;
        // RPC-Fehler → weiter polling
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false; // Timeout ohne Bestätigung
  }

  // ── Hashing ───────────────────────────────────────────────────────────────

  async function computeContentHash(content) {
    const encoded = new TextEncoder().encode(content);
    const hashBuf = await crypto.subtle.digest("SHA-256", encoded);
    return (
      "0x" +
      Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );
  }

  function soulIdToBytes32(uuid) {
    return keccak256(toUtf8Bytes(uuid));
  }

  // ── Growth-Chain ──────────────────────────────────────────────────────────

  function parseGrowthChain() {
    if (!soulContent.value) return [];
    const m = soulContent.value.match(/soul_growth_chain:\s*(\[[\s\S]*?\])/m);
    if (!m) return [];
    try {
      return JSON.parse(m[1]);
    } catch {
      return [];
    }
  }

  function getSessionCount() {
    return parseGrowthChain().length;
  }

  async function appendGrowthEntry() {
    if (!soulContent.value || !soulMeta.value?.id) return;
    const today = new Date().toISOString().split("T")[0];
    const contentHash = await computeContentHash(soulContent.value);

    let signature = "local";
    try {
      const res = await fetch("/api/soul-sign-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soul_id: soulMeta.value.id,
          content_hash: contentHash,
          date: today,
        }),
      });
      if (res.ok) signature = (await res.json()).signature;
    } catch {
      /* Server offline */
    }

    const chain = parseGrowthChain();
    chain.push(`${today}|${contentHash}|${signature}`);
    const chainJson = JSON.stringify(chain);

    if (/soul_growth_chain:/m.test(soulContent.value)) {
      soulContent.value = soulContent.value.replace(
        /soul_growth_chain:\s*\[[\s\S]*?\]/m,
        `soul_growth_chain: ${chainJson}`,
      );
    } else {
      soulContent.value = updateFrontmatterField(
        soulContent.value,
        "soul_growth_chain",
        chainJson,
      );
    }
    save();
  }

  // ── Blockchain-Anker ──────────────────────────────────────────────────────

  async function anchorSoul() {
    if (!CONTRACT_ADDRESS) {
      anchorError.value = "Smart Contract noch nicht deployed.";
      return null;
    }
    if (!isConnected.value) {
      anchorError.value = "Bitte zuerst Wallet verbinden.";
      return null;
    }

    isAnchoring.value = true;
    anchorError.value = "";

    try {
      if (soulMeta.value?.id) {
        const soulIdBytes32Preflight = soulIdToBytes32(soulMeta.value.id);
        const readContract = new Contract(
          CONTRACT_ADDRESS,
          ABI,
          await getFastReadProvider(),
        );

        // ── Pre-Flight: Wallet-Eigentümer prüfen ──────────────────────────────
        try {
          const owner = await readContract.soulOwner(soulIdBytes32Preflight);
          const ZERO = "0x0000000000000000000000000000000000000000";
          if (
            owner !== ZERO &&
            owner.toLowerCase() !== walletAddress.value.toLowerCase()
          ) {
            anchorError.value =
              `Falsche Wallet – diese Soul gehört ${owner.slice(0, 6)}…${owner.slice(-4)}.\n` +
              "Bitte die richtige Wallet verbinden.";
            return null;
          }
        } catch {
          /* Eigentümer-Check nicht möglich – weiter */
        }

        // ── Pre-Flight: Rate-Limit via READ-Call prüfen ───────────────────────
        // Polygon Amoy gibt bei Rate-Limit-Reverts keine revert-data zurück
        // (→ "missing revert data"). Daher vorher per Read-Call prüfen.
        try {
          const nextTs = Number(
            await readContract.nextAnchorAllowed(soulIdBytes32Preflight),
          );
          if (nextTs > 0 && nextTs * 1000 > Date.now()) {
            const diffMs = nextTs * 1000 - Date.now();
            const diffH = Math.max(0, Math.ceil(diffMs / 3_600_000));
            const diffMin = Math.max(0, Math.ceil(diffMs / 60_000));
            const until = new Date(nextTs * 1000).toLocaleString("de-DE");
            const left =
              diffH >= 1 ? `noch ${diffH} Std.` : `noch ${diffMin} Min.`;
            anchorError.value = `Rate-Limit (${left}) – nächster Anker möglich: ${until}`;
            return null;
          }
        } catch {
          /* Read-Fehler ignorieren – Transaktion trotzdem versuchen */
        }
      }

      // Netzwerk sicherstellen → frischen Provider zurückbekommen
      let provider = await ensureCorrectNetwork(getSignerProvider());

      const signer = await withSigner(provider);
      const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);
      const contentHash = await computeContentHash(soulContent.value);
      const soulIdBytes32 = soulIdToBytes32(soulMeta.value.id);
      const sessionCount = getSessionCount();

      let fee = ANCHOR_FEE_WEI;
      try {
        fee = await contract.anchorFee();
      } catch {
        /* Contract-Fallback */
      }

      let tx;
      try {
        tx = await contract.anchor(soulIdBytes32, contentHash, sessionCount, {
          value: fee,
        });
      } catch (txErr) {
        // Nach CALL_EXCEPTION: Rate-Limit nachträglich prüfen für präzisere Fehlermeldung
        if (
          txErr.code === "CALL_EXCEPTION" ||
          /missing revert data/i.test(txErr.message ?? "")
        ) {
          try {
            const readContract = new Contract(
              CONTRACT_ADDRESS,
              ABI,
              await getFastReadProvider(),
            );
            const nextTs = Number(
              await readContract.nextAnchorAllowed(soulIdBytes32),
            );
            if (nextTs > 0 && nextTs * 1000 > Date.now()) {
              const diffMs = nextTs * 1000 - Date.now();
              const diffH = Math.max(0, Math.ceil(diffMs / 3_600_000));
              const diffMin = Math.max(0, Math.ceil(diffMs / 60_000));
              const until = new Date(nextTs * 1000).toLocaleString("de-DE");
              const left =
                diffH >= 1 ? `noch ${diffH} Std.` : `noch ${diffMin} Min.`;
              throw Object.assign(new Error("RateLimitExceeded"), {
                revert: { name: "RateLimitExceeded", args: [nextTs] },
                errorName: "RateLimitExceeded",
                errorArgs: [nextTs],
              });
            }
          } catch (diagErr) {
            if (diagErr.errorName === "RateLimitExceeded") throw diagErr;
            // Diagnose selbst fehlgeschlagen → Original-Fehler weitergeben
          }
        }
        throw txErr;
      }

      // ── sys.md sofort nach TX-Submission schreiben (nicht erst nach Bestätigung)
      // Auf Mobile kann tx.wait() nach App-Switch hängen — der TX-Hash ist aber
      // bereits bekannt und die Transaktion wird gemined unabhängig davon ob wir warten.
      const today = new Date().toISOString().split("T")[0];
      const anchor = JSON.stringify({
        tx: tx.hash,
        hash: contentHash,
        date: today,
        sessions: sessionCount,
        network: ACTIVE_NETWORK.name,
        explorer: `${ACTIVE_NETWORK.explorer}/tx/${tx.hash}`,
      });
      if (/soul_chain_anchor:/m.test(soulContent.value)) {
        soulContent.value = soulContent.value.replace(
          /soul_chain_anchor:\s*.+/m,
          `soul_chain_anchor: ${anchor}`,
        );
      } else {
        soulContent.value = updateFrontmatterField(
          soulContent.value,
          "soul_chain_anchor",
          anchor,
        );
      }
      save();

      // ── TX-Hash sofort zurückgeben — UI nicht blockieren ──────────────────
      // Die Transaktion ist gesendet, der Hash steht bereits in sys.md.
      // Bestätigung im Hintergrund polling — blockiert weder den User noch die UI.
      const txHash = tx.hash;
      const isMobileTx = typeof navigator !== "undefined" &&
        /iPhone|iPad|Android/i.test(navigator.userAgent);

      ;(async () => {
        try {
          await Promise.race([
            tx.wait(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("WAIT_TIMEOUT")), isMobileTx ? 10_000 : 30_000),
            ),
          ]);
        } catch (waitErr) {
          if (waitErr.message === "WAIT_TIMEOUT" || waitErr.code === "NETWORK_ERROR") {
            // Fallback: öffentlicher RPC — WalletConnect-Provider nicht benötigt
            try {
              await pollTxReceipt(txHash);
            } catch (pollErr) {
              if (pollErr?.message === "TX_REVERTED") {
                anchorError.value =
                  "Transaktion on-chain abgelehnt (Revert).\n" +
                  "→ Rate-Limit oder Fee-Problem. Echtheit verifizieren und erneut versuchen.";
              }
              // Polling-Timeout: TX-Hash ist in sys.md, kein Datenverlust
            }
          } else if (waitErr.code === "CALL_EXCEPTION" || waitErr.reason) {
            anchorError.value =
              "Transaktion wurde abgelehnt (Revert on-chain).\n" +
              "→ Rate-Limit oder Fee-Problem. Echtheit verifizieren und erneut versuchen.";
          }
          // Alle anderen wait-Fehler auf Mobile ignorieren — TX wurde gesendet
        }
      })();

      return txHash;
    } catch (e) {
      anchorError.value = parseContractError(e, "anchor");
      return null;
    } finally {
      isAnchoring.value = false;
    }
  }

  // ── Verifikation ──────────────────────────────────────────────────────────

  async function verifySoul(soulId, contentHash) {
    if (!CONTRACT_ADDRESS) return null;
    verifyError.value = "";
    try {
      const provider = await getFastReadProvider();
      const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);
      const [found, timestamp, sessions] = await contract.verify(
        soulIdToBytes32(soulId),
        contentHash,
      );
      return {
        found,
        date: found
          ? new Date(Number(timestamp) * 1000).toISOString().split("T")[0]
          : null,
        sessions: found ? Number(sessions) : 0,
      };
    } catch (e) {
      verifyError.value =
        e.shortMessage ?? e.message ?? "Verifikation fehlgeschlagen.";
      return null;
    }
  }

  async function verifyCurrent() {
    const soulId = soulMeta.value?.id;
    if (!CONTRACT_ADDRESS || !soulId) {
      return { found: false, reason: "Soul-ID oder Contract fehlt." };
    }
    verifyError.value = "";
    try {
      const provider  = await getFastReadProvider();
      const contract  = new Contract(CONTRACT_ADDRESS, ABI, provider);
      const idBytes32 = soulIdToBytes32(soulId);

      // Neuesten Anker immer direkt von der Blockchain holen — nicht dem lokalen
      // soul_chain_anchor vertrauen (kann veraltet sein nach Mobile-TX).
      const history = await contract.getHistory(idBytes32);
      if (!history || history.length === 0) {
        return { found: false, reason: "Keine Anker on-chain für diese Soul-ID gefunden." };
      }
      const latest     = history[history.length - 1];
      const latestDate = new Date(Number(latest.timestamp) * 1000)
        .toISOString().split("T")[0];

      // Prüfen ob der aktuelle Inhalt jemals verankert wurde (≠ neuester Anker)
      const currentHash = await computeContentHash(soulContent.value);
      const [hashFound] = await contract.verify(idBytes32, currentHash);

      return {
        found:          true,
        hashMatch:      hashFound,
        anchorDate:     latestDate,
        anchorSessions: Number(latest.sessionCount),
        totalAnchors:   history.length,
        network:        ACTIVE_NETWORK.name,
      };
    } catch (e) {
      verifyError.value = e.shortMessage ?? e.message ?? "Verifikation fehlgeschlagen.";
      return { found: false, reason: verifyError.value };
    }
  }

  // ── Soul-Transfer ─────────────────────────────────────────────────────────

  async function getSoulOwner() {
    if (!CONTRACT_ADDRESS || !soulMeta.value?.id) return null;
    try {
      const contract = new Contract(CONTRACT_ADDRESS, ABI, await getFastReadProvider());
      const ownerAddr = await contract.soulOwner(
        soulIdToBytes32(soulMeta.value.id),
      );
      return ownerAddr === "0x0000000000000000000000000000000000000000"
        ? null
        : ownerAddr;
    } catch (e) {
      anchorError.value = e.message ?? "Eigentümer-Abfrage fehlgeschlagen";
      return null;
    }
  }

  async function transferSoul(newOwnerAddress) {
    if (!CONTRACT_ADDRESS) {
      anchorError.value = "Smart Contract nicht konfiguriert.";
      return null;
    }
    if (!isConnected.value) {
      anchorError.value = "Bitte zuerst Wallet verbinden.";
      return null;
    }

    isTransferring.value = true;
    anchorError.value = "";
    try {
      const provider = await ensureCorrectNetwork(getSignerProvider());
      const signer = await withSigner(provider);
      const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);
      const tx = await contract.transferSoul(
        soulIdToBytes32(soulMeta.value.id),
        newOwnerAddress,
      );
      const isMobileTr = typeof navigator !== "undefined" &&
        /iPhone|iPad|Android/i.test(navigator.userAgent);
      try {
        await Promise.race([
          tx.wait(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("WAIT_TIMEOUT")), isMobileTr ? 10_000 : 30_000)
          ),
        ]);
      } catch (waitErr) {
        if (waitErr.message === "WAIT_TIMEOUT" || waitErr.code === "NETWORK_ERROR") {
          await pollTxReceipt(tx.hash);
        }
      }
      return tx.hash;
    } catch (e) {
      anchorError.value = parseContractError(e, "transfer");
      return null;
    } finally {
      isTransferring.value = false;
    }
  }

  // ── Identity Proof ────────────────────────────────────────────────────────

  async function proveIdentity() {
    if (!CONTRACT_ADDRESS || !soulMeta.value?.id) return null;
    if (!isConnected.value) {
      anchorError.value = "Bitte zuerst Wallet verbinden.";
      return null;
    }

    isProvingIdentity.value = true;
    anchorError.value = "";
    try {
      // ── Eigentümer-Check: Proof nur wenn Wallet tatsächlich diese Soul besitzt ──
      const soulIdBytes32 = soulIdToBytes32(soulMeta.value.id);
      try {
        const readContract = new Contract(
          CONTRACT_ADDRESS,
          ABI,
          await getFastReadProvider(),
        );
        const owner = await readContract.soulOwner(soulIdBytes32);
        const ZERO = "0x0000000000000000000000000000000000000000";
        if (
          owner !== ZERO &&
          owner.toLowerCase() !== walletAddress.value.toLowerCase()
        ) {
          anchorError.value =
            `Falsche Wallet – diese Soul gehört ${owner.slice(0, 6)}…${owner.slice(-4)}.\n` +
            "Bitte die richtige Wallet verbinden.";
          return null;
        }
      } catch {
        /* Check nicht möglich (RPC) – trotzdem fortfahren, Contract schützt */
      }

      const nonce = crypto.getRandomValues(new Uint8Array(32));
      const nonceHex =
        "0x" +
        Array.from(nonce)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

      const provider = await ensureCorrectNetwork(getSignerProvider());
      const signer = await withSigner(provider);
      const signature = await signer.signMessage(nonce);

      const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);
      const history = await contract.getHistory(soulIdBytes32);
      const anchorCount = history.length;

      return {
        schema: "saveyoursoul/identity-proof/v1",
        soulId: soulIdBytes32,
        wallet: walletAddress.value,
        nonce: nonceHex,
        signature,
        anchorCount,
        firstAnchor:
          anchorCount > 0
            ? new Date(Number(history[0].timestamp) * 1000)
                .toISOString()
                .split("T")[0]
            : null,
        latestAnchor:
          anchorCount > 0
            ? new Date(Number(history[anchorCount - 1].timestamp) * 1000)
                .toISOString()
                .split("T")[0]
            : null,
        latestHash:
          anchorCount > 0 ? history[anchorCount - 1].contentHash : null,
        network: ACTIVE_NETWORK.name,
        contract: CONTRACT_ADDRESS,
        generatedAt: new Date().toISOString(),
      };
    } catch (e) {
      anchorError.value = parseContractError(e, "identity-proof");
      return null;
    } finally {
      isProvingIdentity.value = false;
    }
  }

  // ── Rate-Limit ────────────────────────────────────────────────────────────

  function cancelAnchor() {
    // Setzt UI-State zurück; laufender Promise wird abandoniert
    // (TX-Hash ist bei gesendeter TX bereits in sys.md)
    isAnchoring.value = false;
    anchorError.value = "";
  }

  async function checkNextAnchorAllowed() {
    if (!CONTRACT_ADDRESS || !soulMeta.value?.id) return 0;
    const idBytes32 = soulIdToBytes32(soulMeta.value.id);

    const call = async (provider) => {
      const c = new Contract(CONTRACT_ADDRESS, ABI, provider);
      return Number(await c.nextAnchorAllowed(idBytes32));
    };

    // Wallet-Provider zuerst – wenn verbunden und auf Polygon, zuverlässigster Weg
    const raw = readProvider();
    if (raw) {
      try { return await call(new BrowserProvider(raw)); } catch { /* falscher Chain → weiter */ }
    }

    // Fallback: publicnode (CORS ✓, kein API-Key nötig)
    try { return await call(new JsonRpcProvider(POLYGON_RPC)); } catch { return 0; }
  }

  // ── On-chain Sync ─────────────────────────────────────────────────────────
  // Liest den neuesten Anker direkt von der Blockchain und schreibt ihn in die
  // lokale sys.md, falls er neuer als der gespeicherte ist.
  // Wichtig für: nach erfolgreichem TX der nicht lokal gespeichert wurde (Mobile-Bug),
  // oder wenn soul_chain_anchor gar nicht gesetzt ist.
  async function syncAnchorFromChain() {
    if (!CONTRACT_ADDRESS || !soulMeta.value?.id) return null;
    try {
      const provider = await getFastReadProvider();
      const contract  = new Contract(CONTRACT_ADDRESS, ABI, provider);
      const idBytes32 = soulIdToBytes32(soulMeta.value.id);

      // Gesamte Anker-Historie laden
      const history = await contract.getHistory(idBytes32);
      if (!history.length) return null;

      const latest     = history[history.length - 1];
      const latestDate = new Date(Number(latest.timestamp) * 1000).toISOString().split("T")[0];

      // nextAnchorAllowed immer laden – unabhängig davon ob Sync nötig ist
      let nextAllowed = 0;
      try { nextAllowed = Number(await contract.nextAnchorAllowed(idBytes32)); } catch { /* ignore */ }

      // Prüfen ob lokale soul_chain_anchor bereits aktuell ist
      const localMatch = soulContent.value?.match(/soul_chain_anchor:\s*(\{.+\})/m);
      if (localMatch) {
        try {
          const local = JSON.parse(localMatch[1]);
          // Lokaler Eintrag aktuell → kein Schreiben nötig, aber nextAllowed zurückgeben
          if (local.date >= latestDate && local.tx) return { nextAllowed };
        } catch { /* weiter */ }
      }

      // TX-Hash aus Event-Logs holen
      // SoulRegistry deployed ~2026-04-04 → Polygon Mainnet Block ~83 500 000
      const DEPLOY_BLOCK = 83_500_000;
      let txHash = null;
      try {
        const filter = contract.filters.Anchored(idBytes32);
        // Zuerst vollständig versuchen, bei Fehler auf letzte 7 Tage (~1.2M Blöcke) fallen
        let events = [];
        try {
          events = await contract.queryFilter(filter, DEPLOY_BLOCK);
        } catch {
          events = await contract.queryFilter(filter, -1_200_000);
        }
        if (events.length) {
          // Event mit passendem contentHash finden (neuester zuerst)
          const match = [...events].reverse().find(
            (e) => e.args?.contentHash === latest.contentHash,
          );
          txHash = (match ?? events[events.length - 1])?.transactionHash ?? null;
        }
      } catch { /* TX-Hash nicht ermittelbar – weiter ohne */ }

      const anchor = JSON.stringify({
        tx:       txHash ?? "",
        hash:     latest.contentHash,
        date:     latestDate,
        sessions: Number(latest.sessionCount),
        network:  ACTIVE_NETWORK.name,
        explorer: txHash
          ? `${ACTIVE_NETWORK.explorer}/tx/${txHash}`
          : `${ACTIVE_NETWORK.explorer}/address/${CONTRACT_ADDRESS}`,
      });

      if (/soul_chain_anchor:/m.test(soulContent.value)) {
        soulContent.value = soulContent.value.replace(
          /soul_chain_anchor:\s*.+/m,
          `soul_chain_anchor: ${anchor}`,
        );
      } else {
        soulContent.value = updateFrontmatterField(
          soulContent.value,
          "soul_chain_anchor",
          anchor,
        );
      }
      save();
      return { date: latestDate, sessions: Number(latest.sessionCount), txHash, nextAllowed };
    } catch {
      return null;
    }
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const hasAnchor = computed(() =>
    /soul_chain_anchor:\s*\{/m.test(soulContent.value ?? ""),
  );
  const hasGrowthChain = computed(() =>
    /soul_growth_chain:/m.test(soulContent.value ?? ""),
  );
  const sessionCount = computed(() => getSessionCount());

  return {
    walletAddress,
    currentNetwork,
    isConnected,
    isAnchoring,
    isTransferring,
    isProvingIdentity,
    anchorError,
    verifyError,
    hasAnchor,
    hasGrowthChain,
    sessionCount,
    connectWallet,
    disconnectWallet,
    computeContentHash,
    appendGrowthEntry,
    anchorSoul,
    transferSoul,
    getSoulOwner,
    verifySoul,
    verifyCurrent,
    checkNextAnchorAllowed,
    syncAnchorFromChain,
    cancelAnchor,
    proveIdentity,
  };
}
