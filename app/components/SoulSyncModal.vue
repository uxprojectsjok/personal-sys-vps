<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="syncStatus === 'differs'"
        class="fixed inset-0 z-[80] bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
        @click.self="dismissSync()"
        role="dialog" aria-modal="true" aria-labelledby="soul-sync-title"
      >
        <div class="relative w-full max-w-lg bg-[var(--sys-bg-elevated)] border border-[var(--sys-border)] rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden">

          <!-- Header -->
          <div class="flex items-start justify-between px-5 pt-4 pb-3 border-b border-[var(--sys-border)] flex-none">
            <div>
              <p id="soul-sync-title" class="text-sm font-medium text-[var(--sys-fg)]">Soul-Abgleich</p>
              <p class="text-xs text-[var(--sys-fg-dim)] mt-0.5">
                {{ changedSections.length }} Abschnitte unterscheiden sich zwischen diesem Gerät und dem Server
              </p>
            </div>
            <button
              @click="dismissSync()"
              class="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-[rgba(255,255,255,0.06)] transition-colors flex-none"
              aria-label="Schließen"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Meta-Zeile -->
          <div class="grid grid-cols-2 gap-px px-5 py-2.5 border-b border-[var(--sys-border)] flex-none">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span class="text-xs font-mono font-bold text-[var(--sys-fg-dim)] w-4 flex-none">L</span>
              <span class="text-xs text-[var(--sys-fg-dim)]">Dieses Gerät</span>
              <span class="text-xs font-mono text-[var(--sys-fg-muted)]">{{ localLastSession || '—' }}</span>
              <span v-if="newerSide === 'local'" class="text-xs px-1.5 py-px rounded bg-[rgba(255,255,255,0.10)] text-[var(--sys-fg-muted)] border border-[rgba(255,255,255,0.18)]">Aktueller</span>
            </div>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span class="text-xs font-mono font-bold text-[var(--sys-fg-dim)] w-4 flex-none">S</span>
              <span class="text-xs text-[var(--sys-fg-dim)]">Server</span>
              <span class="text-xs font-mono text-[var(--sys-fg-muted)]">{{ serverLastSession || '—' }}</span>
              <span v-if="newerSide === 'server'" class="text-xs px-1.5 py-px rounded bg-[rgba(255,255,255,0.10)] text-[var(--sys-fg-muted)] border border-[rgba(255,255,255,0.18)]">Aktueller</span>
            </div>
          </div>

          <!-- Abschnitt-Diffs (scrollbar) -->
          <div class="flex-1 overflow-y-auto divide-y divide-[var(--sys-border)]">
            <div
              v-for="s in changedSections"
              :key="s.name"
              class="pl-6 pr-5 pt-3 pb-3"
            >
              <!-- Sektions-Titel + Expand -->
              <button
                class="w-full flex items-center justify-between gap-2 group"
                @click="openSections[s.name] = !openSections[s.name]"
              >
                <span class="text-xs font-medium text-[var(--sys-fg-muted)] group-hover:text-[var(--sys-fg)] transition-colors text-left">{{ s.name }}</span>
                <div class="flex items-center gap-2 flex-none">
                  <span class="text-xs text-[var(--sys-fg-dim)]">
                    <span class="font-mono font-bold">L</span> <span :class="s.localLen > s.serverLen ? 'text-[var(--sys-fg)]' : ''">{{ s.localLen }}</span>
                    <span class="opacity-40 mx-1.5">/</span>
                    <span class="font-mono font-bold">S</span> <span :class="s.serverLen > s.localLen ? 'text-[var(--sys-fg)]' : ''">{{ s.serverLen }}</span>
                  </span>
                  <svg
                    class="w-3 h-3 text-[var(--sys-fg-dim)] transition-transform duration-200 flex-none"
                    :class="openSections[s.name] ? 'rotate-180' : ''"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"
                  ><path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/></svg>
                </div>
              </button>

              <!-- Aufgeklappter Vergleich: auf Mobile gestapelt, auf sm nebeneinander -->
              <div v-if="openSections[s.name]" class="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div class="rounded-lg bg-[rgba(255,255,255,0.03)] border border-[var(--sys-border)] px-2.5 py-2">
                  <p class="text-xs font-mono font-bold text-[var(--sys-fg-dim)] mb-1">L – Dieses Gerät</p>
                  <p class="text-xs text-[var(--sys-fg-muted)] leading-relaxed whitespace-pre-wrap break-words">{{ s.localSnippet }}</p>
                  <p v-if="s.localLen > 200" class="text-xs text-[var(--sys-fg-dim)] opacity-40 mt-1">+{{ s.localLen - 200 }} Zeichen</p>
                </div>
                <div class="rounded-lg bg-[rgba(255,255,255,0.03)] border border-[var(--sys-border)] px-2.5 py-2">
                  <p class="text-xs font-mono font-bold text-[var(--sys-fg-dim)] mb-1">S – Server</p>
                  <p class="text-xs text-[var(--sys-fg-muted)] leading-relaxed whitespace-pre-wrap break-words">{{ s.serverSnippet }}</p>
                  <p v-if="s.serverLen > 200" class="text-xs text-[var(--sys-fg-dim)] opacity-40 mt-1">+{{ s.serverLen - 200 }} Zeichen</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Aktionen -->
          <div class="px-5 py-4 border-t border-[var(--sys-border)] flex gap-2 flex-none">
            <button
              @click="handleAcceptServer"
              :disabled="saving"
              class="flex-1 py-2.5 rounded-xl text-xs font-medium transition-all min-h-[40px] border active:scale-[0.98] disabled:opacity-40"
              :class="newerSide === 'server'
                ? 'border-[rgba(255,255,255,0.25)] text-[var(--sys-fg)] bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.12)]'
                : 'border-[var(--sys-border)] text-[var(--sys-fg-dim)] bg-transparent hover:bg-[rgba(255,255,255,0.04)]'"
            >{{ newerSide === 'server' ? '✓ Server übernehmen' : 'Server übernehmen' }}</button>

            <button
              @click="handlePushLocal"
              :disabled="saving"
              class="flex-1 py-2.5 rounded-xl text-xs font-medium transition-all min-h-[40px] border active:scale-[0.98] disabled:opacity-40"
              :class="newerSide === 'local'
                ? 'border-[rgba(255,255,255,0.25)] text-[var(--sys-fg)] bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.12)]'
                : 'border-[var(--sys-border)] text-[var(--sys-fg-dim)] bg-transparent hover:bg-[rgba(255,255,255,0.04)]'"
            >
              <span v-if="saving">Lädt…</span>
              <span v-else>{{ newerSide === 'local' ? '✓ Auf Server hochladen' : 'Auf Server hochladen' }}</span>
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useSoul } from '~/composables/useSoul.js';
import { useVault } from '~/composables/useVault.js';

