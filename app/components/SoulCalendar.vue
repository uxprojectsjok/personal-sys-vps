<template>
  <!-- ── Kalender-Widget ───────────────────────────────────────────────────── -->
  <div class="rounded-2xl border border-[var(--sys-border)] bg-transparent overflow-hidden">

    <!-- Header: Monats-Navigation -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--sys-border)]">
      <button
        @click="prevMonth"
        class="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-white/[0.07] transition-colors"
        aria-label="Vorheriger Monat"
      >
        <i class="ri-arrow-left-s-line ri-fw text-sm" aria-hidden="true" />
      </button>
      <span class="text-sm font-semibold text-[var(--sys-fg)] tracking-[0.01em] select-none">
        {{ monthLabel }}
      </span>
      <button
        @click="nextMonth"
        class="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-white/[0.07] transition-colors"
        aria-label="Nächster Monat"
      >
        <i class="ri-arrow-right-s-line ri-fw text-sm" aria-hidden="true" />
      </button>
    </div>

    <!-- Wochentag-Header -->
    <div class="grid grid-cols-7 border-b border-[var(--sys-border)]">
      <span
        v-for="d in DAY_LABELS"
        :key="d"
        class="text-center text-[10px] font-medium text-[var(--sys-fg-dim)] py-2 select-none"
      >{{ d }}</span>
    </div>

    <!-- Tage-Grid -->
    <div class="grid grid-cols-7 gap-px p-2">
      <button
        v-for="cell in cells"
        :key="cell.key"
        :disabled="!cell.inMonth"
        :aria-label="cell.inMonth ? `${cell.date}${cell.hasEntry ? ' (Einträge vorhanden)' : ''}` : undefined"
        @click="cell.inMonth && onDayClick(cell)"
        :class="[
          'relative flex items-center justify-center h-8 w-full rounded-lg text-xs transition-all select-none',
          !cell.inMonth
            ? 'pointer-events-none opacity-0'
            : cell.isToday
              ? 'bg-[var(--sys-violet)] text-white font-bold'
              : cell.hasEntry
                ? 'text-[var(--sys-fg)] hover:bg-[var(--sys-violet)]/10 cursor-pointer ring-1 ring-inset ring-[var(--sys-violet)]/25'
                : 'text-[var(--sys-fg)] hover:bg-white/[0.07] cursor-pointer',
        ]"
      >
        {{ cell.inMonth ? cell.day : '' }}
        <span
          v-if="cell.inMonth && cell.hasEntry && !cell.isToday"
          class="absolute bottom-[3px] left-1/2 -translate-x-1/2 w-[5px] h-[5px] rounded-full bg-[var(--sys-violet)]"
          aria-hidden="true"
        />
        <span
          v-if="cell.inMonth && cell.hasEntry && cell.isToday"
          class="absolute bottom-[3px] left-1/2 -translate-x-1/2 w-[5px] h-[5px] rounded-full bg-white/70"
          aria-hidden="true"
        />
      </button>
    </div>

    <!-- Footer: Neuer Eintrag -->
    <div class="px-3 pb-3 pt-2 border-t border-[var(--sys-border)]">
      <button
        @click="openNewEntry"
        class="w-full h-9 rounded-xl text-xs font-medium text-[var(--sys-fg-muted)] border border-[var(--sys-border)] hover:bg-[var(--sys-violet)]/[0.07] hover:text-[var(--sys-violet)] hover:border-[var(--sys-violet)]/30 transition-all active:scale-[0.98]"
      >
        + Neuer Eintrag
      </button>
    </div>
  </div>

  <!-- ── Tages-Modal ────────────────────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="modal.open"
        class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        @click.self="modal.open = false"
      >
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="modal.open = false" />

        <div class="relative w-full max-w-md rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-bg-elevated)] shadow-2xl z-10 max-h-[90dvh] flex flex-col overflow-hidden">

          <!-- Mobile Handle -->
          <div class="flex justify-center pt-3 pb-1 sm:hidden">
            <div class="w-8 h-1 rounded-full bg-white/15" />
          </div>

          <!-- Modal-Header -->
          <div class="px-5 pt-4 pb-3 flex items-start justify-between border-b border-[var(--sys-border)] flex-none">
            <div>
              <p class="text-sm font-semibold text-[var(--sys-fg)]">{{ formatDateLabel(modal.date) }}</p>
              <p class="text-xs text-[var(--sys-fg-dim)] mt-0.5">
                {{ modal.rows.length }} {{ modal.rows.length === 1 ? 'Eintrag' : 'Einträge' }}
              </p>
            </div>
            <button
              @click="modal.open = false"
              class="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-white/[0.07] transition-colors flex-none"
              aria-label="Schließen"
            >
              <i class="ri-close-line ri-fw" aria-hidden="true" />
            </button>
          </div>

          <!-- Eintrags-Liste (scrollbar) -->
          <div class="flex-1 overflow-y-auto min-h-0">
            <div v-if="!modal.rows.length" class="px-5 py-8 text-center text-sm text-[var(--sys-fg-dim)]">
              Noch keine Einträge für diesen Tag.
            </div>

            <div v-else class="divide-y divide-white/[0.06]">
              <div
                v-for="(row, i) in modal.rows"
                :key="i"
                class="group px-4 py-3"
              >
                <!-- Ansicht -->
                <template v-if="!row.editing">
                  <div class="flex items-start gap-2">
                    <p class="flex-1 text-sm text-[var(--sys-fg-muted)] leading-relaxed pt-0.5 min-w-0">{{ row.text }}</p>
                    <div class="flex gap-1 flex-none">
                      <button
                        @click="startEdit(i)"
                        class="w-7 h-7 flex items-center justify-center rounded-lg text-white/35 hover:text-[var(--sys-violet)] hover:bg-[var(--sys-violet)]/10 transition"
                        title="Bearbeiten"
                      >
                        <i class="ri-pencil-line text-xs" />
                      </button>
                      <button
                        @click="deleteEntry(i)"
                        :disabled="row.deleting"
                        class="w-7 h-7 flex items-center justify-center rounded-lg text-white/35 hover:text-red-400 hover:bg-red-950/30 transition disabled:opacity-30"
                        title="Löschen"
                      >
                        <svg v-if="row.deleting" class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                          <path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/>
                        </svg>
                        <i v-else class="ri-delete-bin-line text-xs" />
                      </button>
                    </div>
                  </div>
                </template>

                <!-- Bearbeiten -->
                <template v-else>
                  <textarea
                    v-model="row.editText"
                    rows="3"
                    style="font-family: inherit"
                    class="w-full bg-[rgba(255,255,255,0.04)] border border-[var(--sys-border)] rounded-xl px-3 py-2 text-sm text-[var(--sys-fg)] placeholder:text-[var(--sys-fg-dim)] focus:outline-none focus:border-[var(--sys-violet)]/50 transition resize-none leading-relaxed"
                  />
                  <div class="flex gap-2 mt-2">
                    <button
                      @click="cancelEdit(i)"
                      class="flex-1 h-8 rounded-xl border border-[var(--sys-border)] text-xs text-[var(--sys-fg-muted)] hover:text-[var(--sys-fg)] transition"
                    >Abbrechen</button>
                    <button
                      @click="saveEdit(i)"
                      :disabled="!row.editText.trim() || row.saving"
                      class="flex-1 h-8 rounded-xl bg-[var(--sys-violet)]/15 border border-[var(--sys-violet)]/30 text-[var(--sys-violet)] text-xs font-semibold disabled:opacity-30 hover:not-disabled:bg-[var(--sys-violet)]/25 transition"
                    >{{ row.saving ? '…' : 'Speichern' }}</button>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- Neuer Eintrag -->
          <div class="flex-none border-t border-[var(--sys-border)] px-5 py-3 space-y-2.5">
            <p class="text-[10px] font-medium text-[var(--sys-fg-dim)] uppercase tracking-widest">Neuer Eintrag</p>
            <input
              type="date"
              v-model="modal.date"
              :max="todayStr"
              :style="{ fontFamily: 'inherit', colorScheme: isDark ? 'dark' : 'light' }"
              class="shad-input w-full"
            />
            <!-- Zeit / Ganzer Tag -->
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-2 text-xs text-[var(--sys-fg-muted)] cursor-pointer select-none min-h-[44px] py-2">
                <div class="relative w-8 h-4 rounded-full transition-colors flex-none"
                  :class="modal.newAllDay ? 'bg-[#22c55e]' : 'bg-[rgba(255,255,255,0.1)]'">
                  <div class="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow sys-toggle-thumb"
                    :class="modal.newAllDay ? 'translate-x-3.5' : 'translate-x-0.5'" />
                </div>
                <input type="checkbox" v-model="modal.newAllDay" class="sr-only" />
                Ganzer Tag
              </label>
              <input
                v-if="!modal.newAllDay"
                type="time"
                v-model="modal.newTime"
                :style="{ fontFamily: 'inherit', colorScheme: isDark ? 'dark' : 'light' }"
                class="h-8 rounded-xl bg-[rgba(255,255,255,0.04)] border border-[var(--sys-border)] px-3 text-sm text-[var(--sys-fg)] focus:outline-none focus:border-[var(--sys-violet)]/50 transition"
              />
            </div>
            <textarea
              v-model="modal.newText"
              placeholder="Notiz, Gedanke, Ereignis…"
              rows="2"
              style="font-family: inherit"
              class="w-full bg-[rgba(255,255,255,0.04)] border border-[var(--sys-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--sys-fg)] placeholder:text-[var(--sys-fg-dim)] focus:outline-none focus:border-[var(--sys-violet)]/50 transition resize-none leading-relaxed"
            />
            <Alert v-if="modal.error" variant="destructive" :message="modal.error" />
            <div class="flex gap-2 pt-0.5">
              <button
                @click="modal.open = false"
                class="flex-1 h-10 rounded-xl border border-[var(--sys-border)] text-sm text-[var(--sys-fg-muted)] hover:text-[var(--sys-fg)] transition"
              >Schließen</button>
              <button
                @click="saveNewEntry"
                :disabled="!modal.newText.trim() || modal.saving"
                class="flex-1 h-10 rounded-xl bg-[var(--sys-violet)]/15 border border-[var(--sys-violet)]/30 text-[var(--sys-violet)] text-sm font-semibold disabled:opacity-30 hover:not-disabled:bg-[var(--sys-violet)]/25 transition active:not-disabled:scale-[0.98]"
              >{{ modal.saving ? '…' : '+ Speichern' }}</button>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { useSoul } from '~/composables/useSoul.js'
