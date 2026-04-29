<template>
  <div :class="syncStatus === 'differs' ? 'overflow-y-auto overscroll-contain h-full' : 'flex flex-col h-full min-h-0'">

    <!-- ── META BAR (single compact line) ──────────────────────────────── -->
    <div class="meta-bar flex-none">
      <span class="meta-indicator" :class="vaultConnected ? 'on' : ''"></span>
      <span class="meta-id">{{ soulMeta?.id?.slice(0,8) || '------' }}</span>
      <span class="meta-sep">·</span>
      <span class="meta-vault">{{ vaultConnected ? 'Vault · Lokal' : 'Lokal' }}</span>
      <span v-if="syncStatus === 'in_sync'" class="meta-sync ok">✓</span>
      <span v-else-if="syncStatus === 'differs'" class="meta-sync warn">≠</span>
      <span v-else-if="syncStatus === 'checking'" class="meta-sync" style="animation: pulse 1s infinite">…</span>
      <!-- Maturity collapsible pill -->
      <button class="maturity-pill" @click="maturityOpen = !maturityOpen" :aria-expanded="maturityOpen">
        {{ maturity.score }}/100
        <svg class="maturity-chevron" :class="{ 'rotate-180': maturityOpen }"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/>
        </svg>
      </button>
      <Transition name="fade-quick">
        <span v-if="saveFlash" class="meta-saved">Gespeichert</span>
      </Transition>
    </div>
    <!-- Collapsible maturity meter -->
    <Transition name="expand">
      <div v-if="maturityOpen" class="px-3 pt-2 pb-3 border-b border-[var(--sys-border)] flex-none">
        <SoulMaturityMeter
          :score="maturity.score"
          :level="maturity.level"
          :is-mature="maturity.isMature"
          :breakdown="maturity.breakdown"
        />
      </div>
    </Transition>

    <!-- ── SYNC-VERGLEICH (inline) ──────────────────────────────────────── -->
    <Transition name="expand">
      <div v-if="syncStatus === 'differs'"
        class="px-4 py-3 border-b border-amber-500/20 bg-amber-500/[0.05] flex-none">

        <div class="flex items-center justify-between gap-2 mb-1.5">
          <div class="flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5 text-amber-400 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/>
            </svg>
            <p class="text-xs font-medium text-amber-400">Soul-Abgleich</p>
          </div>
          <button @click="dismissSync()" class="text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] transition-colors text-xs px-1" aria-label="Schließen">✕</button>
        </div>

        <p class="text-[10px] text-[var(--sys-fg-dim)] mb-2">
          {{ changedSections.length }} Abschnitt{{ changedSections.length !== 1 ? 'e' : '' }} unterschiedlich ·
          <span class="font-mono">L {{ localLastSession || '—' }}</span>
          <span class="opacity-40 mx-1">/</span>
          <span class="font-mono">S {{ serverLastSession || '—' }}</span>
        </p>

        <div class="space-y-1 mb-2.5">
          <button
            v-for="s in changedSections" :key="s.name"
            @click="openSyncSections[s.name] = !openSyncSections[s.name]"
            class="w-full text-left px-2.5 py-2 rounded-lg bg-white/[0.04] border border-[var(--sys-border)] hover:bg-white/[0.07] transition-colors"
          >
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-medium text-[var(--sys-fg-muted)]">{{ s.name }}</span>
              <span class="text-[10px] font-mono text-[var(--sys-fg-dim)]">L {{ s.localLen }} / S {{ s.serverLen }}</span>
            </div>
            <Transition name="expand">
              <div v-if="openSyncSections[s.name]" class="mt-2 grid grid-cols-2 gap-1.5">
                <div class="rounded bg-white/[0.03] px-2 py-1.5 border border-[var(--sys-border)]">
                  <p class="text-[9px] font-mono font-bold text-[var(--sys-fg-dim)] mb-0.5">Lokal</p>
                  <p class="text-[10px] text-[var(--sys-fg-muted)] leading-relaxed whitespace-pre-wrap break-words">{{ s.localSnippet || '(leer)' }}</p>
                </div>
                <div class="rounded bg-white/[0.03] px-2 py-1.5 border border-[var(--sys-border)]">
                  <p class="text-[9px] font-mono font-bold text-[var(--sys-fg-dim)] mb-0.5">Server</p>
                  <p class="text-[10px] text-[var(--sys-fg-muted)] leading-relaxed whitespace-pre-wrap break-words">{{ s.serverSnippet || '(leer)' }}</p>
                </div>
              </div>
            </Transition>
          </button>
        </div>

        <div class="flex gap-1.5">
          <button @click="handleAcceptServer" :disabled="syncSaving"
            class="sync-action-btn flex-1 disabled:opacity-40">
            Server übernehmen
          </button>
          <button @click="handlePushLocal" :disabled="syncSaving"
            class="sync-action-btn flex-1 disabled:opacity-40">
            <span v-if="syncSaving">Lädt…</span><span v-else>Hochladen</span>
          </button>
        </div>
      </div>
    </Transition>

    <!-- ── SYNC-FEHLER ────────────────────────────────────────────────── -->
    <Transition name="fade-quick">
      <div v-if="syncError && syncStatus !== 'differs'"
        class="flex items-start gap-2 px-4 py-2.5 border-b border-red-500/20 bg-red-500/[0.05] flex-none">
        <svg class="w-3.5 h-3.5 text-red-400 flex-none mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/>
        </svg>
        <p class="text-[10px] text-red-400 leading-relaxed flex-1">{{ syncError }}</p>
        <button @click="dismissSync()" class="text-red-400/60 hover:text-red-400 transition-colors text-xs px-0.5" aria-label="Schließen">✕</button>
      </div>
    </Transition>

    <!-- ── SCROLLBARE SEKTIONEN ─────────────────────────────────────────── -->
    <div ref="scrollContainerRef" :class="syncStatus === 'differs' ? '' : 'flex-1 overflow-y-auto overscroll-contain min-h-0'">

      <div class="px-4 py-3 space-y-2">

        <div
          v-for="section in SOUL_SECTIONS" :key="section.key"
          class="rounded-xl border overflow-hidden transition-all duration-200"
          :class="editingSection === section.key
            ? 'border-[var(--sys-violet)]/40 bg-[var(--sys-bg-elevated)]'
            : 'border-[var(--sys-border)] bg-[var(--sys-bg-elevated)]'"
        >
          <!-- Section header -->
          <button
            class="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-white/[0.04] transition-colors"
            @click="toggleSection(section.key)"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <i :class="[section.icon, 'ri-fw text-sm flex-none']"
                 :style="{ color: openedSections[section.key] ? section.color : 'var(--sys-fg-dim)' }"
                 aria-hidden="true" />
              <span class="text-xs font-medium truncate transition-colors"
                :class="openedSections[section.key] ? 'text-[var(--sys-fg)]' : 'text-[var(--sys-fg-muted)]'">
                {{ section.label }}
              </span>
              <span v-if="!getContent(section.key)" class="text-[10px] text-[var(--sys-fg-dim)] opacity-50 flex-none">leer</span>
            </div>
            <svg class="w-3 h-3 text-[var(--sys-fg-dim)] flex-none transition-transform duration-200"
              :class="openedSections[section.key] ? 'rotate-180' : ''"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/>
            </svg>
          </button>

          <!-- Expanded -->
          <Transition name="expand">
            <div v-if="openedSections[section.key]" class="border-t border-[var(--sys-border)]">

              <!-- View mode -->
              <div v-if="editingSection !== section.key" class="px-3 py-2.5">
                <p v-if="getContent(section.key)"
                  class="text-xs text-[var(--sys-fg-muted)] leading-relaxed whitespace-pre-wrap break-words">
                  {{ getContent(section.key) }}
                </p>
                <p v-else class="text-xs text-[var(--sys-fg-dim)] italic opacity-50">Noch nichts eingetragen.</p>
                <div class="flex justify-end mt-2">
                  <button @click.stop="startEdit(section.key)"
                    class="inline-flex items-center gap-1 text-[10px] text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-white/[0.06] transition-colors px-2 py-1 rounded min-h-[32px]">
                    <i class="ri-pencil-line ri-fw" aria-hidden="true" />
                    Bearbeiten
                  </button>
                </div>
              </div>

              <!-- Edit mode -->
              <div v-else class="px-3 py-2.5 flex flex-col gap-2">
                <textarea
                  ref="editTextareaRef"
                  v-model="editText"
                  class="w-full min-h-[100px] bg-white/[0.04] border border-[var(--sys-border)] rounded-lg px-2.5 py-2 text-xs text-[var(--sys-fg)] leading-relaxed resize-y focus:outline-none focus:border-[var(--sys-violet)]/50 placeholder-[var(--sys-fg-dim)] transition-colors"
                  :placeholder="section.label + ' …'"
                  @keydown.ctrl.enter="saveEdit(section.key)"
                  @keydown.meta.enter="saveEdit(section.key)"
                  @keydown.escape="cancelEdit"
                />
                <div class="flex justify-end gap-1.5">
                  <button @click="cancelEdit"
                    class="text-[10px] text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-white/[0.06] transition-colors px-2 py-1 rounded">
                    Abbrechen
                  </button>
                  <button @click="saveEdit(section.key)"
                    class="text-[10px] font-semibold text-white px-2.5 py-1 rounded transition-colors"
                    style="background: var(--sys-violet)">
                    Speichern
                  </button>
                </div>
              </div>

            </div>
          </Transition>
        </div>


      </div>

      <!-- ── SOUL UPDATEN + KALENDER ──────────────────────────────────── -->
      <div class="px-4 pb-4 space-y-3">

        <!-- Soul updaten Button -->
        <button
          @click="triggerEnrichment"
          :disabled="isEnriching"
          class="sys-cta-primary cta-sweep w-full h-11 flex items-center justify-between px-5 rounded-xl transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span class="text-sm font-bold text-white">{{ isEnriching ? 'Soul wird analysiert…' : 'Soul updaten' }}</span>
          <svg v-if="isEnriching" class="w-4 h-4 animate-spin flex-none" style="color: rgba(255,255,255,0.75)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/>
          </svg>
          <svg v-else class="w-4 h-4 flex-none group-hover:translate-x-0.5 transition-transform" style="color: rgba(255,255,255,0.75)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/>
          </svg>
        </button>

        <!-- Enrich status -->
        <Transition name="fade-quick">
          <div v-if="enrichStatus"
            class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs border"
            :class="enrichStatus.type === 'success'
              ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400'
              : enrichStatus.type === 'error'
                ? 'border-red-500/20 bg-red-500/[0.06] text-red-400'
                : 'border-[var(--sys-border)] text-[var(--sys-fg-dim)]'"
          >
            <svg v-if="enrichStatus.type === 'success'" class="w-3 h-3 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
            </svg>
            <svg v-else-if="enrichStatus.type === 'error'" class="w-3 h-3 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/>
            </svg>
            <span>{{ enrichStatus.message }}</span>
          </div>
        </Transition>

        <!-- Kalender -->
        <div>
          <p class="text-[10px] font-medium tracking-widest uppercase text-[var(--sys-fg-dim)] mb-2 px-0.5">Kalender</p>
          <SoulCalendar />
        </div>

      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from "vue";
