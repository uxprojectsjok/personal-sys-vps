<template>
  <!-- ═══════════════════════════════════════════════════════
       SYS · SoulAnchorModal — Polygon / on-chain anchoring
       Editorial design: no border-radius, monospace labels.
       ═══════════════════════════════════════════════════════ -->
  <Teleport to="body">
    <Transition name="sys-modal" appear>
      <div v-if="isOpen" class="anc-backdrop" @click.self="handleClose">
        <div class="anc-panel" role="dialog" aria-modal="true">

          <!-- Header -->
          <header class="anc-head">
            <div class="anc-head-labels">
              <div class="anc-kicker">{{ $t('anchor.kicker') }}</div>
              <h2 class="anc-title">{{ $t('anchor.title') }}<em>.</em></h2>
            </div>
            <button class="anc-close" @click="handleClose" :aria-label="$t('common.close')"><span aria-hidden="true">×</span></button>
          </header>

          <!-- Anchor status bar -->
          <div class="anc-status" :class="{ anchored: hasAnchor }">
            <span class="anc-dot" :class="{ pulse: hasAnchor }"></span>
            <span class="anc-status-label">{{ hasAnchor ? $t('anchor.status_anchored') : $t('anchor.status_not_anchored') }}</span>
            <svg class="anc-chain-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"/>
            </svg>
          </div>

          <!-- Wallet row -->
          <div class="anc-wallet">
            <template v-if="walletRestoring">
              <svg class="spin anc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
              <span>{{ $t('anchor.wallet_checking') }}</span>
            </template>
            <template v-else-if="isConnected">
              <span class="anc-wallet-dot pulse"></span>
              <span class="anc-wallet-addr">{{ walletAddress }}</span>
              <span class="anc-wallet-net">{{ currentNetwork || 'Wallet' }}</span>
            </template>
            <template v-else>
              <span class="anc-wallet-empty">{{ $t('anchor.wallet_none') }}</span>
            </template>
          </div>

          <!-- Mobile-Hinweis -->
          <div class="anc-mobile-hint">
            <svg class="anc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
            <span>{{ $t('anchor.mobile_hint') }}</span>
          </div>

          <!-- Divider -->
          <div class="anc-rule"><span>{{ $t('marketplace.field_tags') }}</span></div>

          <!-- Tags -->
          <div class="anc-tags-wrap">
            <p class="anc-tags-hint">{{ $t('marketplace.field_tags_hint') }}</p>
            <input
              v-model="tagsRaw"
              type="text"
              class="anc-tags-input"
              placeholder="Berlin, AI, Design, Musik…"
              :disabled="isAnchoring"
            />
            <div v-if="tagsArray.length" class="anc-chips">
              <span v-for="t in tagsArray" :key="t" class="anc-chip">{{ t }}</span>
            </div>
          </div>

          <!-- Divider -->
          <div class="anc-rule"><span>{{ $t('anchor.divider_actions') }}</span></div>

          <!-- Actions -->
          <div class="anc-actions">
            <div v-if="!canAnchor" class="anc-note info">
              {{ $t('anchor.need_session') }}
            </div>

            <button
              v-if="canAnchor"
              class="anc-btn ghost"
              @click="connectWallet().then(() => recheckWallet())"
            >
              <svg class="anc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"/>
              </svg>
              {{ isConnected ? $t('anchor.wallet_manage') : $t('anchor.wallet_connect') }}
            </button>

            <button
              class="anc-btn primary"
              :class="{ busy: isCheckingRateLimit || isAnchoring }"
              :disabled="!isConnected || !canAnchor || (rateLimitActive && !isAnchoring && !isCheckingRateLimit)"
              @click="isCheckingRateLimit || isAnchoring ? handleCancel() : handleAnchor()"
            >
              <svg v-if="isCheckingRateLimit || isAnchoring" class="spin anc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
              <svg v-else class="anc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"/>
              </svg>
              {{ isCheckingRateLimit ? $t('anchor.btn_checking_cancel') : isAnchoring ? $t('anchor.btn_tx_cancel') : $t('anchor.btn_anchor') }}
            </button>
          </div>

          <div v-if="isAnchoring" class="anc-note info">
            <svg class="spin anc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
            {{ $t('anchor.tx_pending') }}
          </div>
          <div v-if="rateLimitActive" class="anc-note warn">
            {{ $t('anchor.rate_limit_active') }}<br>
            <strong>{{ new Date(rateLimitUntil * 1000).toLocaleString() }}</strong>
          </div>
          <div v-if="anchorError" class="anc-note error">{{ anchorError }}</div>

          <!-- TX result -->
          <Transition name="slide-up">
            <div v-if="anchorTx" class="anc-tx">
              <div class="anc-tx-head">
                <svg class="anc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                <span>{{ $t('anchor.tx_label', { network: anchorNetwork }) }}</span>
              </div>
              <a :href="anchorExplorerUrl" target="_blank" rel="noopener noreferrer" class="anc-tx-hash">
                <span>{{ anchorTx }}</span>
                <svg class="anc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg>
              </a>
            </div>
          </Transition>

          <!-- Identity proof -->
          <template v-if="hasAnchor">
            <div class="anc-rule"><span>{{ $t('anchor.divider_identity') }}</span></div>
            <button class="anc-btn ghost" :class="{ busy: isProvingIdentity || isConnectingForProof }" @click="isProvingIdentity ? cancelProveIdentity() : handleProveIdentity()">
              <svg v-if="isProvingIdentity || isConnectingForProof" class="spin anc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
              <svg v-else class="anc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z"/>
              </svg>
              {{ isProvingIdentity ? $t('anchor.btn_signing_cancel') : isConnectingForProof ? $t('anchor.btn_connecting_wallet') : isConnected ? $t('anchor.btn_prove_identity') : $t('anchor.btn_connect_prove') }}
            </button>
            <Transition name="slide-up">
              <div v-if="identityProof" class="anc-proof">
                <div class="anc-proof-head">
                  <div class="anc-proof-title">
                    <svg class="anc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                    {{ $t('anchor.proof_generated') }}
                  </div>
                  <button class="anc-proof-copy" @click="copyProof">{{ proofCopied ? $t('anchor.proof_copied') : $t('anchor.proof_copy') }}</button>
                </div>
                <div class="anc-proof-data">
                  <div>{{ $t('anchor.proof_count_label') }} <span>{{ identityProof.anchorCount }}</span></div>
                  <div>{{ $t('anchor.proof_since_label') }} <span>{{ identityProof.firstAnchor }}</span></div>
                  <div>{{ $t('anchor.proof_last_label') }} <span>{{ identityProof.latestAnchor }}</span></div>
                  <div class="truncate">{{ $t('anchor.proof_wallet_label') }} <span>{{ identityProof.wallet }}</span></div>
                </div>
                <p class="anc-proof-text">
                  {{ $t('anchor.proof_text', { count: identityProof.anchorCount, since: identityProof.firstAnchor }) }}
                </p>
              </div>
            </Transition>
          </template>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { useI18n } from 'vue-i18n'
