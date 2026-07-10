<template>
  <Teleport to="#teleports">
    <Transition name="cmdk-fade">
      <div v-if="open" class="cmdk-scrim" @mousedown="$emit('close')">
        <div class="cmdk" @mousedown.stop>
          <div class="cmdk-search">
            <SysIcon name="search" style="width:19px;height:19px" />
            <input
              ref="inputEl"
              v-model="q"
              :placeholder="$t('cmdk.search_placeholder')"
              @keydown="onKey"
            />
            <span class="esc">ESC</span>
          </div>
          <div class="cmdk-results">
            <template v-if="flat.length === 0">
              <div class="cmdk-empty">{{ $t('cmdk.empty', { q }) }}</div>
            </template>
            <template v-else>
              <template v-if="filteredNav.length > 0">
                <div class="cmdk-group-label">{{ $t('cmdk.group_nav') }}</div>
                <div
                  v-for="(it, i) in filteredNav"
                  :key="'n' + it.id"
                  :class="['cmdk-item', { sel: sel === i }]"
                  @mouseenter="sel = i"
                  @click="run(it)"
                >
                  <span class="ck-ic"><SysIcon :name="it.icon" style="width:17px;height:17px" /></span>
                  <span class="ck-body">
                    <div class="ck-title">{{ it.label }}</div>
                    <div class="ck-sub">{{ it.sub }}</div>
                  </span>
                  <span class="ck-arr">↵</span>
                </div>
              </template>
              <template v-if="filteredCmds.length > 0">
                <div class="cmdk-group-label">{{ $t('cmdk.group_cmds') }}</div>
                <div
                  v-for="(it, i) in filteredCmds"
                  :key="'c' + it.cmd"
                  :class="['cmdk-item', { sel: sel === filteredNav.length + i }]"
                  @mouseenter="sel = filteredNav.length + i"
                  @click="runCmd(it)"
                >
                  <span class="ck-ic"><span class="ck-at">@</span></span>
                  <span class="ck-body">
                    <div class="ck-title">{{ it.cmd }}</div>
                    <div class="ck-sub">{{ it.desc }}</div>
                  </span>
                  <span class="ck-arr">↵</span>
                </div>
              </template>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close', 'navigate', 'insert'])

const { t } = useI18n()
const q = ref('')
const sel = ref(0)
const inputEl = ref(null)

const NAV_ITEMS = computed(() => [
  { id: 'home',     icon: 'home',     label: t('cmdk.home_label'),     sub: t('cmdk.home_sub') },
  { id: 'chat',     icon: 'chat',     label: t('cmdk.chat_label'),     sub: t('cmdk.chat_sub') },
  { id: 'soul',     icon: 'soul',     label: t('cmdk.soul_label'),     sub: t('cmdk.soul_sub') },
  { id: 'chronik',  icon: 'history',  label: t('cmdk.chronik_label'),  sub: t('cmdk.chronik_sub') },
  { id: 'maturity', icon: 'spark',    label: t('cmdk.maturity_label'), sub: t('cmdk.maturity_sub') },
  { id: 'files',    icon: 'files',    label: t('cmdk.files_label'),    sub: t('cmdk.files_sub') },
  { id: 'calendar', icon: 'calendar', label: t('cmdk.calendar_label'), sub: t('cmdk.calendar_sub') },
  { id: 'peers',    icon: 'peers',    label: t('cmdk.peers_label'),    sub: t('cmdk.peers_sub') },
  { id: 'connect',  icon: 'qr',       label: t('cmdk.connect_label'),  sub: t('cmdk.connect_sub') },
  { id: 'market',   icon: 'market',   label: t('cmdk.market_label'),   sub: t('cmdk.market_sub') },
  { id: 'anchor',   icon: 'anchor',   label: t('cmdk.anchor_label'),   sub: t('cmdk.anchor_sub') },
  { id: 'export',   icon: 'export',   label: t('cmdk.export_label'),   sub: t('cmdk.export_sub') },
  { id: 'settings', icon: 'settings', label: t('cmdk.settings_label'), sub: t('cmdk.settings_sub') },
])

const AT_COMMANDS = computed(() => [
  { cmd: '@audio',        desc: t('cmdk.at_audio_desc') },
  { cmd: '@gesicht',      desc: t('cmdk.at_face_desc') },
  { cmd: '@bewegung',     desc: t('cmdk.at_motion_desc') },
  { cmd: '@sprechen',     desc: t('cmdk.at_speak_desc') },
  { cmd: '@contact',      desc: t('cmdk.at_contact_desc') },
  { cmd: '@alle',         desc: t('cmdk.at_all_desc') },
  { cmd: '@agent',        desc: t('cmdk.at_agent_desc') },
  { cmd: '@session-end',  desc: t('cmdk.at_session_end_desc') },
])

const ql = computed(() => q.value.trim().toLowerCase())

const filteredNav = computed(() =>
  NAV_ITEMS.value.filter(i => !ql.value || i.label.toLowerCase().includes(ql.value) || i.sub.toLowerCase().includes(ql.value))
)
const filteredCmds = computed(() =>
  AT_COMMANDS.value.filter(i => !ql.value || i.cmd.toLowerCase().includes(ql.value) || i.desc.toLowerCase().includes(ql.value))
)
const flat = computed(() => [...filteredNav.value, ...filteredCmds.value])

watch(() => props.open, async (v) => {
  if (v) { q.value = ''; sel.value = 0; await nextTick(); inputEl.value?.focus() }
})
watch(q, () => sel.value = 0)

function run(it) { emit('navigate', it.id); emit('close') }
function runCmd(it) { emit('insert', it.cmd + ' '); emit('close') }

function onKey(e) {
  if (e.key === 'Escape') { emit('close') }
  else if (e.key === 'ArrowDown') { e.preventDefault(); sel.value = Math.min(sel.value + 1, flat.value.length - 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sel.value = Math.max(sel.value - 1, 0) }
  else if (e.key === 'Enter') {
    e.preventDefault()
    const item = flat.value[sel.value]
    if (!item) return
    if (sel.value < filteredNav.value.length) run(item)
    else runCmd(item)
  }
}
</script>

<style scoped>
.cmdk-fade-enter-active, .cmdk-fade-leave-active { transition: opacity .18s; }
.cmdk-fade-enter-from, .cmdk-fade-leave-to { opacity: 0; }
</style>