import { parseSoul, updateSection } from "#shared/utils/soulParser.js";
import { computeMaturity } from "#shared/utils/soulMaturity.js";
import { useSoul } from "~/composables/useSoul.js";
import { useVault } from "~/composables/useVault.js";
import { useSession } from "~/composables/useSession.js";
import { useChainAnchor } from "~/composables/useChainAnchor.js";
import SoulMaturityMeter from "~/components/SoulMaturityMeter.vue";
import SoulCalendar from "~/components/SoulCalendar.vue";

// ── Composables ──────────────────────────────────────────────────────────
const {
  soulContent, soulMeta, syncStatus, syncError, serverContent,
  updateContent, acceptServerVersion, pushToServer, dismissSync,
  enrichFromSession,
} = useSoul();

const { writeSoulMd, isConnected: vaultConnected } = useVault();
const { toApiMessages, messages } = useSession();
const { appendGrowthEntry } = useChainAnchor();

// ── Local state ──────────────────────────────────────────────────────────
const scrollContainerRef = ref(null);
// Maturity: expanded on desktop, collapsed on mobile by default
const maturityOpen = ref(typeof window !== 'undefined' ? window.innerWidth >= 900 : true);
const editingSection   = ref(null);
const editText         = ref("");
const editTextareaRef  = ref(null);
const openedSections   = ref({});
const openSyncSections = ref({});
const saveFlash        = ref(false);
const syncSaving       = ref(false);
const isEnriching      = ref(false);
const enrichStatus     = ref(null);