import { useChainAnchor } from "~/composables/useChainAnchor.js";
import { useSoul } from "~/composables/useSoul.js";

const props = defineProps({
  isOpen: Boolean,
});

const emit = defineEmits(["close"]);

const { t } = useI18n()

// ── Tags ─────────────────────────────────────────────────────────────────────
const tagsRaw   = ref('');
const tagsArray = computed(() =>
  tagsRaw.value
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0 && t.length <= 32)
    .slice(0, 10)
);

const {
  walletAddress,
  currentNetwork,
  isConnected,
  isAnchoring,
  isProvingIdentity,
  anchorError,
  hasAnchor,
  hasGrowthChain,
  sessionCount,
  connectWallet,
  disconnectWallet,
  anchorSoul,
  cancelAnchor,
  checkNextAnchorAllowed,
  syncAnchorFromChain,
  proveIdentity,
  recheckWallet,
} = useChainAnchor();

const { soulContent, pushToServer } = useSoul();

// Local state
const walletRestoring       = ref(false);
const anchorTx              = ref("");
const anchorNetwork         = ref("");
const anchorExplorerUrl     = ref("");
const rateLimitUntil        = ref(0);
const isCheckingRateLimit   = ref(false);
const isCancelled           = ref(false);
const identityProof         = ref(null);
const proofCopied           = ref(false);
const isConnectingForProof  = ref(false);

