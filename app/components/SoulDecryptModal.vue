<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex flex-col justify-end"
        @click.self="handleClose"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/70 backdrop-blur-sm"
          @click="handleClose"
        ></div>

        <!-- Sheet -->
        <div
          class="relative bg-[var(--sys-bg-surface)] border-t border-[var(--sys-border)] rounded-t-2xl px-5 pt-5 pb-safe-or-6 pb-6 z-10 max-h-[92dvh] overflow-y-auto"
        >
          <!-- Handle + Close -->
          <div class="flex items-center mb-5">
            <div class="flex-1 flex justify-center">
              <div class="w-10 h-0.5 bg-[var(--sys-border)] rounded-full"></div>
            </div>
            <button
              @click="handleClose"
              class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full border border-[var(--sys-border)] text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:border-white/20 transition-all"
              :aria-label="$t('common.close')"
            >✕</button>
          </div>

          <!-- Schritt-Indikator -->
          <div class="flex items-center gap-1.5 mb-5">
            <div
              v-for="i in 3"
              :key="i"
              class="h-0.5 flex-1 rounded-full transition-all duration-500"
              :class="i <= step ? 'bg-white' : 'bg-[var(--sys-border)]'"
            ></div>
          </div>

          <!-- ── Step 1: choose .soul file ──────────────────────── -->
          <template v-if="step === 1">
            <p class="text-xs tracking-[0.22em] text-white uppercase mb-1">{{ $t('encrypt.step_1') }}</p>
            <h2 class="text-base font-bold text-[var(--sys-fg)] mb-3">{{ $t('decrypt.title') }}</h2>

            <p class="text-xs text-[var(--sys-fg-muted)] leading-relaxed mb-5">
              {{ $t('decrypt.choose_soul') }}
            </p>

            <label
              class="flex flex-col items-center justify-center gap-3 w-full rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 py-8 mb-5"
              :class="bundleFile
                ? 'border-white/30 bg-[rgba(255,255,255,0.04)]'
                : 'border-[var(--sys-border)] bg-[var(--sys-bg)] hover:border-white/25 hover:bg-[rgba(255,255,255,0.03)]'"
              @dragover.prevent
              @drop.prevent="handleDrop"
            >
              <template v-if="bundleFile">
                <div class="w-10 h-10 rounded-full bg-[rgba(255,255,255,0.06)] border border-white/20 flex items-center justify-center">
                  <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                  </svg>
                </div>
                <div class="text-center">
                  <p class="text-sm font-semibold text-[var(--sys-fg)]">{{ bundleFile.name }}</p>
                  <p v-if="bundle" class="text-xs text-[var(--sys-fg-muted)] mt-0.5">
                    {{ $t('decrypt.bundle_info', { n: bundle.files?.length, created: bundle.created }) }}
                  </p>
                </div>
                <button type="button" @click.prevent="clearBundle" class="text-xs text-[var(--sys-fg-dim)] hover:text-red-400 transition-colors underline underline-offset-2">
                  {{ $t('decrypt.choose_other') }}
                </button>
              </template>
              <template v-else>
                <div class="w-10 h-10 rounded-full bg-[var(--sys-bg-surface)] border border-[var(--sys-border)] flex items-center justify-center">
                  <svg class="w-5 h-5 text-[var(--sys-fg-dim)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"/>
                  </svg>
                </div>
                <div class="text-center">
                  <p class="text-sm text-[var(--sys-fg-muted)]">{{ $t('decrypt.drop_file') }}</p>
                  <p class="text-xs text-[var(--sys-fg-muted)] mt-0.5">{{ $t('decrypt.click_to_select') }}</p>
                </div>
              </template>
              <input ref="fileInputEl" type="file" accept=".soul,application/json" class="hidden" @change="handleFileSelect" />
            </label>

            <p v-if="loadError" class="text-xs text-red-400 mb-4 text-center">{{ loadError }}</p>

            <div class="shad-separator mb-4"></div>
            <div class="flex gap-3">
              <button @click="step = 2" :disabled="!bundle" class="flex-1 h-12 rounded-xl border border-white/20 bg-[rgba(255,255,255,0.08)] text-sm font-semibold text-white disabled:opacity-30 disabled:cursor-not-allowed hover:not-disabled:bg-[rgba(255,255,255,0.14)] active:not-disabled:scale-[0.98] transition-all">
                {{ $t('common.next') }}
              </button>
            </div>
          </template>

          <!-- ── Step 2: enter 12 words ─────────────────────────── -->
          <template v-else-if="step === 2">
            <p class="text-xs tracking-[0.22em] text-white uppercase mb-1">{{ $t('encrypt.step_2') }}</p>
            <h2 class="text-base font-bold text-[var(--sys-fg)] mb-1">{{ $t('encrypt.words_title') }}</h2>
            <p class="text-xs text-[var(--sys-fg-muted)] leading-relaxed mb-4">
              {{ $t('decrypt.words_prose') }}
            </p>

            <datalist id="bip39-dec">
              <option v-for="w in BIP39" :key="w" :value="w" />
            </datalist>

            <div class="grid grid-cols-2 gap-2 mb-3">
              <div
                v-for="(_, i) in 12"
                :key="i"
                class="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[var(--sys-bg)] border transition-colors duration-200"
                :class="wordState(i)"
              >
                <span class="text-xs font-mono w-4 flex-none text-right"
                  :class="isValid(userWords[i]) ? 'text-white' : 'text-[var(--sys-fg-dim)]/40'"
                >{{ i + 1 }}</span>
                <input
                  :id="`dec-word-${i}`"
                  :aria-label="$t('encrypt.word_aria', { n: i + 1 })"
                  list="bip39-dec"
                  :value="userWords[i]"
                  autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"
                  maxlength="12" :placeholder="$t('encrypt.word_placeholder')"
                  class="flex-1 min-w-0 bg-transparent text-sm font-bold text-[var(--sys-fg)] outline-none placeholder-[var(--sys-fg-dim)]/30"
                  @input="sanitizeWord(i, $event)"
                />
                <svg v-if="isValid(userWords[i])" class="w-3 h-3 flex-none text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                </svg>
                <svg v-else-if="userWords[i]" class="w-3 h-3 flex-none text-red-400/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
                </svg>
              </div>
            </div>

            <div class="flex items-center justify-end mb-5">
              <span class="text-xs text-[var(--sys-fg-dim)]">
                <span :class="validCount === 12 ? 'text-white' : 'text-[var(--sys-fg)]'">{{ validCount }}</span> {{ $t('encrypt.valid_count_suffix') }}
              </span>
            </div>

            <div class="flex gap-3">
              <button @click="step = 1" class="flex-1 h-12 rounded-xl border border-[var(--sys-border)] text-sm text-[var(--sys-fg-muted)] hover:text-[var(--sys-fg)] hover:border-[rgba(255,255,255,0.15)] transition-all">
                {{ $t('encrypt.back_btn') }}
              </button>
              <button @click="handleDecrypt" :disabled="!allValid"
                class="flex-1 h-12 rounded-xl border border-white/20 bg-[rgba(255,255,255,0.08)] text-sm font-semibold text-white disabled:opacity-30 disabled:cursor-not-allowed hover:not-disabled:bg-[rgba(255,255,255,0.14)] active:not-disabled:scale-[0.98] transition-all"
              >{{ $t('decrypt.decrypt_btn') }}</button>
            </div>
          </template>

          <!-- ── Step 3: result ──────────────────────────────────── -->
          <template v-else-if="step === 3">
            <p class="text-xs tracking-[0.22em] text-white uppercase mb-1">{{ $t('encrypt.step_3') }}</p>
            <h2 class="text-base font-bold text-[var(--sys-fg)] mb-6">
              {{ isDecrypting ? $t('decrypt.decrypting') : decryptError ? $t('common.error') : $t('decrypt.vault_decrypted') }}
            </h2>

            <!-- Spinner -->
            <div v-if="isDecrypting" class="flex flex-col items-center gap-4 py-8">
              <svg class="w-10 h-10 text-white animate-spin" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <p class="text-sm text-[var(--sys-fg-muted)]">{{ $t('decrypt.files_decrypting') }}</p>
            </div>

            <!-- Error -->
            <div v-else-if="decryptError" class="flex flex-col items-center gap-4 py-6">
              <div class="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <svg class="w-6 h-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
                </svg>
              </div>
              <p class="text-sm text-red-400 text-center leading-relaxed">{{ decryptError }}</p>
              <button
                @click="step = 2"
                class="h-10 px-5 rounded-xl border border-[var(--sys-border)] text-sm text-[var(--sys-fg-muted)] hover:text-[var(--sys-fg)] transition"
              >
                {{ $t('common.back') }}
              </button>
            </div>

            <!-- Success -->
            <div v-else class="flex flex-col gap-3">

              <!-- Logged in status -->
              <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-[rgba(255,255,255,0.04)] border border-white/15">
                <svg class="w-4 h-4 flex-none text-emerald-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                </svg>
                <div>
                  <p class="text-xs font-semibold text-white">{{ $t('decrypt.logged_in') }}</p>
                  <p class="text-xs text-white">{{ $t('decrypt.logged_in_sub') }}</p>
                </div>
              </div>

              <!-- Connect local vault -->
              <div class="rounded-xl border border-[var(--sys-border)] bg-[var(--sys-bg)] px-4 py-3">
                <p class="text-xs font-semibold text-[var(--sys-fg)] mb-0.5">{{ $t('decrypt.local_vault') }}</p>
                <p v-if="!otherFiles.length" class="text-xs text-[var(--sys-fg-muted)] leading-relaxed mb-3">
                  {{ $t('decrypt.local_vault_prose') }}
                </p>
                <p v-else class="text-xs text-[var(--sys-fg-muted)] leading-relaxed mb-3">
                  {{ $t('decrypt.local_vault_prose_files', { n: otherFiles.length }) }}
                </p>

                <!-- Connected -->
                <div v-if="localVaultStatus === 'done'" class="flex items-center gap-2 text-emerald-400/80">
                  <svg class="w-4 h-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                  </svg>
                  <span class="text-xs font-semibold">{{ $t('decrypt.local_vault_connected') }}</span>
                </div>

                <!-- Connect / Retry -->
                <button
                  v-else
                  @click="connectLocalVault"
                  :disabled="localVaultStatus === 'connecting'"
                  class="w-full h-10 sys-btn-filled text-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg v-if="localVaultStatus === 'connecting'" class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <svg v-else class="w-3.5 h-3.5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5"/>
                  </svg>
                  {{ localVaultStatus === 'connecting' ? $t('decrypt.vault_connecting') : localVaultStatus === 'error' ? $t('decrypt.vault_retry') : $t('decrypt.vault_choose_folder') }}
                </button>
              </div>

              <!-- To dashboard -->
              <button
                @click="goToSession"
                class="sys-cta-primary w-full h-12 flex items-center justify-between px-5 rounded-xl active:scale-[0.98] transition-all group"
              >
                <span class="text-sm font-bold text-white">{{ $t('decrypt.go_to_dashboard') }}</span>
                <svg class="w-4 h-4 text-white group-hover:translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/>
                </svg>
              </button>

            </div>
          </template>

        </div>

      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useSoul } from "~/composables/useSoul.js";
