<template>
  <!-- ═══════════════════════════════════════════════════════════════
       SYS · ChatInterface.vue — Editorial reading column
       Serif body copy, rule-separated turns, feature chips, mode toggle.
       ═══════════════════════════════════════════════════════════════ -->
  <div class="sys-chat">

    <!-- ── Stream ──────────────────────────────────────────────────── -->
    <div ref="scrollEl" class="stream" :class="{ 'stream--chat': agentMode }">

      <!-- ── AI-Chat-Modus ─────────────────────────────────────────── -->
      <template v-if="!agentMode">
        <article
          v-for="(m, i) in messages"
          :key="m.id || i"
          class="msg"
          :class="{ user: m.role === 'user', ai: m.role === 'assistant' }"
        >
          <header class="who">
            <span class="handle">{{ m.role === 'user' ? 'Du' : (localRole === 'soul' ? 'SoulKI' : 'Entw.') }}</span>
            <time>{{ fmtTime(m.ts || Date.now()) }}</time>
          </header>
          <div class="body">
            <div v-if="m.mediaType === 'image' && m.mediaUrl" class="media-preview">
              <img :src="m.mediaUrl" alt="" loading="lazy" />
            </div>
            <div v-else-if="m.mediaType === 'audio' && m.mediaUrl" class="media-audio">
              <audio controls :src="m.mediaUrl" style="accent-color:var(--accent)"></audio>
            </div>
            <div v-else-if="m.mediaType === 'video' && m.mediaUrl" class="media-video">
              <video controls :src="m.mediaUrl" playsinline></video>
            </div>
            <div v-if="m.youtubeEmbed" class="media-embed">
              <iframe
                :src="`https://www.youtube-nocookie.com/embed/${m.youtubeEmbed.videoId}`"
                frameborder="0" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"
              ></iframe>
            </div>
            <div v-if="m.spotifyEmbed" class="media-spotify">
              <iframe
                :src="`https://open.spotify.com/embed/track/${m.spotifyEmbed.id}?utm_source=generator&theme=0`"
                frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"
              ></iframe>
            </div>
            <a v-if="m.linkCard" :href="m.linkCard.url" target="_blank" rel="noopener" class="link-card">
              <span class="lc-icon">{{ m.linkCard.service === 'youtube' ? '▶' : m.linkCard.service === 'spotify' ? '♫' : '🔍' }}</span>
              <span class="lc-label">{{ m.linkCard.label }}</span>
              <span class="lc-arr">→</span>
            </a>
            <div v-if="m.streaming && !m.text" class="dots">
              <span></span><span></span><span></span>
            </div>
            <p v-for="(para, j) in paragraphs(m.text)" :key="j" v-html="renderText(para)"></p>
            <div v-if="m.actions?.length" class="msg-actions">
              <button
                v-for="a in m.actions" :key="a.label"
                class="msg-action-btn" :class="a.primary ? 'primary' : 'secondary'"
                :disabled="m.actionsDisabled" @click="handleMsgAction(m, a)"
              >{{ a.label }}</button>
            </div>
          </div>
        </article>
      </template>

      <!-- ── Nachrichten-Modus ─────────────────────────────────────── -->
      <template v-else>
        <!-- View tabs -->
        <div class="msg-tabs">
          <button v-for="[id, label, color] in [['peer','Peers','#34d399'],['agent','Agenten','#a78bfa'],['all','Alle','#60a5fa']]" :key="id"
            class="msg-tab" :class="{ active: msgView === id }"
            :style="msgView === id ? { color } : {}"
            @click="msgView = id">
            {{ label }}
          </button>
        </div>

        <!-- Synthese-Block (nur "Alle"-Tab) -->
        <div v-if="msgView === 'all'" class="synthesis-block">
          <div class="synthesis-label">
            <span class="synthesis-dot"></span>
            Kollektive Synthese
          </div>
          <div v-if="isSynthesizing" class="dots synthesis-dots">
            <span></span><span></span><span></span>
          </div>
          <p v-else-if="synthesisText" class="synthesis-text">{{ synthesisText }}</p>
          <p v-else class="synthesis-empty">Schreib eine Nachricht — die KI synthetisiert was über die Sphären hinaus entsteht.</p>
        </div>

        <div v-if="displayMessages.length === 0" class="agent-empty">
          <p class="agent-empty-icon">⬡</p>
          <p class="agent-empty-title">{{ msgView === 'peer' ? 'Keine Peer-Nachrichten' : msgView === 'agent' ? 'Agent Sandbox leer' : 'Keine Nachrichten' }}</p>
          <p class="agent-empty-hint">{{ msgView === 'peer' ? 'Peers schreiben via MCP in deine Social Sphere.' : 'Wähle unten einen Empfänger und schreib eine Nachricht.' }}</p>
        </div>

        <template v-for="(msg, i) in displayMessages" :key="`${msg.ts}-${i}`">
          <!-- Day separator -->
          <div v-if="isDifferentDay(msg, displayMessages[i - 1])" class="msg-day-sep">
            {{ formatDay(msg.ts) }}
          </div>

          <!-- Bubble -->
          <div class="msg-bubble" :class="msg.from === 'me' ? 'msg-bubble--me' : 'msg-bubble--other'">
            <!-- Sender (other only) -->
            <div v-if="msg.from !== 'me'" class="msg-sender"
              :style="{ color: msg.sphere === 'social' ? '#34d399' : '#a78bfa' }">
              {{ msg.author ?? msg.from.slice(0, 8) }}
            </div>

            <!-- Content -->
            <div class="msg-inner"
              :class="msg.from === 'me' ? 'msg-inner--me' : (msg.sphere === 'social' ? 'msg-inner--social' : 'msg-inner--agent')">
              <div v-if="msgExpiredCache.has(msg.ts)" class="msg-expired">Inhalt abgelaufen</div>
              <template v-else>
                <img v-if="msgMediaCache.get(msg.ts)" :src="msgMediaCache.get(msg.ts)" class="msg-media-img" alt="" />
                <div v-if="msgBlobCache.get(msg.ts)" class="msg-doc-link">
                  <a :href="msgBlobCache.get(msg.ts).url" :download="msgBlobCache.get(msg.ts).name" class="msg-doc-a">
                    <span class="msg-doc-icon">↓</span>
                    <span class="msg-doc-name">{{ msgBlobCache.get(msg.ts).name }}</span>
                  </a>
                </div>
              </template>
              <p v-for="(para, j) in paragraphs(cleanMsgContent(msg))" :key="j" v-html="renderText(para)"></p>
            </div>

            <!-- Footer: to-badge + time -->
            <div class="msg-foot">
              <span v-if="msg.from === 'me'" class="msg-to"
                :style="msg.to === 'peer' ? 'color:#34d399' : msg.to === 'agent' ? 'color:#a78bfa' : 'color:#60a5fa'">
                → {{ msg.to === 'peer' ? '@Peer' : msg.to === 'agent' ? '@Agent' : '@Community' }}
              </span>
              <time class="msg-time">{{ fmtMsgDate(msg.ts) }}</time>
            </div>
          </div>
        </template>

        <div v-if="isSavingAgent" class="dots saving-dots">
          <span></span><span></span><span></span>
        </div>
      </template>

      <!-- Scroll anchor -->
      <div ref="chatEnd" class="anchor"></div>
    </div>

    <!-- ── Dock ────────────────────────────────────────────────────── -->
    <footer class="dock">

      <!-- Row 1: mode toggle · textarea · send -->
      <div class="dock-main" :class="{ 'no-toggle': agentMode }">
        <!-- Mode toggle pill (AI mode only) -->
        <button
          v-if="!agentMode"
          class="mode-btn"
          :class="{ soul: localRole === 'soul' }"
          @click="toggleRole"
          :title="localRole === 'soul' ? 'Wechsel zu Entwicklung' : 'Wechsel zu Soul'"
        >
          <span class="mode-dot"></span>
          {{ localRole === 'soul' ? 'Soul' : 'Dev' }}
        </button>

        <!-- Textarea -->
        <div class="input-wrap">
          <textarea
            ref="textareaEl"
            v-model="draft"
            class="input"
            :placeholder="agentMode ? (msgView === 'peer' ? 'Nachricht an Peers…' : msgView === 'agent' ? 'Nachricht an Agenten…' : 'Nachricht an alle — KI synthetisiert…') : 'Schreib etwas…'"
            rows="1"
            @keydown.enter.exact.prevent="handleSend"
            @keydown.shift.enter.exact="draft += '\n'; $nextTick(autoResize)"
            @input="autoResize"
          ></textarea>
        </div>

        <!-- Send -->
        <button
          class="send"
          :disabled="!canSend"
          @click="handleSend"
          aria-label="Nachricht senden"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="arr-icon">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5m-7 7 7-7 7 7"/>
          </svg>
        </button>
      </div>

      <!-- Image preview (messaging mode, when media attached) -->
      <div v-if="agentMode && msgMedia" class="dock-media-preview">
        <img :src="`data:${msgMedia.mime};base64,${msgMedia.base64}`" alt="Anhang" class="dock-media-thumb" />
        <span class="dock-media-name">{{ msgMedia.name ?? 'Bild' }}</span>
        <button class="dock-media-remove" @click="msgMedia = null" aria-label="Entfernen">✕</button>
      </div>
      <!-- Doc preview (messaging mode, when doc attached) -->
      <div v-if="agentMode && msgDoc" class="dock-media-preview">
        <span class="dock-doc-icon">↓</span>
        <span class="dock-media-name">{{ msgDoc.name }}</span>
        <button class="dock-media-remove" @click="msgDoc = null" aria-label="Entfernen">✕</button>
      </div>

      <!-- Row 2: feature chips -->
      <div class="dock-chips">
        <!-- Mode toggle (nur Mobile, Desktop hat eigenen Button in dock-main) -->
        <button
          class="chip mode-chip"
          :class="{ soul: localRole === 'soul' }"
          @click="toggleRole"
          :title="localRole === 'soul' ? 'Wechsel zu Entwicklung' : 'Wechsel zu Soul'"
        >
          <span class="mode-dot"></span>
          <span class="chip-label">{{ localRole === 'soul' ? 'Soul' : 'Dev' }}</span>
        </button>
        <!-- Nachrichten / Agent Sandbox -->
        <button
          class="chip"
          :class="{ active: agentMode }"
          @click="agentMode = !agentMode"
          aria-label="Nachrichten"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="chip-icon">
            <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"/>
          </svg>
          <span class="chip-label">Nachrichten</span>
        </button>

        <!-- Aktualisieren (nur im Agent-Modus) -->
        <button
          v-if="agentMode"
          class="chip"
          :class="{ loading: isRefreshing }"
          :disabled="isRefreshing"
          @click="refreshAgentContent"
          aria-label="Nachrichten aktualisieren"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="chip-icon" :class="{ pulse: isRefreshing }">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/>
          </svg>
          <span class="chip-label">{{ isRefreshing ? 'Lädt…' : 'Neu laden' }}</span>
        </button>

        <!-- Camera -->
        <button
          class="chip"
          :class="{ active: cameraOpen, loading: visionLoading }"
          :disabled="visionLoading"
          @click="cameraOpen = true"
          aria-label="Kamera"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="chip-icon" :class="{ pulse: visionLoading }">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"/>
          </svg>
          <span class="chip-label">{{ visionLoading ? 'Analyse…' : 'Kamera' }}</span>
        </button>

        <!-- File -->
        <button class="chip" @click="handleFileChip" aria-label="Datei">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="chip-icon">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>
          </svg>
          <span class="chip-label">Datei</span>
        </button>

        <!-- YouTube -->
        <button
          class="chip"
          :class="{ primed: draft.startsWith('@search-youtube') }"
          @click="insertSearch('@search-youtube ')"
          aria-label="YouTube"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" class="chip-icon yt">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          <span class="chip-label">YouTube</span>
        </button>

        <!-- Spotify -->
        <button
          class="chip"
          :class="{ primed: draft.startsWith('@search-spotify') }"
          @click="insertSearch('@search-spotify ')"
          aria-label="Spotify"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" class="chip-icon sp">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
          <span class="chip-label">Spotify</span>
        </button>

        <!-- Web -->
        <button
          class="chip"
          :class="{ primed: draft.startsWith('@search-google') }"
          @click="insertSearch('@search-google ')"
          aria-label="Web-Suche"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="chip-icon">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253M3.157 7.582A8.959 8.959 0 0 0 3 12c0 .778.099 1.533.284 2.253"/>
          </svg>
          <span class="chip-label">Web</span>
        </button>

        <!-- Loading dots (while streaming) -->
        <div v-if="isLoading" class="stream-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    </footer>

    <!-- Camera Recorder Overlay -->
    <CameraRecorder
      :is-open="cameraOpen"
      @captured="handleCameraCapture"
      @cancel="cameraOpen = false"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useClaude } from '~/composables/useClaude.js'
