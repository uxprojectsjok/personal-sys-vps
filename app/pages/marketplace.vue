<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="market" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="[$t('common.network'), 'Marketplace']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />

        <div class="scroll">
          <div class="market-page">

            <!-- ── Hero ── -->
            <div class="mk-hero">
              <div class="mk-eyebrow">AGENT MARKETPLACE</div>
              <h1 class="mk-title">{{ $t('marketplace.hero_prefix') }} <em>{{ $t('marketplace.hero_em') }}</em></h1>
              <p class="mk-sub">{{ $t('marketplace.hero_sub') }}</p>
            </div>

            <!-- ── Panel, embedded flat via the `inline` prop (see AgentMarketplacePanel.vue) ── -->
            <div class="mk-panel">
              <AgentMarketplacePanel inline :soul-cert="soulToken" @close="router.push('/')" />
            </div>

          </div>
        </div>
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>
    <SysPageLoading v-else />
</ClientOnly>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import AgentMarketplacePanel from '~/components/AgentMarketplacePanel.vue'

definePageMeta({ layout: false })

const router = useRouter()
const { soulMeta, hasSoul, soulToken, isLoaded } = useSoul()

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
  if (id === 'setup')    { router.push('/setup');  return }
  if (id === 'soul')     { router.push('/soul');       return }
  if (id === 'chronik')  { router.push('/chronicle');    return }
  if (id === 'files')    { router.push('/vault');    return }
  if (id === 'maturity') { router.push('/maturity');      return }
  if (id === 'health')   { router.push('/health'); return }
  if (id === 'anchor')   { router.push('/anchor');    return }
  if (id === 'export')   { router.push('/export'); return }
  if (id === 'peers')    { router.push('/peers');       return }
  if (id === 'connect')  { router.push('/connection');   return }
  if (id === 'settings') { router.push('/settings'); return }
  if (id === 'earnings') { router.push('/earnings');    return }
  drawerOpen.value = false
  router.push('/')
}
</script>

<style scoped>
.sys-loading {
  min-height: 100dvh; display: flex; align-items: center; justify-content: center;
  background: var(--bg); color: var(--fg-3);
  font-family: var(--mono); font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase;
}

.market-page {
  max-width: 860px;
  margin: 0 auto;
  padding: 36px clamp(22px, 4vw, 42px) 88px;
}

/* ── Hero ── */
.mk-hero {
  padding-bottom: 22px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 20px;
}
.mk-eyebrow {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.18em;
  color: var(--accent); text-transform: uppercase; margin-bottom: 10px;
}
.mk-title {
  font-family: var(--serif); font-size: clamp(28px, 4vw, 42px);
  font-weight: 400; letter-spacing: -0.03em; color: var(--fg);
  line-height: 1.05; margin-bottom: 12px;
}
.mk-title em { font-style: italic; color: var(--accent); }
.mk-sub {
  font-size: 17px; line-height: 1.65; color: var(--fg);
  max-width: 560px; margin: 0;
}

/* ── Panel wrapper — prevent horizontal overflow ── */
.mk-panel {
  overflow-x: hidden;
  width: 100%;
  min-width: 0;
}

/* ════════════════════════════════════════════════
   PANEL THEME
   AgentMarketplacePanel's own `inline` prop (see
   its <script setup>) handles laying out flat —
   nothing here needs to fight position/overflow
   anymore. This just reskins its violet design
   tokens as Warm Ash & Sage, and covers page-level
   presentation (footer border, responsive columns)
   that's a legitimate per-page choice rather than a
   modal-vs-inline structural concern.
   ════════════════════════════════════════════════ */

.mk-panel :deep(.sys-amm-overlay) {
  --ink:         #0e0d0b;
  --paper:       #171717;
  --paper-2:     rgba(255,255,255,0.03);
  --paper-3:     rgba(255,255,255,0.02);
  --rule:        rgba(236,236,236,0.10);
  --rule-2:      rgba(236,236,236,0.15);
  --fg:          #ececec;
  --fg-2:        #ececec;
  --fg-3:        #ececec;
  --fg-4:        #ececec;
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
}

.mk-panel :deep(.amm-tab) { font-size: 16px; }

.mk-panel :deep(.amm-foot) {
  border-top: 1px solid var(--rule);
  background: transparent;
  padding: 20px 0;
}

@media (max-width: 900px) {
  .mk-title { font-size: clamp(24px, 7vw, 32px); }

  /* The component's own 2-col → 1-col collapse only kicks in at 720px
     (sized for the centered modal); the sidebar eats more of the viewport
     here, so this page needs the same collapse a bit earlier. */
  .mk-panel :deep(.mode-grid),
  .mk-panel :deep(.pay-fields) {
    grid-template-columns: 1fr !important;
  }

  .mk-panel :deep(.amm-foot-actions) {
    justify-content: flex-end;
  }
}
</style>
