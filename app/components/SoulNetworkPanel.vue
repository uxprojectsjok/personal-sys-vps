<template>
  <div :class="headless ? '' : 'rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-bg-surface)] overflow-hidden'">

    <!-- Header -->
    <button
      v-if="!headless"
      class="w-full flex items-center justify-between px-5 py-4 hover:bg-[rgba(255,255,255,0.03)] transition-colors"
      @click="handleOpen"
      :aria-expanded="open"
    >
      <div class="flex items-center gap-3">
        <span class="text-sm font-medium text-[var(--sys-fg)]">Soul Network</span>
        <span
          v-if="connections.length"
          class="text-xs font-medium px-2 py-0.5 rounded-full bg-white/5 text-white/50 border border-white/10"
        >{{ connections.length }}</span>
        <!-- Unread peer-removal badge -->
        <span
          v-if="removedByPeer.length"
          class="text-xs font-mono px-2 py-0.5 rounded-full bg-[rgba(239,68,68,0.12)] text-red-400 border border-[rgba(239,68,68,0.2)]"
        >!</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="open"
          @click.stop="fetchConnections()"
          :disabled="loading"
          class="w-7 h-7 flex items-center justify-center rounded-none text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
          aria-label="Verbindungen neu laden"
        >
          <svg class="w-3.5 h-3.5" :class="loading ? 'animate-spin' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <svg
          class="w-4 h-4 text-[var(--sys-fg-dim)] transition-transform duration-200"
          :class="open ? 'rotate-180' : ''"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </button>

    <!-- Body -->
    <Transition name="slide-up">
      <div v-if="open || headless" class="border-t border-[var(--sys-border)]">

        <!-- Eigene Soul-ID -->
        <div class="px-5 pt-4 pb-3">
          <p class="text-xs font-medium text-[var(--sys-fg-dim)] mb-2">Deine Soul-ID</p>
          <div class="flex items-center gap-2 rounded-none bg-[rgba(255,255,255,0.03)] border border-[var(--sys-border)] px-3 py-2.5">
            <p class="flex-1 text-xs font-mono text-[var(--sys-fg-muted)] truncate select-all">{{ ownSoulId || '—' }}</p>
            <button
              class="flex-none w-7 h-7 flex items-center justify-center rounded-none text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-[rgba(255,255,255,0.07)] transition-colors"
              @click="copyId(ownSoulId)"
              aria-label="Soul-ID kopieren"
            >
              <svg v-if="copiedId" class="w-3.5 h-3.5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
            </button>
          </div>
          <p class="amm-prose mt-1.5">
            Teile diese ID nur mit Menschen, denen du vertraust. Wer sie hat, kann deinen Soul lesen.
          </p>
        </div>

        <!-- Peer-Removed-Notifications -->
        <div v-if="removedByPeer.length" class="px-5 pb-3 space-y-2">
          <p class="text-xs font-medium text-[var(--sys-fg-dim)] pt-3 pb-1">Getrennte Verbindungen</p>
          <div
            v-for="n in removedByPeer"
            :key="n.soul_id"
            class="rounded-none bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.18)] px-4 py-3 flex items-start justify-between gap-3"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <svg class="w-3 h-3 text-red-400 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
                <p class="text-xs text-red-400 font-medium">{{ n.alias }} hat getrennt</p>
              </div>
              <p class="text-xs font-mono text-[var(--sys-fg-dim)] mt-0.5 truncate">{{ n.soul_id }}</p>
              <p v-if="n.removed_at" class="text-xs text-[var(--sys-fg-dim)] mt-0.5">
                {{ new Date(n.removed_at * 1000).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) }}
              </p>
            </div>
            <button
              class="flex-none text-xs px-2 py-1 border border-[rgba(239,68,68,0.2)] text-red-400 hover:bg-[rgba(239,68,68,0.1)] transition-colors min-h-[28px]"
              @click="acknowledgeRemoval(n.soul_id)"
            >
              Ok
            </button>
          </div>
        </div>

        <!-- Verbindungsliste -->
        <div v-if="connections.length" class="divide-y divide-[var(--sys-border)]">
          <div
            v-for="conn in connections"
            :key="conn.soul_id"
            class="px-5 py-3 flex items-start justify-between gap-3"
          >
            <!-- Avatar -->
            <div class="w-9 h-9 rounded-full overflow-hidden flex-none bg-white/5 border border-white/10 flex items-center justify-center mt-0.5">
              <img
                v-if="profileUrls[conn.soul_id]"
                :src="profileUrls[conn.soul_id]"
                class="w-full h-full object-cover"
                :alt="conn.alias"
              />
              <span v-else class="text-xs font-bold text-white/30 uppercase">
                {{ conn.alias?.charAt(0) ?? '?' }}
              </span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <!-- Verfügbarkeits-Indikator -->
                <span class="flex-none" :title="availabilityTitle(conn)">
                  <i
                    v-if="conn.available === true"
                    class="ri-checkbox-circle-fill text-[11px] leading-none"
                    :class="conn.mutual ? 'text-green-400' : 'text-green-400/60'"
                    aria-hidden="true"
                  />
                  <span
                    v-else-if="conn.encrypted && conn.available === false"
                    class="flex items-center"
                  >
                    <i class="ri-lock-line text-[11px] leading-none text-[var(--sys-orange)]/80" aria-hidden="true" />
                  </span>
                  <span
                    v-else
                    class="block w-1.5 h-1.5 rounded-full"
                    :class="conn.available === null ? 'bg-white/20' : 'bg-white/10'"
                  />
                </span>

                <p class="text-sm text-[var(--sys-fg)] truncate">{{ conn.alias }}</p>
                <span
                  v-if="!conn.mutual"
                  class="text-xs px-1.5 py-0.5 bg-[rgba(255,255,255,0.05)] text-white/45 border border-[rgba(255,255,255,0.10)]"
                >einseitig</span>
                <!-- Verschlüsselt-Badge -->
                <span
                  v-if="conn.encrypted"
                  class="flex items-center gap-1 text-xs px-1.5 py-0.5 bg-[rgba(255,255,255,0.06)] text-[var(--sys-fg-dim)] border border-[var(--sys-border)]"
                  :title="conn.available ? 'Vault entsperrt – Inhalt zugänglich' : 'Vault gesichert – wartet auf Owner'"
                >
                  <i class="ri-lock-line w-2.5 h-2.5 flex-none text-[10px]" aria-hidden="true" />
                  {{ conn.available ? 'offen' : 'gesichert' }}
                </span>
              </div>
              <p class="text-xs font-mono text-[var(--sys-fg-dim)] mt-0.5 truncate">{{ conn.soul_id }}</p>
              <p v-if="conn.encrypted && !conn.available" class="text-xs text-[var(--sys-fg-dim)] opacity-60 mt-0.5 leading-relaxed">
                Vault verschlüsselt · verfügbar wenn Owner entsperrt
              </p>
              <div class="flex flex-wrap gap-1 mt-1">
                <span
                  v-for="p in conn.permissions"
                  :key="p"
                  class="text-xs px-1.5 py-0.5 bg-white/5 text-white/45 border border-white/8"
                >{{ p }}</span>
              </div>
            </div>
            <button
              class="text-xs px-2 py-1 border border-[rgba(239,68,68,0.2)] text-red-400 hover:bg-[rgba(239,68,68,0.1)] transition-colors min-h-[28px] flex-none"
              @click="handleRemove(conn.soul_id, conn.alias)"
            >
              Trennen
            </button>
          </div>
        </div>

        <div v-else-if="!loading" class="px-5 py-4">
          <p class="text-xs text-[var(--sys-fg-dim)]">Noch keine verbundenen Souls.</p>
        </div>

        <!-- Neue Verbindung Button -->
        <div class="px-5 pb-5 pt-3 border-t border-[var(--sys-border)]">
          <button
            class="w-full py-3 rounded-none text-sm font-medium transition-all min-h-[44px] border border-[var(--sys-border)] text-[var(--sys-fg-muted)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--sys-fg)] active:scale-[0.98]"
            @click="connectModal = true"
          >
            + Soul verbinden
          </button>
          <p v-if="error" class="text-xs text-red-400 mt-2">{{ error }}</p>
        </div>

      </div>
    </Transition>
  </div>

  <!-- Verbindungs-Modal -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="connectModal"
        class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4"
        @click.self="closeModal"
      >
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="closeModal" />

        <div class="relative w-full max-w-md rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-bg-surface)] overflow-hidden z-10">
          <!-- Handle (mobile) -->
          <div class="flex justify-center pt-3 pb-1 sm:hidden">
            <div class="w-8 h-1 rounded-full bg-[rgba(255,255,255,0.15)]" />
          </div>

          <!-- Titel -->
          <div class="px-5 pt-4 pb-2 flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-[var(--sys-fg)]">Soul verbinden</p>
              <p class="text-xs text-[var(--sys-fg-dim)] mt-0.5">Peer-to-Peer · beide Seiten müssen verbinden</p>
            </div>
            <button
              class="w-8 h-8 flex items-center justify-center rounded-none text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-[rgba(255,255,255,0.06)] transition-colors flex-none"
              @click="closeModal"
              aria-label="Schließen"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="px-5 pb-5 space-y-3">
            <!-- Soul-ID Input (wie Token-Anzeige) -->
            <div class="rounded-none bg-[rgba(255,255,255,0.03)] border border-[var(--sys-border)] px-4 py-3">
              <input
                v-model="newSoulId"
                type="text"
                placeholder="Soul-ID der anderen Person"
                class="w-full bg-transparent text-xs font-mono text-[var(--sys-fg)] placeholder-[var(--sys-fg-dim)] focus:outline-none"
                autocomplete="off"
                spellcheck="false"
              />
            </div>

            <!-- Alias -->
            <input
              v-model="newAlias"
              type="text"
              placeholder="Name / Alias (z.B. Maria)"
              class="w-full bg-[rgba(255,255,255,0.04)] border border-[var(--sys-border)] rounded-none px-4 py-3 text-sm text-[var(--sys-fg)] placeholder-[var(--sys-fg-dim)] focus:outline-none focus:border-[rgba(255,255,255,0.30)] transition-colors"
            />

            <!-- Permissions -->
            <div class="flex flex-wrap gap-2">
              <button
                v-for="p in allPermissions"
                :key="p.value"
                class="text-xs px-3 py-1.5 rounded-none border transition-all min-h-[32px]"
                :class="newPermissions.includes(p.value)
                  ? 'border-white/30 text-white bg-[rgba(255,255,255,0.09)]'
                  : 'border-[var(--sys-border)] text-[var(--sys-fg-dim)] hover:border-[rgba(255,255,255,0.2)]'"
                @click="togglePermission(p.value)"
                :aria-pressed="newPermissions.includes(p.value)"
              >{{ p.label }}</button>
            </div>

            <!-- Test-Ergebnis -->
            <div
              v-if="testResult"
              class="rounded-none px-3 py-2 text-xs leading-relaxed"
              :class="testResult === 'ok'
                ? 'bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.18)] text-white/80'
                : 'bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.18)] text-red-400'"
            >
              <span v-if="testResult === 'ok' && testMutual">✓ Soul gefunden · Verbindung gegenseitig</span>
              <span v-else-if="testResult === 'ok'">✓ Soul gefunden · warte auf Gegenseite</span>
              <span v-else-if="testResult === 'not_found'">✗ Soul nicht gefunden – ID prüfen</span>
              <span v-else-if="testResult === 'no_connection'">✗ Keine Verbindung zum Server</span>
              <span v-else>✗ {{ testResult }}</span>
            </div>

            <!-- Buttons: Test + Verbinden -->
            <div class="flex gap-2">
              <button
                class="flex-1 py-2.5 rounded-none text-xs font-medium transition-all min-h-[40px] border active:scale-[0.98] disabled:opacity-40"
                :class="testResult === 'ok'
                  ? 'border-white/25 text-white/80 bg-[rgba(255,255,255,0.07)]'
                  : testResult
                    ? 'border-[rgba(239,68,68,0.3)] text-red-400 bg-[rgba(239,68,68,0.06)]'
                    : 'border-[var(--sys-border)] text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-[rgba(255,255,255,0.04)]'"
                :disabled="testLoading || !newSoulId.trim()"
                @click="handleTest"
              >
                <span v-if="testLoading">Teste…</span>
                <span v-else>Verbindung testen</span>
              </button>

              <button
                class="flex-1 py-2.5 rounded-none text-xs font-medium transition-all min-h-[40px] border active:scale-[0.98] disabled:opacity-40"
                :class="'border-white/20 text-white/80 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.10)] hover:border-white/30'"
                :disabled="!newSoulId.trim() || !newAlias.trim() || addLoading"
                @click="handleAdd"
              >
                <span v-if="addLoading">Verbinde…</span>
                <span v-else>Verbinden</span>
              </button>
            </div>

            <p v-if="modalError" class="text-xs text-red-400">{{ modalError }}</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useVaultConnections } from '../composables/useVaultConnections.js'