// Mindestens 1 Growth-Chain-Eintrag erforderlich – schützt vor Ankerung von Fake-/Test-Souls
const canAnchor = computed(() => sessionCount.value > 0);

// Rate-Limit NUR aktiv wenn der Contract-Timestamp WIRKLICH in der Zukunft liegt.
// rateLimitUntil > 0 reicht nicht – Contract gibt oft vergangene Timestamps zurück.
const rateLimitActive = computed(() =>
  rateLimitUntil.value > 0 && rateLimitUntil.value * 1000 > Date.now()
);


// ── Helpers ───────────────────────────────────────────────────────────────────

async function refreshRateLimit() {
  if (isCheckingRateLimit.value) return; // läuft schon, kein Doppelaufruf
  isCancelled.value = false;
  isCheckingRateLimit.value = true;
  try {
    const ts = await Promise.race([
      checkNextAnchorAllowed(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 12_000)),
    ]);
    if (!isCancelled.value) rateLimitUntil.value = ts;
  } catch (e) {
    // Bei Timeout: bestehenden Wert behalten statt auf 0 zu setzen
    if (e?.message !== "TIMEOUT" && !isCancelled.value) rateLimitUntil.value = 0;
  } finally {
    isCheckingRateLimit.value = false;
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

watch(() => props.isOpen, async (val) => {
  if (val) {
    anchorTx.value            = "";
    anchorNetwork.value       = "";
    anchorExplorerUrl.value   = "";
    identityProof.value       = null;
    rateLimitUntil.value      = 0;
    isCheckingRateLimit.value = false;
    isCancelled.value         = false;
    anchorError.value         = "";
    document.body.style.overflow = "hidden";

    // Session-Restore: kurz warten und dann State aus AppKit lesen
    walletRestoring.value = true;
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent ?? "");
    await new Promise((r) => setTimeout(r, isMobile ? 1_200 : 400));
    recheckWallet();
    walletRestoring.value = false;

    refreshRateLimit();

    // On-chain Sync: neuesten Anker + Rate-Limit von der Blockchain lesen.
    // Läuft im Hintergrund — UI blockiert nicht.
    syncAnchorFromChain().then((result) => {
      if (!result) return;
      pushToServer();
      // Rate-Limit direkt aus dem Sync-Result setzen – kein separater RPC-Call nötig
      if (result.nextAllowed > 0) rateLimitUntil.value = result.nextAllowed;
    });
  } else {
    document.body.style.overflow = "";
  }
});

// Wenn Wallet verbunden wird → Rate-Limit sofort prüfen
// walletAddress als zweiten Trigger: isConnected kann durch Timing-Varianten
// leicht ahead/behind walletAddress liegen — doppelter Watch ist robuster.
watch(isConnected, (val) => { if (val) refreshRateLimit(); });
watch(walletAddress, (val) => { if (val) refreshRateLimit(); });

// ── Actions ───────────────────────────────────────────────────────────────────

function handleClose() {
  emit("close");
}

function handleCancel() {
  isCancelled.value = true;
  isCheckingRateLimit.value = false;
  cancelAnchor();
}

function cancelProveIdentity() {
  isProvingIdentity.value = false;
}

