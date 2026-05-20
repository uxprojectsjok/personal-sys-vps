<template>
  <!-- ═══════════════════════════════════════════════════════════════
       SYS · ChatInterface.vue — Editorial reading column
       Serif body copy, rule-separated turns, feature chips, mode toggle.
       ═══════════════════════════════════════════════════════════════ -->
  <div class="sys-chat">

    <!-- ── Stream ──────────────────────────────────────────────────── -->
    <div ref="scrollEl" class="stream">
      <div class="stream-inner">

      <div v-if="peerPollErrors.length" class="peer-error-notice">
        <span class="peer-error-icon">⚠</span>
        <span>{{ peerPollErrors.length === 1 ? 'Peer nicht erreichbar' : `${peerPollErrors.length} Peers nicht erreichbar` }} · {{ peerPollErrors.map(e => `${e.soul_id.slice(0, 8)}… (${e.error})`).join(', ') }}</span>
      </div>

      <template v-for="(item, idx) in unifiedStream" :key="item.id || `${item._type}-${item.ts ?? item._ts}-${idx}`">

        <!-- Day separator (bubbles only) -->
        <div v-if="item._type === 'bubble' && item._showDaySep" class="msg-day-sep">
          {{ formatDay(item.ts) }}
        </div>

        <!-- AI message — chat bubble, consistent with social stream -->
        <div
          v-if="item._type === 'ai'"
          class="msg-bubble"
          :class="item.role === 'user' ? 'msg-bubble--me' : 'msg-bubble--other'"
        >
          <div v-if="item.role === 'assistant'" class="msg-sender" style="color: var(--accent)">SoulKI</div>
          <div class="msg-inner" :class="item.role === 'user' ? 'msg-inner--me' : 'msg-inner--ki'">
            <div v-if="item.mediaType === 'image' && item.mediaUrl" class="media-preview">
              <img :src="item.mediaUrl" alt="" loading="lazy" />
            </div>
            <div v-else-if="item.mediaType === 'audio' && item.mediaUrl" class="media-audio">
              <audio controls :src="item.mediaUrl" style="accent-color:var(--accent)"></audio>
            </div>
            <div v-else-if="item.mediaType === 'video' && item.mediaUrl" class="media-video">
              <video controls :src="item.mediaUrl" playsinline></video>
            </div>
            <div v-if="item.youtubeEmbed" class="media-embed">
              <iframe
                :src="`https://www.youtube-nocookie.com/embed/${item.youtubeEmbed.videoId}`"
                frameborder="0" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"
              ></iframe>
            </div>
            <div v-if="item.spotifyEmbed" class="media-spotify">
              <iframe
                :src="`https://open.spotify.com/embed/track/${item.spotifyEmbed.id}?utm_source=generator&theme=0`"
                frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"
              ></iframe>
            </div>
            <a v-if="item.linkCard" :href="item.linkCard.url" target="_blank" rel="noopener" class="link-card">
              <span class="lc-icon">{{ item.linkCard.service === 'youtube' ? '▶' : item.linkCard.service === 'spotify' ? '♫' : '🔍' }}</span>
              <span class="lc-label">{{ item.linkCard.label }}</span>
              <span class="lc-arr">→</span>
            </a>
            <div v-if="item.streaming && !item.text" class="dots">
              <span></span><span></span><span></span>
            </div>
            <p v-for="(para, j) in paragraphs(item.text)" :key="j" v-html="renderText(para)"></p>
            <div v-if="item.actions?.length" class="msg-actions">
              <button
                v-for="a in item.actions" :key="a.label"
                class="msg-action-btn" :class="a.primary ? 'primary' : 'secondary'"
                :disabled="item.actionsDisabled" @click="handleMsgAction(item, a)"
              >{{ a.label }}</button>
            </div>
          </div>
          <time class="msg-time-ai">{{ fmtTime(item.ts || Date.now()) }}</time>
        </div>

        <!-- Social / agent / synthesis bubble -->
        <div
          v-else-if="item._type === 'bubble'"
          class="msg-bubble"
          :class="[item.from === 'me' ? 'msg-bubble--me' : 'msg-bubble--other', item.sphere === 'synthesis' ? 'msg-bubble--archivar' : '']"
        >
          <div v-if="item.from !== 'me' || item.content?.startsWith('[KI]')" class="msg-sender"
            :style="{ color: item.sphere === 'synthesis' ? '#60a5fa' : item.sphere === 'social' ? '#34d399' : item.content?.startsWith('[KI]') ? 'var(--accent)' : '#a78bfa' }">
            {{ resolveAuthor(item) }}
          </div>
          <div class="msg-inner"
            :class="item.from === 'me' ? (item.content?.startsWith('[KI]') ? 'msg-inner--ki-out' : 'msg-inner--me') : item.sphere === 'synthesis' ? 'msg-inner--synthesis' : (item.sphere === 'social' ? 'msg-inner--social' : 'msg-inner--agent')">
            <div v-if="msgExpiredCache.has(item.ts)" class="msg-expired">Inhalt abgelaufen</div>
            <template v-else>
              <img v-if="msgMediaCache.get(item.ts)" :src="msgMediaCache.get(item.ts)" class="msg-media-img" alt="" />
              <div v-if="msgBlobCache.get(item.ts)" class="msg-doc-link">
                <a :href="msgBlobCache.get(item.ts).url" :download="msgBlobCache.get(item.ts).name" class="msg-doc-a">
                  <span class="msg-doc-icon">↓</span>
                  <span class="msg-doc-name">{{ msgBlobCache.get(item.ts).name }}</span>
                </a>
              </div>
              <!-- Vault-shared attachment -->
              <template v-if="getMsgVaultRef(item.content)">
                <template v-if="VAULT_SHARED_IMAGE.test(getMsgVaultRef(item.content).filename)">
                  <img
                    v-if="vaultBlobUrls.get(`${getMsgVaultRef(item.content).soul_id}:${getMsgVaultRef(item.content).filename}`)"
                    :src="vaultBlobUrls.get(`${getMsgVaultRef(item.content).soul_id}:${getMsgVaultRef(item.content).filename}`)"
                    class="msg-media-img" alt="" loading="lazy"
                  />
                  <div v-else-if="vaultBlobErrors.has(`${getMsgVaultRef(item.content).soul_id}:${getMsgVaultRef(item.content).filename}`)" class="msg-media-error">Bild nicht ladbar</div>
                  <div v-else class="msg-media-loading">Bild wird geladen…</div>
                </template>
                <div v-else class="msg-doc-link">
                  <a
                    v-if="vaultBlobUrls.get(`${getMsgVaultRef(item.content).soul_id}:${getMsgVaultRef(item.content).filename}`)"
                    :href="vaultBlobUrls.get(`${getMsgVaultRef(item.content).soul_id}:${getMsgVaultRef(item.content).filename}`)"
                    :download="getMsgVaultRef(item.content).label"
                    class="msg-doc-a"
                  >
                    <span class="msg-doc-icon">↓</span>
                    <span class="msg-doc-name">{{ getMsgVaultRef(item.content).label }}</span>
                  </a>
                  <span v-else-if="vaultBlobErrors.has(`${getMsgVaultRef(item.content).soul_id}:${getMsgVaultRef(item.content).filename}`)" class="msg-media-error">Datei nicht ladbar</span>
                  <span v-else class="msg-media-loading">Wird geladen…</span>
                </div>
              </template>
            </template>
            <p v-for="(para, j) in paragraphs(cleanVaultRef(cleanMsgContent(item)))" :key="j" v-html="renderText(para)"></p>
          </div>
          <div class="msg-foot">
            <span v-if="item.from === 'me'" class="msg-to"
              :style="item.to === 'agent' ? 'color:#a78bfa' : item.to === 'community' ? 'color:#60a5fa' : 'color:#34d399'">
              → {{ peerLabelForTo(item.to) }}
            </span>
            <time class="msg-time">{{ fmtMsgDate(item.ts) }}</time>
            <span
              v-if="item.from === 'me' && item.to !== 'agent' && item.to !== 'ki' && msgDeliveryStatus.has(item.ts)"
              class="msg-delivery"
              :class="`msg-delivery--${msgDeliveryStatus.get(item.ts)}`"
              :title="deliveryTitle(item.ts)"
            >{{ deliveryIcon(item.ts) }}</span>
            <button
              v-if="item.from === 'me' && getMsgVaultRef(item.content)"
              class="msg-vault-del"
              @click="deleteSharedFile(getMsgVaultRef(item.content).filename)"
              title="Datei aus vault/shared löschen"
            >×</button>
            <template v-if="item.sphere === 'synthesis' && item.local">
              <button v-if="!item.forwarded" class="msg-forward-btn" @click="forwardSynthesis(item)" title="An Peers weiterleiten">→ Peers</button>
              <span v-else class="msg-forwarded">✓ gesendet</span>
            </template>
          </div>
        </div>

        <!-- Capture card -->
        <div v-else-if="item._type === 'capture'" class="msg-bubble msg-bubble--other">
          <AudioCaptureCard v-if="item.captureMode === 'audio'" />
          <MotionCaptureCard v-else :mode="item.captureMode" />
        </div>

      </template>

      <!-- Synthesis typing indicator -->
      <div v-if="isSynthesizing" class="msg-bubble msg-bubble--other briefing-bubble">
        <div class="msg-sender" style="color:#60a5fa">Briefing</div>
        <div class="msg-inner msg-inner--agent">
          <div class="dots"><span></span><span></span><span></span></div>
        </div>
      </div>

      <div v-if="isSavingAgent" class="dots saving-dots">
        <span></span><span></span><span></span>
      </div>

      <div ref="chatEnd" class="anchor"></div>
      </div><!-- /stream-inner -->
    </div>

    <!-- ── Dock ────────────────────────────────────────────────────── -->
    <footer ref="dockEl" class="dock" :class="{ 'mobile-open': mobileComposerOpen }">

      <!-- Soul-Archivar läuft -->
      <Transition name="fade-quick">
        <div v-if="props.growthLocked" class="dock-growth-lock">
          <span class="dock-growth-spinner"></span>
          <span>Soul-Archivar schreibt…</span>
        </div>
      </Transition>

      <!-- Mode bar -->
      <div class="dock-mode-bar">
        <span class="mode-dot soul"></span>
        <span v-if="isLoading || isSavingAgent || isRefreshing" class="mode-activity">
          <span></span><span></span><span></span>
        </span>
        <button
          class="archivar-toggle"
          :class="{ active: archivEnabled }"
          @click="archivEnabled = !archivEnabled"
          :title="archivEnabled ? 'Archivar aktiv' : 'Archivar aus'"
        >
          <span class="archivar-dot"></span>Archivar
        </button>
        <button
          class="archivar-toggle"
          :class="{ active: autonomousKi }"
          @click="autonomousKi = !autonomousKi"
          :title="autonomousKi ? `KI-Auto aktiv (${soulMeta?.name || 'Soul'})` : 'KI-Auto aus'"
        >
          <span class="archivar-dot"></span>KI-Auto
        </button>
        <select class="model-select" v-model="selectedModel" :title="MODELS.find(m=>m.id===selectedModel)?.hint">
          <option v-for="m in MODELS" :key="m.id" :value="m.id">{{ m.label }}</option>
        </select>
      </div>

      <!-- Input row -->
      <div class="dock-main">
        <!-- "+" media drawer toggle -->
        <button
          class="dock-icon dock-plus"
          :class="{ active: mediaOpen }"
          @click="mediaOpen = !mediaOpen"
          :disabled="props.growthLocked"
          title="Medien anhängen"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="dock-icon-svg">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
        </button>
        <!-- Expandable media buttons -->
        <Transition name="media-drawer">
          <div v-if="mediaOpen" class="media-drawer">
            <button class="dock-icon" @click="cameraOpen = true; mediaOpen = false" :disabled="visionLoading || props.growthLocked" :title="visionLoading ? 'Analyse läuft…' : 'Kamera'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="dock-icon-svg" :class="{ pulse: visionLoading }">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"/>
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"/>
              </svg>
            </button>
            <button class="dock-icon" @click="onFileIconClick" title="Datei anhängen" :disabled="props.growthLocked">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="dock-icon-svg">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>
              </svg>
            </button>
          </div>
        </Transition>
        <div class="input-wrap">
          <textarea
            ref="textareaEl"
            v-model="draft"
            class="input"
            :placeholder="props.growthLocked ? 'Soul-Archivar schreibt…' : inputPlaceholder"
            :disabled="props.growthLocked"
            rows="1"
            @keydown.enter.exact.prevent="handleSend"
            @keydown.shift.enter.exact="draft += '\n'; $nextTick(autoResize)"
            @input="autoResize"
          ></textarea>
        </div>
        <button class="send" :disabled="!canSend" @click="handleSend" aria-label="Senden">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="arr-icon">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5m-7 7 7-7 7 7"/>
          </svg>
        </button>
      </div>

      <!-- Attachment previews -->
      <div v-if="msgMedia" class="dock-media-preview">
        <img :src="`data:${msgMedia.mime};base64,${msgMedia.base64}`" alt="Anhang" class="dock-media-thumb" />
        <span class="dock-media-name">{{ msgMedia.name ?? 'Bild' }}</span>
        <button class="dock-media-remove" @click="msgMedia = null" aria-label="Entfernen">✕</button>
      </div>
      <div v-if="msgDoc" class="dock-media-preview">
        <span class="dock-doc-icon">↓</span>
        <span class="dock-media-name">{{ msgDoc.name }}</span>
        <button class="dock-media-remove" @click="msgDoc = null" aria-label="Entfernen">✕</button>
      </div>

      <!-- Session shared files banner -->
      <div v-if="sessionSharedFiles.length" class="shared-files-banner">
        <span class="sfb-info">{{ sessionSharedFiles.length }} Datei{{ sessionSharedFiles.length > 1 ? 'en' : '' }} in vault/shared — auf Gerät sichern falls gewünscht</span>
        <button class="sfb-delete" @click="deleteAllSessionFiles">Alle löschen</button>
      </div>

    </footer>

    <!-- Camera Recorder Overlay -->
    <CameraRecorder
      :is-open="cameraOpen"
      @captured="handleCameraCapture"
      @cancel="cameraOpen = false"
    />
    <!-- Hidden file input — must be in DOM for mobile to work -->
    <input ref="fileInputEl" type="file" style="display:none;position:fixed" @change="onFileInputChange" />

    <!-- Mobile floating composer button -->
    <button
      class="mobile-fab"
      :class="{ open: mobileComposerOpen }"
      :style="mobileComposerOpen ? { bottom: `${dockHeight + 12}px` } : {}"
      @click="toggleMobileComposer"
      aria-label="Eingabe öffnen"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mobile-fab-icon" width="20" height="20">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useClaude } from '~/composables/useClaude.js'