import { useVault } from "~/composables/useVault.js";
import { BIP39 } from "~/composables/useSoulEncrypt.js";
import { useSoulDecrypt } from "~/composables/useSoulDecrypt.js";
import { useApiContext } from "~/composables/useApiContext.js";
import SoulUpload from "~/components/SoulUpload.vue";

const props = defineProps({
  isOpen: Boolean,
});
const emit  = defineEmits(["close", "uploaded", "openFaq"]);

const { t } = useI18n()
const router = useRouter();
const { importAndSetup, isLoginInProgress, soulToken, soulMeta, soulContent, firstSetupToken } = useSoul();
const { clearVault, connectVault, writeFile, writeSoulMd, scanVault } = useVault();
const { resetContext, saveContext } = useApiContext();
const {
  bundle, isDecrypting, decryptError,
  loadBundle, decrypt,
  getSoulMd, getNonSoulFiles, reset,
} = useSoulDecrypt();

const step             = ref(1);
const bundleFile       = ref(null);
const loadError        = ref(null);
const fileInputEl      = ref(null);

// Wort-Eingabe (identisch zu SoulEncryptModal)
const userWords = reactive(new Array(12).fill(""));
const WORD_RE   = /^[a-zäöüß]{3,12}$/;

function sanitize(raw) {
  return String(raw ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^a-zäöüß]/g, "")
    .slice(0, 12);
}

