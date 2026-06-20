<template>
  <nav class="mob-tab-bar">
    <button
      v-for="tab in tabs" :key="tab.id"
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
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const route  = useRoute()
const router = useRouter()

const tabs = computed(() => [
  { id: 'start',        label: t('mobile_nav.start'),    icon: 'home',     path: '/'               },
  { id: 'session',      label: t('mobile_nav.session'),  icon: 'chat',     path: '/session'        },
  { id: 'einstellungen', label: t('mobile_nav.settings'), icon: 'settings', path: '/settings' },
  { id: 'gate',         label: t('mobile_nav.gate'),     icon: 'lock',     path: '/gate'           },
])

const current = computed(() => {
  const p = route.path
  if (p === '/session')       return 'session'
  if (p === '/settings') return 'einstellungen'
  if (p === '/gate')          return 'gate'
  return 'start'
})

function go(tab) {
  if (current.value !== tab.id) router.push(tab.path)
}
</script>
