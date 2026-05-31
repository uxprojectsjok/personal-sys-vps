<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="market" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Netzwerk', 'Marketplace']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="() => {}" />

        <div class="scroll">
          <div class="market-page">

            <!-- ── Hero ── -->
            <div class="mk-hero">
              <div class="mk-eyebrow">AGENT MARKETPLACE</div>
              <h1 class="mk-title">Deine Soul <em>veröffentlichen</em></h1>
              <p class="mk-sub">Mache deine Soul für externe KI-Assistenten zugänglich — über MCP-Tools, kostenlos oder gegen POL. Danach ist sie im Marketplace auffindbar.</p>
            </div>

            <!-- ── Panel ── -->
            <div class="mk-panel">
              <AgentMarketplacePanel :soul-cert="soulToken" @close="router.push('/')" />
            </div>

          </div>
        </div>
      </div>
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

function lockGate() {
  document.cookie = 'sys_token=; Max-Age=0; path=/'
  window.location.href = '/gate'
}

function onNav(id) {
  if (id === 'market')   return
  if (id === 'chat')     { router.push('/session');   return }
  if (id === 'soul')     { router.push('/soul');      return }
  if (id === 'chronik')  { router.push('/chronik');   return }
  if (id === 'files')    { router.push('/dateien');   return }
  if (id === 'maturity') { router.push('/reife');     return }
  if (id === 'calendar') { router.push('/kalender');  return }
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

/* ── Strip the modal overlay, show panel inline ── */
.mk-panel :deep(.sys-amm-overlay) {
  position: static !important;
  inset: auto !important;
  background: transparent !important;
  backdrop-filter: none !important;
  display: block !important;
  z-index: auto !important;
  padding: 0 !important;
}
.mk-panel :deep(.sys-amm) {
  position: static !important;
  inset: auto !important;
  max-width: none !important;
  width: 100% !important;
  height: auto !important;
  max-height: none !important;
  border-radius: 0 !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  transform: none !important;
  display: flex !important;
  flex-direction: column !important;
}

/* Hide the close button and drag handle (page has sidebar nav) */
.mk-panel :deep(.amm-close),
.mk-panel :deep(.amm-handle) { display: none !important; }

/* Step rail */
.mk-panel :deep(.amm-rail) {
  display: flex; gap: 0;
  border: 1px solid var(--line);
  border-radius: var(--r-xs);
  overflow: hidden;
  margin-bottom: 32px;
  background: var(--surface-2);
}
.mk-panel :deep(.amm-rail-item) {
  flex: 1; display: flex; align-items: center; gap: 12px;
  padding: 14px 20px;
  border: none; background: transparent; cursor: pointer;
  border-right: 1px solid var(--line);
  transition: background 0.15s;
}
.mk-panel :deep(.amm-rail-item:last-child) { border-right: none; }
.mk-panel :deep(.amm-rail-item.on) { background: var(--surface); }
.mk-panel :deep(.amm-rail-item .num) {
  width: 24px; height: 24px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--mono); font-size: 12px;
  border: 1.5px solid var(--fg-4); color: var(--fg-3);
  flex: none;
}
.mk-panel :deep(.amm-rail-item.on .num) {
  border-color: var(--accent); color: var(--accent);
  background: rgba(109,184,154,0.12);
}
.mk-panel :deep(.amm-rail-item.done .num) {
  border-color: var(--accent); background: var(--accent);
  color: var(--on-accent);
}
.mk-panel :deep(.amm-rail-item .lbl) {
  display: flex; flex-direction: column; gap: 2px; text-align: left;
}
.mk-panel :deep(.amm-rail-item .t) {
  font-family: var(--sans); font-size: 14px; font-weight: 500;
  color: var(--fg-3);
}
.mk-panel :deep(.amm-rail-item.on .t),
.mk-panel :deep(.amm-rail-item.done .t) { color: var(--fg); }
.mk-panel :deep(.amm-rail-item .sub) {
  font-family: var(--mono); font-size: 11px; color: var(--fg-4);
  letter-spacing: 0.06em;
}