import { useMind } from '~/composables/useMind.js'
import { useSession } from '~/composables/useSession.js'
import { useVault } from '~/composables/useVault.js'
import { useYouTube } from '~/composables/useYouTube.js'
import { useSpotify } from '~/composables/useSpotify.js'
import { useSoul } from '~/composables/useSoul.js'
import CameraRecorder      from '~/components/CameraRecorder.vue'
import AudioCaptureCard    from '~/components/AudioCaptureCard.vue'
import MotionCaptureCard   from '~/components/MotionCaptureCard.vue'

// ── Props / Emits ──────────────────────────────────────────────────
const props = defineProps({
  soulContent:  { type: String,  default: '' },
  soulCert:     { type: String,  default: '' },
  role:         { type: String,  default: 'soul' },
  growthLocked: { type: Boolean, default: false },
})
const emit = defineEmits(['cert-error'])

// ── Composables ────────────────────────────────────────────────────
const { chat, isLoading, error, certError } = useClaude()
const { mindContent, loadMind } = useMind()
const {
  messages, conversationSummary,
  addMessage, updateLastMessage, setLastMessageMeta, setMessageMetaById,
  toApiMessages, getMessagesToSummarize, pruneWithSummary,
} = useSession()
const { contextText, profileBase64, fileManifest, allFiles, readImageFile, readImageAsBase64, isConnected: vaultConnected, writeSoulMd } = useVault()
const { isConnected: ytConnected, accessToken: ytToken } = useYouTube()
const { isConnected: spConnected, accessToken: spToken } = useSpotify()

// ── Cert error passthrough ─────────────────────────────────────────
watch(certError, (v) => { if (v) emit('cert-error') })

// ── Local role — always soul mode ──────────────────────────────────
const localRole = ref('soul')

// ── Model selector ─────────────────────────────────────────────────
const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku', hint: 'schnell' },
  { id: 'claude-sonnet-4-6',          label: 'Sonnet', hint: 'Standard' },
  { id: 'claude-opus-4-7',            label: 'Opus',   hint: 'tief' },
]
const selectedModel = ref(
  typeof window !== 'undefined' ? (localStorage.getItem('sys_chat_model') || 'claude-sonnet-4-6') : 'claude-sonnet-4-6'
)
watch(selectedModel, v => { if (typeof window !== 'undefined') localStorage.setItem('sys_chat_model', v) })

// ── Archivar toggle ─────────────────────────────────────────────────
const archivEnabled = ref(
  typeof window !== 'undefined' ? localStorage.getItem('sys_archivar_enabled') !== 'false' : true
)
watch(archivEnabled, v => { if (typeof window !== 'undefined') localStorage.setItem('sys_archivar_enabled', v) })

// ── Autonomer Soul-KI Modus ──────────────────────────────────────────
const autonomousKi = ref(
  typeof window !== 'undefined' ? localStorage.getItem('sys_autonomous_ki') === 'true' : false
)
watch(autonomousKi, v => { if (typeof window !== 'undefined') localStorage.setItem('sys_autonomous_ki', String(v)) })

// ── Media drawer ────────────────────────────────────────────────────
const mediaOpen = ref(false)

// ── Mobile composer FAB ─────────────────────────────────────────────
const mobileComposerOpen = ref(false)
const dockEl             = ref(null)
const dockHeight         = ref(160)

function toggleMobileComposer() {
  mobileComposerOpen.value = !mobileComposerOpen.value
  if (mobileComposerOpen.value) {
    nextTick(() => { if (dockEl.value) dockHeight.value = dockEl.value.offsetHeight })
  }
}

function closeMobileComposer() {
  mobileComposerOpen.value = false
}

// ── Input state ────────────────────────────────────────────────────
const draft      = ref('')
const textareaEl = ref(null)
const scrollEl   = ref(null)
const chatEnd    = ref(null)

const canSend = computed(() =>
  (draft.value.trim().length > 0 || !!msgMedia.value || !!msgDoc.value) &&
  !isLoading.value && !isSavingAgent.value && !props.growthLocked
)

const inputPlaceholder = computed(() => {
  return 'Schreib… @name, @agent, @all'
})

// ── Messaging / Social sphere state ───────────────────────────────
const { soulContent: soulContentAgent, soulMeta, updateContent, pushToServer, fetchFromServer, syncStatus, serverContent } = useSoul()
const isSavingAgent      = ref(false)
const isRefreshing       = ref(false)
const isSynthesizing     = ref(false)
const localSynthesisMsgs = ref([])
const msgRecipient       = ref('ki')   // 'ki' | 'peer' | 'agent' | 'community'
const msgMedia        = ref(null)    // { base64, mime, name? } — attached image in messaging mode
const msgDoc          = ref(null)    // { file, name } — attached doc in messaging mode
const msgMediaCache   = reactive(new Map()) // ts → dataUrl — session-only image display
const msgBlobCache    = reactive(new Map()) // ts → { url, name } — session blob URLs for docs
const msgExpiredCache = reactive(new Set()) // ts — evicted cache entries
const CACHE_TTL_MS    = 30 * 60 * 1000
const CACHE_MAX_ITEMS = 30
let   _agentPollTimer  = null
let   _cacheEvictTimer = null
const peerIds           = ref([])
const peerSocialMsgs    = ref([])
const msgDeliveryStatus  = reactive(new Map()) // ts → 'saving'|'saved'|'delivered'|'error'
const peerPollStatus     = reactive(new Map()) // soul_id → { ok, error, ts }
const vaultBlobUrls      = reactive(new Map()) // 'soul_id:filename' → blob URL | null (loading)
const vaultBlobErrors    = reactive(new Set()) // 'soul_id:filename' → failed to load
const sessionSharedFiles = ref([])             // [{ filename, label }] — uploaded this session

const peerPollErrors = computed(() =>
  [...peerPollStatus.entries()]
    .filter(([, v]) => !v.ok)
    .map(([soul_id, v]) => ({ soul_id, error: v.error }))
)

onUnmounted(() => {
  clearInterval(_agentPollTimer)
  clearInterval(_cacheEvictTimer)
  clearInterval(_briefingTimer)
  localSynthesisMsgs.value = []
  msgDeliveryStatus.clear()
  peerPollStatus.clear()
  for (const url of vaultBlobUrls.values()) URL.revokeObjectURL(url)
  vaultBlobUrls.clear()
  vaultBlobErrors.clear()
})

async function refreshAgentContent() {
  isRefreshing.value = true
  try {
    await fetchFromServer(true)
    if (syncStatus.value === 'differs' && serverContent.value) {
      const localFull = soulContentAgent.value ?? ''
      let merged = localFull

      // Merge AGENT block
      const serverAgent = serverContent.value.match(RE_AGENT)?.[0]
      const localAgent  = merged.match(RE_AGENT)?.[0]
      if (serverAgent && serverAgent !== localAgent) {
        merged = RE_AGENT.test(merged)
          ? merged.replace(RE_AGENT, serverAgent)
          : merged.trimEnd() + `\n\n${serverAgent}\n`
      }

      // Merge SOCIAL block
      const serverSocial = serverContent.value.match(RE_SOCIAL_BLOCK)?.[0]
      const localSocial  = merged.match(RE_SOCIAL_BLOCK)?.[0]
      if (serverSocial && serverSocial !== localSocial) {
        merged = RE_SOCIAL_BLOCK.test(merged)
          ? merged.replace(RE_SOCIAL_BLOCK, serverSocial)
          : merged.trimEnd() + `\n\n${serverSocial}\n`
      }

      if (merged !== localFull) {
        updateContent(merged)
        if (vaultConnected.value) writeSoulMd(merged, 'sys').catch(() => {})
        syncStatus.value    = 'in_sync'
        serverContent.value = ''
      }
    }
    // Fetch peer SOCIAL blocks (multi-hoster same-server peers)
    if (peerIds.value.length) {
      peerSocialMsgs.value = await fetchPeerSocialBlocks()
    }
  } finally {
    isRefreshing.value = false
  }
}