function sanitizeWord(i, event) {
  const clean = sanitize(event.target.value);
  userWords[i] = clean;
  if (event.target.value !== clean) {
    const pos = event.target.selectionStart;
    event.target.value = clean;
    event.target.setSelectionRange(pos, pos);
  }
}

function isValid(w)    { return WORD_RE.test(w ?? ""); }
function wordState(i)  {
  const w = userWords[i];
  if (!w) return "border-[var(--sys-border)]";
  return isValid(w) ? "border-emerald-500/35" : "border-red-500/35";
}

const validCount = computed(() => userWords.filter(w => isValid(w)).length);
const allValid   = computed(() => validCount.value === 12);

// Erkennt Soul-Kopien: .md-Dateien mit soul_id: im Frontmatter (z.B. "Soul.Test.md")
// Diese sind inhaltlich identisch mit sys.md und werden beim Restore übersprungen.
function isSoulLikeMd(file) {
  if (!file.name.toLowerCase().endsWith(".md")) return false;
  const preview = new TextDecoder().decode(file.buffer.slice(0, 400));
  return preview.includes("soul_id:");
}

// Dateien außer sys.md, ohne Soul-Kopien (z.B. Soul.Test.md)
const otherFiles = computed(() => getNonSoulFiles().filter(f => !isSoulLikeMd(f)));

