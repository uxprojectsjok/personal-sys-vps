<template>
  <Teleport to="body">
    <Transition name="sys-modal-fade">
      <div v-if="isOpen" class="sys-modal-overlay" @click.self="$emit('cancel')">
        <div class="sys-modal sys-modal--sm sys-modal--no-rail">
          <div class="sys-modal-handle"></div>

          <div class="sys-modal-head">
            <button class="sys-modal-close" @click="$emit('cancel')" :aria-label="$t('common.close')">×</button>
            <span class="sys-kicker">New Soul</span>
            <h2 class="sys-display" style="font-size:clamp(22px,3vw,30px)">{{ $t('create_soul.title') }}</h2>
            <p class="sys-lede">{{ $t('create_soul.lede') }}</p>
          </div>

          <div class="sys-modal-body">
            <div class="sys-field">
              <span class="sys-field-label">Soul-Hash</span>
              <div style="display:flex;gap:8px">
                <div class="sys-input sys-input--mono" style="flex:1;display:flex;align-items:center;min-height:44px">
                  <span style="color:var(--sys-accent-bright)">#{{ hash }}</span>
                </div>
                <button
                  @click="copyHash"
                  :aria-label="copied ? $t('first_setup.btn_copied') : $t('create_soul.btn_copy_hash_aria')"
                  class="sys-btn-ed sys-btn-ed--ghost"
                  style="padding:0 14px"
                >
                  <svg v-if="!copied" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"/>
                  </svg>
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                  </svg>
                </button>
              </div>
            </div>

            <div class="sys-field" style="margin-bottom:0">
              <span class="sys-field-label">{{ $t('create_soul.field_idea') }} <span class="sys-field-hint">{{ $t('create_soul.optional') }}</span></span>
              <textarea
                ref="ideaInput"
                v-model="idea"
                :placeholder="$t('create_soul.idea_placeholder')"
                maxlength="280"
                rows="3"
                class="sys-input"
                style="resize:none;line-height:1.6"
              ></textarea>
            </div>

            <label class="sys-field" style="flex-direction:row;align-items:flex-start;gap:10px;margin-top:16px;margin-bottom:0;cursor:pointer">
              <input type="checkbox" v-model="isGatekeeper" style="margin-top:3px;flex:none" />
              <span>
                <span class="sys-field-label" style="display:block">{{ $t('create_soul.gatekeeper_label') }}</span>
                <span class="sys-field-hint" style="display:block">{{ $t('create_soul.gatekeeper_hint') }}</span>
              </span>
            </label>
          </div>

          <div class="sys-modal-foot">
            <div class="sys-foot-meta">
              <span class="sys-dot sys-dot--idle"></span>
              {{ $t('create_soul.meta_hash_ready') }}
            </div>
            <div class="sys-foot-actions">
              <button class="sys-btn-ed sys-btn-ed--ghost" @click="$emit('cancel')">{{ $t('common.cancel') }}</button>
              <button class="sys-btn-ed sys-btn-ed--primary" @click="handleCreate">{{ $t('create_soul.btn_create') }}</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n()

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(["create", "cancel"]);

const hash        = ref("");
const idea        = ref("");
const isGatekeeper = ref(false);
const copied      = ref(false);
const ideaInput   = ref(null);

function generateHash() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

watch(() => props.isOpen, (val) => {
  if (val) {
    hash.value        = generateHash();
    idea.value        = "";
    isGatekeeper.value = false;
    copied.value       = false;
    nextTick(() => ideaInput.value?.focus());
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
});

async function copyHash() {
  await navigator.clipboard.writeText(hash.value).catch(() => {});
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

function handleCreate() {
  emit("create", { name: hash.value, idea: idea.value.trim(), isGatekeeper: isGatekeeper.value });
}
</script>
