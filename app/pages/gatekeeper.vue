<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="gatekeeper" :soul-meta="soulMeta" :collapsed="sidebarCollapsed" :public-node="publicNode"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="[$t('nav.group_network'), $t('nav.gatekeeper')]" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="page gk-page">
            <div class="gk-head">
              <div class="gk-eyebrow">{{ $t('gatekeeper.eyebrow') }}</div>
              <h1 class="gk-title">{{ $t('gatekeeper.hero_prefix') }} <em>{{ $t('gatekeeper.hero_em') }}</em></h1>
              <p class="gk-sub">{{ $t('gatekeeper.lede') }}</p>
            </div>
            <GatekeeperPanel />
          </div>
        </div>
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
      <ConfirmModal />
    </div>
    <SysPageLoading v-else />
  </ClientOnly>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { useNodeStatus } from '~/composables/useNodeStatus.js'
import GatekeeperPanel from '~/components/GatekeeperPanel.vue'
import ConfirmModal from '~/components/ConfirmModal.vue'

definePageMeta({ layout: false })
const router = useRouter()
const { hasSoul, soulMeta, clear } = useSoul()
const { publicNode, fetchNodeStatus } = useNodeStatus()
onMounted(() => fetchNodeStatus())

const drawerOpen = ref(false), sidebarCollapsed = ref(false), cmdkOpen = ref(false)

function lockGate() { clear(); document.cookie = 'sys_gate=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax'; window.location.href = '/' }
function onNav(id) {
  const routes = { chat:'/session', setup:'/setup', soul:'/soul', chronik:'/chronicle', files:'/vault', maturity:'/maturity', health:'/health', archivar:'/archivar', anchor:'/anchor', export:'/export', peers:'/peers', market:'/marketplace', earnings:'/earnings', settings:'/settings', connect:'/connection', connections:'/connections', wallet:'/wallet', agent:'/agent' }
  if (id === 'gatekeeper') return
  if (routes[id]) { router.push(routes[id]); return }
  drawerOpen.value = false; router.push('/')
}
</script>

<style scoped>
.gk-page { max-width: 720px; margin: 0 auto; padding: 36px clamp(22px,4vw,42px) 88px; }
.gk-head { padding-bottom: 32px; border-bottom: 1px solid var(--line); margin-bottom: 32px; }
.gk-eyebrow {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.18em;
  color: var(--accent); text-transform: uppercase; margin-bottom: 10px;
}
.gk-title {
  font-family: var(--serif); font-size: clamp(32px, 5vw, 48px);
  font-weight: 400; letter-spacing: -0.03em; color: var(--fg);
  line-height: 1.05; margin-bottom: 14px;
}
.gk-title em { font-style: italic; color: var(--accent); }
.gk-sub { font-size: 17px; line-height: 1.65; color: var(--fg); max-width: 560px; margin: 0; }
</style>