async function handleAnchor() {
  anchorTx.value          = "";
  anchorExplorerUrl.value = "";
  anchorNetwork.value     = "";

  const tx = await anchorSoul(tagsArray.value);
  if (tx) {
    anchorTx.value = tx;
    const m = soulContent.value?.match(/soul_chain_anchor:\s*(\{.+\})/m);
    if (m) {
      try {
        const stored            = JSON.parse(m[1]);
        anchorExplorerUrl.value = stored.explorer ?? `https://polygonscan.com/tx/${tx}`;
        anchorNetwork.value     = stored.network  ?? "Polygon Mainnet";
      } catch {
        anchorExplorerUrl.value = `https://polygonscan.com/tx/${tx}`;
        anchorNetwork.value     = "Polygon Mainnet";
      }
    }
    // Rate-Limit nach erfolgreichem Anker sofort aktualisieren
    refreshRateLimit();
    // Ankereintrag sofort auf dem Server speichern
    pushToServer();
  }
}

async function handleProveIdentity() {
  identityProof.value = null;
  if (!isConnected.value) {
    isConnectingForProof.value = true;
    try {
      await connectWallet();
      await new Promise(r => setTimeout(r, 600));
    } finally {
      isConnectingForProof.value = false;
    }
    if (!isConnected.value) return;
  }
  identityProof.value = await proveIdentity();
}

function copyProof() {
  if (!identityProof.value) return;
  navigator.clipboard.writeText(JSON.stringify(identityProof.value, null, 2));
  proofCopied.value = true;
  setTimeout(() => { proofCopied.value = false; }, 2000);
}
</script>

<style scoped>
/* ── Design tokens ─────────────────────────────────────── */
.anc-backdrop {
  --ink:    #08070c;
  --paper:  #171717;
  --paper-2:#1a1726;
  --paper-3:#0d0b14;
  --rule:   rgba(226,220,240,0.10);
  --rule-2: rgba(226,220,240,0.20);
  --fg:     #ece7f5;
  --fg-2:   rgba(236,231,245,0.88);
  --fg-3:   rgba(236,231,245,0.70);
  --fg-4:   rgba(236,231,245,0.55);
  --accent: #8b5cf6;
  --accent-bright: #a78bfa;
  --accent-dim:    rgba(139,92,246,0.12);
  --on-accent: #0a0810;
  --serif: 'Noto Serif', Georgia, serif;
  --mono:  'JetBrains Mono', ui-monospace, monospace;

  position: fixed; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(4,3,8,0.80);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* ── Panel ─────────────────────────────────────────────── */
.anc-panel {
  position: relative; z-index: 1;
  width: 100%; max-width: 480px;
  max-height: 92dvh; overflow-y: auto;
  background: var(--paper-2);
  border: 1px solid var(--rule-2);
  border-radius: 16px;
  box-shadow: 0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.08);
  display: flex; flex-direction: column; gap: 0;
}

/* ── Header ────────────────────────────────────────────── */
.anc-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 16px;
  min-height: 52px;
  background: var(--paper-3);
  border-bottom: 1px solid var(--rule);
}
.anc-head-labels { display: flex; flex-direction: column; gap: 2px; }
.anc-kicker {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--accent); display: block; margin-bottom: 4px;
}
.anc-title  { font-family: var(--serif); font-size: 22px; font-weight: 400; letter-spacing: -0.02em; color: var(--fg); line-height: 1; margin: 0; }
.anc-title em { font-style: italic; color: var(--accent); }
.anc-close  {
  width: 36px; height: 36px; flex: none;
  border: 1px solid var(--rule-2); background: transparent; cursor: pointer;
  color: var(--fg-3); font-size: 22px; line-height: 1; font-family: var(--sans);
  display: flex; align-items: center; justify-content: center;
  transition: color 0.12s, border-color 0.12s; padding: 0;
}
.anc-close:hover { color: var(--fg); border-color: var(--accent); background: rgba(139,92,246,0.14); }

