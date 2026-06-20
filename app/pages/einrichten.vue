<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="setup" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="[t('setup.crumb_soul'), t('setup.crumb_setup')]" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="page er-page">

            <div class="er-head">
              <div class="eyebrow">{{ $t('setup.eyebrow') }}</div>
              <h1 class="er-title">Soul <em>{{ $t('setup.activate') }}</em></h1>
            </div>

            <div class="er-wizard">
              <SoulSetupWizard
                :soul-cert="soulToken"
                :soul-content="soulContent"
                :soul-id="soulMeta?.id ?? ''"
                :modal="true"
                @close="onNav('soul')"
                @unlocked="() => {}"
              />
            </div>

          </div>
        </div>
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>
    <SysPageLoading v-else />
<ConfirmModal />
  </ClientOnly>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSoul } from '~/composables/useSoul.js'
const { t } = useI18n()

definePageMeta({ layout: false })

const router = useRouter()
const { soulContent, soulMeta, hasSoul, soulToken, isLoaded } = useSoul()

const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)
const cmdkOpen         = ref(false)

function lockGate() {
  document.cookie = 'sys_token=; Max-Age=0; path=/'
  window.location.href = '/gate'
}

function onNav(id) {
  if (id === 'setup')    return
  if (id === 'chat')     { router.push('/session');     return }
  if (id === 'soul')     { router.push('/soul');        return }
  if (id === 'chronik')  { router.push('/chronik');     return }
  if (id === 'files')    { router.push('/dateien');     return }
  if (id === 'market')   { router.push('/marketplace'); return }
  if (id === 'earnings') { router.push('/einnahmen');   return }
  if (id === 'maturity') { router.push('/reife');       return }
  if (id === 'health')   { router.push('/gesundheit'); return }
  if (id === 'calendar') { router.push('/kalender');    return }
  if (id === 'anchor')   { router.push('/verankern');    return }
  if (id === 'export')   { router.push('/exportieren'); return }
  if (id === 'peers')    { router.push('/peers');       return }
  if (id === 'connect')  { router.push('/verbindung');  return }
  if (id === 'settings') { router.push('/einstellungen'); return }
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

.er-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px clamp(16px, 3vw, 32px) 80px;
}

.er-head {
  margin-bottom: 32px;
}

.er-title {
  font-family: var(--serif);
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 400;
  letter-spacing: -0.025em;
  color: var(--fg);
  line-height: 1.1;
  margin: 8px 0 12px;
}
.er-title em { font-style: italic; color: var(--accent); }

.er-lede {
  font-size: 15px;
  line-height: 1.65;
  color: var(--fg-2);
  margin: 0;
  max-width: 560px;
}

.er-wizard {
  border: 1px solid var(--line);
  border-radius: var(--r);
  overflow: hidden;
  background: var(--surface);
}

/* ── Map old wizard tokens to Warm Ash & Sage ── */
.er-wizard {
  --sys-violet:        var(--accent);
  --sys-accent:        var(--accent);
  --sys-accent-dim:    rgba(109, 184, 154, 0.35);
  --sys-glow:          rgba(109, 184, 154, 0.22);
  --sys-fg:            var(--fg);
  --sys-fg-dim:        var(--fg-2);
  --sys-fg-muted:      var(--fg-3);
  --sys-border:        var(--line);
  --sys-bg-surface:    var(--surface-2);
  --sys-ok:            var(--accent);
  --sys-err:           #e06c75;
  --sys-mono:          var(--mono);
  --sys-accent-bright: var(--accent-bright);
}

/* "Weiter" inactive button override — Tailwind classes with hardcoded violet */
.er-wizard :deep(.bg-\[rgba\(128\,90\,213\,0\.12\)\]) {
  background-color: rgba(109, 184, 154, 0.10) !important;
}
.er-wizard :deep(.border-\[rgba\(139\,92\,246\,0\.22\)\]) {
  border-color: rgba(109, 184, 154, 0.30) !important;
}

@media (max-width: 900px) {
  .er-head { margin-bottom: 24px; }
}
</style>
