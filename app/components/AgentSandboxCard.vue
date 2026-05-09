<template>
  <div class="agent-card" :class="{ open: isOpen }">

    <!-- Header -->
    <button class="agent-header" @click="toggle">
      <div class="agent-header-left">
        <i class="ri-robot-2-line ri-fw agent-icon" aria-hidden="true" />
        <span class="agent-label">Agent Sandbox</span>
        <span v-if="!agentContent && !isOpen" class="agent-empty">leer</span>
        <Transition name="agent-flash">
          <span v-if="showSaved" class="agent-saved-flash">Gespeichert</span>
        </Transition>
      </div>
      <div class="agent-header-right">
        <span v-if="agentContent" class="agent-chars">{{ agentContent.length }} Z.</span>
        <svg class="agent-chevron" :class="{ 'rotate-180': isOpen }"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/>
        </svg>
      </div>
    </button>

    <!-- Body — immer Textarea, kein Zwischenschritt -->
    <Transition name="agent-expand">
      <div v-if="isOpen" class="agent-body">
        <p class="agent-hint">
          Was externe KI-Agenten über dich sehen — der Rest von sys.md bleibt privat.
        </p>
        <textarea
          ref="textareaRef"
          v-model="editText"
          class="agent-textarea"
          placeholder="Schreibe hier frei — als Markdown oder Fließtext. z.B.: »Hallo, ich bin Jan aus Marburg. Ich freue mich über Nachrichten.«"
          @keydown.ctrl.enter="save"
          @keydown.meta.enter="save"
        />
        <div class="agent-actions">
          <span v-if="isDirty" class="agent-dirty">Ungespeicherte Änderungen</span>
          <button class="agent-btn ghost" :disabled="!isDirty || isSaving" @click="revert">
            Verwerfen
          </button>
          <button class="agent-btn primary" :disabled="!isDirty || isSaving" @click="save">
            <i class="ri-save-line ri-fw" aria-hidden="true" />
            {{ isSaving ? 'Speichern…' : 'Speichern' }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useSoul } from '~/composables/useSoul.js'

const { soulContent, updateContent, pushToServer } = useSoul()

const isOpen    = ref(false)
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

// Textarea immer aktuell halten wenn soulContent von außen kommt
// (Server-Sync, initialer Load) — aber nur wenn der Nutzer nichts
// geändert hat (isDirty false) damit kein Text verloren geht.
watch(agentContent, (val) => {
  if (!isDirty.value) editText.value = val
}, { immediate: true })

const isDirty = computed(() => editText.value !== agentContent.value)

function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value) nextTick(() => textareaRef.value?.focus())
}

function revert() {
  editText.value = agentContent.value
}

async function save() {
  if (isSaving.value || !isDirty.value) return
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
    showSaved.value = true
    setTimeout(() => { showSaved.value = false }, 2500)
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

.agent-icon { font-size: 14px; color: var(--fg-3); flex-shrink: 0; transition: color 0.15s; }
.open .agent-icon { color: var(--accent); }

.agent-label { font-family: var(--mono); font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--fg-3); white-space: nowrap; transition: color 0.15s; }
.open .agent-label { color: var(--fg-2); }

.agent-empty { font-family: var(--mono); font-size: 12px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--fg-4); opacity: 0.6; }
.agent-saved-flash { font-family: var(--mono); font-size: 12px; letter-spacing: 0.15em; text-transform: uppercase; color: #b8dcc4; }
.agent-chars { font-family: var(--mono); font-size: 12px; color: var(--fg-4); letter-spacing: 0.1em; }

.agent-chevron { width: 12px; height: 12px; color: var(--fg-4); transition: transform 0.2s; flex-shrink: 0; }
.agent-chevron.rotate-180 { transform: rotate(180deg); }

/* Body */
.agent-body {
  border-top: 1px solid var(--rule);
  padding: 12px clamp(14px, 2.5vw, 24px);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-hint {
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--fg-4);
  letter-spacing: 0.08em;
  margin: 0;
}

.agent-textarea {
  width: 100%;
  min-height: 100px;
  max-height: 220px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--rule);
  border-radius: 8px;
  padding: 10px 12px;
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--fg);
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
}
.agent-textarea:focus { border-color: rgba(139,92,246,0.5); }
.agent-textarea::placeholder { color: var(--fg-4); }

.agent-actions { display: flex; align-items: center; gap: 6px; }

.agent-dirty { flex: 1; font-family: var(--mono); font-size: 12px; color: var(--fg-4); letter-spacing: 0.1em; }

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
  font-size: 12px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  cursor: pointer;
  min-height: 30px;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.agent-btn:hover:not(:disabled) { color: var(--fg); border-color: var(--fg-3); }
.agent-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.agent-btn.ghost { color: var(--fg-4); }
.agent-btn.ghost:hover:not(:disabled) { color: var(--fg-3); }

.agent-btn.primary {
  background: rgba(139,92,246,0.12);
  border-color: rgba(139,92,246,0.3);
  color: var(--accent-bright, #a78bfa);
}
.agent-btn.primary:hover:not(:disabled) { background: rgba(139,92,246,0.22); color: #fff; }

/* Transitions */
.agent-expand-enter-active,
.agent-expand-leave-active { transition: max-height 0.22s ease, opacity 0.18s ease; overflow: hidden; }
.agent-expand-enter-from,
.agent-expand-leave-to { max-height: 0; opacity: 0; }
.agent-expand-enter-to,
.agent-expand-leave-from { max-height: 420px; opacity: 1; }

.agent-flash-enter-active,
.agent-flash-leave-active { transition: opacity 0.3s; }
.agent-flash-enter-from,
.agent-flash-leave-to { opacity: 0; }
</style>
