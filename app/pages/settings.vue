<template>
  <ClientOnly>
    <div class="app" :class="{ 'drawer-open': drawerOpen }">
      <SysSidebar route="settings" :soul-meta="soulMeta" :public-node="publicNode" @go="onNav" @lock="lockGate" @collapse="() => {}" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="[t('settings.title')]" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="page es-page">
            <div class="es-header">
              <h2 class="es-title">{{ $t('settings.title') }}</h2>
            </div>
            <SettingsModal inline @master-rotated="handleMasterRotated" />
          </div>
        </div>
      </div>
    </div>
    <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    <ConfirmModal />
  </ClientOnly>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import SysSidebar from '~/components/SysSidebar.vue'
import SysTopbar  from '~/components/SysTopbar.vue'
import SettingsModal from '~/components/SettingsModal.vue'
import ConfirmModal  from '~/components/ConfirmModal.vue'
const { t } = useI18n()
import { useSoul }   from '~/composables/useSoul.js'
import { useNodeStatus } from '~/composables/useNodeStatus.js'

definePageMeta({ layout: false })

const router = useRouter()
const { hasSoul, soulMeta, refreshCert, clear } = useSoul()
const { publicNode, fetchNodeStatus } = useNodeStatus()

const drawerOpen = ref(false)
const cmdkOpen   = ref(false)

onMounted(() => fetchNodeStatus())

async function handleMasterRotated() {
  await refreshCert()
}

function lockGate() {
  clear()
  document.cookie = 'sys_gate=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax'
  window.location.href = '/gate'
}

function onNav(id) {
  if (id === 'settings') return
  if (id === 'home')     { router.push('/');            return }
  if (id === 'chat')     { router.push('/session');     return }
  if (id === 'setup')    { router.push('/setup');  return }
  if (id === 'soul')     { router.push('/soul');        return }
  if (id === 'chronik')  { router.push('/chronicle');     return }
  if (id === 'files')    { router.push('/vault');     return }
  if (id === 'market')   { router.push('/marketplace'); return }
  if (id === 'earnings') { router.push('/earnings');   return }
  if (id === 'maturity') { router.push('/maturity');       return }
  if (id === 'health')   { router.push('/health'); return }
  if (id === 'anchor')   { router.push('/anchor');   return }
  if (id === 'export')   { router.push('/export'); return }
  if (id === 'peers')    { router.push('/peers');       return }
  if (id === 'connect')  { router.push('/connection');  return }
  drawerOpen.value = false
  router.push('/')
}

onMounted(() => {
  if (!hasSoul.value) router.replace('/')
})
</script>

<style scoped>
.es-page { max-width: 560px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
.es-header { margin-bottom: 28px; }
.es-title {
  font-family: var(--serif); font-size: 26px; font-weight: 400;
  letter-spacing: -0.02em; color: var(--fg); margin: 0 0 6px;
}
.es-sub {
  font-family: var(--sans); font-size: 13px; color: var(--fg-3);
  line-height: 1.5; margin: 0;
}
</style>