import { useVault } from '~/composables/useVault.js'
import { useColorScheme } from '~/composables/useColorScheme.js'
import { parseSoul, appendCalendarEntry, updateCalendarEntry, deleteCalendarEntry } from '#shared/utils/soulParser.js'

const { soulContent, updateContent } = useSoul()
const { isConnected: vaultConnected, writeSoulMd } = useVault()
const { isDark } = useColorScheme()

async function saveToVaultIfConnected() {
  if (vaultConnected.value) await writeSoulMd(soulContent.value, 'sys')
}

const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

// ── View-Datum ──────────────────────────────────────────────────────────────
const viewDate = ref(new Date())

const monthLabel = computed(() => {
  const d = viewDate.value
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
})

const todayStr = computed(() => new Date().toISOString().split('T')[0])

// ── Kalender-Einträge aus sys.md (beide Format-Varianten) ─────────────────
const calendarEntries = computed(() => {
  const dates = new Map()
  if (!soulContent.value) return dates
  const { sections } = parseSoul(soulContent.value)
  const cal = sections['Kalender'] || ''
  for (const line of cal.split('\n')) {
    // Format 1: **2024-01-01:** text  (Doppelpunkt vor schließendem **)
    // Format 2: **2024-01-01**: text  (Doppelpunkt nach schließendem **)
    const m = line.match(/\*\*(\d{4}-\d{2}-\d{2}):\*\*\s*(.+)/) ||
              line.match(/\*\*(\d{4}-\d{2}-\d{2})\*\*:\s*(.+)/)
    if (m) {
      const [, date, text] = m
      if (!dates.has(date)) dates.set(date, [])
      dates.get(date).push(text.trim())
    }
  }
  return dates
})