import { useSession } from '~/composables/useSession.js'
import { useVault } from '~/composables/useVault.js'
import { useYouTube } from '~/composables/useYouTube.js'
import { useSpotify } from '~/composables/useSpotify.js'
import { useSoul } from '~/composables/useSoul.js'
import CameraRecorder from '~/components/CameraRecorder.vue'

// ── Props / Emits ──────────────────────────────────────────────────
const props = defineProps({
  soulContent: { type: String, default: '' },
  soulCert:    { type: String, default: '' },
  role:        { type: String, default: 'soul' },  // 'soul' | 'session'
})
const emit = defineEmits(['cert-error', 'role-change'])

// ── Composables ────────────────────────────────────────────────────
const { chat, isLoading, error, certError } = useClaude()
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

// ── Local role (synced with prop, togglable) ───────────────────────
const localRole = ref(props.role)
watch(() => props.role, (v) => { localRole.value = v })

function toggleRole() {
  localRole.value = localRole.value === 'soul' ? 'session' : 'soul'
  emit('role-change', localRole.value)
}

// ── Input state ────────────────────────────────────────────────────
const draft      = ref('')
const textareaEl = ref(null)
const scrollEl   = ref(null)
const chatEnd    = ref(null)

const canSend = computed(() =>
  (draft.value.trim().length > 0 || (agentMode.value && (!!msgMedia.value || !!msgDoc.value))) &&
  (agentMode.value ? !isSavingAgent.value : !isLoading.value)
)