import { useConfirm } from '../composables/useConfirm.js'
const { ask } = useConfirm();

const props = defineProps({ headless: Boolean })

const {
  connections, removedByPeer, loading, error, profileUrls,
  getSoulId, fetchConnections, addConnection,
  removeConnection, acknowledgeRemoval, testConnection
} = useVaultConnections()

onMounted(() => { if (props.headless) fetchConnections() })

const open          = ref(false)
const connectModal  = ref(false)
const newSoulId     = ref('')
const newAlias      = ref('')
const newPermissions = ref(['soul'])
const addLoading    = ref(false)
const copiedId      = ref(false)
const testLoading   = ref(false)
const testResult    = ref(null)   // null | 'ok' | 'not_found' | 'no_connection' | string
const testMutual    = ref(false)
const modalError    = ref(null)

const ownSoulId = computed(() => getSoulId())

const allPermissions = [
  { value: 'soul',          label: 'Soul' },
  { value: 'audio',         label: 'Audio' },
  { value: 'images',        label: 'Bilder' },
  { value: 'video',         label: 'Video' },
  { value: 'context_files', label: 'Kontext' },
]

function togglePermission(p) {
  const idx = newPermissions.value.indexOf(p)
  if (idx === -1) newPermissions.value.push(p)
  else newPermissions.value.splice(idx, 1)
}