/* Body / Step content */
.mk-panel :deep(.amm-body) { flex: 1; }
.mk-panel :deep(.step-title) {
  font-family: var(--serif); font-size: 26px; font-weight: 400;
  letter-spacing: -0.02em; color: var(--fg); margin-bottom: 12px;
}
.mk-panel :deep(.step-title em) { font-style: italic; color: var(--fg-2); }
.mk-panel :deep(.prose) {
  font-size: 14px; line-height: 1.65; color: var(--fg-2); margin-bottom: 24px;
}

/* Fields */
.mk-panel :deep(.field-label) {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em;
  color: var(--fg-3); text-transform: uppercase; display: block; margin-bottom: 8px;
}
.mk-panel :deep(.field-hint) {
  font-size: 10px; color: var(--fg-4); text-transform: none; letter-spacing: 0;
}
.mk-panel :deep(input[type="text"]),
.mk-panel :deep(input[type="url"]),
.mk-panel :deep(textarea),
.mk-panel :deep(select) {
  width: 100%; box-sizing: border-box;
  background: var(--surface-2) !important; border: 1px solid var(--line-2) !important;
  color: var(--fg) !important; border-radius: var(--r-xs) !important;
  padding: 10px 14px; font-family: var(--sans); font-size: 14px;
  outline: none;
}
.mk-panel :deep(input:focus),
.mk-panel :deep(textarea:focus) {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 1px var(--accent) !important;
}
.mk-panel :deep(input::placeholder),
.mk-panel :deep(textarea::placeholder) { color: var(--fg-3); }

/* Bearer code */
.mk-panel :deep(.bearer-row) {
  display: flex; align-items: center; gap: 10px;
  border: 1px solid var(--line-2); background: var(--surface-2);
  border-radius: var(--r-xs); padding: 10px 14px;
}
.mk-panel :deep(.bearer-val) {
  flex: 1; font-family: var(--mono); font-size: 13px; color: var(--fg-2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* Buttons */
.mk-panel :deep(button.btn-primary),
.mk-panel :deep(.amm-btn-primary),
.mk-panel :deep(button[class*="primary"]) {
  background: var(--accent) !important; color: var(--on-accent) !important;
  border: none; border-radius: var(--r-xs); padding: 9px 20px;
  font-family: var(--sans); font-size: 14px; font-weight: 500; cursor: pointer;
}
.mk-panel :deep(button.btn-ghost),
.mk-panel :deep(.amm-btn-ghost),
.mk-panel :deep(button[class*="ghost"]) {
  background: transparent; border: 1px solid var(--line-2);
  color: var(--fg-2); border-radius: var(--r-xs); padding: 9px 20px;
  font-family: var(--sans); font-size: 14px; cursor: pointer;
}
.mk-panel :deep(.bearer-copy) {
  background: transparent; border: 1px solid var(--line-2); border-radius: var(--r-xs);
  color: var(--fg-2); font-family: var(--sans); font-size: 12px;
  padding: 5px 12px; cursor: pointer; white-space: nowrap; flex: none;
}
.mk-panel :deep(.bearer-copy.copied),
.mk-panel :deep(.bearer-copy:hover) { border-color: var(--accent); color: var(--accent); }

/* Peer entries */
.mk-panel :deep(.peer-item) {
  border: 1px solid var(--line); border-radius: var(--r-xs);
  padding: 12px 16px; margin-bottom: 10px;
  background: var(--surface-2);
}
.mk-panel :deep(.peer-name) {
  font-family: var(--sans); font-size: 14px; font-weight: 500; color: var(--fg);
}
.mk-panel :deep(.peer-url) {
  font-family: var(--mono); font-size: 12px; color: var(--fg-3);
}

/* Misc text */
.mk-panel :deep(h3),
.mk-panel :deep(h4) {
  font-family: var(--serif) !important; font-weight: 400 !important;
  letter-spacing: -0.02em; color: var(--fg);
}
.mk-panel :deep(p) { color: var(--fg-2); font-size: 14px; line-height: 1.65; }
.mk-panel :deep(small),
.mk-panel :deep(.muted) { color: var(--fg-3); font-size: 12px; }

@media (max-width: 900px) {
  .mk-title { font-size: clamp(24px, 7vw, 32px); }
  .mk-panel :deep(.amm-rail) { flex-direction: column; }
  .mk-panel :deep(.amm-rail-item) { border-right: none; border-bottom: 1px solid var(--line); }
  .mk-panel :deep(.amm-rail-item:last-child) { border-bottom: none; }
}
</style>
