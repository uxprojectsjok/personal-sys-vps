<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="market" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Netzwerk', 'Marketplace']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />

        <div class="scroll">
          <div class="market-page">

            <!-- ── Hero ── -->
            <div class="mk-hero">
              <div class="mk-eyebrow">AGENT MARKETPLACE</div>
              <h1 class="mk-title">Deine Soul <em>veröffentlichen</em></h1>
              <p class="mk-sub">Mache deine Soul für externe KI-Assistenten zugänglich — über MCP-Tools, kostenlos oder gegen POL. Danach ist sie im Marketplace auffindbar.</p>
            </div>

            <!-- ── Panel (inline, modal stripped) ── -->
            <div class="mk-panel">
              <AgentMarketplacePanel :soul-cert="soulToken" @close="router.push('/')" />
            </div>

          </div>
        </div>
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>

    <div v-else class="sys-loading">
      <span>SYS · Marketplace lädt</span>
    </div>
  </ClientOnly>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import AgentMarketplacePanel from '~/components/AgentMarketplacePanel.vue'

definePageMeta({ layout: false })

const router = useRouter()
const { soulMeta, hasSoul, soulToken } = useSoul()

const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)
const cmdkOpen         = ref(false)

function lockGate() {
  document.cookie = 'sys_token=; Max-Age=0; path=/'
  window.location.href = '/gate'
}

function onNav(id) {
  if (id === 'market')   return
  if (id === 'chat')     { router.push('/session');    return }
  if (id === 'setup')    { router.push('/einrichten');  return }
  if (id === 'soul')     { router.push('/soul');       return }
  if (id === 'chronik')  { router.push('/chronik');    return }
  if (id === 'files')    { router.push('/dateien');    return }
  if (id === 'maturity') { router.push('/reife');      return }
  if (id === 'calendar') { router.push('/kalender');   return }
  if (id === 'anchor')   { router.push('/verankern');    return }
  if (id === 'export')   { router.push('/exportieren'); return }
  drawerOpen.value = false
  router.push('/')
}
</script>

<style scoped>
.sys-loading {
  min-height: 100dvh; display: flex; align-items: center; justify-content: center;
  background: var(--bg); color: var(--fg-3);
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
}

.market-page {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px clamp(16px, 3vw, 32px) 80px;
}

/* ── Hero ── */
.mk-hero {
  padding-bottom: 28px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 32px;
}
.mk-eyebrow {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em;
  color: var(--accent); text-transform: uppercase; margin-bottom: 10px;
}
.mk-title {
  font-family: var(--serif); font-size: clamp(28px, 4vw, 42px);
  font-weight: 400; letter-spacing: -0.03em; color: var(--fg);
  line-height: 1.05; margin-bottom: 12px;
}
.mk-title em { font-style: italic; color: var(--fg-2); }
.mk-sub {
  font-size: 14px; line-height: 1.65; color: var(--fg-2);
  max-width: 560px; margin: 0;
}

/* ── Panel wrapper — prevent horizontal overflow ── */
.mk-panel {
  overflow-x: hidden;
  width: 100%;
  min-width: 0;
}

/* ════════════════════════════════════════════════
   PANEL OVERRIDES
   Override the violet design system inside
   AgentMarketplacePanel with Warm Ash & Sage.
   :deep() compiles to .mk-panel .sys-amm-overlay
   which has higher specificity than the scoped
   component rule [data-v-xxx].sys-amm-overlay.
   ════════════════════════════════════════════════ */

/* 1. Override all design tokens on the overlay root */
.mk-panel :deep(.sys-amm-overlay) {
  /* Warm Ash & Sage color tokens */
  --ink:         #0e0d0b;
  --paper:       #161513;
  --paper-2:     rgba(255,255,255,0.03);
  --paper-3:     rgba(255,255,255,0.02);
  --rule:        rgba(244,241,234,0.10);
  --rule-2:      rgba(244,241,234,0.15);
  --fg:          #f4f1ea;
  --fg-2:        rgba(244,241,234,0.72);
  --fg-3:        rgba(244,241,234,0.48);
  --fg-4:        rgba(244,241,234,0.30);
  --accent:      #6db89a;
  --accent-2:    rgba(109,184,154,0.12);
  --accent-bright: #8ad0b3;
  --accent-deep: #4a9e82;
  --on-accent:   #0e1a16;
  --ok:          #6db89a;
  --warn:        #8ad0b3;
  --err:         #e06c75;
  --serif:       'Noto Serif', Georgia, serif;
  --sans:        'Inter', system-ui, -apple-system, sans-serif;
  --mono:        'JetBrains Mono', ui-monospace, monospace;

  /* Strip modal overlay behavior */
  position: static !important;
  inset: auto !important;
  background: transparent !important;
  backdrop-filter: none !important;
  padding: 0 !important;
  display: block !important;
  z-index: auto !important;
  font-family: var(--sans);
  color: var(--fg);
}

