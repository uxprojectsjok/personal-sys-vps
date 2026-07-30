<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="archivar" :soul-meta="soulMeta" :collapsed="sidebarCollapsed" :public-node="publicNode"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="[$t('nav.group_soul'), $t('nav.archivar')]" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="page ar-page">
            <div class="ar-head">
              <h1 class="ar-title">{{ $t('nav.archivar') }}</h1>
            </div>

            <!-- LONGMEM Status -->
            <div class="sys-field" style="margin-bottom:24px">
              <div class="sys-field-label" style="margin-bottom:10px">{{ $t('settings.longmem_title') }}</div>
              <div v-if="archivLoading" class="archivar-loading">{{ $t('common.loading') }}</div>
              <template v-else>
                <div class="archivar-lm-block">
                  <div class="archivar-lm-row">
                    <span class="archivar-lm-key">{{ $t('settings.facts_label') }}</span>
                    <span class="archivar-lm-val" :class="longmemFacts > 0 ? 'archivar-lm-ok' : 'archivar-lm-dim'">
                      {{ longmemFacts > 0 ? $t('settings.facts_count', { n: longmemFacts }) : $t('chat.no_facts') }}
                    </span>
                  </div>
                  <div class="archivar-lm-row">
                    <span class="archivar-lm-key">{{ $t('settings.last_cleanup') }}</span>
                    <span class="archivar-lm-val archivar-lm-dim">{{ longmemUpdated || '—' }}</span>
                  </div>
                  <div class="archivar-lm-row">
                    <span class="archivar-lm-key">{{ $t('settings.size') }}</span>
                    <span class="archivar-lm-val archivar-lm-dim">{{ longmemSizeKb }}</span>
                  </div>
                  <div class="archivar-lm-row">
                    <span class="archivar-lm-key">{{ $t('chat.chaos') }}</span>
                    <span class="archivar-lm-val archivar-chaos-wrap">
                      <span class="archivar-chaos-bar">
                        <span class="archivar-chaos-fill" :style="{ width: longmemChaos.pct + '%', background: longmemChaos.color }" />
                      </span>
                      <span :style="{ color: longmemChaos.color }">{{ longmemChaos.label }}</span>
                    </span>
                  </div>
                </div>
                <button
                  class="sys-btn-ed sys-btn-ed--primary"
                  style="margin-top:14px;width:100%;justify-content:center"
                  :disabled="crystallizeBusy"
                  @click="triggerCrystallize"
                ><span v-if="crystallizeBusy" class="dots-running">{{ $t('settings.cleanup_running') }}</span><template v-else>{{ $t('settings.cleanup_now') }}</template></button>
                <Transition name="sys-modal-fade">
                  <div v-if="archivFeedback" style="margin-top:10px;padding:10px 14px;border-left:2px solid;font-family:var(--sys-mono);font-size:11px"
                    :style="archivFeedback.ok
                      ? 'border-color:var(--sys-ok);color:var(--sys-ok);background:rgba(184,220,196,0.06)'
                      : 'border-color:var(--sys-err);color:var(--sys-err);background:rgba(240,163,163,0.06)'"
                  >{{ archivFeedback.message }}</div>
                </Transition>
              </template>
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
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSoul } from '~/composables/useSoul.js'
import { useNodeStatus } from '~/composables/useNodeStatus.js'

definePageMeta({ layout: false })
const { t } = useI18n()
const router = useRouter()
const { hasSoul, soulMeta, soulToken, clear } = useSoul()
const { publicNode, fetchNodeStatus } = useNodeStatus()
onMounted(() => { fetchNodeStatus(); loadArchivStatus() })

const drawerOpen = ref(false), sidebarCollapsed = ref(false), cmdkOpen = ref(false)

function lockGate() { clear(); document.cookie = 'sys_gate=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax'; window.location.href = '/' }
function onNav(id) {
  const routes = { chat:'/session', setup:'/setup', soul:'/soul', chronik:'/chronicle', files:'/vault', maturity:'/maturity', health:'/health', anchor:'/anchor', export:'/export', peers:'/peers', market:'/marketplace', earnings:'/earnings', settings:'/settings', connect:'/connection', connections:'/connections', gatekeeper:'/gatekeeper', wallet:'/wallet', agent:'/agent' }
  if (id === 'archivar') return
  if (routes[id]) { router.push(routes[id]); return }
  drawerOpen.value = false; router.push('/')
}

