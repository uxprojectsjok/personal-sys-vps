<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="connections" :soul-meta="soulMeta" :collapsed="sidebarCollapsed" :public-node="publicNode"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="[$t('nav.group_network'), $t('nav.connections')]" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="page cx-page">
            <div class="cx-head">
              <h1 class="cx-title">{{ $t('nav.connections') }}</h1>
            </div>
            <SoulConnectionsPanel />
          </div>
        </div>
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>
    <SysPageLoading v-else />
  </ClientOnly>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { useNodeStatus } from '~/composables/useNodeStatus.js'
import SoulConnectionsPanel from '~/components/SoulConnectionsPanel.vue'

definePageMeta({ layout: false })
const router = useRouter()
const { hasSoul, soulMeta, clear } = useSoul()
const { publicNode, fetchNodeStatus } = useNodeStatus()
onMounted(() => fetchNodeStatus())

const drawerOpen = ref(false), sidebarCollapsed = ref(false), cmdkOpen = ref(false)

function lockGate() { clear(); document.cookie = 'sys_gate=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax'; window.location.href = '/' }
function onNav(id) {
  const routes = { chat:'/session', setup:'/setup', soul:'/soul', chronik:'/chronicle', files:'/vault', maturity:'/maturity', health:'/health', archivar:'/archivar', anchor:'/anchor', export:'/export', peers:'/peers', market:'/marketplace', earnings:'/earnings', settings:'/settings', connect:'/connection', gatekeeper:'/gatekeeper', wallet:'/wallet', agent:'/agent' }
  if (id === 'connections') return
  if (routes[id]) { router.push(routes[id]); return }
  drawerOpen.value = false; router.push('/')
}
</script>

<style scoped>
.cx-page { max-width: 720px; margin: 0 auto; padding: 36px clamp(22px,4vw,42px) 88px; }
.cx-head { padding-bottom: 28px; border-bottom: 1px solid var(--line); margin-bottom: 32px; }
.cx-title { font-family: var(--serif); font-size: clamp(28px,4vw,42px); font-weight: 400; letter-spacing: -0.03em; color: var(--fg); line-height: 1.05; margin: 0; }
</style>
