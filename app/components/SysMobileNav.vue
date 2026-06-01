<template>
  <nav class="mob-tab-bar">
    <button
      v-for="tab in TABS" :key="tab.id"
      class="mob-tab"
      :class="{ active: current === tab.id }"
      @click="go(tab)"
      :aria-label="tab.label"
    >
      <SysIcon :name="tab.icon" class="mob-tab-icon" />
      <span class="mob-tab-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route  = useRoute()
const router = useRouter()

const TABS = [
  { id: 'start',        label: 'Start',        icon: 'home',     path: '/'               },
  { id: 'session',      label: 'Session',      icon: 'chat',     path: '/session'        },
  { id: 'einstellungen', label: 'Einstellungen', icon: 'settings', path: '/einstellungen' },
  { id: 'gate',         label: 'Gate',         icon: 'lock',     path: '/gate'           },
]

const current = computed(() => {
  const p = route.path
  if (p === '/session')       return 'session'
  if (p === '/einstellungen') return 'einstellungen'
  if (p === '/gate')          return 'gate'
  return 'start'
})

function go(tab) {
  if (current.value !== tab.id) router.push(tab.path)
}
</script>
