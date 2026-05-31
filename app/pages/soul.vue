<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="soul" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Seele', 'sys.md']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="() => {}">
          <button class="icon-btn" :class="{ on: syncing }" @click="handlePush" :disabled="syncing" title="Auf Server hochladen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="17" height="17">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
            </svg>
          </button>
        </SysTopbar>

        <div class="scroll">
          <div class="soul-page">

            <!-- ── Hero ── -->
            <div class="sp-hero">
              <div class="sp-avatar">{{ initial }}</div>
              <div class="sp-identity">
                <h1 class="sp-name">{{ soulMeta?.name || 'Soul' }}</h1>
                <div class="sp-addr">soul://{{ shortId }} · sys.md v{{ soulMeta?.version || '1' }}</div>
                <div class="sp-stats">
                  <span>{{ soulMeta?.chainCount ?? 0 }} Sessions</span>
                  <span class="sp-dot-sep">·</span>
                  <span>{{ soulMeta?.maturity ?? 0 }}% Reife</span>
                  <span class="sp-dot-sep">·</span>
                  <span>seit {{ soulMeta?.created || '—' }}</span>
                </div>
              </div>
            </div>

            <!-- ── Status ── -->
            <div class="sp-status">
              <span class="live-dot" />
              <span>Lebendige Datei · der Soul-Archivar schreibt still mit</span>
            </div>

            <!-- ── Sections ── -->
            <div class="sp-sections">
              <div v-for="section in SOUL_SECTIONS" :key="section.key" class="sp-section">
                <div class="sp-section-head">
                  <span class="sp-sec-dot" :class="{ filled: !!getContent(section.key) }" />
                  <h2 class="sp-sec-title">{{ section.label }}</h2>
                  <button
                    class="sp-edit-btn icon-btn"
                    @click="startEdit(section)"
                    v-if="editingKey !== section.key"
                    title="Bearbeiten"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/>
                    </svg>
                  </button>
                </div>

                <!-- Read mode -->
                <template v-if="editingKey !== section.key">
                  <p v-if="getContent(section.key)" class="sp-sec-text">{{ getContent(section.key) }}</p>
                  <p v-else class="sp-sec-empty">Noch nicht beschrieben.</p>
                </template>

                <!-- Edit mode -->
                <div v-else class="sp-edit-wrap">
                  <textarea
                    ref="editareaRef"
                    v-model="editDraft"
                    class="sp-textarea"
                    rows="5"
                    @keydown.meta.s.prevent="saveEdit"
                    @keydown.ctrl.s.prevent="saveEdit"
                    @keydown.esc="cancelEdit"
                  />
                  <div class="sp-edit-actions">
                    <span class="sp-edit-hint">⌘S speichern · Esc abbrechen</span>
                    <button class="sp-btn-cancel" @click="cancelEdit">Abbrechen</button>
                    <button class="sp-btn-save" @click="saveEdit" :disabled="saving">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                      </svg>
                      {{ saving ? 'Speichert…' : 'Speichern' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>

    <!-- Not loaded yet -->
    <div v-else class="sys-loading">
      <span>SYS · sys.md lädt</span>
    </div>
  </ClientOnly>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { parseSoul, updateSection } from '#shared/utils/soulParser.js'

definePageMeta({ layout: false })

const router = useRouter()
const { soulContent, soulMeta, hasSoul, soulToken, save, pushToServer } = useSoul()

// ── Shell state ──────────────────────────────────────────────────────────────
const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)
const syncing          = ref(false)

// ── Soul sections ────────────────────────────────────────────────────────────
const SOUL_SECTIONS = [
  { key: 'Kern-Identität',                      label: 'Kern-Identität' },
  { key: 'Werte & Überzeugungen',               label: 'Werte & Überzeugungen' },
  { key: 'Ästhetik & Resonanz',                 label: 'Ästhetik & Resonanz' },
  { key: 'Sprachmuster & Ausdruck',             label: 'Sprachmuster & Ausdruck' },
  { key: 'Wiederkehrende Themen & Obsessionen', label: 'Themen & Obsessionen' },
  { key: 'Emotionale Signatur',                 label: 'Emotionale Signatur' },
  { key: 'Weltbild',                            label: 'Weltbild' },
  { key: 'Offene Fragen dieser Person',         label: 'Offene Fragen' },
]

const parsed = computed(() => parseSoul(soulContent.value))

function getContent(key) {
  const c = parsed.value.sections[key] ?? ''
  if (!c) return ''
  if (c.includes('Noch nicht beschrieben') || c.includes('Noch nicht eingetragen') || c.includes('Musik, Atmosphären')) return ''
  return c
}

// ── Hero helpers ─────────────────────────────────────────────────────────────
const initial  = computed(() => (soulMeta.value?.name || 'S').charAt(0).toUpperCase())
const shortId  = computed(() => (soulMeta.value?.id || '').slice(0, 8))

// ── Inline edit ──────────────────────────────────────────────────────────────
const editingKey  = ref(null)
const editDraft   = ref('')
const saving      = ref(false)
const editareaRef = ref(null)

function startEdit(section) {
  editingKey.value = section.key
  editDraft.value  = getContent(section.key)
  nextTick(() => {
    const el = Array.isArray(editareaRef.value) ? editareaRef.value[0] : editareaRef.value
    el?.focus()
  })
}

function cancelEdit() {
  editingKey.value = null
  editDraft.value  = ''
}

async function saveEdit() {
  if (!editingKey.value) return
  saving.value = true
  const updated = updateSection(soulContent.value, editingKey.value, editDraft.value.trim())
  soulContent.value = updated
  save()
  editingKey.value = null
  editDraft.value  = ''
  saving.value     = false
  // push to server in background — don't block UI
  pushToServer().catch(() => {})
}

// ── Server push ──────────────────────────────────────────────────────────────
async function handlePush() {
  syncing.value = true
  await pushToServer()
  syncing.value = false
}

// ── Navigation ───────────────────────────────────────────────────────────────
function lockGate() {
  document.cookie = 'sys_token=; Max-Age=0; path=/'
  window.location.href = '/gate'
}

function onNav(id) {
  if (id === 'soul')     return
  if (id === 'chat')     { router.push('/session');  return }
  if (id === 'chronik')  { router.push('/chronik');  return }
  if (id === 'files')    { router.push('/dateien');    return }
  if (id === 'market')   { router.push('/marketplace'); return }
  if (id === 'maturity') { router.push('/reife');    return }
  if (id === 'calendar') { router.push('/kalender'); return }
  if (id === 'settings') { router.push('/'); return }
  if (id === 'anchor')   { router.push('/'); return }
  drawerOpen.value = false
  router.push('/')
}
</script>

<style scoped>
.sys-loading {
  min-height: 100dvh; display: flex; align-items: center; justify-content: center;
  background: var(--bg); color: var(--fg-3);
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
}

/* ── Page wrapper ── */
.soul-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px clamp(16px, 3vw, 32px) 80px;
}

