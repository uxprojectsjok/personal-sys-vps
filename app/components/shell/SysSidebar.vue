<template>
  <aside class="sidebar">
    <div class="sb-head">
      <span class="sb-mark">SYS<span class="dot">.</span></span>
      <button class="sb-collapse" @click="$emit('collapse')" title="Seitenleiste" aria-label="Seitenleiste einklappen">
        <SysIcon name="panel" style="width:17px;height:17px" />
      </button>
    </div>

    <button class="sb-soul" @click="$emit('go', 'soul')" :title="soulMeta?.id || ''">
      <span class="sb-avatar">{{ initial }}</span>
      <span class="sb-soul-meta">
        <span class="sb-soul-name">{{ soulMeta?.name || 'Soul' }}</span>
        <span class="sb-soul-id">#{{ shortId }}</span>
      </span>
    </button>

    <nav class="sb-nav">
      <div v-for="(grp, gi) in NAV" :key="gi" class="sb-group">
        <div v-if="grp.group" class="sb-group-label">{{ grp.group }}</div>
        <button
          v-for="it in grp.items"
          :key="it.id"
          :class="['nav-item', { active: route === it.id }]"
          @click="$emit('go', it.id)"
          :title="it.label"
        >
          <SysIcon :name="it.icon" class="nav-ic" />
          <span>{{ it.label }}</span>
          <span v-if="it.badge" class="nav-badge">{{ it.badge }}</span>
          <span v-if="it.tag" class="nav-tag">{{ it.tag }}</span>
        </button>
      </div>
    </nav>

    <div class="sb-foot">
      <div class="sb-node">
        <span class="live-dot" />
        <span>Private Node</span>
        <button class="lock" title="Node sperren" aria-label="Node sperren" @click="$emit('lock')">
          <SysIcon name="lock" style="width:16px;height:16px" />
        </button>
      </div>
      <div class="sb-mat-row">
        <span>Soul-Reife</span>
        <b>{{ soulMeta?.maturity ?? 0 }}%</b>
      </div>
      <div class="sb-mat-bar">
        <div class="sb-mat-fill" :style="{ width: (soulMeta?.maturity ?? 0) + '%' }" />
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  route: { type: String, default: 'home' },
  soulMeta: { type: Object, default: null },
  collapsed: { type: Boolean, default: false },
})

defineEmits(['collapse', 'lock', 'go'])

const initial = computed(() => (props.soulMeta?.name || 'S')[0].toUpperCase())
const shortId = computed(() => {
  const id = props.soulMeta?.id || ''
  return id ? id.slice(0, 8) : '--------'
})

const NAV = [
  { group: null, items: [{ id: 'home', icon: 'home', label: 'Start' }] },
  { group: 'Seele', items: [
    { id: 'chat', icon: 'chat', label: 'Session' },
    { id: 'soul', icon: 'soul', label: 'sys.md' },
    { id: 'chronik', icon: 'history', label: 'Chronik' },
    { id: 'maturity', icon: 'spark', label: 'Reife' },
  ]},
  { group: 'Vault', items: [
    { id: 'files', icon: 'files', label: 'Dateien' },
    { id: 'calendar', icon: 'calendar', label: 'Kalender' },
  ]},
  { group: 'Netzwerk', items: [
    { id: 'peers', icon: 'peers', label: 'Peers' },
    { id: 'connect', icon: 'qr', label: 'Verbindung', tag: 'neu' },
    { id: 'market', icon: 'market', label: 'Marketplace' },
  ]},
  { group: 'System', items: [
    { id: 'anchor', icon: 'anchor', label: 'Verankern' },
    { id: 'export', icon: 'export', label: 'Exportieren' },
    { id: 'settings', icon: 'settings', label: 'Einstellungen' },
  ]},
]
</script>