async function fetchPeerSocialBlocks() {
  if (!peerIds.value.length || !props.soulCert) return []
  const results = await Promise.allSettled(
    peerIds.value.map(async (peer) => {
      try {
        const peerId = peer.soul_id
        // Cross-domain peers go through the server-side proxy to satisfy CSP.
        // Same-server peers use the direct local endpoint.
        let url
        if (peer.endpoint) {
          url = `/api/soul/peer-social-read?endpoint=${encodeURIComponent(peer.endpoint.replace(/\/$/, ''))}&soul_id=${encodeURIComponent(peerId)}&raw=1`
        } else {
          url = `/api/soul/social-read?soul_id=${encodeURIComponent(peerId)}&raw=1`
        }
        const r = await fetch(url, { headers: { Authorization: `Bearer ${props.soulCert}` } })
        const ok = r.ok || r.status === 204
        if (!ok) {
          let errDetail = `HTTP ${r.status}`
          try {
            const body = await r.json()
            if (body?.error) errDetail = body.error + (body.message ? ` · ${body.message}` : '')
          } catch { /* not JSON */ }
          peerPollStatus.set(peer.soul_id, { ok: false, error: errDetail, ts: Date.now() })
          return []
        }
        peerPollStatus.set(peer.soul_id, { ok: true, error: null, ts: Date.now() })
        if (r.status === 204) return []
        const text = await r.text()
        if (!text.trim()) return []
        return parseMsgBlock(text, 'social').map(m => ({
          ...m,
          from: m.from === 'me' ? peerId : m.from
        }))
      } catch (e) {
        let host = peer.endpoint ?? '(same-server)'
        try { host = new URL(peer.endpoint).hostname } catch {}
        peerPollStatus.set(peer.soul_id, { ok: false, error: `${e?.message ?? 'Netzwerkfehler'} [${host}]`, ts: Date.now() })
        return []
      }
    })
  )
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
}

const RE_AGENT        = /<!--\s*AGENT:START\s*-->([\s\S]*?)<!--\s*AGENT:END\s*-->/
const RE_SOCIAL_BLOCK = /<!--\s*SOCIAL:START\s*-->([\s\S]*?)<!--\s*SOCIAL:END\s*-->/
const MSG_RE_G        = () => /<!--\s*@msg\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*?)-->/g

function parseMsgBlock(blockContent, sphere) {
  const re   = MSG_RE_G()
  const msgs = []
  let m
  while ((m = re.exec(blockContent)) !== null) {
    msgs.push({ ts: m[1], from: m[2], to: m[3], content: m[4].trim(), sphere, format: 'new' })
  }
  return msgs
}

function parseOldAgentBlock(blockContent) {
  return blockContent.split(/\n\n---\n/).map((part, i) => {
    const t = part.trim()
    if (!t) return null
    // @msg HTML-Kommentare werden von parseMsgBlock verarbeitet — hier überspringen
    if (/<!--/.test(t)) return null
    const pm = t.match(/^\*\*(.+?)\*\*(.+?)\n([\s\S]*)/)
    if (pm) {
      const rawName     = pm[1].trim()
      const meta        = pm[2]
      const content     = pm[3].trim()
      const tx          = meta.match(/tx:(0x[0-9a-fA-F]+…)/)?.[1] ?? null
      const date        = meta.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
      const soulIdMatch = rawName.match(/soul:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i)
      const soulId      = soulIdMatch?.[1] ?? null
      const isSelf      = soulId === soulMeta.value?.id
      const authorName  = soulId ? rawName.replace(/\s*·\s*soul:[a-f0-9-]{36}/i, '').trim() || soulId.slice(0, 8) : rawName
      return {
        id: `old-${i}`,
        ts: date ? `${date}T00:00:00Z` : '2000-01-01T00:00:00Z',
        from: isSelf ? 'me' : (soulId ?? rawName),
        to: 'agent',
        content,
        sphere: 'agent',
        format: 'old',
        author: authorName,
        wallet: soulId,
        tx,
        isSoulId: !!soulId,
      }
    }
    if (t) return { id: `note-${i}`, ts: '2000-01-01T00:00:00Z', from: '?', to: 'agent', content: t, sphere: 'agent', format: 'old' }
    return null
  }).filter(Boolean)
}

function formatMsgEntry(content, from, to, ts = new Date().toISOString()) {
  const safe = content.replace(/\n+/g, ' ').replace(/-->/g, '—>')
  return `\n<!-- @msg ${ts} ${from} ${to} ${safe.trim()} -->`
}

function appendToMarkerBlock(md, type, entry) {
  const end = `<!-- ${type}:END -->`
  const idx = md.indexOf(end)
  if (idx !== -1) return md.slice(0, idx) + entry + '\n' + md.slice(idx)
  // Block fehlt — am Ende erstellen (v1 → v2 Auto-Migration)
  const start = `<!-- ${type}:START -->`
  return md.trimEnd() + `\n\n${start}${entry}\n${end}\n`
}

function fmtMsgDate(ts) {
  try {
    const d   = new Date(ts)
    const now = new Date()
    const isToday     = d.toDateString() === now.toDateString()
    const isYesterday = d.toDateString() === new Date(Date.now() - 86400000).toDateString()
    const hm = d.toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })
    if (isToday)     return hm
    if (isYesterday) return `Gestern ${hm}`
    return d.toLocaleDateString('de', { day: '2-digit', month: '2-digit' }) + ' ' + hm
  } catch { return ts?.slice(0, 16) ?? '' }
}

function isDifferentDay(msg, prev) {
  if (!prev) return false
  return new Date(msg.ts).toDateString() !== new Date(prev.ts).toDateString()
}

function formatDay(ts) {
  try {
    const d   = new Date(ts)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return 'Heute'
    if (d.toDateString() === new Date(Date.now() - 86400000).toDateString()) return 'Gestern'
    return d.toLocaleDateString('de', { weekday: 'short', day: 'numeric', month: 'short' })
  } catch { return '' }
}

const socialMsgs = computed(() => {
  const m   = soulContentAgent.value?.match(RE_SOCIAL_BLOCK)
  const own = m ? parseMsgBlock(m[1], 'social') : []
  if (!peerSocialMsgs.value.length) return own
  const seen = new Set()
  return [...own, ...peerSocialMsgs.value]
    .filter(msg => {
      const k = `${msg.ts}|${msg.from}|${msg.to}|${msg.content}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => new Date(a.ts) - new Date(b.ts))
})

const agentMsgsNew = computed(() => {
  const m = soulContentAgent.value?.match(RE_AGENT)
  return m ? parseMsgBlock(m[1], 'agent') : []
})

const agentMsgsOld = computed(() => {
  const m = soulContentAgent.value?.match(RE_AGENT)
  return m ? parseOldAgentBlock(m[1]) : []
})

// Kept for legacy backward-compat display (old **author** format)
const agentMessages = computed(() => agentMsgsOld.value)

const displayMessages = computed(() => {
  const seen = new Set()
  return [...socialMsgs.value, ...agentMsgsNew.value, ...agentMsgsOld.value, ...localSynthesisMsgs.value]
    .filter(m => {
      const k = `${m.ts}|${m.from}|${m.to}|${m.content}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => new Date(a.ts) - new Date(b.ts))
})

// ── Unified stream: AI articles + social bubbles, sorted by time ──
const unifiedStream = computed(() => {
  const ai = (messages.value || []).map(m => ({
    _type: 'ai',
    _ts: typeof m.ts === 'number' ? m.ts : new Date(m.ts).getTime(),
    ...m,
  }))
  const bubbles = displayMessages.value.map(m => ({
    _type: 'bubble',
    _ts: typeof m.ts === 'string' ? new Date(m.ts).getTime() : (m.ts || 0),
    ...m,
  }))
  const sorted = [...ai, ...bubbles].sort((a, b) => a._ts - b._ts)
  let lastBubbleDate = null
  for (const item of sorted) {
    if (item._type === 'bubble') {
      const d = new Date(item.ts).toDateString()
      item._showDaySep = lastBubbleDate !== null && d !== lastBubbleDate
      lastBubbleDate = d
    }
  }
  return sorted
})

function resolveAuthor(msg) {
  if (msg.sphere === 'synthesis') return 'Archivar'
  const senderName = msg.author
    || (!msg.from || msg.from === 'me'
        ? (soulMeta.value?.name || 'Du')
        : (peerIds.value.find(p => p.soul_id === msg.from)?.label || msg.from.slice(0, 8)))
  if (msg.content?.startsWith('[KI]')) {
    return msg.from === 'me' ? 'KI' : `KI@${senderName}`
  }
  return senderName
}

function peerLabelForTo(to) {
  if (to === 'peer')      return '@Peers'
  if (to === 'agent')     return '@Agent'
  if (to === 'community') return '@Alle'
  const peer = peerIds.value.find(p => p.soul_id === to)
  return peer?.label ? `@${peer.label}` : `@${String(to).slice(0, 8)}…`
}

// ── Vault Shared: Upload + Inline-Rendering ───────────────────────
const VAULT_SHARED_IMAGE = /\.(jpe?g|png|webp|gif|avif)$/i

function getMsgVaultRef(content) {
  const m = String(content || '').match(/\[([^\]]+)\]\(vault-shared:\/\/([^/\)]+)\/([^\)]+)\)/)
  if (!m) return null
  return { label: m[1], soul_id: m[2], filename: m[3] }
}

function cleanVaultRef(content) {
  return String(content || '').replace(/\[([^\]]+)\]\(vault-shared:\/\/[^\)]+\)/g, '').trim()
}

function vaultRefProxyUrl(ref) {
  const peer = peerIds.value.find(p => p.soul_id === ref.soul_id)
  const endpoint = peer?.endpoint || ''
  const params = new URLSearchParams({ soul_id: ref.soul_id, file: ref.filename })
  if (endpoint) params.set('endpoint', endpoint)
  return `/api/vault/peer-media?${params}`
}

async function loadVaultBlob(ref) {
  const key = `${ref.soul_id}:${ref.filename}`
  if (vaultBlobUrls.has(key) || vaultBlobErrors.has(key)) return
  vaultBlobUrls.set(key, null) // loading sentinel
  try {
    const proxyUrl = ref.soul_id === (props.soulCert?.split('.')?.[0] || '')
      ? `/api/vault/shared/${ref.soul_id}/${ref.filename}`
      : vaultRefProxyUrl(ref)
    const r = await fetch(proxyUrl, { headers: { Authorization: `Bearer ${props.soulCert}` } })
    if (!r.ok) { vaultBlobUrls.delete(key); vaultBlobErrors.add(key); return }
    const blob = await r.blob()
    vaultBlobErrors.delete(key)
    vaultBlobUrls.set(key, URL.createObjectURL(blob))
  } catch { vaultBlobUrls.delete(key); vaultBlobErrors.add(key) }
}

watch(displayMessages, (msgs) => {
  for (const msg of msgs) {
    const ref = getMsgVaultRef(msg.content)
    if (ref) loadVaultBlob(ref)
  }
}, { immediate: true })