// ── Tage-Grid ───────────────────────────────────────────────────────────────
const cells = computed(() => {
  const d = viewDate.value
  const year = d.getFullYear()
  const month = d.getMonth()
  const firstDow = new Date(year, month, 1).getDay()
  const offset = firstDow === 0 ? 6 : firstDow - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayKey = new Date().toISOString().split('T')[0]
  const result = []
  for (let i = 0; i < offset; i++) result.push({ key: `e-${i}`, inMonth: false })
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    result.push({ key: dateStr, day, date: dateStr, inMonth: true, isToday: dateStr === todayKey, hasEntry: calendarEntries.value.has(dateStr) })
  }
  const remainder = result.length % 7
  if (remainder !== 0) for (let i = 0; i < 7 - remainder; i++) result.push({ key: `t-${i}`, inMonth: false })
  return result
})

// ── Navigation ──────────────────────────────────────────────────────────────
function prevMonth() {
  const d = new Date(viewDate.value); d.setDate(1); d.setMonth(d.getMonth() - 1); viewDate.value = d
}
function nextMonth() {
  const d = new Date(viewDate.value); d.setDate(1); d.setMonth(d.getMonth() + 1); viewDate.value = d
}

// ── Datum-Label ─────────────────────────────────────────────────────────────
function formatDateLabel(dateStr) {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-').map(Number)
  return `${day}. ${MONTHS[month - 1]} ${year}`
}