/* ── Status bar ────────────────────────────────────────── */
.anc-status {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--rule);
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--fg-3);
  background: var(--paper-3);
  transition: background 0.3s;
}
.anc-status.anchored { background: rgba(139,92,246,0.06); color: var(--fg-2); }
.anc-dot {
  width: 8px; height: 8px; border-radius: 50%; flex: none;
  background: rgba(236,231,245,0.20);
  transition: background 0.3s, box-shadow 0.3s;
}
.anc-dot.pulse { background: var(--accent); box-shadow: 0 0 10px var(--accent); animation: anc-pulse 2s infinite; }
.anc-status-label { flex: 1; }
.anc-chain-icon { width: 14px; height: 14px; flex: none; opacity: 0.35; }

/* ── Wallet row ────────────────────────────────────────── */
.anc-wallet {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--rule);
  font-family: var(--mono); font-size: 12px; color: var(--fg-3);
  min-height: 44px;
}
.anc-wallet-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; background: var(--accent); }
.anc-wallet-dot.pulse { animation: anc-pulse 2s infinite; box-shadow: 0 0 8px var(--accent); }
.anc-wallet-addr { flex: 1; font-family: var(--mono); font-size: 12px; color: var(--fg-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.anc-wallet-net  { flex: none; font-size: 12px; letter-spacing: 0.10em; text-transform: uppercase; color: var(--fg-3); }
.anc-wallet-empty { color: var(--fg-4); font-size: 12px; letter-spacing: 0.1em; }

/* ── Rule divider ──────────────────────────────────────── */
.anc-rule {
  display: flex; align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid var(--rule);
  color: var(--fg-3);
}
.anc-rule span {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em;
  text-transform: uppercase; padding: 10px 0;
}
.anc-rule::before, .anc-rule::after { content: ""; flex: 1; height: 1px; }
.anc-rule::before { margin-right: 12px; background: var(--rule); }
.anc-rule::after  { margin-left: 12px;  background: var(--rule); }

/* ── Actions ───────────────────────────────────────────── */
.anc-actions { display: flex; flex-direction: column; gap: 0; padding: 0; }

.anc-btn {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; min-height: 48px; padding: 0 20px;
  border: 0; border-bottom: 1px solid var(--rule);
  background: transparent; cursor: pointer;
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.10em;
  text-transform: uppercase; color: var(--fg-3);
  transition: all 0.15s;
}
.anc-btn:hover:not(:disabled) { background: rgba(255,255,255,0.03); color: var(--fg); }
.anc-btn:disabled { opacity: 0.25; cursor: not-allowed; }

.anc-btn.ghost { color: var(--fg-3); }
.anc-btn.ghost:hover:not(:disabled) { color: var(--fg); }

.anc-btn.danger { color: rgba(248,113,113,0.7); }
.anc-btn.danger:hover:not(:disabled) { color: rgba(248,113,113,0.9); background: rgba(239,68,68,0.06); }

.anc-btn.primary { color: var(--fg); background: rgba(139,92,246,0.10); border-color: rgba(139,92,246,0.25); }
.anc-btn.primary:hover:not(:disabled) { background: var(--accent); color: var(--on-accent); box-shadow: 0 8px 24px rgba(139,92,246,0.35); }
.anc-btn.primary:disabled { background: transparent; color: var(--fg-4); border-color: var(--rule); }
.anc-btn.primary.busy { background: rgba(255,255,255,0.04); color: var(--fg-3); }

/* ── Notes ─────────────────────────────────────────────── */
.anc-note {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--rule);
  font-family: var(--serif); font-size: 14px;
  line-height: 1.6; color: var(--fg-3);
}
.anc-note.info  { color: var(--fg-3); }
.anc-note.warn  { color: var(--accent-bright); background: rgba(139,92,246,0.05); }
.anc-note.error { color: rgba(248,113,113,0.8); background: rgba(239,68,68,0.05); }
.anc-note strong { color: inherit; font-weight: 600; }

/* ── TX result ─────────────────────────────────────────── */
.anc-tx { padding: 16px 20px; border-bottom: 1px solid var(--rule); }
.anc-tx-head {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--fg-2); margin-bottom: 8px;
}
.anc-tx-hash {
  display: flex; align-items: flex-start; gap: 6px;
  font-family: var(--mono); font-size: 12px; color: var(--fg);
  text-decoration: none; word-break: break-all;
}
.anc-tx-hash:hover { text-decoration: underline; color: var(--accent-bright); }