// Scroll to top when diff appears so the amber block is visible
watch(syncStatus, (val) => {
  if (val === "differs") {
    nextTick(() => {
      scrollContainerRef.value?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
});

// ── Soul sections config ─────────────────────────────────────────────────
const SOUL_SECTIONS = [
  { key: "Kern-Identität",                       label: "Kern-Identität",         icon: "ri-user-line",      color: "var(--chart-1)" },
  { key: "Werte & Überzeugungen",                label: "Werte & Überzeugungen",  icon: "ri-scales-3-line",  color: "var(--sys-violet)" },
  { key: "Ästhetik & Resonanz",                  label: "Ästhetik & Resonanz",    icon: "ri-palette-line",   color: "#f472b6" },
  { key: "Sprachmuster & Ausdruck",              label: "Sprachmuster & Ausdruck",icon: "ri-chat-1-line",    color: "var(--sys-fg-muted)" },
  { key: "Wiederkehrende Themen & Obsessionen",  label: "Themen & Obsessionen",   icon: "ri-fire-line",      color: "var(--sys-orange)" },
  { key: "Emotionale Signatur",                  label: "Emotionale Signatur",    icon: "ri-emotion-line",   color: "#fbbf24" },
  { key: "Weltbild",                             label: "Weltbild",               icon: "ri-earth-line",     color: "var(--chart-2)" },
  { key: "Offene Fragen dieser Person",          label: "Offene Fragen",          icon: "ri-question-line",  color: "var(--sys-fg-muted)" },
  { key: "Session-Log (komprimiert)",            label: "Verlauf",                icon: "ri-history-line",   color: "var(--sys-fg-dim)" },
];

// ── Computed ─────────────────────────────────────────────────────────────
const parsed = computed(() => parseSoul(soulContent.value));

function getContent(key) {
  let c = parsed.value.sections[key];
  // Session-Log: beide Varianten zusammenführen
  if (key === "Session-Log (komprimiert)" || key === "Session-Log") {
    const a = parsed.value.sections["Session-Log"] ?? "";
    const b = parsed.value.sections["Session-Log (komprimiert)"] ?? "";
    c = [a, b].filter(Boolean).join("\n\n") || "";
  }
  if (!c) return "";
  if (c.includes("Noch nicht beschrieben") || c.includes("Noch nicht eingetragen")) return "";
  return c;
}


const maturity = computed(() => {
  if (!soulContent.value) return { score: 0, level: "Genesis", isMature: false, breakdown: null };
  return computeMaturity(soulContent.value);
});

const hasMessages = computed(() =>
  messages.value.filter(m => m.role === "user").length > 0
);

// ── Section toggle ────────────────────────────────────────────────────────
function toggleSection(key) {
  if (editingSection.value === key) return;
  openedSections.value[key] = !openedSections.value[key];
}

// ── Edit / Save ───────────────────────────────────────────────────────────
function startEdit(key) {
  editingSection.value = key;
  editText.value = getContent(key);
  openedSections.value[key] = true;
  nextTick(() => editTextareaRef.value?.focus());
}

function cancelEdit() {
  editingSection.value = null;
  editText.value = "";
}

async function saveEdit(key) {
  if (editingSection.value !== key) return;
  const updated = updateSection(soulContent.value, key, editText.value);
  updateContent(updated);
  if (vaultConnected.value) {
    writeSoulMd(soulContent.value, "sys").catch(() => {});
  }
  editingSection.value = null;
  editText.value = "";
  saveFlash.value = true;
  setTimeout(() => { saveFlash.value = false; }, 2000);
}

// ── Soul updaten (Enrichment) ─────────────────────────────────────────────
async function triggerEnrichment() {
  if (isEnriching.value) return;
  if (!hasMessages.value) {
    enrichStatus.value = { type: "error", message: "Erst chatten, dann updaten." };
    setTimeout(() => { enrichStatus.value = null; }, 3000);
    return;
  }
  isEnriching.value = true;
  enrichStatus.value = null;
  try {
    const result = await enrichFromSession(toApiMessages(50));
    if (!result) {
      enrichStatus.value = { type: "error", message: "Verbindung fehlgeschlagen." };
    } else if (!result.changed) {
      enrichStatus.value = { type: "success", message: "Nichts Soul-Würdiges gefunden." };
    } else {
      const n = result.sectionsUpdated.length;
      enrichStatus.value = {
        type: "success",
        message: n > 0 ? `${n} Sektion${n > 1 ? "en" : ""} aktualisiert` : "Session-Log eingetragen",
      };
      appendGrowthEntry();
      if (vaultConnected.value) {
        await writeSoulMd(soulContent.value, "sys").catch(() => {});
      }
    }
    setTimeout(() => { enrichStatus.value = null; }, 4000);
  } catch {
    enrichStatus.value = { type: "error", message: "Fehler beim Soul-Update." };
  } finally {
    isEnriching.value = false;
  }
}

// ── Sync comparison ───────────────────────────────────────────────────────
function extractMeta(md, field) {
  return md.match(new RegExp(`${field}:\\s*(.+)`))?.[1]?.trim() ?? "";
}

function extractSections(md) {
  const result = {};
  const parts = md.split(/\n(?=## )/);
  for (const part of parts) {
    const m = part.match(/^## (.+?)\n([\s\S]*)/);
    if (m) result[m[1].trim()] = m[2].trim();
  }
  return result;
}

const localLastSession  = computed(() => extractMeta(soulContent.value,  "last_session"));
const serverLastSession = computed(() => extractMeta(serverContent.value, "last_session"));

const newerSide = computed(() => {
  const l = localLastSession.value;
  const s = serverLastSession.value;
  if (l && s && l !== s) return l > s ? "local" : "server";
  return "unknown";
});

const changedSections = computed(() => {
  if (!serverContent.value) return [];
  const local  = extractSections(soulContent.value);
  const remote = extractSections(serverContent.value);
  const all    = new Set([...Object.keys(local), ...Object.keys(remote)]);
  return [...all]
    .filter(k => (local[k] ?? "") !== (remote[k] ?? ""))
    .map(k => {
      const lc = local[k]  ?? "";
      const sc = remote[k] ?? "";
      return {
        name:          k,
        localLen:      lc.length,
        serverLen:     sc.length,
        localSnippet:  lc.slice(0, 200).trim(),
        serverSnippet: sc.slice(0, 200).trim(),
      };
    });
});

async function handleAcceptServer() {
  acceptServerVersion();
  if (vaultConnected.value) {
    await writeSoulMd(soulContent.value, "sys").catch(() => {});
  }
}

async function handlePushLocal() {
  syncSaving.value = true;
  await pushToServer();
  syncSaving.value = false;
}
</script>

<style scoped>
/* ── Meta bar (single compact line) ────────────────────────────────── */
.meta-bar {
  display: flex; align-items: center; gap: 7px;
  padding: 7px 14px 7px 12px;
  border-bottom: 1px solid var(--sys-border, rgba(226,220,240,0.10));
  font-family: ui-monospace, monospace;
  font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
  min-height: 34px;
}
.meta-indicator {
  width: 6px; height: 6px; border-radius: 50%; flex: none;
  background: rgba(255,255,255,0.18);
  transition: background 0.2s;
}
.meta-indicator.on { background: #a78bfa; box-shadow: 0 0 6px rgba(167,139,250,0.5); }
.meta-id { color: var(--sys-fg-dim, rgba(236,231,245,0.30)); white-space: nowrap; }
.meta-sep { color: var(--sys-fg-dim, rgba(236,231,245,0.30)); opacity: 0.4; }
.meta-vault { color: var(--sys-fg-dim, rgba(236,231,245,0.30)); white-space: nowrap; }
.meta-sync { flex: none; font-size: 10px; }
.meta-sync.ok { color: #34d399; }
.meta-sync.warn { color: #fbbf24; }
.maturity-pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 7px; margin-left: auto; flex: none;
  background: rgba(139,92,246,0.10); border: 1px solid rgba(139,92,246,0.22);
  cursor: pointer; color: var(--sys-fg-muted, rgba(236,231,245,0.48));
  font-family: ui-monospace; font-size: 10px; letter-spacing: 0.12em;
  white-space: nowrap; transition: background 0.15s;
}
.maturity-pill:hover { background: rgba(139,92,246,0.18); }
.maturity-chevron {
  width: 10px; height: 10px; flex: none;
  color: currentColor; transition: transform 0.2s ease;
}
.maturity-chevron.rotate-180 { transform: rotate(180deg); }
.meta-saved { color: #34d399; white-space: nowrap; font-size: 10px; }

.sync-action-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 26px; min-height: 0;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 10px; font-weight: 500;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  color: var(--sys-fg-muted);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.sync-action-btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.10);
  border-color: rgba(255,255,255,0.20);
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}
.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 1000px;
}

.fade-quick-enter-active,
.fade-quick-leave-active {
  transition: opacity 0.3s ease;
}
.fade-quick-enter-from,
.fade-quick-leave-to {
  opacity: 0;
}
</style>
