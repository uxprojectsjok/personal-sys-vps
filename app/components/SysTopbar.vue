<template>
  <header class="topbar">
    <button class="icon-btn mob-only" @click="$emit('open-drawer')" :aria-label="$t('common.menu')" style="margin-right:-4px">
      <SysIcon name="menu" style="width:20px;height:20px" />
    </button>
    <div class="tb-crumbs">
      <template v-for="(c, i) in crumbs" :key="i">
        <span v-if="i > 0" class="tb-sep">/</span>
        <span :class="['tb-crumb', { cur: i === crumbs.length - 1 }]">{{ c }}</span>
      </template>
    </div>
    <div class="tb-spacer" />
    <slot />
    <button class="searchbtn" @click="$emit('open-cmdk')" aria-label="Befehle">
      <SysIcon name="search" style="width:17px;height:17px;flex:none" />
      <span class="label-txt">Suchen oder Befehl…</span>
      <span class="kbd">⌘K</span>
    </button>
  </header>
</template>

<script setup>
defineProps({
  crumbs: { type: Array, default: () => ['Start'] },
})
defineEmits(['open-cmdk', 'open-drawer'])
</script>