/* ── Proof ─────────────────────────────────────────────── */
.anc-proof { padding: 16px 20px; border-bottom: 1px solid var(--rule); }
.anc-proof-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.anc-proof-title {
  display: flex; align-items: center; gap: 6px;
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--fg-2);
}
.anc-proof-copy {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--fg-3); background: transparent;
  border: 1px solid var(--rule); padding: 4px 10px; cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
}
.anc-proof-copy:hover { color: var(--fg); border-color: var(--rule-2); }
.anc-proof-data {
  font-family: var(--mono); font-size: 12px; color: var(--fg-3);
  display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px;
}
.anc-proof-data span { color: var(--fg); }
.anc-proof-text { font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em; line-height: 1.6; color: var(--fg-3); }

/* ── Shared icon size ──────────────────────────────────── */
.anc-ico { width: 14px; height: 14px; flex: none; }

/* ── Animations ────────────────────────────────────────── */
@keyframes anc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Transitions ───────────────────────────────────────── */
.sys-modal-enter-active, .sys-modal-leave-active { transition: opacity 0.2s; }
.sys-modal-enter-active .anc-panel, .sys-modal-leave-active .anc-panel { transition: transform 0.25s ease, opacity 0.2s; }
.sys-modal-enter-from { opacity: 0; }
.sys-modal-enter-from .anc-panel { transform: translateY(20px) scale(0.98); opacity: 0; }
.sys-modal-leave-to { opacity: 0; }
.sys-modal-leave-to .anc-panel { transform: translateY(20px) scale(0.98); opacity: 0; }
.slide-up-enter-active { transition: all 0.2s ease; }
.slide-up-enter-from { opacity: 0; transform: translateY(6px); }

/* ── Tags ──────────────────────────────────────────────── */
.anc-tags-wrap { padding: 0 20px 16px; display: flex; flex-direction: column; gap: 8px; }
.anc-tags-hint { font-family: var(--sys-mono); font-size: 12px; color: var(--sys-fg-dim); letter-spacing: 0.06em; margin: 0; }
.anc-tags-input {
  width: 100%; background: rgba(255,255,255,0.04); border: 1px solid var(--sys-rule);
  color: var(--sys-fg); font-family: var(--sys-mono); font-size: 12px;
  padding: 8px 10px; outline: none; box-sizing: border-box;
}
.anc-tags-input:focus { border-color: var(--sys-violet); }
.anc-tags-input:disabled { opacity: 0.4; }
.anc-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.anc-chip {
  font-family: var(--sys-mono); font-size: 12px; letter-spacing: 0.1em;
  padding: 3px 8px; background: rgba(139,92,246,0.15); border: 1px solid rgba(139,92,246,0.3);
  color: var(--sys-accent-bright);
}

/* ── Mobile-Hinweis ────────────────────────────────────── */
.anc-mobile-hint {
  display: none;
  align-items: flex-start; gap: 10px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--rule);
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em;
  line-height: 1.6; color: var(--fg-4);
}
.anc-mobile-hint .anc-ico { flex-shrink: 0; margin-top: 1px; opacity: 0.5; }

/* ── Mobile ────────────────────────────────────────────── */
@media (max-width: 639px) {
  .anc-backdrop { padding: 12px; }
  .anc-panel { max-height: calc(100dvh - 24px); }
  .anc-mobile-hint { display: flex; }
}
</style>
