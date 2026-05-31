<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="files" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Vault', 'Dateien']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="() => {}" />

        <div class="scroll">
          <div class="dateien-page">

            <!-- ── Hero ── -->
            <div class="dt-hero">
              <div class="dt-eyebrow">VAULT</div>
              <h1 class="dt-title">Dein Kontext, <em>verschlüsselt</em></h1>
            </div>

            <!-- ── Explorer ── -->
            <div class="dt-explorer">
              <VaultExplorer :soul-cert="soulToken" :soul-content="soulContent" />
            </div>

          </div>
        </div>
      </div>
    </div>

    <div v-else class="sys-loading">
      <span>SYS · Dateien lädt</span>
    </div>
  </ClientOnly>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import VaultExplorer from '~/components/VaultExplorer.vue'

definePageMeta({ layout: false })

const router = useRouter()
const { soulContent, soulMeta, hasSoul, soulToken } = useSoul()

const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)

function lockGate() {
  document.cookie = 'sys_token=; Max-Age=0; path=/'
  window.location.href = '/gate'
}

function onNav(id) {
  if (id === 'files')    return
  if (id === 'chat')     { router.push('/session');  return }
  if (id === 'soul')     { router.push('/soul');     return }
  if (id === 'chronik')  { router.push('/chronik');  return }
  if (id === 'maturity') { router.push('/reife');    return }
  if (id === 'calendar') { router.push('/kalender'); return }
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

.dateien-page {
  max-width: 900px;
  padding: 32px clamp(16px, 3vw, 32px) 80px;
}

/* ── Hero ── */
.dt-hero {
  padding-bottom: 24px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 28px;
}
.dt-eyebrow {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em;
  color: var(--accent); text-transform: uppercase; margin-bottom: 10px;
}
.dt-title {
  font-family: var(--serif); font-size: clamp(28px, 4vw, 42px);
  font-weight: 400; letter-spacing: -0.03em; color: var(--fg);
  line-height: 1.05; margin: 0;
}
.dt-title em { font-style: italic; color: var(--fg-2); }

/* ── VaultExplorer overrides ── */
.dt-explorer :deep(.rounded-none) { border-radius: 0 !important; }
.dt-explorer :deep(.rounded-xl),
.dt-explorer :deep(.rounded-2xl),
.dt-explorer :deep(.rounded-lg),
.dt-explorer :deep(.rounded-md) { border-radius: 0 !important; }
.dt-explorer :deep(.rounded-full) { border-radius: 2px !important; }

/* Outer container */
.dt-explorer :deep(> div) {
  background: transparent !important;
  border: none !important;
}

/* Tab bar */
.dt-explorer :deep(.flex.gap-1.p-1) {
  background: var(--surface-2) !important;
  border: 1px solid var(--line) !important;
  border-radius: var(--r-xs) !important;
  padding: 4px !important;
}
.dt-explorer :deep(.flex.gap-1.p-1 button) {
  height: 30px !important; font-size: 13px !important;
  font-family: var(--sans) !important;
  color: var(--fg-3) !important;
  background: transparent !important;
}
.dt-explorer :deep(.flex.gap-1.p-1 button.bg-white\/12) {
  background: var(--surface) !important;
  color: var(--fg) !important;
  border: 1px solid var(--line-2) !important;
}

/* File rows */
.dt-explorer :deep(.divide-y) {
  border: 1px solid var(--line) !important;
}
.dt-explorer :deep(.divide-y > div) {
  border-color: var(--line) !important;
}

/* Text overrides */
.dt-explorer :deep(.text-white\/70),
.dt-explorer :deep(.text-white\/60),
.dt-explorer :deep(.text-white\/65) { color: var(--fg-2) !important; }
.dt-explorer :deep(.text-white\/40),
.dt-explorer :deep(.text-white\/35),
.dt-explorer :deep(.text-white\/30) { color: var(--fg-3) !important; }
.dt-explorer :deep(.text-white)     { color: var(--fg)   !important; }
.dt-explorer :deep(.text-white\/50) { color: var(--fg-2) !important; }

/* Section labels */
.dt-explorer :deep(.text-\[10px\]) {
  font-family: var(--mono) !important;
  color: var(--fg-4) !important;
  letter-spacing: 0.1em !important;
}

/* Buttons */
.dt-explorer :deep(button.border) {
  border-color: var(--line-2) !important;
  color: var(--fg-2) !important;
}
.dt-explorer :deep(button.border:hover) {
  color: var(--fg) !important;
  background: var(--surface-2) !important;
}

/* Upload/action buttons with accent */
.dt-explorer :deep(.bg-\[var\(--sys-accent\)\]),
.dt-explorer :deep([class*="bg-violet"]),
.dt-explorer :deep([class*="bg-indigo"]) {
  background: var(--accent) !important;
  color: var(--on-accent) !important;
}

/* Progress bars */
.dt-explorer :deep([class*="bg-violet"],  [class*="bg-indigo"]) {
  background: var(--accent) !important;
}

/* Backgrounds */
.dt-explorer :deep(.bg-white\/4),
.dt-explorer :deep(.bg-white\/5),
.dt-explorer :deep(.bg-white\/8),
.dt-explorer :deep(.bg-white\/12) {
  background: var(--surface-2) !important;
}
.dt-explorer :deep(.bg-white\/\[0\.07\]),
.dt-explorer :deep(.bg-white\/\[0\.05\]) {
  background: var(--surface) !important;
}

/* Borders */
.dt-explorer :deep(.border-white\/10),
.dt-explorer :deep(.border-white\/8),
.dt-explorer :deep(.border-white\/\[0\.07\]),
.dt-explorer :deep(.border-white\/\[0\.05\]) {
  border-color: var(--line) !important;
}

@media (max-width: 900px) {
  .dt-title { font-size: clamp(24px, 7vw, 32px); }
}
</style>