// ── Messaging mode ─────────────────────────────────────────────────
const { soulContent: soulContentAgent, soulMeta, updateContent, pushToServer, fetchFromServer, syncStatus, serverContent } = useSoul()
const agentMode       = ref(false)
const isSavingAgent   = ref(false)
const isRefreshing    = ref(false)
const msgView         = ref('all')   // 'all' | 'peer' | 'agent'
const synthesisText                  = ref('')
const isSynthesizing                 = ref(false)
const synthesisTriggeredThisSession  = ref(false)
const msgMedia        = ref(null)    // { base64, mime, name? } — attached image in messaging mode
const msgDoc          = ref(null)    // { file, name } — attached doc in messaging mode
const msgMediaCache   = reactive(new Map()) // ts → dataUrl — session-only image display
const msgBlobCache    = reactive(new Map()) // ts → { url, name } — session blob URLs for docs
const msgExpiredCache = reactive(new Set()) // ts — evicted cache entries
const SYNTHESIS_N     = 5           // messages per sphere for synthesis
const CACHE_TTL_MS    = 30 * 60 * 1000
const CACHE_MAX_ITEMS = 30
let   _agentPollTimer  = null
let   _cacheEvictTimer = null

watch(agentMode, async (active) => {
  if (active) {
    await refreshAgentContent()
    _agentPollTimer  = setInterval(refreshAgentContent, 30_000)
    _cacheEvictTimer = setInterval(evictCache, 5 * 60 * 1000)
  } else {
    clearInterval(_agentPollTimer);  _agentPollTimer  = null
    clearInterval(_cacheEvictTimer); _cacheEvictTimer = null
  }
})
onUnmounted(() => {
  clearInterval(_agentPollTimer)
  clearInterval(_cacheEvictTimer)
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
  } finally {
    isRefreshing.value = false
  }
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
  const m = soulContentAgent.value?.match(RE_SOCIAL_BLOCK)
  return m ? parseMsgBlock(m[1], 'social') : []
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
  const social    = socialMsgs.value
  const agentNew  = agentMsgsNew.value
  const agentOld  = agentMsgsOld.value

  let pool
  if (msgView.value === 'peer')  pool = social
  else if (msgView.value === 'agent') pool = [...agentNew, ...agentOld]
  else {
    // Plenum: merge + deduplicate by ts|from|to|content
    const seen = new Set()
    pool = [...social, ...agentNew, ...agentOld].filter(m => {
      const k = `${m.ts}|${m.from}|${m.to}|${m.content}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }
  return [...pool].sort((a, b) => new Date(a.ts) - new Date(b.ts))
})

// ── Collective Sense-Making ────────────────────────────────────────
async function triggerSynthesis(imageBase64 = null) {
  const social = [...socialMsgs.value].slice(-SYNTHESIS_N)
  const agent  = [...agentMsgsNew.value, ...agentMsgsOld.value]
    .sort((a, b) => new Date(a.ts) - new Date(b.ts))
    .slice(-SYNTHESIS_N)

  if (social.length === 0 && agent.length === 0) {
    synthesisText.value = ''
    return
  }

  isSynthesizing.value = true
  synthesisText.value  = ''
  try {
    const fmtMsgs = (msgs, label) => msgs.length
      ? `**${label}**\n` + msgs.map(m => `[${fmtMsgDate(m.ts)}] ${m.from === 'me' ? 'Du' : (m.author ?? m.from.slice(0, 8))}: ${m.content}`).join('\n')
      : ''

    const context = [fmtMsgs(social, 'Social Sphere (Peers)'), fmtMsgs(agent, 'Agent Sandbox (KIs)')].filter(Boolean).join('\n\n')

    const userContent = imageBase64
      ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } }, { type: 'text', text: context }]
      : context

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${props.soulCert || 'anonymous'}` },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        stream: false,
        system: `Du bekommst Nachrichten aus zwei Bereichen: dem Peer-Bereich (Gespräche mit anderen Menschen) und der Agenten-Sandbox (Mensch-KI-Zusammenarbeit).
Schreib eine kurze, klare Zusammenfassung auf Deutsch: Was passiert gerade? Was verbindet beide Bereiche?
2–3 einfache Sätze. Keine Fachbegriffe. Keine Einleitung. Direkt anfangen.`,
        messages: [{ role: 'user', content: userContent }]
      })
    })

    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = await res.json()
    const text = data?.content?.[0]?.text ?? ''
    synthesisText.value = text

    if (text) {
      const ts          = new Date().toISOString()
      const safeText    = `[Synthese] ${text}`
      const socialEntry = formatMsgEntry(safeText, 'ki', 'peer',  ts)
      const agentEntry  = formatMsgEntry(safeText, 'ki', 'agent', ts)
      let updated = soulContentAgent.value ?? ''
      updated = appendToMarkerBlock(updated, 'SOCIAL', socialEntry)
      updated = appendToMarkerBlock(updated, 'AGENT',  agentEntry)
      updateContent(updated)
      pushToServer().catch(() => {})
    }
  } catch {
    synthesisText.value = ''
  } finally {
    isSynthesizing.value = false
  }
}