async function forwardSynthesis(item) {
  const idx = localSynthesisMsgs.value.findIndex(m => m.ts === item.ts)
  if (idx !== -1) localSynthesisMsgs.value[idx] = { ...localSynthesisMsgs.value[idx], forwarded: true }
  await handlePeerSend(`[KI] ${item.content}`, 'peer')
}

let _lastAutonomousPostTs = 0
const AUTONOMOUS_MIN_INTERVAL_MS = 20 * 60 * 1000

async function runAutonomousKiPost() {
  if (!autonomousKi.value) return
  if (isSavingAgent.value) return
  if (Date.now() - _lastAutonomousPostTs < AUTONOMOUS_MIN_INTERVAL_MS) return

  // Only run when there's actual recent peer activity (within 90 min)
  const recentSocialMsgs = displayMessages.value
    .filter(m => m.sphere === 'social' && m.ts)
  const lastPeerMsg = recentSocialMsgs.filter(m => m.from !== 'me').slice(-1)[0]
  if (!lastPeerMsg) return
  if (Date.now() - new Date(lastPeerMsg.ts).getTime() > 90 * 60 * 1000) return

  const soulName   = soulMeta.value?.name || 'Ich'
  const soulSnippet = (props.soulContent || '').slice(0, 600)

  // Last 6 social messages for grounding
  const recentSocial = recentSocialMsgs
    .slice(-6)
    .map(m => `${m.from === 'me' ? soulName : resolveAuthor(m)}: ${cleanMsgContent(m).slice(0, 150)}`)
    .join('\n')

  // Last SoulKI insight (if any) — so the auto-post knows what was processed
  const lastKiThought = (messages.value || [])
    .filter(m => m.role === 'assistant' && m.text)
    .slice(-1)
    .map(m => m.text.slice(0, 200))
    .join('')

  const context = [
    `Soul von ${soulName}:\n${soulSnippet}`,
    recentSocial ? `Aktuelle Unterhaltung:\n${recentSocial}` : '',
    lastKiThought ? `Meine letzte Überlegung dazu:\n${lastKiThought}` : '',
  ].filter(Boolean).join('\n\n')

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${props.soulCert || 'anonymous'}` },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        stream: false,
        system: `Du bist ${soulName}. Schreibe genau eine kurze, spontane Nachricht an deine Peers — basierend auf dem, was GERADE WIRKLICH in der Konversation passiert. Keine allgemeinen Lebensweisheiten. Kein Philosophieren. Beziehe dich konkret auf das Gespräch.

Wenn du nichts Konkretes und Sinnvolles beitragen kannst: antworte nur mit "SKIP" — kein anderer Text.

Wenn du etwas schreibst: max. 2 kurze Sätze. Kein Präfix, keine Anrede, kein Meta-Kommentar. Deutsch. So wie ${soulName} spricht.`,
        messages: [{ role: 'user', content: context }],
      }),
    })
    if (!res.ok) return
    const data = await res.json()
    const text = (data?.content?.[0]?.text ?? '').trim()
    if (!text || text === 'SKIP' || text.startsWith('SKIP') || text.length < 8) return
    _lastAutonomousPostTs = Date.now()
    await handlePeerSend(`[KI] ${text}`, 'community')
  } catch { /* silent */ }
}

async function deleteSharedFile(filename) {
  const ownId = props.soulCert?.split('.')?.[0] || ''
  try {
    await fetch(`/api/vault/shared/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${props.soulCert}` },
    })
  } catch { /* silent — remove from tracking anyway */ }
  sessionSharedFiles.value = sessionSharedFiles.value.filter(f => f.filename !== filename)
  const key = `${ownId}:${filename}`
  if (vaultBlobUrls.has(key)) {
    const url = vaultBlobUrls.get(key)
    if (url) URL.revokeObjectURL(url)
    vaultBlobUrls.delete(key)
  }
}

async function deleteAllSessionFiles() {
  for (const f of [...sessionSharedFiles.value]) {
    await deleteSharedFile(f.filename)
  }
}

async function uploadToSharedVault(file) {
  const isImg = VAULT_SHARED_IMAGE.test(file.name)
  let b64
  if (isImg) {
    b64 = await compressImage(file).catch(() => null)
    if (!b64) b64 = await fileToBase64(file)
  } else {
    b64 = await fileToBase64(file)
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('Datei zu groß (max 10 MB)')
  const r = await fetch('/api/vault/shared', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${props.soulCert}` },
    body: JSON.stringify({ name: file.name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '') || 'file', data: b64 }),
  })
  if (!r.ok) throw new Error(`Upload fehlgeschlagen (${r.status})`)
  const d = await r.json()
  return d.filename
}

// ── KI Gesprächsbeitrag (lokal, nicht gepusht) ────────────────────
async function triggerSynthesis() {
  if (isSynthesizing.value) return
  const recent = displayMessages.value
    .filter(m => m.sphere !== 'synthesis' && !m.content?.startsWith('[KI]'))
    .slice(-5)
  if (recent.length < 2) return
  const totalContent = recent.map(m => m.content || '').join(' ').replace(/\[.*?\]\(.*?\)/g, '').trim()
  if (totalContent.length < 80) return

  isSynthesizing.value = true
  await nextTick(scrollToBottom)
  try {
    const context = recent
      .map(m => `${m.from === 'me' ? 'Du' : resolveAuthor(m)}: ${m.content}`)
      .join('\n')

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${props.soulCert || 'anonymous'}` },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        stream: false,
        system: `Lies den Chat-Verlauf und liefere genau 1–2 Sätze auf Deutsch: einen konkreten Fakt, eine präzise Zusammenfassung oder einen nützlichen Impuls zum Thema. Kein "Ich", keine Anrede, kein Meta-Kommentar, keine Einleitung. Nur Inhalt. Optional: ein Google-Suchlink am Ende — [Begriff](https://www.google.com/search?q=Begriff).`,
        messages: [{ role: 'user', content: context }]
      })
    })

    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = await res.json()
    const text = (data?.content?.[0]?.text ?? '').trim()
    if (text) {
      const newMsg = {
        ts:     new Date().toISOString(),
        from:   'ki',
        to:     'community',
        content: text,
        sphere: 'synthesis',
        format: 'new',
        author: 'KI',
        local:  true,
      }
      localSynthesisMsgs.value = [...localSynthesisMsgs.value, newMsg]
      await nextTick(scrollToBottom)
    }
  } catch { /* silent */ } finally {
    isSynthesizing.value = false
  }
}

