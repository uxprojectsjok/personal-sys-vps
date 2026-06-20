<template>
  <div class="soul-upload">
    <label
      class="soul-upload-zone"
      :class="dragActive ? 'is-drag' : ''"
      @dragenter.prevent="dragActive = true"
      @dragleave.prevent="dragActive = false"
      @dragover.prevent
      @drop.prevent="handleDrop"
    >
      <span class="soul-upload-label">{{ t('soul_upload.label') }}</span>
      <svg class="soul-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
      </svg>
      <input
        ref="fileInput"
        type="file"
        accept=".md,text/markdown,text/plain"
        class="soul-upload-input"
        @change="handleFileInput"
      />
    </label>
    <p v-if="errorMsg" class="soul-upload-error">{{ errorMsg }}</p>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { validateSoul } from "#shared/utils/soulParser.js";
const { t } = useI18n();

const emit = defineEmits(["uploaded"]);

const fileInput = ref(null);
const dragActive = ref(false);
const errorMsg = ref("");

async function readFile(file) {
  errorMsg.value = "";

  if (!file) return;
  if (!file.name.endsWith(".md") && file.type !== "text/markdown" && file.type !== "text/plain") {
    errorMsg.value = t('soul_upload.err_type');
    return;
  }

  try {
    const text = await file.text();
    const { valid, error } = validateSoul(text);

    if (!valid) {
      errorMsg.value = error || t("soul_upload.err_invalid");
      return;
    }

    emit("uploaded", text, file.name);
  } catch (e) {
    errorMsg.value = t('soul_upload.err_read');
    console.error("[SoulUpload]", e);
  }
}

function handleFileInput(e) {
  const file = e.target.files?.[0];
  if (file) readFile(file);
  e.target.value = "";
}

function handleDrop(e) {
  dragActive.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) readFile(file);
}
</script>

<style scoped>
.soul-upload-zone {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 52px;
  padding: 0 16px;
  border: 1px solid var(--sys-rule-strong, rgba(226,220,240,0.20));
  background: transparent;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
}

.soul-upload-zone:hover,
.soul-upload-zone.is-drag {
  background: rgba(255,255,255,0.03);
  border-color: var(--sys-fg-dim, rgba(226,220,240,0.48));
}

.soul-upload-label {
  font-family: var(--sys-mono, 'JetBrains Mono', monospace);
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--sys-fg-muted, rgba(226,220,240,0.72));
  transition: color 0.15s;
}

.soul-upload-zone:hover .soul-upload-label,
.soul-upload-zone.is-drag .soul-upload-label {
  color: var(--sys-fg, #ece7f5);
}

.soul-upload-icon {
  width: 16px;
  height: 16px;
  color: var(--sys-fg-dim, rgba(226,220,240,0.48));
  flex: none;
  transition: color 0.15s;
}

.soul-upload-zone:hover .soul-upload-icon,
.soul-upload-zone.is-drag .soul-upload-icon {
  color: var(--sys-fg-muted, rgba(226,220,240,0.72));
}

.soul-upload-input { display: none; }

.soul-upload-error {
  font-family: var(--sys-mono, 'JetBrains Mono', monospace);
  font-size: 12px;
  color: var(--sys-err, #f0a3a3);
  border-left: 2px solid var(--sys-err, #f0a3a3);
  padding-left: 10px;
  margin: 8px 0 0;
}
</style>