/* 2. Strip the modal panel chrome */
.mk-panel :deep(.sys-amm) {
  position: static !important;
  inset: auto !important;
  max-width: 100% !important;
  width: 100% !important;
  max-height: none !important;
  height: auto !important;
  border-radius: 0 !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

/* 3. Hide close button and drag handle */
.mk-panel :deep(.amm-head) { display: none !important; }

/* 4. Step rail — 2 cols (2 steps), no overflow */
.mk-panel :deep(.amm-rail) {
  border: 1px solid var(--rule) !important;
  background: var(--paper-2) !important;
  border-radius: 0 !important;
  margin-bottom: 32px;
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  overflow: hidden !important;
  width: 100% !important;
}
.mk-panel :deep(.amm-rail-item) {
  background: transparent !important;
  border-right: none !important;
  padding: 14px 16px !important;
  min-width: 0 !important;
  overflow: hidden !important;
}
.mk-panel :deep(.amm-rail-item:first-child) {
  border-right: 1px solid var(--rule) !important;
}
.mk-panel :deep(.amm-rail-item.on) {
  background: var(--paper) !important;
}
.mk-panel :deep(.amm-rail-item .t) {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
.mk-panel :deep(.amm-rail-item .sub) {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

/* 5. Body */
.mk-panel :deep(.amm-body) {
  overflow: hidden !important;
  padding: 0 0 32px !important;
  min-height: auto !important;
  width: 100% !important;
  min-width: 0 !important;
}

/* 5a. Step + every direct layout container: can't bleed wider than body */
.mk-panel :deep(.step),
.mk-panel :deep(.step-head),
.mk-panel :deep(.node-list),
.mk-panel :deep(.node-row),
.mk-panel :deep(.node-info),
.mk-panel :deep(.own-endpoint-row),
.mk-panel :deep(.peer-form),
.mk-panel :deep(.peer-form-inputs),
.mk-panel :deep(.peer-form-row),
.mk-panel :deep(.bearer-row),
.mk-panel :deep(.mode-grid),
.mk-panel :deep(.mode-card),
.mk-panel :deep(.pay-form),
.mk-panel :deep(.pay-fields),
.mk-panel :deep(.state-ok),
.mk-panel :deep(.field),
.mk-panel :deep(.card),
.mk-panel :deep(.card-body) {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
}

/* 6. Footer */
.mk-panel :deep(.amm-foot) {
  border-top: 1px solid var(--rule) !important;
  background: transparent !important;
  padding: 20px 0 !important;
}

/* 7. Global overflow guard on all deep children */
.mk-panel :deep(*) {
  max-width: 100%;
  box-sizing: border-box;
}
.mk-panel :deep(input),
.mk-panel :deep(textarea),
.mk-panel :deep(code),
.mk-panel :deep(.bearer-val),
.mk-panel :deep(.oe-val) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mk-panel :deep(textarea) {
  white-space: pre-wrap;
}

@media (max-width: 900px) {
  .mk-title { font-size: clamp(24px, 7vw, 32px); }

  /* Step rail: stack vertically on mobile */
  .mk-panel :deep(.amm-rail) {
    grid-template-columns: 1fr !important;
  }
  .mk-panel :deep(.amm-rail-item) {
    padding: 10px 14px !important;
  }
  .mk-panel :deep(.amm-rail-item:first-child) {
    border-right: none !important;
    border-bottom: 1px solid var(--rule) !important;
  }
  .mk-panel :deep(.amm-rail-item .t) {
    white-space: normal !important;
  }

  /* 2-col grids → single col */
  .mk-panel :deep(.mode-grid),
  .mk-panel :deep(.pay-fields),
  .mk-panel :deep(.peer-form-inputs) {
    grid-template-columns: 1fr !important;
  }

  /* Peer form row stacks */
  .mk-panel :deep(.peer-form-row) {
    flex-direction: column !important;
    align-items: stretch !important;
  }

  /* Bearer row: wrap */
  .mk-panel :deep(.bearer-row) {
    flex-wrap: wrap !important;
  }
  .mk-panel :deep(.bearer-copy) {
    width: 100% !important;
    justify-content: center !important;
  }

  /* Footer stacks */
  .mk-panel :deep(.amm-foot) {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }
  .mk-panel :deep(.amm-foot-actions) {
    justify-content: flex-end !important;
  }

  /* Own endpoint row: wrap */
  .mk-panel :deep(.own-endpoint-row) {
    flex-wrap: wrap !important;
    gap: 6px !important;
  }
  .mk-panel :deep(.oe-val) {
    width: 100% !important;
    white-space: normal !important;
    word-break: break-all !important;
  }
}
</style>