async function handlePeerSend(text, recipient) {
  if (isSavingAgent.value || (!text && !msgMedia.value && !msgDoc.value)) return
  isSavingAgent.value = true
  const msgTs = new Date().toISOString()
  msgDeliveryStatus.set(msgTs, 'saving')

  // Upload attachment if present
  let attachmentStr = ''
  const attachFile = msgMedia.value ? msgMedia.value._file || null : (msgDoc.value ? msgDoc.value.file || null : null)
  const attachName = msgMedia.value ? (msgMedia.value.name || 'bild.jpg') : (msgDoc.value ? msgDoc.value.name : null)
  if ((msgMedia.value || msgDoc.value) && attachName) {
    let uploadOk = false
    try {
      const ownSoulId = props.soulCert?.split('.')?.[0] || ''
      let b64, fileName
      const sanitizeName = n => n.replace(/[^A-Za-z0-9._-]/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '') || 'file'
      if (msgMedia.value) {
        b64 = msgMedia.value.base64
        fileName = sanitizeName(attachName)
        const r = await fetch('/api/vault/shared', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${props.soulCert}` },
          body: JSON.stringify({ name: fileName, data: b64 }),
        })
        if (!r.ok) throw new Error(`Upload ${r.status}`)
        const d = await r.json()
        attachmentStr = `[${fileName}](vault-shared://${ownSoulId}/${d.filename})`
        sessionSharedFiles.value.push({ filename: d.filename, label: fileName })
        uploadOk = true
      } else if (msgDoc.value?.file) {
        const stored = await uploadToSharedVault(msgDoc.value.file)
        attachmentStr = `[${msgDoc.value.name}](vault-shared://${ownSoulId}/${stored})`
        sessionSharedFiles.value.push({ filename: stored, label: msgDoc.value.name })
        uploadOk = true
      }
    } catch (e) {
      addMessage('assistant', `Anlage konnte nicht hochgeladen werden — ${e?.message ?? 'Fehler'}. Nachricht ohne Datei senden?`)
      msgDeliveryStatus.set(msgTs, 'error')
      isSavingAgent.value = false
      return
    }
    msgMedia.value = null
    msgDoc.value   = null
    if (!uploadOk && !text) { isSavingAgent.value = false; return }
  }

  const fullText = [attachmentStr, text].filter(Boolean).join(' ')
  try {
    const entry = formatMsgEntry(fullText, 'me', recipient, msgTs)
    let current = soulContentAgent.value ?? ''
    const toSocial = recipient !== 'agent' && recipient !== 'ki'
    const toAgent  = recipient === 'agent' || recipient === 'community'
    if (toSocial) current = appendToMarkerBlock(current, 'SOCIAL', entry)
    if (toAgent)  current = appendToMarkerBlock(current, 'AGENT', entry)
    updateContent(current)
    await pushToServer()
    msgDeliveryStatus.set(msgTs, 'saved')
    checkPeerReachabilityForMsg(msgTs)
  } catch {
    msgDeliveryStatus.set(msgTs, 'error')
  } finally {
    isSavingAgent.value = false
  }
}

async function checkPeerReachabilityForMsg(msgTs) {
  const crossDomainPeers = peerIds.value.filter(p => p.endpoint)
  if (!crossDomainPeers.length) return   // same-server only — 'saved' is sufficient
  let anyReachable = false
  await Promise.allSettled(crossDomainPeers.map(async (peer) => {
    try {
      const url = `/api/soul/peer-social-read?endpoint=${encodeURIComponent(peer.endpoint.replace(/\/$/, ''))}&soul_id=${encodeURIComponent(peer.soul_id)}&raw=1`
      const r   = await fetch(url, { headers: { Authorization: `Bearer ${props.soulCert}` } })
      const ok  = r.ok || r.status === 204
      peerPollStatus.set(peer.soul_id, { ok, error: ok ? null : `HTTP ${r.status}`, ts: Date.now() })
      if (ok) anyReachable = true
    } catch (e) {
      let host = peer.endpoint ?? '(same-server)'
      try { host = new URL(peer.endpoint).hostname } catch {}
      peerPollStatus.set(peer.soul_id, { ok: false, error: `${e?.message ?? 'Netzwerkfehler'} [${host}]`, ts: Date.now() })
    }
  }))
  msgDeliveryStatus.set(msgTs, anyReachable ? 'delivered' : 'error')
}

function deliveryIcon(ts) {
  const s = msgDeliveryStatus.get(ts)
  if (s === 'saving')    return '···'
  if (s === 'saved')     return '✓'
  if (s === 'delivered') return '✓✓'
  if (s === 'error')     return '!'
  return ''
}

function deliveryTitle(ts) {
  const s = msgDeliveryStatus.get(ts)
  if (s === 'saving')    return 'Wird gesendet…'
  if (s === 'saved')     return 'Gespeichert'
  if (s === 'delivered') return 'Peer erreichbar'
  if (s === 'error')     return 'Fehler — Peer prüfen'
  return ''
}

async function summarizeDocument(file) {
  try {
    let messages
    if (PDF_EXT.test(file.name) && file.size <= 5 * 1024 * 1024) {
      const base64 = await fileToBase64(file)
      messages = [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: 'Fasse dieses Dokument in 2–3 Sätzen zusammen.' },
      ] }]
    } else {
      const text = await file.text()
      messages = [{ role: 'user', content: `Fasse diesen Text in 2–3 Sätzen zusammen:\n\n${text.slice(0, 8000)}` }]
    }
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${props.soulCert || 'anonymous'}` },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 256, stream: false, messages }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    return data?.content?.[0]?.text?.trim() ?? ''
  } catch { return '' }
}

function evictCache() {
  const now = Date.now()
  for (const [ts] of msgMediaCache.entries()) {
    if (now - new Date(ts).getTime() > CACHE_TTL_MS) {
      msgMediaCache.delete(ts)
      msgExpiredCache.add(ts)
    }
  }
  for (const [ts, { url }] of msgBlobCache.entries()) {
    if (now - new Date(ts).getTime() > CACHE_TTL_MS) {
      URL.revokeObjectURL(url)
      msgBlobCache.delete(ts)
      msgExpiredCache.add(ts)
    }
  }
  const allTs = [...Array.from(msgMediaCache.keys()), ...Array.from(msgBlobCache.keys())].sort()
  const over  = allTs.length - CACHE_MAX_ITEMS
  if (over > 0) {
    allTs.slice(0, over).forEach(ts => {
      if (msgMediaCache.has(ts)) {
        msgMediaCache.delete(ts)
      } else {
        const e = msgBlobCache.get(ts)
        if (e) URL.revokeObjectURL(e.url)
        msgBlobCache.delete(ts)
      }
      msgExpiredCache.add(ts)
    })
  }
}

function cleanMsgContent(msg) {
  let c = (msg.content || '').replace('[Bild]', '').replace(/^\[KI\]\s*/, '').replace(/^\[Synthese\]\s*/, '').trim()
  if (msgBlobCache.has(msg.ts) || msgExpiredCache.has(msg.ts)) {
    c = c.replace(/^\[Dokument:[^\]]*\]\s*/, '')
  }
  return c.trim()
}

// ── Camera / Vision ────────────────────────────────────────────────
const cameraOpen    = ref(false)
const visionLoading = ref(false)
const fileInputEl   = ref(null)

// ── Blob URL management ────────────────────────────────────────────
const mediaBlobUrls = []

// ── Auto-resize textarea ───────────────────────────────────────────
function autoResize() {
  const el = textareaEl.value
  if (!el) return
  el.style.height = '0'
  el.style.height = Math.min(el.scrollHeight, 140) + 'px'
}

// ── Scroll ─────────────────────────────────────────────────────────
async function scrollToBottom() {
  await nextTick()
  chatEnd.value?.scrollIntoView({ block: 'end' })
}

watch(() => messages.value?.length, scrollToBottom)
watch(() => displayMessages.value.length, scrollToBottom)
watch(isSynthesizing, (val) => { if (val) nextTick(scrollToBottom) })

// ── Formatters ─────────────────────────────────────────────────────
function fmtTime(ts) {
  try { return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

function paragraphs(s) {
  return String(s || '').split(/\n{2,}/).filter(Boolean)
}

function renderText(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\[([^\]]{1,80})\]\((https:\/\/[^)\s]{1,300})\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="inline-link">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
}

// ── File handling ──────────────────────────────────────────────────
const AUDIO_EXT = /\.(mp3|ogg|wav|flac|aac|m4a|opus|weba)$/i
const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv|m4v)$/i
const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i
const PDF_EXT   = /\.pdf$/i

async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 1024
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width >= height) { height = Math.round(height * MAX / width); width = MAX }
        else { width = Math.round(width * MAX / height); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.75).split(',')[1])
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')) }
    img.src = url
  })
}

function fileToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.readAsDataURL(file)
  })
}

async function handleLocalFile(file) {
  const name = file.name
  if (AUDIO_EXT.test(name)) {
    const url = URL.createObjectURL(file); mediaBlobUrls.push(url)
    return { text: `[Musik: "${name}"]`, contentBlocks: null, mediaUrl: url, mediaType: 'audio' }
  }
  if (VIDEO_EXT.test(name)) {
    const url = URL.createObjectURL(file); mediaBlobUrls.push(url)
    return { text: `[Video: "${name}"]`, contentBlocks: null, mediaUrl: url, mediaType: 'video' }
  }
  if (IMAGE_EXT.test(name)) {
    return { _imageFile: file, name }
  }
  if (PDF_EXT.test(name)) {
    if (file.size > 5 * 1024 * 1024) return { text: `[PDF: "${name}" – zu groß (max 5 MB)]`, contentBlocks: null }
    const base64 = await fileToBase64(file)
    return {
      text: `[PDF: "${name}"]`,
      contentBlocks: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: `[Dokument: "${name}" – bitte beschreib den Inhalt]` },
      ],
    }
  }
  const TEXT_EXT = /\.(txt|md|json|csv|xml|yaml|yml|log|js|ts|py|sh|html|css)$/i
  if (TEXT_EXT.test(name) || file.size < 100_000) {
    try {
      const text = await file.text()
      return {
        text: `[Datei: "${name}"]`,
        contentBlocks: [{ type: 'text', text: `Dateiinhalt von "${name}":\n\n${text.slice(0, 20000)}` }],
      }
    } catch { /**/ }
  }
  return { text: `[Datei: "${name}" – Format nicht unterstützt]`, contentBlocks: null }
}

function isInPeerMode() {
  const t = draft.value.trim()
  if (!t) return false
  const intent = detectIntent(t)
  return intent.type === 'peer' || intent.type === 'community' || intent.type === 'peer-specific' || intent.type === 'agent'
}

async function onFileIconClick() {
  mediaOpen.value = false
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await window.showOpenFilePicker({ multiple: false })
      const file = await handle.getFile()
      await processPickedFile(file)
      return
    } catch (e) { if (e.name === 'AbortError') return }
  }
  fileInputEl.value?.click()
}

async function onFileInputChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  e.target.value = ''
  await processPickedFile(file)
}

async function processPickedFile(file) {
  // Always stage — handleSend routes to peer or KI based on @mention in draft
  if (IMAGE_EXT.test(file.name)) {
    try {
      const b64 = await compressImage(file).catch(() => fileToBase64(file))
      msgMedia.value = { base64: b64, mime: 'image/jpeg', name: file.name, _file: file }
    } catch { /* ignore */ }
  } else {
    msgDoc.value = { file, name: file.name }
  }
}

// ── NLP intent detection ───────────────────────────────────────────
function detectIntent(text) {
  const t = text.trim()
  // Legacy @search- prefix (backward compat)
  const legacy = t.match(/^@search-(youtube|spotify|google)\s*(.*)/is)
  if (legacy) return { type: legacy[1].toLowerCase(), query: legacy[2].trim() }
  // YouTube
  const ytMatch = t.match(/^(?:zeig(?:\s+mir)?\s+(?:ein\s+)?(?:youtube\s+)?video\s+(?:von\s+)?|youtube\s+)(.+)/i)
  if (ytMatch) return { type: 'youtube', query: ytMatch[1].trim() }
  // Spotify / music
  const spMatch = t.match(/^(?:spiele?\s+(?:(?:das\s+)?(?:lied|song|musik)\s+)?|musik\s+|song\s+|spotify\s+)(.+)/i)
  if (spMatch) return { type: 'spotify', query: spMatch[1].trim() }
  // Web search
  const webMatch = t.match(/^such[e]?\s+(?:(?:im\s+)?(?:netz|web|internet|google)\s+(?:nach\s+)?|nach\s+)(.+)/i)
  if (webMatch) return { type: 'google', query: webMatch[1].trim() }
  // Capture intents — checked before generic @name match
  if (/^@audio\b|^@stimme\b/i.test(t)) return { type: 'capture-audio' }
  if (/^@face\b|^@gesicht\b/i.test(t)) return { type: 'capture-face' }
  if (/^@body\b|^@bewegung\b/i.test(t)) return { type: 'capture-body' }
  // @all/@alle → community (send to everyone)
  const allMention = t.match(/^@al(?:l|le)\b\s*(.*)/is)
  if (allMention) return { type: 'community', query: (allMention[1].trim() || t) }
  // @agent → Agent Sandbox
  const agentMention = t.match(/^@agent\b\s*(.*)/is)
  if (agentMention) return { type: 'agent', query: (agentMention[1].trim() || t) }
  // @name → specific peer by label (exact match, then unique prefix match)
  const nameMention = t.match(/^@(\w+)\b\s*(.*)/is)
  if (nameMention) {
    const name = nameMention[1].toLowerCase()
    const exact = peerIds.value.find(p => p.label?.toLowerCase() === name)
    if (exact) return { type: 'peer-specific', soul_id: exact.soul_id, query: (nameMention[2].trim() || t) }
    const prefix = peerIds.value.filter(p => p.label?.toLowerCase().startsWith(name))
    if (prefix.length === 1) return { type: 'peer-specific', soul_id: prefix[0].soul_id, query: (nameMention[2].trim() || t) }
    if (prefix.length > 1)   return { type: 'ambiguous', candidates: prefix, name: nameMention[1] }
  }
  // Peer message: "→ peers: msg", "peer: msg", "an peers: msg"
  const peerMatch = t.match(/^(?:→\s*|peer(?:s)?:|an\s+(?:meine[n]?\s+)?peers?:\s*)(.+)/is)
  if (peerMatch) return { type: 'peer', query: peerMatch[1].trim() }
  // Community: "community: msg", "→ alle: msg"
  const commMatch = t.match(/^(?:community:|→\s*alle?:|an\s+alle?:\s*)(.+)/is)
  if (commMatch) return { type: 'community', query: commMatch[1].trim() }
  // KI synthesis trigger
  if (/^ki[:\s]/i.test(t)) return { type: 'ki', query: '' }
  // Mode switch
  return { type: 'chat', query: t }
}

async function searchYouTubeApi(query) {
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=1`, { headers: { Authorization: `Bearer ${ytToken.value}` } })
    const data = await res.json()
    const item = data.items?.[0]
    if (!item) return null
    return { videoId: item.id.videoId, title: item.snippet.title }
  } catch { return null }
}

async function searchSpotifyApi(query) {
  try {
    const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, { headers: { Authorization: `Bearer ${spToken.value}` } })
    const data = await res.json()
    const track = data.tracks?.items?.[0]
    if (!track) return null
    return { id: track.id, title: `${track.name} – ${track.artists[0]?.name}` }
  } catch { return null }
}

async function handleSearchCommand(cmd) {
  const safe = cmd.query.replace(/<[^>]*>/g, '').trim().slice(0, 200)
  if (!safe) return null

  if (cmd.type === 'youtube') {
    if (ytConnected.value) {
      const yt = await searchYouTubeApi(safe)
      if (yt) return { text: `[YouTube: "${yt.title}"]`, contentBlocks: null, youtubeEmbed: yt }
    }
    return { text: `[YouTube-Suche: "${safe}"]`, contentBlocks: null, linkCard: { url: `https://www.youtube.com/results?search_query=${encodeURIComponent(safe)}`, service: 'youtube', label: safe } }
  }
  if (cmd.type === 'spotify') {
    if (spConnected.value) {
      const sp = await searchSpotifyApi(safe)
      if (sp) return { text: `[Spotify: "${sp.title}"]`, contentBlocks: null, spotifyEmbed: sp }
    }
    return { text: `[Spotify-Suche: "${safe}"]`, contentBlocks: null, linkCard: { url: `https://open.spotify.com/search/${encodeURIComponent(safe)}`, service: 'spotify', label: safe } }
  }
  if (cmd.type === 'google') {
    return { text: `[Web-Suche: "${safe}"]`, contentBlocks: null, linkCard: { url: `https://www.google.com/search?q=${encodeURIComponent(safe)}`, service: 'google', label: safe } }
  }
  return null
}

