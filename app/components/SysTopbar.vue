<template>
  <header class="topbar">
    <button class="icon-btn mob-only" @click="$emit('open-drawer')" :aria-label="$t('common.menu')" style="margin-right:-4px">
      <SysIcon name="menu" style="width:22px;height:22px" />
    </button>
    <div class="tb-crumbs">
      <template v-for="(c, i) in crumbs" :key="i">
        <span v-if="i > 0" class="tb-sep">/</span>
        <span :class="['tb-crumb', { cur: i === crumbs.length - 1 }]">{{ c }}</span>
      </template>
    </div>
    <div class="tb-spacer" />
    <button class="icon-btn" @click="toggle" :aria-label="isDark ? $t('settings.theme_light') : $t('settings.theme_dark')" :title="isDark ? $t('settings.theme_light') : $t('settings.theme_dark')">
      <SysIcon :name="isDark ? 'sun' : 'moon'" style="width:18px;height:18px" />
    </button>
    <slot />
  </header>
</template>

<script setup>
import { useColorScheme } from '~/composables/useColorScheme.js'

defineProps({
  crumbs: { type: Array, default: () => ['Start'] },
})
defineEmits(['open-cmdk', 'open-drawer'])

const { isDark, toggle } = useColorScheme()
</script>
