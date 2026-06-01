<template>
  <ClientOnly>
    <div class="app" :class="{ 'drawer-open': drawerOpen }">
      <SysSidebar route="settings" :soul-meta="soulMeta" @go="onNav" @lock="lockGate" @collapse="() => {}" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Einstellungen']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="page es-page">
            <div class="es-header">
              <h2 class="es-title">Einstellungen</h2>
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
import SysSidebar from '~/components/SysSidebar.vue'
import SysTopbar  from '~/components/SysTopbar.vue'
import SettingsModal from '~/components/SettingsModal.vue'
import ConfirmModal  from '~/components/ConfirmModal.vue'
import { useSoul }   from '~/composables/useSoul.js'

definePageMeta({ layout: false })

const router = useRouter()
const { hasSoul, soulMeta, refreshCert, clear } = useSoul()

const drawerOpen = ref(false)
const cmdkOpen   = ref(false)

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
  if (id === 'setup')    { router.push('/einrichten');  return }
  if (id === 'soul')     { router.push('/soul');        return }
  if (id === 'chronik')  { router.push('/chronik');     return }
  if (id === 'files')    { router.push('/dateien');     return }
  if (id === 'market')   { router.push('/marketplace'); return }
  if (id === 'maturity') { router.push('/reife');       return }
  if (id === 'calendar') { router.push('/kalender');    return }
  if (id === 'anchor')   { router.push('/verankern');   return }
  if (id === 'export')   { router.push('/exportieren'); return }
  if (id === 'peers')    { router.push('/peers');       return }
  if (id === 'connect')  { router.push('/verbindung');  return }
  drawerOpen.value = false
  router.push('/')
}

onMounted(() => {
  if (!hasSoul.value) router.replace('/')
})
</script>

<style scoped>
.es-page { max-width: 560px; }
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