// ── Shared vision pipeline (camera + file upload) ──────────────────
async function runVisionAnalysis(base64, caption, previewUrl) {
  const authHeader = { Authorization: `Bearer ${props.soulCert}` }

  addMessage('user', caption, { mediaUrl: previewUrl, mediaType: 'image' })
  addMessage('assistant', '', { streaming: true })
  await scrollToBottom()

  let soulReaction = ''
  let genPrompt    = ''
  let outputMode   = 'skip'
  try {
    const vRes = await fetch('/api/vision-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({
        imageBase64: base64,
        mimeType: 'image/jpeg',
        transcript:  caption,
        soulContext: [props.soulContent, contextText.value].filter(Boolean).join('\n\n').slice(0, 800),
      }),
    })
    if (vRes.ok) {
      const vData  = await vRes.json()
      soulReaction = vData.soulReaction ?? vData.analysis ?? ''
      genPrompt    = vData.genPrompt   ?? ''
      outputMode   = vData.outputMode  ?? 'skip'
    }
  } catch { /* weiter ohne Vision */ }

  updateLastMessage(soulReaction || 'Ich sehe das Bild.')

  if (outputMode === 'edit-multi' && genPrompt) {
    setLastMessageMeta('genPrompt',     genPrompt)
    setLastMessageMeta('pendingBase64', base64)
    setLastMessageMeta('actions', [
      { label: 'Bild generieren', primary: true,  type: 'wavespeed-generate' },
      { label: 'Überspringen',    primary: false,  type: 'skip' },
    ])
  }

  setLastMessageMeta('streaming', false)
  await scrollToBottom()
}

async function handleImageVision(file, name) {
  visionLoading.value = true
  let base64
  try { base64 = await compressImage(file) }
  catch { visionLoading.value = false; return }
  const previewUrl = URL.createObjectURL(file)
  mediaBlobUrls.push(previewUrl)
  await runVisionAnalysis(base64, `[Bild: "${name}"]`, previewUrl)
  visionLoading.value = false
}

// ── Camera pipeline ────────────────────────────────────────────────
async function handleCameraCapture(capture) {
  cameraOpen.value = false
  const base64 = capture.frameBase64 ?? capture.base64 ?? null
  if (!base64) return

  // In peer/social mode: compress then stage as attachment
  if (localRole.value === 'soul' && isInPeerMode()) {
    let compressed = base64
    try {
      const img = new Image()
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = `data:image/jpeg;base64,${base64}` })
      const MAX = 1024
      let w = img.naturalWidth, h = img.naturalHeight
      if (w > MAX || h > MAX) {
        if (w >= h) { h = Math.round(h * MAX / w); w = MAX }
        else { w = Math.round(w * MAX / h); h = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      compressed = canvas.toDataURL('image/jpeg', 0.75).split(',')[1]
    } catch { /* use original */ }
    msgMedia.value = { base64: compressed, mime: 'image/jpeg', name: 'kamerabild.jpg' }
    return
  }

  visionLoading.value = true
  const previewUrl = `data:image/jpeg;base64,${base64}`
  await runVisionAnalysis(base64, capture.caption || '[Kamerabild]', previewUrl)
  visionLoading.value = false
}

// ── WaveSpeed image generation ─────────────────────────────────────
async function handleMsgAction(msg, action) {
  if (action.type === 'skip') {
    setMessageMetaById(msg.id, 'actions', [])
    return
  }
  if (action.type === 'wavespeed-generate') {
    setMessageMetaById(msg.id, 'actionsDisabled', true)
    await runWavespeedGeneration(msg)
    setMessageMetaById(msg.id, 'actions', [])
  }
}

async function runWavespeedGeneration(msg) {
  const authHeader = { Authorization: `Bearer ${props.soulCert}` }
  addMessage('assistant', '', { streaming: true })
  await scrollToBottom()

  try {
    const submitRes = await fetch('/api/wavespeed-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({
        outputMode:  'edit-multi',
        prompt:      msg.genPrompt,
        imageBase64: msg.pendingBase64,
      }),
    })
    if (!submitRes.ok) {
      updateLastMessage('_(Bildgenerierung fehlgeschlagen)_')
      setLastMessageMeta('streaming', false)
      return
    }
    const { taskId } = await submitRes.json()
    if (!taskId) {
      updateLastMessage('_(Keine Task-ID erhalten)_')
      setLastMessageMeta('streaming', false)
      return
    }

    // Poll every 4 s, max 25 attempts (~100 s)
    let imageUrl = null
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 4000))
      try {
        const pollRes = await fetch(`/api/wavespeed-result?id=${encodeURIComponent(taskId)}`, {
          headers: authHeader,
        })
        if (pollRes.ok) {
          const pollData = await pollRes.json()
          if (pollData.url) { imageUrl = pollData.url; break }
          if (pollData.error && pollData.status !== 'pending' && pollData.status !== 'running') break
        }
      } catch { /* retry */ }
    }

    if (imageUrl) {
      updateLastMessage('[Generiertes Bild]')
      setLastMessageMeta('mediaUrl',   imageUrl)
      setLastMessageMeta('mediaType',  'image')
    } else {
      updateLastMessage('_(Bildgenerierung: kein Ergebnis)_')
    }
  } catch {
    updateLastMessage('_(Bildgenerierung fehlgeschlagen)_')
  }

  setLastMessageMeta('streaming', false)
  await scrollToBottom()
}