watch(msgView, (v) => {
  if (v === 'all' && agentMode.value && !synthesisTriggeredThisSession.value) {
    synthesisTriggeredThisSession.value = true
    triggerSynthesis()
  }
})
watch(agentMode, (active, prev) => {
  // Reset flag on every entry/exit so next entry triggers fresh synthesis
  synthesisTriggeredThisSession.value = false
  if (active && msgView.value === 'all') {
    synthesisTriggeredThisSession.value = true
    triggerSynthesis()
  }
})

async function handleMsgSend() {
  if (isSavingAgent.value) return
  const text = draft.value.trim()
  if (!text && !msgMedia.value && !msgDoc.value) return
  draft.value = ''
  await nextTick(autoResize)
  isSavingAgent.value = true

  const media = msgMedia.value
  const doc   = msgDoc.value
  msgMedia.value = null
  msgDoc.value   = null

  try {
    const recipient = msgView.value === 'all' ? 'community' : msgView.value
    const msgTs     = new Date().toISOString()

    let fullText
    if (doc) {
      const summary = await summarizeDocument(doc.file).catch(() => '')
      const blobUrl = URL.createObjectURL(doc.file)
      msgBlobCache.set(msgTs, { url: blobUrl, name: doc.name })
      fullText = `[Dokument: ${doc.name}]${summary ? ' ' + summary : ''}`
    } else if (media) {
      msgMediaCache.set(msgTs, `data:${media.mime};base64,${media.base64}`)
      fullText = `${text}${text ? ' ' : ''}[Bild]`
    } else {
      fullText = text
    }

    const entry = formatMsgEntry(fullText, 'me', recipient, msgTs)
    let current = soulContentAgent.value ?? ''
    if (recipient === 'peer'      || recipient === 'community')
      current = appendToMarkerBlock(current, 'SOCIAL', entry)
    if (recipient === 'agent'     || recipient === 'community')
      current = appendToMarkerBlock(current, 'AGENT', entry)
    updateContent(current)
    await pushToServer()

    if (msgView.value === 'all') {
      triggerSynthesis(media?.base64 ?? null)
    } else {
      msgView.value = recipient === 'community' ? 'all' : recipient
    }
  } finally {
    isSavingAgent.value = false
  }
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
  let c = msg.content.replace('[Bild]', '').trim()
  if (msgBlobCache.has(msg.ts) || msgExpiredCache.has(msg.ts)) {
    c = c.replace(/^\[Dokument:[^\]]*\]\s*/, '')
  }
  return c.trim()
}

