<template>
  <div :class="headless ? '' : 'sys-card-ed'">

    <!-- Header (collapsible, non-headless only) -->
    <button
      v-if="!headless"
      class="api-panel-toggle"
      @click="handleToggle"
      :aria-expanded="open"
    >
      <div style="display:flex;align-items:center;gap:10px">
        <span class="api-panel-title">{{ $t('api_context.title') }}</span>
        <span class="api-panel-badge" :class="enabled ? 'is-active' : ''">
          {{ enabled ? $t('api_context.active') : $t('api_context.inactive') }}
        </span>
      </div>
      <svg
        class="api-panel-chevron"
        :class="open ? 'is-open' : ''"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Body -->
    <Transition name="slide-up">
      <div v-if="open || headless" class="api-panel-body" :class="headless ? 'is-headless' : ''">

        <!-- Enable toggle -->
        <label class="api-panel-row">
          <div class="api-toggle" :class="enabled ? 'is-on' : ''">
            <div class="api-toggle-thumb" :class="enabled ? 'is-on' : ''"></div>
          </div>
          <input type="checkbox" v-model="enabled" class="sr-only" @change="onToggleEnabled" />
          <span class="api-panel-row-label">{{ $t('api_context.enable') }}</span>
        </label>

        <p v-if="saveError && !enabled" class="api-panel-error">{{ saveError }}</p>

        <template v-if="enabled">
          <div class="sys-field" style="margin-bottom:0">
            <span class="sys-field-label">{{ $t('api_context.permissions') }}</span>
            <p class="api-panel-prose">{{ $t('api_context.public_vault_desc') }}</p>
            <div style="display:flex;flex-direction:column;gap:14px;margin-top:10px">
              <label
                v-for="(perm, key) in permLabels"
                :key="key"
                class="api-panel-perm"
              >
                <div class="api-toggle api-toggle--sm" :class="permissions[key] ? 'is-on' : ''">
                  <div class="api-toggle-thumb api-toggle-thumb--sm" :class="permissions[key] ? 'is-on' : ''"></div>
                </div>
                <input type="checkbox" v-model="permissions[key]" class="sr-only" />
                <span class="api-panel-perm-label">{{ perm.label }}</span>
                <span class="api-panel-perm-hint">{{ perm.hint }}</span>
              </label>
            </div>
          </div>

          <button
            @click="onSave"
            :disabled="isSaving"
            class="btn btn-primary"
            style="width:100%;justify-content:center;margin-top:4px"
          >{{ isSaving ? $t('api_context.saving_permissions') : $t('api_context.save_permissions') }}</button>

          <p v-if="saveError" class="api-panel-error">{{ saveError }}</p>
          <p v-else-if="saveSuccess" class="sys-field-ok">{{ $t('api_context.saved_ok') }}</p>
        </template>

      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useI18n } from 'vue-i18n'
import { useApiContext } from "~/composables/useApiContext.js";
const { t } = useI18n()

const props = defineProps({
  soulCert:    { type: String, default: "" },
  soulContent: { type: String, default: "" },
  soulId:      { type: String, default: "" },
  headless:    { type: Boolean, default: false }
});

onMounted(() => { if (props.headless && props.soulCert) loadContext(props.soulCert) });

defineEmits(["close"]);

const {
  enabled, permissions, saveError,
  loadContext, saveContext, resetContext,
} = useApiContext();

const open        = ref(false);
const isSaving    = ref(false);
const saveSuccess = ref(false);

const permLabels = computed(() => ({
  soul:          { label: t('api_context.perm_soul'),     hint: t('api_context.perm_soul_hint')    },
  calendar:      { label: t('api_context.perm_calendar'), hint: t('api_context.perm_calendar_hint') },
  audio:         { label: t('api_context.perm_audio'),    hint: t('api_context.perm_audio_hint')   },
  video:         { label: t('api_context.perm_video'),    hint: t('api_context.perm_video_hint')   },
  images:        { label: t('api_context.perm_images'),   hint: t('api_context.perm_images_hint')  },
  context_files: { label: t('api_context.perm_context'),  hint: t('api_context.perm_context_hint') },
}));

watch(() => props.soulCert, async (cert, oldCert) => {
  if (cert) {
    if (oldCert && oldCert !== cert) resetContext();
    await loadContext(cert);
  } else {
    resetContext();
  }
}, { immediate: true });

function handleToggle() {
  open.value = !open.value;
}

async function onToggleEnabled() {
  if (!props.soulCert) return;
  const newVal = enabled.value;
  const ok = await saveContext(props.soulCert, { enabled: newVal });
  if (!ok) {
    enabled.value = !newVal;
  }
}

async function onSave() {
  if (!props.soulCert) return;
  isSaving.value = true;
  saveSuccess.value = false;
  const ok = await saveContext(props.soulCert, {
    enabled:     enabled.value,
    permissions: { ...permissions.value }
  });
  isSaving.value = false;
  if (ok) {
    saveSuccess.value = true;
    setTimeout(() => { saveSuccess.value = false; }, 3000);
  }
}
</script>

<style scoped>
.api-panel-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  min-height: unset;
  border-radius: 0;
  transition: background 0.15s;
  text-align: left;
}
.api-panel-toggle:hover { background: rgba(255,255,255,0.02); }

.api-panel-title {
  font-family: var(--sys-mono);
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--sys-fg-muted);
}

.api-panel-badge {
  font-family: var(--sys-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 2px 8px;
  border: 1px solid var(--sys-rule-strong);
  color: var(--sys-fg-dim);
  transition: all 0.15s;
}
.api-panel-badge.is-active {
  color: var(--sys-ok);
  border-color: rgba(184,220,196,0.3);
}

.api-panel-chevron {
  width: 14px; height: 14px;
  color: var(--sys-fg-dim);
  transition: transform 0.2s;
}
.api-panel-chevron.is-open { transform: rotate(180deg); }

.api-panel-body {
  padding: 0 20px 20px;
  border-top: 1px solid var(--sys-rule);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.api-panel-body.is-headless {
  border-top: none;
  padding-top: 0;
}

.api-panel-row {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding-top: 14px;
}
.api-panel-row-label {
  font-family: var(--sys-mono);
  font-size: 12px;
  letter-spacing: 0.1em;
  color: var(--fg);
  transition: color 0.15s;
}
.api-panel-row:hover .api-panel-row-label { color: var(--sys-fg); }

.api-toggle {
  position: relative;
  width: 36px; height: 20px;
  background: rgba(255,255,255,0.1);
  border-radius: 10px;
  flex-shrink: 0;
  transition: background 0.2s;
}
.api-toggle.is-on { background: var(--sys-ok); }
.api-toggle--sm { width: 28px; height: 16px; border-radius: 8px; }

.api-toggle-thumb {
  position: absolute;
  top: 2px; left: 2px;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  transition: transform 0.2s;
}
.api-toggle-thumb.is-on { transform: translateX(16px); }
.api-toggle-thumb--sm { width: 12px; height: 12px; }
.api-toggle-thumb--sm.is-on { transform: translateX(12px); }

.api-panel-prose {
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.6;
  color: var(--fg);
  margin: 6px 0 20px;
}

.api-panel-perm {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}
.api-panel-perm-label {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--fg);
  flex: 1;
}
.api-panel-perm-hint {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--fg-3);
  letter-spacing: 0.06em;
}

.api-panel-error {
  font-family: var(--sys-mono);
  font-size: 12px;
  color: var(--sys-err);
  padding-left: 10px;
  border-left: 2px solid var(--sys-err);
  margin: 0;
}
</style>