// ── History compression ────────────────────────────────────────────
async function maybeCompressHistory() {
  const toSummarize = getMessagesToSummarize()
  if (!toSummarize.length) return
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${props.soulCert || 'anonymous'}` },
      body: JSON.stringify({
        model: (typeof window !== 'undefined' && localStorage.getItem('sys_chat_model')) || 'claude-haiku-4-5-20251001',
        max_tokens: 400, stream: false,
        system: 'Fasse diesen Gesprächsverlauf prägnant zusammen. Max. 5 Sätze. Auf Deutsch.',
        messages: toSummarize.map((m) => ({ role: m.role, content: m.contentBlocks || m.text })),
      }),
    })
    if (res.ok) {
      const data = await res.json()
      const summary = data?.content?.[0]?.text?.trim() || ''
      if (summary) pruneWithSummary(summary)
    }
  } catch { /**/ }
}

// ── Core dispatch ──────────────────────────────────────────────────
async function dispatchToChat(text, msgMeta = {}) {
  addMessage('user', text, msgMeta)
  await scrollToBottom()
  await maybeCompressHistory()
  addMessage('assistant', '', { streaming: true })

  // Recent peer messages so SoulKI knows what's being discussed
  const recentPeer = displayMessages.value
    .filter(m => m.sphere === 'social' && m.ts)
    .slice(-8)
    .map(m => `${m.from === 'me' ? (soulMeta.value?.name || 'Ich') : resolveAuthor(m)}: ${cleanMsgContent(m).slice(0, 200)}`)
    .join('\n')

  const chatResult = await chat({
    messages: toApiMessages(),
    soulContent: props.soulContent,
    soulCert: props.soulCert,
    mindContent: mindContent.value || null,
    vaultContext: null,
    networkContext: recentPeer || null,
    networkPdfBlocks: null,
    networkImageBlocks: null,
    conversationSummary: conversationSummary.value || null,
    profileImageBase64: profileBase64.value,
    role: localRole.value,
    model: selectedModel.value,
    onDelta: (delta, fullText) => { updateLastMessage(fullText); scrollToBottom() },
  })

  setLastMessageMeta('streaming', false)
  if (!chatResult) updateLastMessage(error.value ? `_(Fehler: ${error.value})_` : '…')
  await scrollToBottom()
}

// ── Send handler ───────────────────────────────────────────────────
async function handleSend() {
  if (!canSend.value) return
  const raw = draft.value.trim()
  if (!raw && !msgMedia.value && !msgDoc.value) return
  draft.value = ''
  closeMobileComposer()
  await nextTick(autoResize)

  const intent = detectIntent(raw)

  if (intent.type === 'ki')        { await triggerSynthesis(); return }

  if (intent.type === 'capture-audio' || intent.type === 'capture-face' || intent.type === 'capture-body') {
    const mode = intent.type.replace('capture-', '')
    addMessage('capture', `@${mode}`, { _type: 'capture', captureMode: mode })
    await scrollToBottom()
    return
  }

  if (intent.type === 'ambiguous') {
    const names = intent.candidates.map(p => `@${p.label}`).join(', ')
    addMessage('assistant', `Mehrdeutig: ${names} — bitte den vollständigen Namen verwenden.`)
    return
  }

  // Peer routing — capture staged files BEFORE handlePeerSend clears them,
  // then also process through KI so the file always lands in chat.
  const peerIntents = ['peer', 'community', 'peer-specific', 'agent']
  if (peerIntents.includes(intent.type)) {
    const peerTarget = intent.type === 'peer-specific' ? intent.soul_id : intent.type
    const peerText   = intent.query || raw
    const mediaFile  = msgMedia.value?._file  || null
    const mediaName  = msgMedia.value?.name   || null
    const docFile    = msgDoc.value?.file     || null
    await handlePeerSend(peerText, peerTarget)
    // Also process the staged file through KI
    if (mediaFile) {
      await handleImageVision(mediaFile, peerText || mediaName || '')
    } else if (docFile) {
      const result = await handleLocalFile(docFile)
      if (result) {
        if (result._imageFile) { await handleImageVision(result._imageFile, result.name) }
        else {
          const meta = {}
          if (result.contentBlocks) meta.contentBlocks = result.contentBlocks
          if (result.mediaUrl) { meta.mediaUrl = result.mediaUrl; meta.mediaType = result.mediaType }
          await dispatchToChat(result.text || peerText, meta)
        }
      }
    }
    return
  }

  // No peer — process staged file for KI
  if (msgMedia.value?._file) {
    const media = msgMedia.value
    msgMedia.value = null
    await handleImageVision(media._file, raw || media.name || '')
    return
  }
  if (msgDoc.value?.file) {
    const doc = msgDoc.value
    msgDoc.value = null
    const result = await handleLocalFile(doc.file)
    if (!result) return
    if (result._imageFile) { await handleImageVision(result._imageFile, result.name); return }
    const meta = {}
    if (result.contentBlocks) meta.contentBlocks = result.contentBlocks
    if (result.mediaUrl) { meta.mediaUrl = result.mediaUrl; meta.mediaType = result.mediaType }
    await dispatchToChat(result.text || raw, meta)
    return
  }

  if (intent.type === 'youtube' || intent.type === 'spotify' || intent.type === 'google') {
    const result = await handleSearchCommand({ type: intent.type, query: intent.query })
    if (!result) return
    const meta = {}
    if (result.contentBlocks) meta.contentBlocks = result.contentBlocks
    if (result.mediaUrl)      { meta.mediaUrl = result.mediaUrl; meta.mediaType = result.mediaType }
    if (result.youtubeEmbed)  meta.youtubeEmbed = result.youtubeEmbed
    if (result.spotifyEmbed)  meta.spotifyEmbed = result.spotifyEmbed
    if (result.linkCard)      meta.linkCard = result.linkCard
    await dispatchToChat(result.text, meta)
    return
  }

  await dispatchToChat(raw, {})
}

// ── Lifecycle ──────────────────────────────────────────────────────
let _briefingTimer        = null
let _lastBriefingMsgCount = 0

onMounted(async () => {
  nextTick(autoResize)
  loadMind(props.soulCert)
  try {
    const r = await fetch('/api/soul/amortization', { headers: { Authorization: `Bearer ${props.soulCert}` } })
    if (r.ok) {
      const d = await r.json()
      // Enrich peer list with labels from localStorage
      const ownId     = props.soulCert?.split('.')?.[0] || ''
      const lsKey     = ownId ? `sys.connected_nodes.${ownId}` : null
      let localNodes  = []
      if (lsKey) { try { localNodes = JSON.parse(localStorage.getItem(lsKey) || '[]') } catch {} }
      const labelMap  = new Map(localNodes.map(n => [n.soul_id, n.label || '']))
      peerIds.value = (d.amortization?.trusted_souls ?? [])
        .map(p => {
          if (typeof p === 'string') return { soul_id: p, endpoint: null, label: labelMap.get(p) || '' }
          return { soul_id: p.soul_id, endpoint: p.endpoint || null, label: p.label || labelMap.get(p.soul_id) || '' }
        })
        .filter(p => p && p.soul_id)
    }
  } catch { /* silent */ }
  await refreshAgentContent()
  // Auto-briefing on open (small delay so content renders first)
  setTimeout(() => {
    const msgs = displayMessages.value
    const total = msgs.slice(-5).map(m => m.content || '').join(' ').replace(/\[.*?\]\(.*?\)/g, '').trim()
    if (msgs.length >= 2 && total.length >= 80) {
      triggerSynthesis()
      _lastBriefingMsgCount = msgs.length
    }
  }, 3000)
  _agentPollTimer  = setInterval(refreshAgentContent, 30_000)
  _cacheEvictTimer = setInterval(evictCache, 5 * 60 * 1000)
  // Every 3 min — synthesis if new messages; autonomous post if mode active
  _briefingTimer   = setInterval(() => {
    const count = displayMessages.value.length
    if (count > 0 && count !== _lastBriefingMsgCount) {
      _lastBriefingMsgCount = count
      triggerSynthesis()
    }
    if (autonomousKi.value) runAutonomousKiPost()
  }, 3 * 60 * 1000)
})
onUnmounted(() => {
  for (const { url } of msgBlobCache.values()) URL.revokeObjectURL(url)
  mediaBlobUrls.forEach((url) => URL.revokeObjectURL(url))
})

defineExpose({
  focusInput:         () => textareaEl.value?.focus(),
  sendExternal:       (text) => { if (text?.trim() && !isLoading.value) dispatchToChat(text, {}) },
  getSocialMessages:  () => displayMessages.value,
})
</script>

<style scoped>
/* ── Design tokens ───────────────────────────────────────────────── */
.sys-chat {
  --rule:    rgba(226,220,240,0.10);
  --rule-2:  rgba(226,220,240,0.20);
  --fg:      #ece7f5;
  --fg-2:    rgba(236,231,245,0.88);
  --fg-3:    rgba(236,231,245,0.70);
  --fg-4:    rgba(236,231,245,0.55);
  --accent:  #8b5cf6;
  --accent-bright: #a78bfa;
  --accent-dim:    rgba(139,92,246,0.12);
  --on-accent: #0a0810;
  --paper-3: #0d0b14;
  --serif:   'Noto Serif', Georgia, serif;
  --mono:    'JetBrains Mono', ui-monospace, monospace;

  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ── Stream ──────────────────────────────────────────────────────── */
.stream {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: clamp(16px,3vw,32px) clamp(12px,3vw,32px);
  padding-bottom: clamp(24px,4vw,48px);
  display: flex;
  flex-direction: column;
  position: relative;
}
.stream::before {
  content: "";
  position: absolute; inset: 0;
  background: radial-gradient(circle at 85% 10%, rgba(139,92,246,0.07), transparent 50%);
  pointer-events: none; z-index: 0;
}
.stream > * { position: relative; z-index: 1; }

/* Centered inner column — like Claude.ai */
.stream-inner {
  display: flex;
  flex-direction: column;
  gap: clamp(12px,2.5vw,28px);
  max-width: 780px;
  margin: 0 auto;
  width: 100%;
}

.anchor { height: 1px; }

/* ── Inline link ─────────────────────────────────────────────────── */
.inline-link { color: var(--accent-bright); text-decoration: underline; text-underline-offset: 2px; text-decoration-color: rgba(167,139,250,0.4); transition: text-decoration-color 0.15s; }
.inline-link:hover { text-decoration-color: var(--accent-bright); }

/* ── AI message timestamp ────────────────────────────────────────── */
.msg-time-ai {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em;
  color: var(--fg-4); padding: 1px 4px;
  align-self: flex-start;
}
.msg-bubble--me .msg-time-ai { align-self: flex-end; }

/* ── Streaming dots ──────────────────────────────────────────────── */
.dots { display: flex; gap: 6px; padding: 8px 0; }
.dots span { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--fg-3); animation: sys-blink 1.2s infinite; }
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes sys-blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }

/* ── Media embeds ────────────────────────────────────────────────── */
.media-preview img { display: block; width: 100%; height: auto; border-radius: 10px; margin-bottom: 10px; }
.media-video video { max-width: 100%; display: block; border-radius: 10px; margin-bottom: 10px; }
.media-audio audio  { width: 260px; height: 36px; display: block; margin-bottom: 10px; }
.media-embed iframe { width: 100%; max-width: 320px; aspect-ratio: 16/9; display: block; margin-bottom: 10px; }
.media-spotify iframe { width: 100%; max-width: 320px; height: 80px; display: block; margin-bottom: 10px; }

.link-card {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px; border: 1px solid var(--rule-2);
  color: var(--fg-3); font-family: var(--mono); font-size: 12px;
  letter-spacing: 0.12em; text-decoration: none; margin-bottom: 10px;
  transition: all 0.15s;
}
.link-card:hover { border-color: var(--rule); color: var(--fg); }
.lc-icon  { flex: none; }
.lc-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
.lc-arr   { flex: none; opacity: 0.4; font-family: var(--serif); }

/* ── Dock ────────────────────────────────────────────────────────── */
.dock {
  border-top: 1px solid var(--rule-2);
  background: var(--paper-3);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

/* Growth lock banner */
.dock-growth-lock {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 14px;
  background: rgba(139, 92, 246, 0.07);
  border-bottom: 1px solid rgba(139, 92, 246, 0.15);
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.10em; text-transform: uppercase;
  color: var(--accent); opacity: 0.8;
}
.dock-growth-spinner {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  border: 1.5px solid rgba(139, 92, 246, 0.3);
  border-top-color: var(--accent);
  animation: dock-spin 0.9s linear infinite;
}
@keyframes dock-spin { to { transform: rotate(360deg); } }

/* Mode bar */
.dock-mode-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  height: 36px;
  border-bottom: 1px solid var(--rule);
}
.mode-dot {
  width: 5px; height: 5px; border-radius: 50%; flex: none;
  background: var(--fg-4);
  transition: background 0.15s, box-shadow 0.15s;
}
.mode-dot.soul {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
}
.mode-label-btn {
  font-family: var(--mono); font-size: 11px;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--fg-4);
  background: transparent; border: 0; cursor: pointer;
  padding: 0; transition: color 0.15s;
}
.mode-label-btn:hover { color: var(--fg-3); }

.mode-activity {
  display: flex; align-items: center; gap: 3px;
  margin-left: auto;
}
.mode-activity span {
  display: inline-block; width: 4px; height: 4px; border-radius: 50%;
  background: var(--accent); opacity: 0.6;
  animation: sys-blink 1.2s infinite;
}
.mode-activity span:nth-child(2) { animation-delay: 0.2s; }
.mode-activity span:nth-child(3) { animation-delay: 0.4s; }

/* Model selector */
.model-select {
  margin-left: auto;
  background: transparent;
  border: 0;
  border-left: 1px solid var(--rule);
  color: var(--fg-4);
  font-family: var(--mono); font-size: 10px;
  letter-spacing: 0.08em; text-transform: uppercase;
  padding: 2px 6px;
  cursor: pointer;
  appearance: none; -webkit-appearance: none;
  outline: 0;
}
.model-select:hover { color: var(--fg-2); }
.model-select option { background: #12101a; color: var(--fg); }

/* Archivar toggle */
.archivar-toggle {
  display: flex; align-items: center; gap: 5px;
  border: 0; border-left: 1px solid var(--rule);
  background: transparent; cursor: pointer;
  font-family: var(--mono); font-size: 10px;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--fg-4); padding: 2px 8px;
  transition: color 0.15s;
}
.archivar-toggle:hover { color: var(--fg-2); }
.archivar-toggle.active { color: var(--accent); }
.archivar-dot {
  width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0;
  border: 1.5px solid currentColor;
  transition: background 0.15s;
}
.archivar-toggle.active .archivar-dot {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 0 6px var(--accent);
}

/* Main row */
.dock-main {
  display: flex;
  align-items: stretch;
  min-height: 52px;
}

/* Icon buttons (camera, file) */
.dock-icon {
  display: flex; align-items: center; justify-content: center;
  width: 44px; flex-shrink: 0;
  border: 0; border-right: 1px solid var(--rule);
  background: transparent; cursor: pointer;
  color: var(--fg-4);
  transition: color 0.12s, background 0.12s;
}
.dock-icon:hover:not(:disabled) { color: var(--fg-2); background: rgba(255,255,255,0.025); }
.dock-icon:disabled { opacity: 0.3; cursor: not-allowed; }
.dock-icon-svg { width: 15px; height: 15px; }

/* "+" toggle */
.dock-plus { border-right: 1px solid var(--rule); }
.dock-plus.active { color: var(--accent); }
.dock-plus svg { transition: transform 0.2s; }
.dock-plus.active svg { transform: rotate(45deg); }

/* Expandable media buttons */
.media-drawer { display: flex; }
.media-drawer-enter-active, .media-drawer-leave-active { transition: opacity 0.15s, max-width 0.2s; overflow: hidden; max-width: 96px; }
.media-drawer-enter-from, .media-drawer-leave-to { opacity: 0; max-width: 0; }

/* Input wrap */
.input-wrap {
  flex: 1;
  display: flex; align-items: center;
  padding: 0 clamp(12px,2.5vw,20px);
  min-width: 0;
}
.input {
  font-family: var(--serif); font-size: clamp(16px,1.6vw,17px);
  color: var(--fg); border: 0; outline: 0;
  background: transparent; padding: 14px 0 14px 8px;
  width: 100%; min-width: 0;
  line-height: 1.45; resize: none; overflow-y: auto;
  min-height: 48px; max-height: 140px;
}
.input::placeholder { color: var(--fg-3); font-style: italic; }

/* Send button */
.send {
  width: 64px; border: 0; border-left: 1px solid var(--rule);
  background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
  color: var(--fg-3);
}
.send:hover:not(:disabled) { background: var(--accent); color: var(--on-accent); }
.send:disabled { opacity: 0.25; cursor: not-allowed; }
.arr-icon { width: 18px; height: 18px; }

.pulse { animation: sys-blink 1.2s infinite; }

/* ── Message action buttons ──────────────────────────────────────── */
.msg-actions {
  display: flex; gap: 10px; flex-wrap: wrap;
  margin-top: 14px;
}
.msg-action-btn {
  font-family: var(--mono); font-size: 12px;
  letter-spacing: 0.10em; text-transform: uppercase;
  padding: 7px 16px;
  border: 1px solid var(--rule-2);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.msg-action-btn.primary {
  background: var(--accent); color: var(--on-accent); border-color: var(--accent);
}
.msg-action-btn.primary:hover:not(:disabled) {
  background: var(--accent-bright); border-color: var(--accent-bright);
}
.msg-action-btn.secondary {
  background: transparent; color: var(--fg-3);
}
.msg-action-btn.secondary:hover:not(:disabled) {
  color: var(--fg); border-color: var(--rule);
}
.msg-action-btn:disabled {
  opacity: 0.35; cursor: not-allowed;
}

/* ── Mobile FAB (hidden on desktop) ─────────────────────────────── */
.mobile-fab { display: none; }

/* ── Responsive ──────────────────────────────────────────────────── */
@media (max-width: 640px) {
  /* Stream fills full height — dock is fixed, so no bottom padding needed */
  .stream {
    padding: 16px 12px 80px;
  }
  .msg { grid-template-columns: 1fr; }
  .dock-icon { width: 40px; }
  .dock-mode-bar { padding: 0 12px; }

  /* Dock slides up from bottom as fixed overlay */
  .dock {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    z-index: 200;
    transform: translateY(calc(100% + 64px));
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    background: rgba(18, 16, 26, 0.92);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-top: 1px solid rgba(139, 92, 246, 0.22);
    box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.5);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .dock.mobile-open {
    transform: translateY(0);
  }

  /* Floating composer button */
  .mobile-fab {
    display: flex;
    align-items: center;
    justify-content: center;
    position: fixed;
    bottom: calc(64px + env(safe-area-inset-bottom, 0px));
    right: 18px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.13);
    background: rgba(18, 16, 26, 0.72);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow:
      0 4px 20px rgba(0, 0, 0, 0.45),
      0 0 0 1px rgba(139, 92, 246, 0.12);
    cursor: pointer;
    color: rgba(255, 255, 255, 0.65);
    z-index: 201;
    transition:
      bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      color 0.2s,
      border-color 0.2s,
      background 0.2s,
      box-shadow 0.2s;
  }
  .mobile-fab:active {
    transform: scale(0.93);
  }
  .mobile-fab.open {
    color: #f87171;
    border-color: rgba(248, 113, 113, 0.3);
    background: rgba(18, 16, 26, 0.88);
    box-shadow:
      0 4px 20px rgba(248, 113, 113, 0.15),
      0 0 0 1px rgba(248, 113, 113, 0.15);
  }
  .mobile-fab-icon {
    transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .mobile-fab.open .mobile-fab-icon {
    transform: rotate(45deg);
  }
}

/* ── Agent Sandbox empty state ───────────────────────────────────── */
.agent-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 32px;
  text-align: center;
}
.agent-empty-icon {
  font-size: 28px;
  color: var(--fg-4);
  margin: 0;
  line-height: 1;
}
.agent-empty-title {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--fg-3);
  margin: 0;
}
.agent-empty-hint {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--fg-4);
  line-height: 1.6;
  max-width: 320px;
  margin: 0;
}
.saving-dots { padding: 12px clamp(16px,3vw,40px); }

/* ── Agent ID-Badges (Wallet + TX) ──────────────────────────────── */
.agent-id-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.agent-id-badge {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--fg-4);
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 2px 7px;
  white-space: nowrap;
}
.agent-id-badge.tx { opacity: 0.6; }


/* ── Dock: Bild-Vorschau ─────────────────────────────────────────── */
.dock-media-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--rule);
  background: rgba(255,255,255,0.02);
}
.dock-media-thumb {
  width: 36px; height: 36px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--rule-2);
  flex-shrink: 0;
}
.dock-media-name {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--fg-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.dock-media-remove {
  font-size: 11px;
  color: var(--fg-4);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  flex-shrink: 0;
}
.dock-media-remove:hover { color: var(--fg-2); }


/* ── Tages-Trenner ──────────────────────────────────────────────── */
.msg-day-sep {
  align-self: center;
  font-family: var(--mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.10em;
  color: var(--fg-4);
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--rule);
  border-radius: 99px;
  padding: 3px 12px;
  margin: 10px auto;
}

/* ── Nachrichten-Modus: Chat-Bubbles ─────────────────────────────── */
.msg-bubble {
  display: flex;
  flex-direction: column;
  max-width: min(88%, 600px);
  gap: 3px;
}
.msg-bubble--me    { align-self: flex-end;   align-items: flex-end; }
.msg-bubble--other { align-self: flex-start; align-items: flex-start; }

.msg-sender {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  opacity: 0.9;
  padding: 0 4px;
}

.msg-inner {
  padding: 10px 14px;
  font-family: var(--serif);
  font-size: clamp(14px,1.4vw,16px);
  line-height: 1.55;
  color: var(--fg);
  word-break: break-word;
}
.msg-inner p        { margin: 0 0 6px; }
.msg-inner p:last-child { margin-bottom: 0; }
.msg-inner p:empty  { display: none; }
.msg-media-img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 10px;
  margin: 4px 0 8px;
}
.msg-doc-link { margin-bottom: 6px; }
.msg-doc-a {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 10px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  text-decoration: none;
  color: var(--fg-2);
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.05em;
  max-width: 200px;
  transition: background 0.12s;
}
.msg-doc-a:hover { background: rgba(255,255,255,0.10); }
.msg-doc-icon { flex-shrink: 0; font-size: 13px; }
.msg-doc-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }
.msg-media-loading {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em;
  color: var(--fg-4); padding: 6px 0;
}
.msg-media-error {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em;
  color: #f87171; padding: 6px 0;
}
.msg-expired {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--fg-4);
  font-style: italic;
  margin-bottom: 4px;
}
.dock-doc-icon {
  font-size: 16px; flex-shrink: 0; color: var(--fg-3);
}

.msg-inner--me {
  background: rgba(139,92,246,0.20);
  border-radius: 14px 14px 4px 14px;
}
.msg-inner--social {
  background: rgba(255,255,255,0.06);
  border-radius: 14px 14px 14px 4px;
  border-left: 2px solid #34d399;
  color: var(--fg-2);
}
.msg-inner--agent {
  background: rgba(255,255,255,0.06);
  border-radius: 14px 14px 14px 4px;
  border-left: 2px solid #a78bfa;
  color: var(--fg-2);
}
.msg-inner--synthesis {
  background: rgba(96,165,250,0.07);
  border-radius: 14px 14px 14px 4px;
  border-left: 2px solid #60a5fa;
  color: var(--fg-2);
  font-style: italic;
}
.msg-inner--ki {
  background: rgba(255,255,255,0.05);
  border-radius: 14px 14px 14px 4px;
  border-left: 2px solid rgba(139,92,246,0.45);
  color: var(--fg);
  font-size: clamp(15px,1.5vw,16px);
  line-height: 1.60;
}
.msg-inner--ki em { color: var(--accent-bright); font-style: italic; }
.msg-inner--ki code { font-family: var(--mono); font-size: 0.85em; background: rgba(255,255,255,0.06); padding: 1px 5px; }

/* KI sending on my behalf to peers — outgoing but AI-generated */
.msg-inner--ki-out {
  background: rgba(139,92,246,0.09);
  border-radius: 14px 14px 4px 14px;
  border: 1px dashed rgba(139,92,246,0.28);
  color: var(--fg-2);
  font-size: 0.94em;
}

/* Archivar (synthesis) — journal entry style, not a chat bubble */
.msg-bubble--archivar {
  align-self: stretch;
  max-width: 100%;
  opacity: 0.78;
}
.msg-bubble--archivar .msg-sender {
  font-size: 9px;
  letter-spacing: 0.18em;
  text-align: center;
  padding: 0 2px;
}
.msg-inner--synthesis {
  background: transparent;
  border-radius: 0;
  border-left: none;
  border-top: 1px solid rgba(96,165,250,0.18);
  padding: 8px 4px 6px;
  font-size: 13px;
  line-height: 1.5;
  font-style: italic;
  color: var(--fg-3);
}

.msg-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px;
}
.msg-to {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  font-weight: 600;
}
.msg-time {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--fg-4);
  letter-spacing: 0.06em;
}

/* ── Delivery indicator ─────────────────────────────────────────── */
.msg-delivery {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  transition: color 0.2s, opacity 0.2s;
  cursor: default;
  user-select: none;
}
.msg-delivery--saving    { color: var(--fg-4); opacity: 0.5; }
.msg-delivery--saved     { color: var(--fg-4); }
.msg-delivery--delivered { color: #34d399; }
.msg-delivery--error     { color: #fbbf24; }

/* ── Peer error notice ──────────────────────────────────────────── */
.peer-error-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(251,191,36,0.07);
  border: 1px solid rgba(251,191,36,0.18);
  border-radius: 8px;
  font-family: var(--mono);
  font-size: 11px;
  color: #fbbf24;
  letter-spacing: 0.05em;
  line-height: 1.5;
  flex-shrink: 0;
  word-break: break-all;
}
.peer-error-icon { flex-shrink: 0; margin-top: 1px; }

/* ── Vault shared session banner ────────────────────────────────── */
.shared-files-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(139,92,246,0.07);
  border-top: 1px solid rgba(139,92,246,0.18);
  flex-shrink: 0;
}
.sfb-info {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--fg-4);
  letter-spacing: 0.05em;
  flex: 1;
  min-width: 0;
}
.sfb-delete {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: transparent;
  border: 1px solid rgba(240,163,163,0.3);
  color: #f0a3a3;
  cursor: pointer;
  padding: 3px 8px;
  flex-shrink: 0;
  transition: all 0.15s;
}
.sfb-delete:hover { background: rgba(240,163,163,0.08); border-color: #f0a3a3; }

/* ── Vault delete button on own messages ────────────────────────── */
.msg-vault-del {
  margin-left: 4px;
  background: transparent;
  border: 0;
  color: var(--fg-4);
  font-size: 14px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  transition: color 0.15s;
}
.msg-vault-del:hover { color: #f0a3a3; }

/* ── Synthesis forward button ───────────────────────────────────── */
.msg-forward-btn {
  margin-left: 6px;
  background: transparent;
  border: 1px solid rgba(96,165,250,0.3);
  color: #60a5fa;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  cursor: pointer;
  padding: 1px 6px;
  transition: all 0.15s;
}
.msg-forward-btn:hover { background: rgba(96,165,250,0.08); border-color: #60a5fa; }
.msg-forwarded {
  margin-left: 6px;
  font-family: var(--mono);
  font-size: 10px;
  color: #34d399;
  letter-spacing: 0.06em;
}

</style>