// ── Camera / Vision ────────────────────────────────────────────────
const cameraOpen    = ref(false)
const visionLoading = ref(false)

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
  chatEnd.value?.scrollIntoView({ behavior: 'smooth', block: 'end' })
}

watch(() => messages.value?.length, scrollToBottom)
watch(() => displayMessages.value.length, () => { if (agentMode.value) scrollToBottom() })

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

async function handleFileChip() {
  if (agentMode.value) {
    const file = await new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*,.pdf,.txt,.md,.json,.csv,.xml,.yaml,.yml,.log'
      input.onchange = () => resolve(input.files[0] || null); input.click()
    })
    if (!file) return
    if (IMAGE_EXT.test(file.name)) {
      try {
        const base64 = await compressImage(file)
        msgMedia.value = { base64, mime: 'image/jpeg', name: file.name }
      } catch { /* ignore */ }
    } else {
      msgDoc.value = { file, name: file.name }
    }
    return
  }

  let file = null
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await window.showOpenFilePicker({ multiple: false })
      file = await handle.getFile()
    } catch (e) { if (e.name === 'AbortError') return }
  }
  if (!file) {
    file = await new Promise((resolve) => {
      const input = document.createElement('input'); input.type = 'file'
      input.onchange = () => resolve(input.files[0] || null); input.click()
    })
  }
  if (!file) return
  const result = await handleLocalFile(file)
  if (!result) return
  if (result._imageFile) {
    await handleImageVision(result._imageFile, result.name)
    return
  }
  const meta = {}
  if (result.contentBlocks) meta.contentBlocks = result.contentBlocks
  if (result.mediaUrl) { meta.mediaUrl = result.mediaUrl; meta.mediaType = result.mediaType }
  await dispatchToChat(result.text, meta)
}

