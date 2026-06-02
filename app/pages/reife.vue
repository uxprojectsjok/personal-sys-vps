<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="maturity" :soul-meta="soulMeta ? { ...soulMeta, maturity: data.score } : null" :collapsed="sidebarCollapsed" @go="onNav" @lock="lockSoul" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Seele', 'Reife']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
        <div class="page rf-page">

          <!-- Header -->
          <div class="rf-head">
            <div class="eyebrow">Soul-Reife</div>
            <h1 class="rf-title">Wie deine Seele <em>wächst</em></h1>
            <p class="rf-lede">Reife misst die Tiefe und Konsistenz deiner Identität — nicht Aktivität, sondern Substanz. Sie steigt durch echten Dialog, reichen Kontext und Verankerung.</p>
          </div>

          <!-- Ring + Levels -->
          <div class="rf-hero">
            <!-- Circular ring -->
            <div class="rf-ring-wrap">
              <svg viewBox="0 0 160 160" class="rf-ring-svg">
                <circle cx="80" cy="80" r="66" fill="none" stroke="rgba(245,241,234,0.07)" stroke-width="12" />
                <circle cx="80" cy="80" r="66" fill="none" stroke="var(--accent)" stroke-width="12"
                  stroke-linecap="round"
                  :stroke-dasharray="CIRC"
                  :stroke-dashoffset="CIRC * (1 - data.score / 100)"
                  transform="rotate(-90 80 80)"
                  style="transition: stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)"
                />
              </svg>
              <div class="rf-ring-inner">
                <span class="rf-pct">{{ data.score }}</span>
                <span class="rf-unit">%</span>
                <span class="rf-level-name">{{ currentDisplayLevel?.name }}</span>
                <span v-if="nextLevelHint" class="rf-next-hint">{{ nextLevelHint }}</span>
              </div>
            </div>

            <!-- Level ladder -->
            <ol class="rf-levels">
              <li v-for="lv in DISPLAY_LEVELS" :key="lv.name"
                  class="rf-level"
                  :class="{ 'active': currentDisplayLevel?.name === lv.name, 'done': data.score > lv.max }">
                <span class="rf-lv-check">
                  <svg v-if="data.score > lv.max" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m3 8 4 4 6-7"/></svg>
                  <span v-else class="rf-lv-num">{{ lv.num }}</span>
                </span>
                <span class="rf-lv-name">{{ lv.name }}</span>
                <span class="rf-lv-range">{{ lv.range }}</span>
              </li>
            </ol>
          </div>

          <!-- Stat cards -->
          <div class="rf-section-head">Was deine Reife trägt</div>
          <div class="rf-cards">
            <div v-for="card in CARDS" :key="card.key" class="rf-card">
              <div class="rf-card-top">
                <span class="rf-card-icon"><component :is="card.icon" /></span>
                <span class="rf-card-pct">{{ cardPct(card) }}<small>%</small></span>
              </div>
              <div class="rf-card-title">{{ card.label }}</div>
              <div class="rf-card-desc">{{ cardDesc(card) }}</div>
              <div class="rf-card-bar">
                <div class="rf-card-fill" :style="{ width: cardPct(card) + '%' }" />
              </div>
            </div>
          </div>

        </div>
        </div><!-- /scroll -->
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>
    <div v-else class="sys-loading"><span>SYS · wird geladen</span></div>
    <SysMobileNav />
  </ClientOnly>
</template>

<script setup>
definePageMeta({ layout: false })
import { ref, computed, h } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { useVault } from '~/composables/useVault.js'
import { computeMaturity } from '#shared/utils/soulMaturity.js'

const router = useRouter()
const { hasSoul, soulContent, soulMeta, clear: _clear } = useSoul()
const { allFiles } = useVault()

const drawerOpen      = ref(false)
const sidebarCollapsed = ref(false)
const cmdkOpen        = ref(false)

function lockSoul() {
  _clear?.()
  document.cookie = 'sys_gate=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax'
  window.location.href = '/gate'
}

function onNav(id) {
  if (id === 'maturity') return
  if (id === 'chat')     { router.push('/session');     return }
  if (id === 'setup')    { router.push('/einrichten');   return }
  if (id === 'soul')     { router.push('/soul');        return }
  if (id === 'chronik')  { router.push('/chronik');     return }
  if (id === 'files')    { router.push('/dateien');     return }
  if (id === 'market')   { router.push('/marketplace'); return }
  if (id === 'calendar') { router.push('/kalender');    return }
  if (id === 'anchor')   { router.push('/verankern');    return }
  if (id === 'export')   { router.push('/exportieren'); return }
  if (id === 'peers')    { router.push('/peers');       return }
  if (id === 'connect')  { router.push('/verbindung');  return }
  if (id === 'settings') { router.push('/einstellungen'); return }
  router.push('/')
}

const syncedFiles = computed(() => {
  if (!allFiles.value?.length) return {}
  const AUDIO_EXTS = ['mp3', 'ogg', 'wav', 'flac', 'aac', 'm4a', 'opus', 'webm', 'weba']
  return {
    audio:   allFiles.value.filter(f => AUDIO_EXTS.includes(f.kind)),
    images:  allFiles.value.filter(f => f.kind === 'image' || f.kind === 'profile'),
    context: allFiles.value.filter(f => f.name?.includes('context')),
  }
})

