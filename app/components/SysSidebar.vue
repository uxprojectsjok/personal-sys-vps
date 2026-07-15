<template>
  <aside class="sidebar">
    <div class="sb-head">
      <div class="sb-head-top">
        <span class="sb-mark">SYS<span class="dot">.</span></span>
        <button class="sb-collapse" @click="$emit('collapse')" :title="$t('nav.sidebar_toggle')" :aria-label="$t('nav.sidebar_collapse')">
          <SysIcon name="panel" style="width:19px;height:19px" />
        </button>
      </div>
      <div class="sb-node">
        <span class="live-dot" />
        <span>{{ props.publicNode ? $t('nav.public_node') : $t('nav.private_node') }}</span>
        <button class="lock" :title="$t('nav.lock_node')" :aria-label="$t('nav.lock_node')" @click="$emit('lock')">
          <SysIcon name="lock" style="width:20px;height:20px" />
        </button>
      </div>
    </div>

    <button class="sb-soul" @click="$emit('go', 'soul')" :title="soulMeta?.id || ''">
      <span class="sb-avatar">{{ initial }}</span>
      <span class="sb-soul-meta">
        <span class="sb-soul-name">{{ soulMeta?.name || 'Soul' }}</span>
        <span class="sb-soul-id">#{{ shortId }}</span>
      </span>
    </button>

    <nav class="sb-nav">
      <div v-for="(grp, gi) in nav" :key="gi" class="sb-group">
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

  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  route: { type: String, default: 'home' },
  soulMeta: { type: Object, default: null },
  collapsed: { type: Boolean, default: false },
  publicNode: { type: Boolean, default: true },
})

defineEmits(['collapse', 'lock', 'go'])

const initial = computed(() => (props.soulMeta?.name || 'S')[0].toUpperCase())
const shortId = computed(() => {
  const id = props.soulMeta?.id || ''
  return id ? id.slice(0, 8) : '--------'
})

const nav = computed(() => [
  { group: null, items: [{ id: 'home', icon: 'home', label: t('nav.home') }] },
  { group: t('nav.group_soul'), items: [
    { id: 'setup',    icon: 'edit',    label: t('nav.setup') },
    { id: 'chat',     icon: 'chat',    label: t('nav.session') },
    { id: 'soul',     icon: 'soul',    label: t('nav.contents') },
    { id: 'chronik',  icon: 'history', label: t('nav.chronik') },
    { id: 'maturity', icon: 'spark',   label: t('nav.maturity') },
    { id: 'health',   icon: 'pulse',   label: t('nav.health') },
  ]},
  { group: t('nav.group_vault'), items: [
    { id: 'files',    icon: 'files',    label: t('nav.files') },
  ]},
  { group: t('nav.group_network'), items: [
    { id: 'peers',    icon: 'peers',  label: t('nav.peers') },
    { id: 'connect',  icon: 'qr',     label: t('nav.connect') },
    // Marketplace/Earnings: Private Node hat serverseitig ohnehin keinen
    // Zugriff (soul_amortization.lua/soul_pay.lua lehnen ab) — hier zusätzlich
    // aus der Navigation genommen, damit der Nutzer nicht ins Leere klickt.
    ...(props.publicNode ? [
      { id: 'market',   icon: 'market', label: t('nav.marketplace') },
      { id: 'earnings', icon: 'earn',   label: t('nav.earnings') },
    ] : []),
  ]},
  { group: t('nav.group_tools'), items: [
    { id: 'anchor',   icon: 'anchor',   label: t('nav.anchor') },
    { id: 'export',   icon: 'export',   label: t('nav.export') },
    { id: 'settings', icon: 'settings', label: t('nav.settings') },
  ]},
])
</script>
