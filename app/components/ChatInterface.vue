<template>
  <!-- ═══════════════════════════════════════════════════════════════
       SYS · ChatInterface.vue — Editorial reading column
       Serif body copy, rule-separated turns, feature chips, mode toggle.
       ═══════════════════════════════════════════════════════════════ -->
  <div class="sys-chat">

    <!-- ── Stream ──────────────────────────────────────────────────── -->
    <div ref="scrollEl" class="stream">


      <!-- Messages -->
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
          <!-- Media previews (image/audio/video) -->
          <div v-if="m.mediaType === 'image' && m.mediaUrl" class="media-preview">
            <img :src="m.mediaUrl" alt="" loading="lazy" />
          </div>
          <div v-else-if="m.mediaType === 'audio' && m.mediaUrl" class="media-audio">
            <audio controls :src="m.mediaUrl" style="accent-color:var(--accent)"></audio>
          </div>
          <div v-else-if="m.mediaType === 'video' && m.mediaUrl" class="media-video">
            <video controls :src="m.mediaUrl" playsinline></video>
          </div>

          <!-- YouTube embed -->
          <div v-if="m.youtubeEmbed" class="media-embed">
            <iframe
              :src="`https://www.youtube-nocookie.com/embed/${m.youtubeEmbed.videoId}`"
              frameborder="0" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"
            ></iframe>
          </div>

          <!-- Spotify embed -->
          <div v-if="m.spotifyEmbed" class="media-spotify">
            <iframe
              :src="`https://open.spotify.com/embed/track/${m.spotifyEmbed.id}?utm_source=generator&theme=0`"
              frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"
            ></iframe>
          </div>

          <!-- Link card -->
          <a v-if="m.linkCard" :href="m.linkCard.url" target="_blank" rel="noopener" class="link-card">
            <span class="lc-icon">{{ m.linkCard.service === 'youtube' ? '▶' : m.linkCard.service === 'spotify' ? '♫' : '🔍' }}</span>
            <span class="lc-label">{{ m.linkCard.label }}</span>
            <span class="lc-arr">→</span>
          </a>

          <!-- Streaming dots -->
          <div v-if="m.streaming && !m.text" class="dots">
            <span></span><span></span><span></span>
          </div>

          <!-- Text (rendered with minimal markdown) -->
          <p
            v-for="(para, j) in paragraphs(m.text)"
            :key="j"
            v-html="renderText(para)"
          ></p>
        </div>
      </article>

      <!-- Scroll anchor -->
      <div ref="chatEnd" class="anchor"></div>
    </div>

    <!-- ── Dock ────────────────────────────────────────────────────── -->
    <footer class="dock">

      <!-- Row 1: mode toggle · textarea · send -->
      <div class="dock-main">
        <!-- Mode toggle pill -->
        <button
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
            placeholder="Schreib etwas…"
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
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useClaude } from '~/composables/useClaude.js'
import { useSession } from '~/composables/useSession.js'
import { useVault } from '~/composables/useVault.js'
import { useYouTube } from '~/composables/useYouTube.js'
import { useSpotify } from '~/composables/useSpotify.js'
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
  addMessage, updateLastMessage, setLastMessageMeta,
  toApiMessages, getMessagesToSummarize, pruneWithSummary,
} = useSession()
const { contextText, profileBase64, fileManifest, allFiles, readImageFile, readImageAsBase64, isConnected: vaultConnected } = useVault()
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

const canSend = computed(() => draft.value.trim().length > 0 && !isLoading.value)

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
    let base64
    try { base64 = await compressImage(file) } catch { return { text: `[Bild: "${name}" – Fehler]`, contentBlocks: null } }
    const previewUrl = URL.createObjectURL(file); mediaBlobUrls.push(previewUrl)
    return {
      text: `[Bild: "${name}"]`,
      contentBlocks: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
        { type: 'text', text: `[Bild: "${name}" – bitte beschreib es]` },
      ],
      mediaUrl: previewUrl, mediaType: 'image',
    }
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

// ── Camera pipeline ────────────────────────────────────────────────
async function handleCameraCapture(capture) {
  cameraOpen.value = false
  visionLoading.value = true

  const authHeader = { Authorization: `Bearer ${props.soulCert}` }
  const base64 = capture.frameBase64 ?? capture.base64 ?? null
  if (!base64) { visionLoading.value = false; return }

  const previewUrl = `data:image/jpeg;base64,${base64}`
  addMessage('user', capture.caption || '[Kamerabild]', { mediaUrl: previewUrl, mediaType: 'image' })
  addMessage('assistant', '', { streaming: true })
  await scrollToBottom()

  let soulReaction = ''
  try {
    const vRes = await fetch('/api/vision-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({
        imageBase64: base64,
        mimeType: 'image/jpeg',
        transcript: capture.caption ?? capture.transcript ?? '',
        soulContext: [props.soulContent, contextText.value].filter(Boolean).join('\n\n').slice(0, 800),
      }),
    })
    if (vRes.ok) {
      const vData = await vRes.json()
      soulReaction = vData.soulReaction ?? vData.analysis ?? ''
    }
  } catch { /* weiter ohne Vision */ }

  updateLastMessage(soulReaction || 'Ich sehe das Bild.')
  setLastMessageMeta('streaming', false)
  visionLoading.value = false
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
  --fg-2:    rgba(236,231,245,0.72);
  --fg-3:    rgba(236,231,245,0.48);
  --fg-4:    rgba(236,231,245,0.30);
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

.who {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--fg-3);
  padding-top: 6px; text-align: right;
  border-right: 1px solid var(--rule-2); padding-right: 14px;
  display: flex; flex-direction: column; gap: 4px; align-items: flex-end;
}
.who .handle { color: var(--fg-3); }
.who time    { font-family: var(--mono); font-style: normal; color: var(--fg-4); font-size: 9px; letter-spacing: 0.18em; }
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
  color: var(--fg-3); font-family: var(--mono); font-size: 11px;
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

/* Mode toggle button */
.mode-btn {
  display: flex; align-items: center; gap: 7px;
  padding: 0 16px;
  border: 0; border-right: 1px solid var(--rule);
  background: transparent; cursor: pointer;
  font-family: var(--mono); font-size: 10px;
  letter-spacing: 0.2em; text-transform: uppercase;
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
  font-family: var(--mono); font-size: 10px;
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

/* ── Responsive ──────────────────────────────────────────────────── */
@media (max-width: 700px) {
  .dock-main { grid-template-columns: 1fr auto; }
  .mode-btn  { display: none; } /* auf Mobile in Chips-Zeile verlagert */
  .send      { width: 56px; border-left: 1px solid var(--rule); }
  .chip      { padding: 0 12px; font-size: 9px; letter-spacing: 0.12em; }
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
</style>