// ── @search prefix chips ───────────────────────────────────────────
function insertSearch(prefix) {
  draft.value = prefix
  nextTick(() => {
    autoResize()
    textareaEl.value?.focus()
  })
}

function parseSearchCommand(text) {
  const t = text.trim()
  const m = t.match(/^@search-(youtube|spotify|google)\s*(.*)/is)
  if (m) return { type: m[1].toLowerCase(), query: m[2].trim() }
  return null
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
  // In Nachrichten-Modus: Bild als Anhang setzen, nicht als Vision-Analyse
  if (agentMode.value) {
    msgMedia.value = { base64, mime: 'image/jpeg', name: 'Kamerabild' }
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
        model: 'claude-sonnet-4-6', max_tokens: 400, stream: false,
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

  const chatResult = await chat({
    messages: toApiMessages(),
    soulContent: props.soulContent,
    soulCert: props.soulCert,
    vaultContext: null,
    networkContext: null,
    networkPdfBlocks: null,
    networkImageBlocks: null,
    conversationSummary: conversationSummary.value || null,
    profileImageBase64: profileBase64.value,
    role: localRole.value,
    onDelta: (delta, fullText) => { updateLastMessage(fullText); scrollToBottom() },
  })

  setLastMessageMeta('streaming', false)
  if (!chatResult) updateLastMessage(error.value ? `_(Fehler: ${error.value})_` : '…')
  await scrollToBottom()
}

// ── Send handler ───────────────────────────────────────────────────
async function handleSend() {
  if (!canSend.value) return
  if (agentMode.value) { await handleMsgSend(); return }
  const raw = draft.value.trim()
  draft.value = ''
  await nextTick(autoResize)

  const cmd = parseSearchCommand(raw)
  if (cmd) {
    const result = await handleSearchCommand(cmd)
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
onMounted(() => {
  nextTick(autoResize)
})
onUnmounted(() => {
  for (const { url } of msgBlobCache.values()) URL.revokeObjectURL(url)
  mediaBlobUrls.forEach((url) => URL.revokeObjectURL(url))
})

defineExpose({
  focusInput: () => textareaEl.value?.focus(),
  sendExternal: (text) => { if (text?.trim() && !isLoading.value) dispatchToChat(text, {}) },
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
  padding: clamp(28px,5vw,48px) clamp(20px,4vw,48px);
  /* Bottom gap so last message breathes above the dock */
  padding-bottom: clamp(40px,6vw,64px);
  display: flex;
  flex-direction: column;
  gap: clamp(28px,3.5vw,40px);
  position: relative;
}
.stream::before {
  content: "";
  position: absolute; inset: 0;
  background: radial-gradient(circle at 85% 10%, rgba(139,92,246,0.07), transparent 50%);
  pointer-events: none; z-index: 0;
}
.stream > * { position: relative; z-index: 1; }

.anchor { height: 1px; }

/* ── Message ─────────────────────────────────────────────────────── */
.msg {
  max-width: 720px;
  display: grid; grid-template-columns: 96px 1fr; gap: 20px; align-items: start;
}
.msg.user { margin-left: auto; }
.msg.note { grid-template-columns: 1fr; color: var(--fg-3); font-style: italic; border-left: 2px solid var(--rule-2); padding-left: 12px; }

.who {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--fg-3);
  padding-top: 6px; text-align: right;
  border-right: 1px solid var(--rule-2); padding-right: 14px;
  display: flex; flex-direction: column; gap: 4px; align-items: flex-end;
}
.who .handle { color: var(--fg-3); }
.who time    { font-family: var(--mono); font-style: normal; color: var(--fg-4); font-size: 12px; letter-spacing: 0.10em; }
.msg.user .who .handle { color: var(--accent-bright); }

.body { font-family: var(--serif); font-size: clamp(16px,1.6vw,17px); line-height: 1.58; color: var(--fg); }
.msg.user .body { color: var(--fg-2); }
.body p   { margin: 0 0 12px; }
.body p:last-child { margin-bottom: 0; }
.body code { font-family: var(--mono); font-size: 0.85em; background: rgba(255,255,255,0.06); padding: 1px 5px; }
.msg.ai .body em { color: var(--accent-bright); font-style: italic; }

@media (max-width: 560px) {
  .msg { grid-template-columns: 1fr; gap: 6px; }
  .who { border-right: 0; padding-right: 0; text-align: left; align-items: flex-start; border-bottom: 1px solid var(--rule); padding-bottom: 6px; flex-direction: row; gap: 10px; }
}

/* ── Streaming dots ──────────────────────────────────────────────── */
.dots { display: flex; gap: 6px; padding: 8px 0; }
.dots span { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--fg-3); animation: sys-blink 1.2s infinite; }
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes sys-blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }

/* ── Media embeds ────────────────────────────────────────────────── */
.media-preview img, .media-video video { max-width: 280px; display: block; margin-bottom: 10px; }
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

/* Main row */
.dock-main {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: stretch;
  min-height: 60px;
  border-bottom: 1px solid var(--rule);
}
.dock-main.no-toggle {
  grid-template-columns: 1fr auto;
}

/* Mode toggle button */
.mode-btn {
  display: flex; align-items: center; gap: 7px;
  padding: 0 16px;
  border: 0; border-right: 1px solid var(--rule);
  background: transparent; cursor: pointer;
  font-family: var(--mono); font-size: 12px;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--fg-3);
  white-space: nowrap;
  transition: color 0.15s, background 0.15s;
  min-width: 88px;
}
.mode-btn:hover { color: var(--fg); background: rgba(255,255,255,0.025); }
.mode-btn.soul  { color: var(--accent); }
.mode-btn.soul:hover { color: var(--accent-bright); background: var(--accent-dim); }
.mode-dot {
  width: 5px; height: 5px; border-radius: 50%; flex: none;
  background: var(--fg-4);
  transition: background 0.15s, box-shadow 0.15s;
}
.mode-btn.soul .mode-dot {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
}

