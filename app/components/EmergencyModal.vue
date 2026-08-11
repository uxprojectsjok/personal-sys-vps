<template>
  <Teleport to="body">
    <div class="em-backdrop" @click.self="$emit('close')">
      <div class="em-panel" role="dialog" aria-modal="true">

        <div class="em-head">
          <div class="em-head-left">
            <svg class="em-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
            </svg>
            <div>
              <span class="em-kicker">{{ $t('emergency.kicker') }}</span>
              <h2 class="em-title">{{ lockActive ? $t('emergency.title_active', { level: lockLevel }) : $t('emergency.title_idle') }}</h2>
            </div>
          </div>
          <button class="em-close" @click="$emit('close')">×</button>
        </div>

        <!-- Aktiver Lock -->
        <div v-if="lockActive" class="em-active-banner">
          <span class="em-active-dot soul-pulse"></span>
          <span>{{ $t('emergency.banner', { level: lockLevel, time: formatTime(activatedAt) }) }}</span>
        </div>

        <!-- Level-Auswahl -->
        <div class="em-levels">
          <button
            v-for="lvl in levels" :key="lvl.n"
            class="em-level"
            :class="[`em-level--${lvl.n}`, lockLevel === lvl.n && lockActive ? 'em-level--current' : '']"
            :disabled="isLoading"
            @click="activate(lvl.n)"
          >
            <div class="em-level-head">
              <span class="em-level-num">{{ lvl.n }}</span>
              <span class="em-level-name">{{ lvl.name }}</span>
            </div>
            <p class="em-level-desc">{{ lvl.desc }}</p>
          </button>
        </div>

        <!-- Restore -->
        <div v-if="lockActive" class="em-foot">
          <button class="em-restore" :disabled="isLoading" @click="restore">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"/>
            </svg>
            {{ $t('emergency.btn_restore') }}
          </button>
        </div>

        <p v-if="error" class="em-error">{{ error }}</p>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  soulCert: { type: String, default: '' }
})
const emit = defineEmits(['close', 'status-change'])

const lockActive   = ref(false)
const lockLevel    = ref(0)
const activatedAt  = ref(null)
const isLoading    = ref(false)
const error        = ref(null)

const levels = computed(() => [
  { n: 1, name: t('emergency.lvl1_name'), desc: t('emergency.lvl1_desc') },
  { n: 2, name: t('emergency.lvl2_name'), desc: t('emergency.lvl2_desc') },
  { n: 3, name: t('emergency.lvl3_name'), desc: t('emergency.lvl3_desc') },
])

const headers = () => ({
  'Content-Type':  'application/json',
  'Authorization': `Bearer ${props.soulCert}`,
})

onMounted(fetchStatus)

async function fetchStatus() {
  try {
    const res  = await fetch('/api/emergency/status', { headers: headers() })
    const data = await res.json()
    lockActive.value  = data.active || false
    lockLevel.value   = data.level  || 0
    activatedAt.value = data.activated_at || null
  } catch { /* ignore */ }
}

async function activate(level) {
  if (isLoading.value) return
  isLoading.value = true
  error.value = null
  try {
    const res  = await fetch('/api/emergency/isolate', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ level })
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || t('emergency.err_generic'))
    lockActive.value  = true
    lockLevel.value   = data.level
    activatedAt.value = data.activated_at
    emit('status-change', { active: true, level: data.level })
  } catch (e) {
    error.value = e.message
  } finally {
    isLoading.value = false
  }
}

async function restore() {
  if (isLoading.value) return
  isLoading.value = true
  error.value = null
  try {
    const res  = await fetch('/api/emergency/restore', {
      method: 'POST', headers: headers()
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || t('emergency.err_generic'))
    lockActive.value  = false
    lockLevel.value   = 0
    activatedAt.value = null
    emit('status-change', { active: false, level: 0 })
  } catch (e) {
    error.value = e.message
  } finally {
    isLoading.value = false
  }
}

function formatTime(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) }
  catch { return iso }
}
</script>

<style scoped>
.em-backdrop {
  position: fixed; inset: 0; z-index: 60;
  display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(4,3,8,0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.em-panel {
  width: 100%; max-width: 400px;
  background: var(--sys-paper-2, #0e0c17);
  border: 1px solid rgba(239,68,68,0.25);
  box-shadow: 0 0 40px rgba(239,68,68,0.08), 0 32px 80px rgba(0,0,0,0.7);
  display: flex; flex-direction: column;
  border-radius: 4px;
}

.em-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 16px 20px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.em-head-left { display: flex; align-items: center; gap: 12px; }
.em-icon { width: 20px; height: 20px; color: #f87171; flex: none; }
.em-kicker {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em;
  text-transform: uppercase; color: #f87171; opacity: 0.8; display: block;
}
.em-title {
  font-family: var(--serif); font-size: 17px; font-weight: 400;
  color: var(--fg); margin: 3px 0 0; letter-spacing: -0.01em;
}
.em-close {
  background: none; border: none; color: var(--fg-3); cursor: pointer;
  font-size: 18px; line-height: 1; padding: 2px 4px;
  transition: color 0.12s;
}
.em-close:hover { color: var(--fg); }

.em-active-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 20px;
  background: rgba(239,68,68,0.08);
  border-bottom: 1px solid rgba(239,68,68,0.15);
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em;
  color: #f87171;
}
.em-active-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #ef4444; flex: none;
}

.em-levels {
  padding: 12px 16px;
  display: flex; flex-direction: column; gap: 6px;
}

.em-level {
  width: 100%; text-align: left;
  padding: 12px 14px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.em-level:hover:not(:disabled) { background: rgba(255,255,255,0.06); }
.em-level:disabled { opacity: 0.5; cursor: not-allowed; }

.em-level--1:hover:not(:disabled) { border-color: rgba(251,191,36,0.3); }
.em-level--2:hover:not(:disabled) { border-color: rgba(249,115,22,0.3); }
.em-level--3:hover:not(:disabled) { border-color: rgba(239,68,68,0.4); }

.em-level--current { border-color: rgba(239,68,68,0.5) !important; background: rgba(239,68,68,0.06) !important; }

.em-level-head {
  display: flex; align-items: center; gap: 10px; margin-bottom: 4px;
}
.em-level-num {
  width: 20px; height: 20px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--mono); font-size: 10px; font-weight: 700;
  flex: none;
}
.em-level--1 .em-level-num { background: rgba(251,191,36,0.15); color: #fbbf24; }
.em-level--2 .em-level-num { background: rgba(249,115,22,0.15); color: #f97316; }
.em-level--3 .em-level-num { background: rgba(239,68,68,0.15);  color: #ef4444; }

.em-level-name {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--fg-2);
}
.em-level-desc {
  font-family: var(--serif); font-size: 13px; line-height: 1.5;
  color: var(--fg-3); margin: 0; padding-left: 30px;
}

.em-foot {
  padding: 12px 16px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.em-restore {
  display: flex; align-items: center; gap: 6px;
  width: 100%; padding: 9px 14px;
  border-radius: 6px;
  border: 1px solid rgba(34,197,94,0.25);
  background: rgba(34,197,94,0.06);
  color: #86efac;
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em;
  text-transform: uppercase; cursor: pointer;
  transition: background 0.12s;
}
.em-restore:hover:not(:disabled) { background: rgba(34,197,94,0.12); }
.em-restore:disabled { opacity: 0.4; cursor: not-allowed; }

.em-error {
  padding: 0 16px 12px;
  font-family: var(--mono); font-size: 11px; color: #f87171;
  margin: 0;
}
</style>