/* ── Hero ── */
.sp-hero {
  display: flex;
  align-items: center;
  gap: 24px;
  padding-bottom: 28px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 20px;
}

.sp-avatar {
  width: 72px; height: 72px; border-radius: 50%; flex: none;
  background: var(--accent-deep);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--serif); font-size: 32px; font-weight: 400;
  color: #fff; letter-spacing: -0.02em;
}

.sp-name {
  font-family: var(--serif); font-size: clamp(26px, 4vw, 38px);
  font-weight: 400; letter-spacing: -0.025em; color: var(--fg);
  line-height: 1.05; margin-bottom: 6px;
}

.sp-addr {
  font-family: var(--mono); font-size: 12px; color: var(--fg-3);
  letter-spacing: 0.02em; margin-bottom: 8px;
}

.sp-stats {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--mono); font-size: 12px; color: var(--fg-2);
  letter-spacing: 0.03em;
}

.sp-dot-sep { color: var(--fg-4); }

/* ── Status bar ── */
.sp-status {
  display: flex; align-items: center; gap: 10px;
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--fg-3);
  padding-bottom: 24px;
}

/* ── Sections ── */
.sp-sections { display: flex; flex-direction: column; }

.sp-section {
  padding: 22px 0;
  border-bottom: 1px solid var(--line);
}
.sp-section:last-child { border-bottom: none; }

.sp-section-head {
  display: flex; align-items: center; gap: 12px; margin-bottom: 10px;
}

.sp-sec-dot {
  width: 9px; height: 9px; border-radius: 50%; flex: none;
  border: 1.5px solid var(--fg-4);
  transition: background 0.2s, border-color 0.2s;
}
.sp-sec-dot.filled {
  background: var(--accent); border-color: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
}

.sp-sec-title {
  font-family: var(--serif); font-size: 20px; font-weight: 400;
  letter-spacing: -0.015em; color: var(--fg); flex: 1;
}

.sp-edit-btn { opacity: 0; transition: opacity 0.15s; }
.sp-section:hover .sp-edit-btn { opacity: 1; }

.sp-sec-text {
  font-size: 15px; line-height: 1.65; color: var(--fg-2);
  margin: 0; white-space: pre-wrap; word-break: break-word;
}

.sp-sec-empty {
  font-size: 13px; color: var(--fg-4); margin: 0; font-style: italic;
}

/* ── Edit form ── */
.sp-edit-wrap {
  background: var(--surface-2);
  border: 1px solid var(--line-2);
  border-radius: var(--r);
  overflow: hidden;
}

.sp-textarea {
  width: 100%; box-sizing: border-box;
  background: transparent; border: none; outline: none; resize: vertical;
  color: var(--fg); font-family: var(--sans); font-size: 15px; line-height: 1.6;
  padding: 16px 18px; min-height: 120px;
}

.sp-edit-actions {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-top: 1px solid var(--line);
  background: var(--surface);
}

.sp-edit-hint {
  font-family: var(--mono); font-size: 10.5px; color: var(--fg-4);
  letter-spacing: 0.08em; margin-right: auto;
}

.sp-btn-cancel {
  padding: 6px 14px; border: 1px solid var(--line-2); border-radius: var(--r-xs);
  background: transparent; color: var(--fg-2); font-size: 13px; cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.sp-btn-cancel:hover { border-color: var(--fg-3); color: var(--fg); }

.sp-btn-save {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 16px; border: none; border-radius: var(--r-xs);
  background: var(--accent); color: var(--on-accent);
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: background 0.15s;
}
.sp-btn-save:hover:not(:disabled) { background: var(--accent-bright); }
.sp-btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 900px) {
  .sp-hero { flex-direction: column; align-items: flex-start; gap: 16px; }
  .sp-edit-hint { display: none; }
}
</style>