function closeModal() {
  connectModal.value  = false
  newSoulId.value     = ''
  newAlias.value      = ''
  newPermissions.value = ['soul']
  testResult.value    = null
  testMutual.value    = false
  modalError.value    = null
}

async function handleOpen() {
  open.value = !open.value
  if (open.value) await fetchConnections()
}

async function handleTest() {
  if (!newSoulId.value.trim()) return
  testLoading.value = true
  testResult.value  = null
  testMutual.value  = false
  const res = await testConnection(newSoulId.value.trim())
  testLoading.value = false
  if (res.ok) {
    testResult.value = 'ok'
    testMutual.value = res.mutual
  } else {
    testResult.value = res.reason || 'error'
  }
}

async function handleAdd() {
  if (!newSoulId.value.trim() || !newAlias.value.trim()) return
  addLoading.value = true
  modalError.value = null
  const ok = await addConnection(
    newSoulId.value.trim(),
    newAlias.value.trim(),
    [...newPermissions.value]
  )
  addLoading.value = false
  if (ok) {
    closeModal()
  } else {
    modalError.value = error.value || 'Verbindung fehlgeschlagen'
  }
}

async function handleRemove(soulId, alias) {
  if (!await ask({ title: 'Verbindung trennen', message: `Verbindung mit „${alias}" trennen? Die Gegenseite erhält eine Benachrichtigung.`, confirmText: 'Trennen' })) return
  await removeConnection(soulId)
}

function availabilityTitle(conn) {
  if (conn.available === true && conn.encrypted) return 'Vault entsperrt – Inhalt zugänglich'
  if (conn.available === true) return 'Verfügbar – Inhalt zugänglich'
  if (conn.available === false && conn.encrypted) return 'Vault verschlüsselt – wartet auf Owner'
  if (conn.available === false) return 'Nicht erreichbar'
  return 'Status wird geladen…'
}

async function copyId(id) {
  if (!id) return
  try {
    await navigator.clipboard.writeText(id)
    copiedId.value = true
    setTimeout(() => { copiedId.value = false }, 2000)
  } catch {}
}
</script>

<style scoped>
.amm-prose {
  font-family: 'Noto Serif', Georgia, serif;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(236,231,245,0.55);
  margin: 0;
}
.slide-up-enter-active, .slide-up-leave-active { transition: opacity 0.2s, transform 0.2s; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