// ── Archivar (LONGMEM Kristallisation) ──────────────────────────────────────────
const herzActive       = ref(false)
const longmemFacts     = ref(0)
const longmemUpdated   = ref('')
const bootstrapPending = ref(false)
const archivLoading    = ref(false)
const crystallizeBusy   = ref(false)
const longmemSizeBytes  = ref(0)
const longmemLogEntries = ref(0)
const longmemDaysSince  = ref(0)

const longmemSizeKb = computed(() => {
  const kb = longmemSizeBytes.value / 1024
  return kb < 1 ? longmemSizeBytes.value + ' B' : kb.toFixed(1) + ' KB'
})

const longmemChaos = computed(() => {
  const e = longmemLogEntries.value, d = longmemDaysSince.value
  const pct = Math.min(100, Math.round(e / 15 * 70 + d / 30 * 30))
  if (e <= 7 && d <= 14) return { pct: Math.max(8, pct), color: '#22c55e', label: t('settings.chaos_calm') }
  if (e <= 12 || d <= 21) return { pct: Math.max(40, pct), color: '#f59e0b', label: t('settings.chaos_growing') }
  return { pct: 100, color: '#ef4444', label: t('settings.chaos_chaotic') }
})
const archivFeedback   = ref(null)

async function loadArchivStatus() {
  archivLoading.value = true
  try {
    const [herzRes, lmRes] = await Promise.all([
      fetch('/api/soul/herz/status', {
        headers: { Authorization: `Bearer ${soulToken.value}` }
      }).then(r => r.json()).catch(() => null),
      fetch('/api/soul/longmem-status', {
        headers: { Authorization: `Bearer ${soulToken.value}` }
      }).then(r => r.json()).catch(() => null),
    ])
    herzActive.value        = herzRes?.active ?? false
    longmemFacts.value      = lmRes?.facts ?? 0
    longmemUpdated.value    = lmRes?.updated ?? ''
    bootstrapPending.value  = lmRes?.bootstrap_pending ?? false
    longmemSizeBytes.value  = lmRes?.size_bytes ?? 0
    longmemLogEntries.value = lmRes?.log_entries ?? 0
    longmemDaysSince.value  = lmRes?.days_since_cleanup ?? 0
  } finally {
    archivLoading.value = false
  }
}

async function triggerCrystallize() {
  const token = soulToken.value
  if (!token || token === 'anonymous') {
    archivFeedback.value = { ok: false, message: t('settings.soul_not_loaded') }
    setTimeout(() => { archivFeedback.value = null }, 8000)
    return
  }
  crystallizeBusy.value = true
  archivFeedback.value  = null
  try {
    const res = await fetch('/api/soul/herz/crystallize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    await loadArchivStatus()
    crystallizeBusy.value = false
    if (data?.ok) {
      archivFeedback.value = { ok: true, message: t('settings.cleanup_done') }
      setTimeout(() => { archivFeedback.value = null }, 5000)
    } else {
      archivFeedback.value = { ok: false, message: data?.error || t('settings.cleanup_error') }
      setTimeout(() => { archivFeedback.value = null }, 8000)
    }
  } catch {
    crystallizeBusy.value = false
    archivFeedback.value = { ok: false, message: t('common.network_error') }
    setTimeout(() => { archivFeedback.value = null }, 8000)
  }
}
</script>

<style scoped>
.ar-page { max-width: 720px; margin: 0 auto; padding: 36px clamp(22px,4vw,42px) 88px; }
.ar-head { padding-bottom: 28px; border-bottom: 1px solid var(--line); margin-bottom: 32px; }
.ar-title { font-family: var(--serif); font-size: clamp(28px,4vw,42px); font-weight: 400; letter-spacing: -0.03em; color: var(--fg); line-height: 1.05; margin: 0; }
</style>