const data = computed(() => {
  if (!soulContent.value) return { score: 0, level: 'Genesis', breakdown: null }
  return computeMaturity(soulContent.value, syncedFiles.value)
})

// Ring circumference (r=66)
const CIRC = 2 * Math.PI * 66

const DISPLAY_LEVELS = [
  { num: '01', name: 'Keim',      range: '0 – 14 %',  min: 0,  max: 14  },
  { num: '02', name: 'Aufbau',    range: '15 – 34 %', min: 15, max: 34  },
  { num: '03', name: 'Etabliert', range: '35 – 74 %', min: 35, max: 74  },
  { num: '04', name: 'Reif',      range: '75 – 95 %', min: 75, max: 95  },
  { num: '05', name: 'Souverän',  range: '96 – 100 %',min: 96, max: 100 },
]

const currentDisplayLevel = computed(() => {
  const s = data.value.score
  return DISPLAY_LEVELS.find(l => s >= l.min && s <= l.max) ?? DISPLAY_LEVELS[0]
})

const nextLevelHint = computed(() => {
  const s = data.value.score
  const next = DISPLAY_LEVELS.find(l => l.min > s)
  if (!next) return null
  return `${next.min - s} bis ${next.name}`
})

// Icon components (inline SVG via h())
const IconChat    = { render: () => h('svg', { viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', 'stroke-width':'1.6', 'stroke-linecap':'round', 'stroke-linejoin':'round' }, [h('path', { d:'M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1Z' })]) }
const IconDoc     = { render: () => h('svg', { viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', 'stroke-width':'1.6', 'stroke-linecap':'round', 'stroke-linejoin':'round' }, [h('path', { d:'M4 5a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Z' })]) }
const IconFolder  = { render: () => h('svg', { viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', 'stroke-width':'1.6', 'stroke-linecap':'round', 'stroke-linejoin':'round' }, [h('path', { d:'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z' })]) }
const IconPeers   = { render: () => h('svg', { viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', 'stroke-width':'1.6', 'stroke-linecap':'round', 'stroke-linejoin':'round' }, [h('path', { d:'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 8a6 6 0 0 1 12 0M17 7a3 3 0 0 1 0 6m4 6a5 5 0 0 0-4-4.9' })]) }
const IconAnchor  = { render: () => h('svg', { viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', 'stroke-width':'1.6', 'stroke-linecap':'round', 'stroke-linejoin':'round' }, [h('path', { d:'M12 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm0 0v14m0 0c-3.5 0-6.5-2.5-7-6m7 6c3.5 0 6.5-2.5 7-6M5 11H3m18 0h-2' })]) }
const IconSpark   = { render: () => h('svg', { viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', 'stroke-width':'1.6', 'stroke-linecap':'round', 'stroke-linejoin':'round' }, [h('path', { d:'M12 3v6m0 6v6m9-9h-6m-6 0H3m13.5-6.5-3 3m-5 5-3 3m11 0-3-3m-5-5-3-3' })]) }

const CARDS = [
  { key: 'session', label: 'Session-Tiefe',  icon: IconChat,   max: 8  },
  { key: 'sysmd',   label: 'sys.md-Reichtum',icon: IconDoc,    max: 12 },
  { key: 'vault',   label: 'Vault-Kontext',  icon: IconFolder, max: 20 },
  { key: 'social',  label: 'Soziale Resonanz',icon: IconPeers,  max: 10 },
  { key: 'anchor',  label: 'Verankerung',    icon: IconAnchor, max: 15 },
  { key: 'skills',  label: 'Konsistenz',     icon: IconSpark,  max: 15 },
]

function cardPct(card) {
  const b = data.value.breakdown
  if (!b) return 0
  const vals = { session: b.sessionLog, sysmd: b.tiefe - b.sessionLog, vault: b.archiv, social: b.netzwerk, anchor: b.growthChain, skills: b.signatur }
  return Math.round(Math.min((vals[card.key] ?? 0) / card.max, 1) * 100)
}

function cardDesc(card) {
  const b = data.value.breakdown
  if (!b) return '—'
  switch (card.key) {
    case 'session': return b.sessionCount > 0
      ? `${b.sessionCount} Sessions · konsistenter Dialog`
      : 'Noch keine Session-Einträge'
    case 'sysmd': {
      const filled = Object.values(b.sectionScores ?? {}).filter(v => v > 0).length
      return `${filled} von 8 Sektionen gefüllt`
    }
    case 'vault': {
      const parts = []
      if (b.vaultAudio  > 0) parts.push('Audio')
      if (b.vaultImages > 0) parts.push('Bilder')
      if (b.vaultContext > 0) parts.push('Kontext')
      return parts.length ? parts.join(', ') + ' verknüpft' : 'Noch keine Vault-Dateien'
    }
    case 'social': return b.netzwerk > 0 ? `${b.netzwerk} Verbindungspunkte` : 'Keine Peers verbunden'
    case 'anchor': return b.growthChain > 0 ? `${b.growthChain} Wachstumseinträge` : 'Noch nicht verankert'
    case 'skills': return b.signatureHints?.length ? b.signatureHints.slice(0, 3).join(' · ') + ' erkannte Skills' : 'Noch keine Signatur-Merkmale'
    default: return '—'
  }
}
</script>

<style scoped>
.sys-loading {
  min-height: 100dvh; display: flex; align-items: center; justify-content: center;
  background: var(--bg); color: var(--fg-3);
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
}
.rf-page {
  max-width: 900px;
  padding-top: 32px;
  padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
}
/* ── Header ── */
.rf-head { margin-bottom: 40px; }
.rf-title {
  font-family: var(--serif); font-size: clamp(32px, 4vw, 48px);
  font-weight: 400; letter-spacing: -0.02em; color: var(--fg);
  line-height: 1.1; margin: 8px 0 14px;
}
.rf-title em { color: var(--accent); font-style: italic; }
.rf-lede { font-size: 15px; line-height: 1.65; color: var(--fg-2); max-width: 56ch; margin: 0; }

/* ── Hero (ring + levels) ── */
.rf-hero {
  display: grid; grid-template-columns: auto 1fr;
  gap: 48px; align-items: center;
  margin-bottom: 52px;
}
@media (max-width: 640px) {
  .rf-hero { grid-template-columns: 1fr; gap: 32px; }
}
.rf-ring-wrap {
  position: relative; width: 200px; height: 200px; flex: none;
  display: grid; place-items: center;
}
.rf-ring-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.rf-ring-inner {
  display: flex; flex-direction: column; align-items: center; gap: 0;
  z-index: 1;
}
.rf-pct {
  font-family: var(--serif); font-size: 52px; font-weight: 400;
  letter-spacing: -0.03em; color: var(--fg); line-height: 1;
}
.rf-unit { font-family: var(--mono); font-size: 14px; color: var(--fg-3); letter-spacing: 0.06em; }
.rf-level-name {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--accent); margin-top: 4px;
}
.rf-next-hint {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.10em;
  text-transform: uppercase; color: var(--fg-4); margin-top: 2px;
}

/* ── Levels ── */
.rf-levels { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.rf-level {
  display: flex; align-items: center; gap: 12px;
  padding: 9px 14px; border-radius: 6px;
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.06em;
  color: var(--fg-2); transition: background 0.15s, color 0.15s;
}
.rf-level.done { color: var(--fg-2); }
.rf-level.done .rf-lv-name { color: var(--fg); }
.rf-level.active {
  background: rgba(109,184,154,0.10);
  border: 1px solid rgba(109,184,154,0.25);
  color: var(--fg);
}
.rf-level.active .rf-lv-name { color: var(--accent); font-weight: 600; }
.rf-lv-check {
  width: 20px; height: 20px; flex: none; display: grid; place-items: center;
  border: 1px solid var(--rule-2); border-radius: 50%;
  color: var(--fg-3); font-size: 10px;
}
.rf-level.done .rf-lv-check { border-color: var(--accent); color: var(--accent); }
.rf-level.done .rf-lv-check svg { width: 12px; height: 12px; }
.rf-level.active .rf-lv-check { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.rf-lv-num { font-size: 9px; color: inherit; }
.rf-lv-name { flex: 1; text-transform: uppercase; font-size: 13px; letter-spacing: 0.08em; }
.rf-lv-range { font-size: 11px; color: var(--fg-3); white-space: nowrap; }

/* ── Stat cards ── */
.rf-section-head {
  font-family: var(--serif); font-size: 22px; font-weight: 400;
  color: var(--fg); letter-spacing: -0.01em; margin-bottom: 20px;
}
.rf-cards {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
}
@media (max-width: 720px) { .rf-cards { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px) { .rf-cards { grid-template-columns: 1fr; } }
.rf-card {
  background: var(--surface); border: 1px solid var(--line);
  padding: 16px 16px 12px; display: flex; flex-direction: column; gap: 6px;
}
.rf-card-top {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
  margin-bottom: 2px;
}
.rf-card-icon { width: 18px; height: 18px; color: var(--fg-3); flex: none; }
.rf-card-icon svg { width: 18px; height: 18px; }
.rf-card-pct {
  font-family: var(--serif); font-size: 22px; color: var(--fg); line-height: 1;
  letter-spacing: -0.02em;
}
.rf-card-pct small { font-family: var(--mono); font-size: 10px; color: var(--fg-3); vertical-align: super; }
.rf-card-title { font-size: 13px; font-weight: 600; color: var(--fg); line-height: 1.2; }
.rf-card-desc { font-size: 13px; color: var(--fg-2); line-height: 1.5; font-family: var(--mono); flex: 1; }
.rf-card-bar {
  height: 2px; background: var(--line); margin-top: 6px; border-radius: 1px; overflow: hidden;
}
.rf-card-fill {
  height: 100%; background: var(--accent); border-radius: 1px;
  transition: width 0.8s cubic-bezier(0.4,0,0.2,1);
  min-width: 0;
}
</style>