// ── Datei-Upload ─────────────────────────────────────────────────────────────

async function selectFile(file) {
  if (!file) return;
  loadError.value   = null;
  bundleFile.value  = file;
  const ok = await loadBundle(file);
  if (!ok) {
    loadError.value  = decryptError.value;
    bundleFile.value = null;
  }
}

function handleFileSelect(e) {
  selectFile(e.target?.files?.[0]);
  if (fileInputEl.value) fileInputEl.value.value = "";
}

function handleDrop(e) {
  const file = e.dataTransfer?.files?.[0];
  if (file) selectFile(file);
}

function clearBundle() {
  bundleFile.value = null;
  loadError.value  = null;
  reset();
}

// ── Entschlüsseln ────────────────────────────────────────────────────────────

async function finishDecrypt(ok) {
  if (ok) {
    const soulMd = getSoulMd();
    if (soulMd) {
      clearVault();
      resetContext();
      isLoginInProgress.value = true;

      await importAndSetup(soulMd);
      // Bundle-Import: FirstSetupModal überspringen — Soul ist bereits vollständig importiert.
      // Admin-Token (Multi-Hoster) ist in localStorage gespeichert und via Settings abrufbar.
      firstSetupToken.value = null;

      // Permissions & enabled in api_context.json initialisieren
      const token = soulToken.value;
      if (token && token !== "anonymous") {
        await saveContext(token, {
          enabled: false,
          permissions: {
            soul: true, calendar: false, audio: false,
            video: false, images: false, context_files: false
          }
        });
      }

      isLoginInProgress.value = false;
    }
  }
}

// ── Lokaler Vault nach Decrypt ────────────────────────────────────────────────
// "idle" | "connecting" | "done" | "error"
const localVaultStatus = ref("idle");

async function connectLocalVault() {
  const id = soulMeta.value?.id;
  if (!id) return;
  localVaultStatus.value = "connecting";
  const connected = await connectVault(id);
  if (connected) {
    // Soul-Datei in den lokalen Ordner schreiben — Dateiname = Soul-Name (z.B. jan.md)
    if (soulContent.value) {
      const safeName = (soulMeta.value?.name ?? "sys")
        .toLowerCase()
        .replace(/[^a-z0-9äöüß_\-]/g, "_")
        .replace(/_{2,}/g, "_")
        .replace(/^_|_$/g, "") || "sys";
      await writeSoulMd(soulContent.value, safeName);
    }
    // Weitere Vault-Dateien aus dem Bundle schreiben (Audio, Bilder, Videos, …)
    for (const file of otherFiles.value) {
      await writeFile(file.name, file.buffer);
    }
    // Vault neu scannen nachdem alle Dateien geschrieben wurden —
    // connectVault() hat scanVault() vor dem Schreiben aufgerufen, daher kein soul in allFiles
    await scanVault();
    localVaultStatus.value = "done";
  } else {
    localVaultStatus.value = "error";
  }
}

async function handleDecrypt() {
  const clean = Array.from(userWords).map(sanitize);
  step.value  = 3;
  const ok    = await decrypt(clean);
  await finishDecrypt(ok);
}

// ── Navigation ────────────────────────────────────────────────────────────────

function goToSession() {
  emit("close");
  router.push("/");
}

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function fileEmoji(name) {
  const ext = name.split(".").pop().toLowerCase();
  if (["jpg","jpeg","png","webp","gif"].includes(ext)) return "🖼";
  if (["webm","mp4"].includes(ext)) {
    // Stimme vs. Motion anhand Dateiname erkennen
    const lower = name.toLowerCase();
    if (lower.includes("voice") || lower.includes("audio")) return "🎤";
    if (lower.includes("motion") || lower.includes("video")) return "🎬";
    return "📹";
  }
  if (["mp3","ogg","m4a"].includes(ext)) return "🎤";
  if (["md","txt"].includes(ext)) return "📝";
  return "📄";
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

watch(() => props.isOpen, (val) => {
  if (val) {
    step.value             = 1;
    bundleFile.value       = null;
    loadError.value        = null;
    localVaultStatus.value = "idle";
    for (let i = 0; i < 12; i++) userWords[i] = "";
    reset();
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
});

function handleClose() {
  if (isDecrypting.value) return;
  emit("close");
}
</script>

<style scoped>
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.25s ease;
}
.sheet-enter-active .relative,
.sheet-leave-active .relative {
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .relative,
.sheet-leave-to .relative {
  transform: translateY(100%);
}
</style>