/* Input wrap */
.input-wrap {
  display: flex; align-items: center;
  padding: 0 clamp(14px,2vw,24px);
}
.input {
  font-family: var(--serif); font-size: clamp(16px,1.8vw,18px);
  color: var(--fg); border: 0; outline: 0;
  background: transparent; padding: 14px 0 14px clamp(12px,2vw,20px);
  width: 100%; min-width: 0;
  line-height: 1.45; resize: none; overflow-y: hidden;
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

/* Chips row */
.dock-chips {
  display: flex; align-items: center;
  gap: 0; padding: 0;
  overflow-x: auto; scrollbar-width: none;
  min-height: 42px;
}
.dock-chips::-webkit-scrollbar { display: none; }

.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 14px;
  height: 42px;
  border: 0; border-right: 1px solid var(--rule);
  background: transparent; cursor: pointer;
  font-family: var(--mono); font-size: 12px;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--fg-3); white-space: nowrap;
  transition: color 0.12s, background 0.12s;
  flex: none;
}
.chip:hover:not(:disabled)  { color: var(--fg); background: rgba(255,255,255,0.03); }
.chip.active  { color: var(--fg); background: rgba(255,255,255,0.06); }
.chip.primed  { color: var(--accent); background: var(--accent-dim); }
.chip.loading { color: var(--fg-4); cursor: default; }
.chip:disabled { opacity: 0.35; cursor: not-allowed; }
.chip-icon { width: 13px; height: 13px; flex: none; }
/* Mode-Chip: Desktop versteckt (mode-btn übernimmt), Mobile sichtbar */
.mode-chip { display: none; }
@media (max-width: 700px) { .mode-chip { display: inline-flex; } }
.mode-chip.soul { color: var(--accent); }
.mode-chip.soul .mode-dot { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
.chip-icon.yt { color: #f44; }
.chip-icon.sp { color: #1db954; }
.pulse { animation: sys-blink 1.2s infinite; }

/* Stream-loading indicator (right side of chips) */
.stream-indicator {
  margin-left: auto;
  padding: 0 16px;
  display: flex; align-items: center; gap: 5px;
  flex: none;
}
.stream-indicator span {
  display: inline-block; width: 5px; height: 5px; border-radius: 50%;
  background: var(--accent); opacity: 0.6;
  animation: sys-blink 1.2s infinite;
}
.stream-indicator span:nth-child(2) { animation-delay: 0.2s; }
.stream-indicator span:nth-child(3) { animation-delay: 0.4s; }

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

/* ── Responsive ──────────────────────────────────────────────────── */
@media (max-width: 700px) {
  .dock-main { grid-template-columns: 1fr auto; }
  .mode-btn  { display: none; } /* auf Mobile in Chips-Zeile verlagert */
  .send      { width: 56px; border-left: 1px solid var(--rule); }
  .chip      { padding: 0 12px; font-size: 12px; letter-spacing: 0.12em; }
}
@media (max-width: 480px) {
  .stream { padding: 20px 16px 32px; }
  .msg    { grid-template-columns: 1fr; }
  /* Chips: Icon + kompakter Label */
  .chip-label { display: none; }
  .chip       { padding: 0 14px; }
  .chip-icon  { width: 15px; height: 15px; }
  /* Mode-Toggle als erstes Chip sichtbar auf Mobile */
  .mode-chip  { display: inline-flex; }
  /* Chips-Row etwas höher für bessere Touch-Targets */
  .dock-chips { min-height: 52px; }
  .chip       { height: 52px; }
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

/* ── Collective Sense-Making: Synthese-Block ─────────────────────── */
.synthesis-block {
  border: 1px solid rgba(96,165,250,0.20);
  background: rgba(96,165,250,0.04);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}
.synthesis-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #60a5fa;
  opacity: 0.8;
}
.synthesis-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: #60a5fa;
  flex-shrink: 0;
  animation: sys-blink 2s infinite;
}
.synthesis-text {
  font-family: var(--serif);
  font-size: clamp(14px,1.3vw,15px);
  line-height: 1.6;
  color: var(--fg-2);
  margin: 0;
}
.synthesis-empty {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--fg-4);
  margin: 0;
  font-style: italic;
}
.synthesis-dots { padding: 4px 0; }

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

/* ── Nachrichten-Modus: Stream-Override ──────────────────────────── */
.stream--chat {
  gap: 6px;
  padding: clamp(16px,3vw,28px) clamp(12px,3vw,32px);
  padding-bottom: clamp(24px,4vw,40px);
}

/* ── Nachrichten-Modus: View-Tabs ────────────────────────────────── */
.msg-tabs {
  display: flex;
  gap: 2px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 0;
  flex-shrink: 0;
}
.msg-tab {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--fg-4);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 6px 12px;
  margin-bottom: -1px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.msg-tab:hover { color: var(--fg-3); }
.msg-tab.active { border-bottom-color: currentColor; color: inherit; }

/* ── Nachrichten-Modus: Tages-Trenner ───────────────────────────── */
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
  max-width: min(78%, 440px);
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
  max-width: 220px;
  max-height: 220px;
  border-radius: 8px;
  object-fit: cover;
  margin-bottom: 6px;
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

</style>
