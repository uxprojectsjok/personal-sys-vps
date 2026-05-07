<template>
  <div class="agent-card" :class="{ open: isOpen, saving: isSaving, saved: showSaved }">

    <!-- Header -->
    <button class="agent-header" @click="toggle">
      <div class="agent-header-left">
        <i class="ri-robot-2-line ri-fw agent-icon" aria-hidden="true" />
        <span class="agent-label">Agent Sandbox</span>
        <span v-if="!agentContent" class="agent-empty">leer</span>
        <span v-if="showSaved" class="agent-saved-flash">Gespeichert</span>
      </div>
      <div class="agent-header-right">
        <span v-if="agentContent" class="agent-chars">{{ agentContent.length }} Z.</span>
        <svg class="agent-chevron" :class="{ 'rotate-180': isOpen }"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/>
        </svg>
      </div>
    </button>

    <!-- Body -->
    <Transition name="agent-expand">
      <div v-if="isOpen" class="agent-body">

        <!-- View mode -->
        <div v-if="!isEditing" class="agent-view">
          <pre v-if="agentContent" class="agent-pre">{{ agentContent }}</pre>
          <p v-else class="agent-hint">
            Hier definierst du, was externe KI-Agenten und zahlende Nutzer sehen dürfen.<br>
            Alles andere in sys.md bleibt privat.
          </p>
          <div class="agent-actions">
            <button class="agent-btn" @click="startEdit">
              <i class="ri-pencil-line ri-fw" aria-hidden="true" />
              Bearbeiten
            </button>
          </div>
        </div>

        <!-- Edit mode -->
        <div v-else class="agent-edit">
          <textarea
            ref="textareaRef"
            v-model="editText"
            class="agent-textarea"
            placeholder="Was sollen externe Agenten über dich wissen? Schreibe hier frei — als Markdown oder Fließtext."
            @keydown.ctrl.enter="save"
            @keydown.meta.enter="save"
            @keydown.escape="cancelEdit"
          />
          <div class="agent-actions">
            <button class="agent-btn ghost" @click="cancelEdit">Abbrechen</button>
            <button class="agent-btn primary" :disabled="isSaving" @click="save">
              <i class="ri-save-line ri-fw" aria-hidden="true" />
              {{ isSaving ? 'Speichern…' : 'Speichern' }}
            </button>
          </div>
        </div>

      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useSoul } from '~/composables/useSoul.js'

const { soulContent, updateContent, pushToServer } = useSoul()

const isOpen    = ref(false)
const isEditing = ref(false)
const editText  = ref('')
const isSaving  = ref(false)
const showSaved = ref(false)
const textareaRef = ref(null)

const MARKER_START = '<!-- AGENT:START -->'
const MARKER_END   = '<!-- AGENT:END -->'
const RE_AGENT     = /<!--\s*AGENT:START\s*-->([\s\S]*?)<!--\s*AGENT:END\s*-->/

const agentContent = computed(() => {
  const m = soulContent.value?.match(RE_AGENT)
  return m ? m[1].trim() : ''
})

function toggle() {
  isOpen.value = !isOpen.value
  if (!isOpen.value) isEditing.value = false
}

function startEdit() {
  editText.value = agentContent.value
  isEditing.value = true
  nextTick(() => textareaRef.value?.focus())
}

function cancelEdit() {
  isEditing.value = false
}

async function save() {
  if (isSaving.value) return
  isSaving.value = true
  try {
    const replacement = `${MARKER_START}\n${editText.value.trim()}\n${MARKER_END}`
    let updated
    if (RE_AGENT.test(soulContent.value)) {
      updated = soulContent.value.replace(RE_AGENT, replacement)
    } else {
      updated = soulContent.value.trimEnd() + '\n\n' + replacement + '\n'
    }
    updateContent(updated)
    await pushToServer()
    isEditing.value = false
    showSaved.value = true
    setTimeout(() => { showSaved.value = false }, 2000)
  } finally {
    isSaving.value = false
  }
}
</script>

<style scoped>
.agent-card {
  flex-shrink: 0;
  border-top: 1px solid var(--rule);
  background: var(--paper-3);
}

.agent-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px clamp(14px, 2.5vw, 24px);
  background: transparent;
  border: 0;
  cursor: pointer;
  color: inherit;
  min-height: 44px;
}
.agent-header:hover { background: rgba(255,255,255,0.03); }

.agent-header-left  { display: flex; align-items: center; gap: 8px; min-width: 0; }
.agent-header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.agent-icon  { font-size: 14px; color: var(--fg-3); flex-shrink: 0; }
.open .agent-icon { color: var(--accent); }

.agent-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--fg-3); white-space: nowrap; }
.open .agent-label { color: var(--fg-2); }

.agent-empty { font-family: var(--mono); font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--fg-4); opacity: 0.6; }

.agent-saved-flash { font-family: var(--mono); font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase; color: #b8dcc4; }

.agent-chars { font-family: var(--mono); font-size: 9px; color: var(--fg-4); letter-spacing: 0.1em; }

.agent-chevron { width: 12px; height: 12px; color: var(--fg-4); transition: transform 0.2s; flex-shrink: 0; }
.agent-chevron.rotate-180 { transform: rotate(180deg); }

/* Body */
.agent-body { border-top: 1px solid var(--rule); }

.agent-view,
.agent-edit { padding: 12px clamp(14px, 2.5vw, 24px); display: flex; flex-direction: column; gap: 8px; }

.agent-pre {
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.6;
  color: var(--fg-2);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  max-height: 180px;
  overflow-y: auto;
}

.agent-hint {
  font-family: var(--mono);
  font-size: 10px;
  line-height: 1.6;
  color: var(--fg-4);
  letter-spacing: 0.05em;
  margin: 0;
}

.agent-textarea {
  width: 100%;
  min-height: 120px;
  max-height: 240px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--rule);
  border-radius: 8px;
  padding: 10px 12px;
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.6;
  color: var(--fg);
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
}
.agent-textarea:focus { border-color: var(--accent); }
.agent-textarea::placeholder { color: var(--fg-4); }

.agent-actions { display: flex; justify-content: flex-end; gap: 6px; }

.agent-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: 1px solid var(--rule);
  border-radius: 6px;
  background: transparent;
  color: var(--fg-3);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  cursor: pointer;
  min-height: 30px;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.agent-btn:hover:not(:disabled) { color: var(--fg); border-color: var(--fg-3); }
.agent-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.agent-btn.ghost { color: var(--fg-4); }
.agent-btn.ghost:hover { color: var(--fg-3); }

.agent-btn.primary {
  background: rgba(139,92,246,0.15);
  border-color: rgba(139,92,246,0.35);
  color: var(--accent-bright, #a78bfa);
}
.agent-btn.primary:hover:not(:disabled) {
  background: rgba(139,92,246,0.25);
  color: #fff;
}

/* Transition */
.agent-expand-enter-active,
.agent-expand-leave-active { transition: max-height 0.22s ease, opacity 0.18s ease; overflow: hidden; }
.agent-expand-enter-from,
.agent-expand-leave-to { max-height: 0; opacity: 0; }
.agent-expand-enter-to,
.agent-expand-leave-from { max-height: 500px; opacity: 1; }
</style>