const {
  soulContent, serverContent, syncStatus,
  acceptServerVersion, pushToServer, dismissSync
} = useSoul();

const { writeSoulMd, isConnected: vaultConnected } = useVault();

const saving       = ref(false);
const openSections = ref({});

function extractMeta(md, field) {
  return md.match(new RegExp(`${field}:\\s*(.+)`))?.[1]?.trim() ?? '';
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

const localLastSession  = computed(() => extractMeta(soulContent.value,  'last_session'));
const serverLastSession = computed(() => extractMeta(serverContent.value, 'last_session'));
const localVersion      = computed(() => extractMeta(soulContent.value,  'version') || '1');
const serverVersion     = computed(() => extractMeta(serverContent.value,'version') || '1');

const newerSide = computed(() => {
  const l = localLastSession.value;
  const s = serverLastSession.value;
  if (l && s && l !== s) return l > s ? 'local' : 'server';
  const lv = parseInt(localVersion.value) || 1;
  const sv = parseInt(serverVersion.value) || 1;
  if (lv !== sv) return lv > sv ? 'local' : 'server';
  return 'unknown';
});

const changedSections = computed(() => {
  if (!serverContent.value) return [];
  const local  = extractSections(soulContent.value);
  const remote = extractSections(serverContent.value);
  const all    = new Set([...Object.keys(local), ...Object.keys(remote)]);
  return [...all]
    .filter(k => (local[k] ?? '') !== (remote[k] ?? ''))
    .map(k => {
      const lc = local[k]  ?? '';
      const sc = remote[k] ?? '';
      return {
        name:          k,
        localLen:      lc.length,
        serverLen:     sc.length,
        localSnippet:  lc.slice(0, 200).trim() || '(leer)',
        serverSnippet: sc.slice(0, 200).trim() || '(leer)',
      };
    });
});

async function handleAcceptServer() {
  acceptServerVersion();
  // Vault-Datei ebenfalls aktualisieren, damit lokale Kopie nicht veraltet bleibt
  if (vaultConnected.value) {
    await writeSoulMd(soulContent.value, 'sys');
  }
}

async function handlePushLocal() {
  saving.value = true;
  await pushToServer();
  saving.value = false;
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