// ── Modal ───────────────────────────────────────────────────────────────────
const modal = reactive({
  open: false,
  date: '',
  rows: [],   // [{ text, editing, editText, saving, deleting }]
  newText: '',
  newAllDay: true,
  newTime: '09:00',
  error: '',
  saving: false,
})

function onDayClick(cell) {
  modal.date = cell.date
  modal.newText = ''
  modal.newAllDay = true
  modal.newTime = '09:00'
  modal.error = ''
  modal.saving = false
  const existing = calendarEntries.value.get(cell.date) || []
  modal.rows = existing.map(text => ({ text, editing: false, editText: text, saving: false, deleting: false }))
  modal.open = true
}

function openNewEntry() {
  onDayClick({ date: todayStr.value })
}

// ── Inline-Bearbeitung ──────────────────────────────────────────────────────
function startEdit(i) {
  modal.rows[i].editing = true
  modal.rows[i].editText = modal.rows[i].text
}

function cancelEdit(i) {
  modal.rows[i].editing = false
  modal.rows[i].editText = modal.rows[i].text
}

async function saveEdit(i) {
  const row = modal.rows[i]
  if (!row.editText.trim() || row.editText.trim() === row.text) {
    row.editing = false; return
  }
  row.saving = true
  try {
    updateContent(updateCalendarEntry(soulContent.value, modal.date, row.text, row.editText.trim()))
    await saveToVaultIfConnected()
    row.text = row.editText.trim()
    row.editing = false
  } catch { /* bleibt im Edit-Modus */ }
  finally { row.saving = false }
}

async function deleteEntry(i) {
  const row = modal.rows[i]
  row.deleting = true
  try {
    updateContent(deleteCalendarEntry(soulContent.value, modal.date, row.text))
    await saveToVaultIfConnected()
    modal.rows.splice(i, 1)
  } catch { row.deleting = false }
}

// ── Neuen Eintrag speichern ─────────────────────────────────────────────────
async function saveNewEntry() {
  if (!modal.newText.trim()) return
  modal.error = ''
  modal.saving = true
  try {
    const noteText = modal.newAllDay
      ? modal.newText.trim()
      : `${modal.newTime} · ${modal.newText.trim()}`
    updateContent(appendCalendarEntry(soulContent.value, modal.date, noteText))
    await saveToVaultIfConnected()
    modal.rows.push({ text: noteText, editing: false, editText: noteText, saving: false, deleting: false })
    modal.newText = ''
    modal.newAllDay = true
    modal.newTime = '09:00'
    modal.open = false
  } catch {
    modal.error = 'Speichern fehlgeschlagen'
  } finally {
    modal.saving = false
  }
}
</script>
