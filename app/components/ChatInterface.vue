<template>
  <!-- ═══════════════════════════════════════════════════════════════
       SYS · ChatInterface.vue — Editorial reading column
       Serif body copy, rule-separated turns, feature chips, mode toggle.
       ═══════════════════════════════════════════════════════════════ -->
  <div class="sys-chat" :class="{ 'mob-composer-open': mobileComposerOpen }">

    <!-- ── Stream ──────────────────────────────────────────────────── -->
    <div ref="scrollEl" class="stream" :style="streamPadStyle">
      <div class="stream-inner">

      <div v-if="peerPollPending.length" class="peer-error-notice peer-error-notice--pending">
        <span class="peer-error-icon">⏳</span>
        <span>Verbindung ausstehend · {{ peerPollPending.map(e => `${peerLabel(e.soul_id)} muss Verbindungsanfrage bestätigen`).join(', ') }}</span>
      </div>
      <div v-if="peerPollUnreachable.length" class="peer-error-notice">
        <span class="peer-error-icon">⚠</span>
        <span>{{ peerPollUnreachable.length === 1 ? 'Peer nicht erreichbar' : `${peerPollUnreachable.length} Peers nicht erreichbar` }} · {{ peerPollUnreachable.map(e => `${e.soul_id.slice(0, 8)}… (${e.error})`).join(', ') }}</span>
      </div>

      <template v-for="(item, idx) in filteredStream" :key="item.id || `${item._type}-${item.ts ?? item._ts}-${idx}`">

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
            <div v-if="item.mediaType === 'image' && item.mediaUrl" class="media-preview msg-img-wrap">
              <img :src="item.mediaUrl" alt="" loading="lazy" class="msg-media-img"
                @click="openLightbox(item.mediaUrl, 'bild.jpg')" />
              <div class="msg-img-actions">
                <button class="mia-btn" @click="openLightbox(item.mediaUrl, 'bild.jpg')" title="Vergrößern">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 5.5V1h4.5M1 1l5 5M15 10.5V15h-4.5M15 15l-5-5"/></svg>
                  <span>Groß</span>
                </button>
                <button class="mia-btn" @click="downloadImg(item.mediaUrl, 'bild.jpg')" title="Speichern">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1v9M4.5 7l3.5 3.5L11.5 7M1.5 13v.5A1.5 1.5 0 003 15h10a1.5 1.5 0 001.5-1.5V13"/></svg>
                  <span>Laden</span>
                </button>
                <button class="mia-btn mia-btn--del" @click="deleteLocalImg(item)" title="Löschen">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5.5 4V2.5h5V4M3.5 4L4.8 13a1 1 0 001 .8h4.4a1 1 0 001-.8L12.5 4"/></svg>
                  <span>Löschen</span>
                </button>
              </div>
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
            <div v-if="item.sources?.length" class="msg-sources">
              <a v-for="(s, si) in item.sources" :key="s.url"
                :href="s.url" target="_blank" rel="noopener noreferrer"
                class="source-chip"
              >
                <span class="src-n">[{{ si + 1 }}]</span>
                <span class="src-title">{{ s.title }}</span>
                <span class="src-domain">{{ getDomain(s.url) }}</span>
              </a>
            </div>
            <div v-if="item.actions?.length" class="msg-actions">
              <button
                v-for="a in item.actions" :key="a.label"
                class="msg-action-btn"
                :class="[a.primary ? 'primary' : 'secondary', a.pin_tool_id && pinSelectedTools.includes(a.pin_tool_id) ? 'selected' : '']"
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
          :class="item.from === 'me' ? 'msg-bubble--me' : 'msg-bubble--other'"
        >
          <div v-if="item.from !== 'me' || item.content?.startsWith('[KI]')" class="msg-sender"
            :style="{ color: item.sphere === 'social' ? peerTextColor(item.from) : item.content?.startsWith('[KI]') ? 'var(--accent)' : 'var(--accent-bright)' }">
            {{ resolveAuthor(item) }}
          </div>
          <div class="msg-inner"
            :class="item.from === 'me' ? (item.content?.startsWith('[KI]') ? 'msg-inner--ki-out' : 'msg-inner--me') : (item.sphere === 'social' ? 'msg-inner--social' : 'msg-inner--agent')">
            <div v-if="msgExpiredCache.has(item.ts)" class="msg-expired">Inhalt abgelaufen</div>
            <template v-else>
              <!-- Local cached image (encrypted messages) -->
              <div v-if="msgMediaCache.get(item.ts)" class="msg-img-wrap">
                <img :src="msgMediaCache.get(item.ts)" class="msg-media-img" alt=""
                  @click="openLightbox(msgMediaCache.get(item.ts), 'bild.jpg')" />
                <div class="msg-img-actions">
                  <button class="mia-btn" @click="openLightbox(msgMediaCache.get(item.ts), 'bild.jpg')" title="Vergrößern">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 5.5V1h4.5M1 1l5 5M15 10.5V15h-4.5M15 15l-5-5"/></svg>
                    <span>Groß</span>
                  </button>
                  <button class="mia-btn" @click="downloadImg(msgMediaCache.get(item.ts), 'bild.jpg')" title="Speichern">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1v9M4.5 7l3.5 3.5L11.5 7M1.5 13v.5A1.5 1.5 0 003 15h10a1.5 1.5 0 001.5-1.5V13"/></svg>
                    <span>Laden</span>
                  </button>
                  <button class="mia-btn mia-btn--del" @click="deleteLocalImg(item)" title="Löschen">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5.5 4V2.5h5V4M3.5 4L4.8 13a1 1 0 001 .8h4.4a1 1 0 001-.8L12.5 4"/></svg>
                    <span>Löschen</span>
                  </button>
                </div>
              </div>
              <!-- Local blob doc -->
              <div v-if="msgBlobCache.get(item.ts)" class="msg-doc-link">
                <a :href="msgBlobCache.get(item.ts).url" :download="msgBlobCache.get(item.ts).name" class="msg-doc-a">
                  <span class="msg-doc-icon">↓</span>
                  <span class="msg-doc-name">{{ msgBlobCache.get(item.ts).name }}</span>
                </a>
                <button class="msg-doc-del" @click="deleteLocalImg(item)" title="Löschen">×</button>
              </div>
              <!-- Vault-shared attachment -->
              <template v-if="getMsgVaultRef(item.content)">
                <template v-if="VAULT_SHARED_IMAGE.test(getMsgVaultRef(item.content).filename)">
                  <div v-if="vaultBlobUrls.get(`${getMsgVaultRef(item.content).soul_id}:${getMsgVaultRef(item.content).filename}`)" class="msg-img-wrap">
                    <img
                      :src="vaultBlobUrls.get(`${getMsgVaultRef(item.content).soul_id}:${getMsgVaultRef(item.content).filename}`)"
                      class="msg-media-img" alt="" loading="lazy"
                      @click="openLightbox(vaultBlobUrls.get(`${getMsgVaultRef(item.content).soul_id}:${getMsgVaultRef(item.content).filename}`), getMsgVaultRef(item.content).label)"
                    />
                    <div class="msg-img-actions">
                      <button class="mia-btn" @click="openLightbox(vaultBlobUrls.get(`${getMsgVaultRef(item.content).soul_id}:${getMsgVaultRef(item.content).filename}`), getMsgVaultRef(item.content).label)" title="Vergrößern">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 5.5V1h4.5M1 1l5 5M15 10.5V15h-4.5M15 15l-5-5"/></svg>
                        <span>Groß</span>
                      </button>
                      <button class="mia-btn" @click="downloadImg(vaultBlobUrls.get(`${getMsgVaultRef(item.content).soul_id}:${getMsgVaultRef(item.content).filename}`), getMsgVaultRef(item.content).label)" title="Speichern">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1v9M4.5 7l3.5 3.5L11.5 7M1.5 13v.5A1.5 1.5 0 003 15h10a1.5 1.5 0 001.5-1.5V13"/></svg>
                        <span>Laden</span>
                      </button>
                      <button class="mia-btn mia-btn--del" @click="deleteVaultImg(item, getMsgVaultRef(item.content).filename)" title="Löschen">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5.5 4V2.5h5V4M3.5 4L4.8 13a1 1 0 001 .8h4.4a1 1 0 001-.8L12.5 4"/></svg>
                        <span>Löschen</span>
                      </button>
                    </div>
                  </div>
                  <div v-else-if="vaultBlobErrors.has(`${getMsgVaultRef(item.content).soul_id}:${getMsgVaultRef(item.content).filename}`)" class="msg-media-error">Bild nicht ladbar</div>
                  <div v-else class="msg-media-loading">Bild wird geladen…</div>
                </template>
                <div v-else class="msg-doc-link">
                  <template v-if="vaultBlobUrls.get(`${getMsgVaultRef(item.content).soul_id}:${getMsgVaultRef(item.content).filename}`)">
                    <a
                      :href="vaultBlobUrls.get(`${getMsgVaultRef(item.content).soul_id}:${getMsgVaultRef(item.content).filename}`)"
                      :download="getMsgVaultRef(item.content).label"
                      class="msg-doc-a"
                    >
                      <span class="msg-doc-icon">↓</span>
                      <span class="msg-doc-name">{{ getMsgVaultRef(item.content).label }}</span>
                    </a>
                    <button class="msg-doc-del"
                      @click="deleteVaultImg(item, getMsgVaultRef(item.content).filename)"
                      title="Datei löschen">×</button>
                  </template>
                  <span v-else-if="vaultBlobErrors.has(`${getMsgVaultRef(item.content).soul_id}:${getMsgVaultRef(item.content).filename}`)" class="msg-media-error">Datei nicht ladbar</span>
                  <span v-else class="msg-media-loading">Wird geladen…</span>
                </div>
              </template>
            </template>
            <p v-for="(para, j) in paragraphs(cleanVaultRef(cleanMsgContent(item)))" :key="j" v-html="renderText(para)"></p>
          </div>
          <div class="msg-foot">
            <span v-if="item.from === 'me'" class="msg-to"
              :style="item.to === 'agent' ? 'color:var(--accent-bright)' : item.to === 'community' ? 'color:#7099b8' : 'color:#5baa87'">
              → {{ peerLabelForTo(item.to) }}
            </span>
            <time class="msg-time">{{ fmtMsgDate(item.ts) }}</time>
            <span
              v-if="item.from === 'me' && item.to !== 'agent' && item.to !== 'ki' && msgDeliveryStatus.has(item.ts)"
              class="msg-delivery"
              :class="`msg-delivery--${msgDeliveryStatus.get(item.ts)}`"
              :title="deliveryTitle(item.ts)"
            >{{ deliveryIcon(item.ts) }}</span>
          </div>
        </div>

        <!-- Capture card -->
        <div v-else-if="item._type === 'capture'" class="capture-wrap">
          <button class="capture-dismiss" @click="removeMessage(item.id)" aria-label="Schließen">✕</button>
          <AudioCaptureCard v-if="item.captureMode === 'audio'" />
          <MotionCaptureCard v-else :mode="item.captureMode" />
        </div>


      </template>

      <!-- Synthesis typing indicator -->
      <div v-if="isSynthesizing" class="msg-bubble msg-bubble--other briefing-bubble">
        <div class="msg-sender" style="color:#7099b8">Briefing</div>
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

    <!-- ── Dock — Teleport auf mobile heraus aus overflow:hidden Containern
         damit backdrop-filter auf Android Chrome funktioniert ──────── -->
    <Teleport to="#teleports" :disabled="!isMobile">
    <footer ref="dockEl" class="dock" v-show="!(isMobile && props.sidebarOpen)">

      <!-- Soul-Archivar läuft -->
      <Transition name="fade-quick">
        <div v-if="props.growthLocked" class="dock-growth-lock">
          <span class="dock-growth-spinner"></span>
          <span>Soul-Archivar schreibt…</span>
        </div>
      </Transition>

      <!-- Media picker (compact pills) — shown when + is tapped -->
      <Transition name="cmd-strip">
        <div v-show="mediaPickerOpen" class="media-picker">
          <button class="mp-btn" @click="mediaPickerOpen = false; cameraOpen = true" :disabled="visionLoading || props.growthLocked">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="13" height="13">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"/>
            </svg>
            Foto
          </button>
          <button class="mp-btn" @click="mediaPickerOpen = false; onFileIconClick()" :disabled="props.growthLocked">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="13" height="13">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>
            </svg>
            Datei
          </button>
        </div>
      </Transition>

      <!-- @-Command chip strip — toggled via @ button -->
      <Transition name="cmd-strip">
        <div v-show="cmdsOpen" class="cmd-strip">
          <button v-for="c in AT_COMMANDS" :key="c.cmd" class="cmd-chip" @click="insertCommand(c)" :title="c.desc">
            <span class="cmd-at">@</span>{{ c.label }}
          </button>
        </div>
      </Transition>

      <!-- Input row -->
      <div class="dock-main">
        <!-- Open media picker -->
        <button
          class="dock-icon dock-plus"
          :class="{ active: mediaPickerOpen }"
          @click="mediaPickerOpen = !mediaPickerOpen; cmdsOpen = false"
          :disabled="props.growthLocked"
          :title="mediaPickerOpen ? 'Schließen' : 'Foto oder Datei'"
        >
          <svg v-if="!mediaPickerOpen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="dock-icon-svg">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="dock-icon-svg">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
        <!-- @ button toggles command strip -->
        <button class="dock-icon dock-at" :class="{ active: cmdsOpen }" @click="cmdsOpen = !cmdsOpen; mediaPickerOpen = false" :disabled="props.growthLocked" title="@ Befehle">
          <span class="dock-at-sym">@</span>
        </button>
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
        <!-- Voice-Agent Mikrofon: gedrückt halten zum Aufnehmen -->
        <button
          class="dock-icon dock-mic"
          :class="{ recording: voiceRecording }"
          :disabled="props.growthLocked"
          @pointerdown.prevent="startVoiceRecord"
          @pointerup="stopVoiceRecord"
          @pointercancel="stopVoiceRecord"
          @contextmenu.prevent
          title="Gedrückt halten → sprechen → loslassen"
          aria-label="Mit Agent sprechen"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="dock-icon-svg">
            <rect x="9" y="2" width="6" height="12" rx="3" stroke-linecap="round"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 10a7 7 0 0 0 14 0M12 19v3M9 22h6"/>
          </svg>
        </button>

        <!-- TTS Stop-Button — nur sichtbar wenn Audio läuft -->
        <Transition name="tts-stop">
          <button
            v-if="ttsPlaying"
            class="dock-icon tts-stop-btn"
            @click="stopTts"
            title="Audio stoppen"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" class="dock-icon-svg">
              <rect x="5" y="5" width="14" height="14" rx="2"/>
            </svg>
          </button>
        </Transition>
      </div>

      <!-- Speicher Panel -->
      <Transition name="archivar-panel-fade">
        <div v-if="showArchivPanel" class="archivar-panel">
          <div v-if="archivPanelLoading" class="archivar-panel-loading">Lade…</div>
          <template v-else>
            <div class="archivar-panel-row">
              <span class="archivar-panel-key">Fakten</span>
              <span class="archivar-panel-val" :class="archivFacts > 0 ? 'archivar-panel-ok' : ''">
                {{ archivFacts > 0 ? archivFacts + ' gespeichert' : 'noch keine' }}
              </span>
            </div>
            <div class="archivar-panel-row">
              <span class="archivar-panel-key">Letztes Aufräumen</span>
              <span class="archivar-panel-val">{{ archivUpdated || '—' }}</span>
            </div>
            <div class="archivar-panel-row">
              <span class="archivar-panel-key">Größe</span>
              <span class="archivar-panel-val">{{ archivSizeKb }}</span>
            </div>
            <div class="archivar-panel-row">
              <span class="archivar-panel-key">Chaos</span>
              <span class="archivar-panel-val archivar-chaos-wrap">
                <span class="archivar-chaos-bar">
                  <span class="archivar-chaos-fill" :style="{ width: archivChaos.pct + '%', background: archivChaos.color }" />
                </span>
                <span :style="{ color: archivChaos.color }">{{ archivChaos.label }}</span>
              </span>
            </div>
            <button class="archivar-panel-btn" :disabled="archivCrystallizeBusy" @click="chatCrystallize">
              <span v-if="archivCrystallizeBusy" class="dots-running">Räumt auf</span><template v-else>Jetzt aufräumen</template>
            </button>
            <div v-if="archivPanelMsg" class="archivar-panel-msg" :class="archivPanelMsg.ok ? 'ok' : 'err'">
              {{ archivPanelMsg.text }}
            </div>
          </template>
        </div>
      </Transition>

      <!-- Mode bar — always below input -->
      <div class="dock-mode-bar">
        <button class="archivar-toggle" :class="{ active: autonomousKi }" @click="autonomousKi = !autonomousKi">
          <span class="archivar-dot"></span>KI-Auto
        </button>
        <button class="archivar-toggle" :class="{ active: showArchivPanel }" @click="toggleArchivPanel">
          <span class="archivar-dot"></span>Speicher<span v-if="archivFacts > 0" class="archivar-facts-count">{{ archivFacts }}</span>
        </button>
        <span class="mode-sep"></span>
        <button class="model-btn" @click="cycleModel">{{ MODELS.find(m => m.id === selectedModel)?.label }}</button>
        <span v-if="isLoading || isSavingAgent || isRefreshing" class="mode-activity"><span></span><span></span><span></span></span>
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

      <!-- KI-Disclaimer -->
      <p class="dock-disclaimer">KI kann Fehler machen — überprüfe wichtige Informationen.</p>

      <!-- Session shared files banner -->
      <div v-if="sessionSharedFiles.length" class="shared-files-banner">
        <span class="sfb-info">{{ sessionSharedFiles.length }} Datei{{ sessionSharedFiles.length > 1 ? 'en' : '' }} in vault/shared — auf Gerät sichern falls gewünscht</span>
        <button class="sfb-delete" @click="deleteAllSessionFiles">Alle löschen</button>
      </div>

    </footer>
    </Teleport>

    <!-- Image Lightbox -->
    <Teleport to="#teleports">
      <div v-if="lightboxImg" class="lightbox-overlay" @click.self="closeLightbox">
        <button class="lightbox-close" @click="closeLightbox" aria-label="Schließen">×</button>
        <img :src="lightboxImg.url" class="lightbox-img" alt="" />
        <button class="lightbox-download" @click="downloadLightboxImg" aria-label="Herunterladen">↓ Speichern</button>
      </div>
    </Teleport>

    <!-- Camera Recorder Overlay -->
    <CameraRecorder
      :is-open="cameraOpen"
      @captured="handleCameraCapture"
      @cancel="cameraOpen = false"
    />
    <!-- Hidden file input — must be in DOM for mobile to work -->
    <input ref="fileInputEl" type="file" style="display:none;position:fixed" @change="onFileInputChange" />

  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useClaude } from '~/composables/useClaude.js'
import { useMind } from '~/composables/useMind.js'
import { useMcpTools } from '~/composables/useMcpTools.js'
import { useSession } from '~/composables/useSession.js'
import { useVault } from '~/composables/useVault.js'
import { useYouTube } from '~/composables/useYouTube.js'
import { useSpotify } from '~/composables/useSpotify.js'
import { useSoul } from '~/composables/useSoul.js'
import { useVaultSession } from '~/composables/useVaultSession.js'
import CameraRecorder      from '~/components/CameraRecorder.vue'
import AudioCaptureCard    from '~/components/AudioCaptureCard.vue'
import MotionCaptureCard   from '~/components/MotionCaptureCard.vue'

// ── Props / Emits ──────────────────────────────────────────────────
const props = defineProps({
  soulContent:  { type: String,  default: '' },
  soulCert:     { type: String,  default: '' },
  role:         { type: String,  default: 'soul' },
  growthLocked: { type: Boolean, default: false },
  filter:       { type: String,  default: 'all' },
  sidebarOpen:  { type: Boolean, default: false },
})
const emit = defineEmits(['cert-error', 'session-end', 'update:filter'])

// ── Composables ────────────────────────────────────────────────────
const { chat, isLoading, error, certError } = useClaude()
const { mindContent, loadMind } = useMind()
const { mcpTools, loadMcpTools } = useMcpTools()
const {
  messages, conversationSummary,
  addMessage, removeMessage, updateLastMessage, setLastMessageMeta, setMessageMetaById,
  toApiMessages, getMessagesToSummarize, pruneWithSummary,
} = useSession()
const { contextText, profileBase64, fileManifest, allFiles, readImageFile, readImageAsBase64, isConnected: vaultConnected, writeSoulMd } = useVault()
const { vaultKey: _vaultKey } = useVaultSession()
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

function cycleModel() {
  const idx = MODELS.findIndex(m => m.id === selectedModel.value)
  selectedModel.value = MODELS[(idx + 1) % MODELS.length].id
}

// ── Archivar toggle ─────────────────────────────────────────────────
const archivEnabled = ref(
  typeof window !== 'undefined' ? localStorage.getItem('sys_archivar_enabled') !== 'false' : true
)
watch(archivEnabled, v => { if (typeof window !== 'undefined') localStorage.setItem('sys_archivar_enabled', v) })

// ── Autonomer Soul-KI Modus ──────────────────────────────────────────
const autonomousKi = ref(
  typeof window !== 'undefined' ? localStorage.getItem('sys_autonomous_ki') === 'true' : false
)
let _herzHeartbeatTimer = null

function startHerzHeartbeat() {
  if (_herzHeartbeatTimer) return
  _herzHeartbeatTimer = setInterval(() => {
    if (!autonomousKi.value || !props.soulCert) return
    fetch('/api/soul/herz/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${props.soulCert}` },
      body: JSON.stringify({}),
    }).catch(() => {})
  }, 5 * 60 * 1000)
}

function stopHerzHeartbeat() {
  if (_herzHeartbeatTimer) { clearInterval(_herzHeartbeatTimer); _herzHeartbeatTimer = null }
}

watch(autonomousKi, async (v) => {
  if (typeof window !== 'undefined') localStorage.setItem('sys_autonomous_ki', String(v))
  if (!props.soulCert) return
  try {
    await fetch('/api/soul/herz/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${props.soulCert}` },
      body: JSON.stringify({ active: v }),
    })
    if (v) startHerzHeartbeat()
    else stopHerzHeartbeat()
  } catch { /* silent */ }
})

// ── Archivar LONGMEM Panel ──────────────────────────────────────────
const showArchivPanel       = ref(false)
const archivPanelLoading    = ref(false)
const archivFacts           = ref(0)
const archivUpdated         = ref('')
const archivBootstrapPending = ref(false)
const archivSizeBytes       = ref(0)
const archivLogEntries      = ref(0)
const archivDaysSince       = ref(0)

const archivSizeKb = computed(() => {
  const kb = archivSizeBytes.value / 1024
  return kb < 1 ? archivSizeBytes.value + ' B' : kb.toFixed(1) + ' KB'
})

const archivChaos = computed(() => {
  const e = archivLogEntries.value, d = archivDaysSince.value
  const pct = Math.min(100, Math.round(e / 15 * 70 + d / 30 * 30))
  if (e <= 7 && d <= 14) return { pct: Math.max(8, pct), color: '#22c55e', label: 'ruhig' }
  if (e <= 12 || d <= 21) return { pct: Math.max(40, pct), color: '#f59e0b', label: 'wächst' }
  return { pct: 100, color: '#ef4444', label: 'chaotisch' }
})
const archivCrystallizeBusy = ref(false)
const archivPanelMsg        = ref(null)

async function loadArchivPanel() {
  archivPanelLoading.value = true
  try {
    const res = await fetch('/api/soul/longmem-status', {
      headers: { Authorization: `Bearer ${props.soulCert}` }
    }).then(r => r.json()).catch(() => null)
    archivFacts.value           = res?.facts ?? 0
    archivUpdated.value         = res?.updated ?? ''
    archivBootstrapPending.value = res?.bootstrap_pending ?? false
    archivSizeBytes.value       = res?.size_bytes ?? 0
    archivLogEntries.value      = res?.log_entries ?? 0
    archivDaysSince.value       = res?.days_since_cleanup ?? 0
  } finally {
    archivPanelLoading.value = false
  }
}

async function toggleArchivPanel() {
  showArchivPanel.value = !showArchivPanel.value
  if (showArchivPanel.value) loadArchivPanel()
}

async function chatCrystallize() {
  archivCrystallizeBusy.value = true
  archivPanelMsg.value = null
  try {
    const res = await fetch('/api/soul/herz/crystallize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${props.soulCert}` },
    })
    const data = await res.json()
    if (data?.ok) {
      setTimeout(async () => {
        await syncLongmemFromServer()
        loadArchivPanel()
        archivCrystallizeBusy.value = false
        archivPanelMsg.value = { ok: true, text: 'Aufräumen abgeschlossen ✓' }
        setTimeout(() => { archivPanelMsg.value = null }, 5000)
      }, 18000)
    } else {
      archivCrystallizeBusy.value = false
      archivPanelMsg.value = { ok: false, text: data?.error || 'Fehler' }
      setTimeout(() => { archivPanelMsg.value = null }, 8000)
    }
  } catch {
    archivCrystallizeBusy.value = false
    archivPanelMsg.value = { ok: false, text: 'Netzwerkfehler' }
    setTimeout(() => { archivPanelMsg.value = null }, 8000)
  }
}

// ── Config status (Preflight-Checks) ───────────────────────────────
const configStatus = ref(null)

async function loadConfigStatus() {
  try {
    const r = await fetch('/api/get-config', { headers: { Authorization: `Bearer ${props.soulCert}` } })
    if (r.ok) configStatus.value = await r.json()
  } catch {}
}

function preflightCheck(type) {
  const s = configStatus.value
  if (!s) return null // noch nicht geladen → API-Fehler übernimmt

  if (type === 'web-search' && !s.brave_key_set) {
    return [
      '**Brave Search API-Key fehlt**',
      '',
      'Damit die KI-Websuche funktioniert:',
      '1. brave.com/search/api → kostenloser Key (2.000 Suchen/Monat)',
      '2. Einstellungen → API-Keys → Brave Search eintragen',
    ].join('\n')
  }

  if (type === 'create-media' && !s.wavespeed_key_set) {
    return [
      '**WaveSpeed API-Key fehlt**',
      '',
      'Damit Bilder generiert werden können:',
      '1. wavespeed.ai → Account erstellen → API-Key kopieren',
      '2. Einstellungen → API-Keys → WaveSpeed Key eintragen',
    ].join('\n')
  }

  if (type === 'create-agent' && !s.elevenlabs_key_set) {
    return [
      '**ElevenLabs API-Key fehlt**',
      '',
      'Damit dein Sprach-Agent erstellt werden kann:',
      '1. elevenlabs.io → Account erstellen → API-Key kopieren',
      '2. Einstellungen → API-Keys → ElevenLabs Key eintragen',
    ].join('\n')
  }

  if (type === 'voice-stt' && !s.elevenlabs_key_set) {
    return [
      '**ElevenLabs API-Key fehlt**',
      '',
      '1. elevenlabs.io → API-Key kopieren',
      '2. Einstellungen → API-Keys → ElevenLabs Key eintragen',
    ].join('\n')
  }

  if (type === 'voice-agent') {
    if (!s.elevenlabs_key_set) {
      return [
        '**ElevenLabs API-Key fehlt**',
        '',
        'Richte zuerst deinen Sprach-Agent ein:',
        '1. elevenlabs.io → Account erstellen → API-Key kopieren',
        '2. Einstellungen → API-Keys → ElevenLabs Key eintragen',
        '3. `@create-agent` eingeben um deinen Agent zu erstellen',
      ].join('\n')
    }
    const hasAgent = /elevenlabs_agent_id:\s*\S+/.test(props.soulContent || '') ||
                     /elevenlabs_agent_id:\s*\S+/.test(soulContentAgent.value || '') ||
                     !!localStorage.getItem('sys_elevenlabs_agent_id')
    if (!hasAgent) {
      return [
        '**Kein Agent vorhanden**',
        '',
        'Erstelle zuerst deinen persönlichen Sprach-Agent mit `@create-agent`.',
      ].join('\n')
    }
  }

  return null
}

// ── Voice-Agent Aufnahme ───────────────────────────────────────────
const voiceRecording = ref(false)
let _vaStream   = null
let _vaRecorder = null
let _vaChunks   = []
let _vaMsgId    = null   // user-bubble ID während Aufnahme/Transkription

async function startVoiceRecord() {
  if (voiceRecording.value) return
  const err = preflightCheck('voice-stt')
  if (err) { addMessage('assistant', err); await scrollToBottom(); return }
  _vaChunks = []

  // getUserMedia als erstes await — kein async-Code davor damit iOS Gesture-Kontext erhalten bleibt
  let stream
  if (!navigator.mediaDevices?.getUserMedia) {
    addMessage('assistant', 'Mikrofon-Zugriff nicht verfügbar — HTTPS oder Browser-Unterstützung fehlt.')
    await scrollToBottom()
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  } catch (e) {
    const msg = e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError'
      ? 'Mikrofon-Zugriff verweigert — bitte in den Browser-Einstellungen erlauben.'
      : e?.name === 'NotFoundError'
        ? 'Kein Mikrofon gefunden — bitte ein Audiogerät anschließen.'
        : `Mikrofon nicht verfügbar (${e?.name || 'unbekannt'}).`
    addMessage('assistant', msg)
    await scrollToBottom()
    return
  }

  _vaStream = stream

  // AudioContext für Auto-Play entsperren — NACH getUserMedia, kein await nötig
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (AC) { const ctx = new AC(); const buf = ctx.createBuffer(1,1,22050); const src = ctx.createBufferSource(); src.buffer=buf; src.connect(ctx.destination); src.start(0); ctx.close() }
  } catch {}

  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
               MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' :
               MediaRecorder.isTypeSupported('audio/mp4')  ? 'audio/mp4'  : ''
  _vaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {})
  _vaRecorder.ondataavailable = e => { if (e.data.size > 0) _vaChunks.push(e.data) }
  _vaRecorder.start(100)
  voiceRecording.value = true
  _vaMsgId = addMessage('user', '', { streaming: true }).id
  await scrollToBottom()
}

function stopTts() {
  if (ttsAudio.value) {
    ttsAudio.value.pause()
    ttsAudio.value = null
    ttsPlaying.value = false
  }
}

async function stopVoiceRecord() {
  if (!voiceRecording.value || !_vaRecorder) return
  return new Promise(resolve => {
    _vaRecorder.onstop = async () => {
      const mime = _vaRecorder.mimeType || 'audio/webm'
      const blob = new Blob(_vaChunks, { type: mime })
      voiceRecording.value = false
      _vaChunks = []
      _vaStream?.getTracks().forEach(t => t.stop())
      resolve()

      if (blob.size < 2000) {
        if (_vaMsgId) { removeMessage(_vaMsgId); _vaMsgId = null }
        return
      }

      // STT: Audio → Transkript via ElevenLabs
      let transcript = ''
      try {
        const sttRes = await fetch('/api/elevenlabs-stt', {
          method: 'POST',
          headers: { 'Content-Type': mime, Authorization: `Bearer ${props.soulCert}` },
          body: blob,
        })
        if (sttRes.ok) transcript = ((await sttRes.json()).text || '').trim()
      } catch {}

      if (!transcript) {
        if (_vaMsgId) {
          setMessageMetaById(_vaMsgId, 'text', '_(Sprache nicht erkannt)_')
          setMessageMetaById(_vaMsgId, 'streaming', false)
        }
        _vaMsgId = null
        return
      }

      // Transkript in User-Bubble eintragen
      if (_vaMsgId) {
        setMessageMetaById(_vaMsgId, 'text', transcript)
        setMessageMetaById(_vaMsgId, 'streaming', false)
      }
      _vaMsgId = null

      // Transkript an KI senden — kein zweites addMessage('user'), Bubble schon da
      await scrollToBottom()
      await maybeCompressHistory()
      addMessage('assistant', '', { streaming: true })
      await scrollToBottom()

      const recentPeer = displayMessages.value
        .filter(m => m.sphere === 'social' && m.ts).slice(-8)
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
        externalTools: mcpTools.value,
        voiceMode: true,
        onDelta: (delta, fullText) => { updateLastMessage(fullText); scrollToBottom() },
      })

      setLastMessageMeta('streaming', false)
      if (!chatResult) updateLastMessage(error.value ? `_(Fehler: ${error.value})_` : '…')
      await scrollToBottom()

      // Auto-TTS: Antwort vorlesen mit geklonter Stimme wenn vorhanden
      const responseText = messages.value.at(-1)?.text || ''
      if (responseText) {
        try {
          const ttsVoiceId = (soulContentAgent.value || props.soulContent || '').match(/elevenlabs_voice_id:\s*(\S+)/)?.[1]
            || localStorage.getItem('sys_elevenlabs_voice_id')
            || undefined
          const ttsBody = { text: responseText }
          if (ttsVoiceId) ttsBody.voiceId = ttsVoiceId
          const ttsRes = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${props.soulCert}` },
            body: JSON.stringify(ttsBody),
          })
          if (ttsRes.ok) {
            const url = URL.createObjectURL(await ttsRes.blob())
            const audio = new Audio(url)
            ttsAudio.value = audio
            ttsPlaying.value = true
            audio.onended = () => { URL.revokeObjectURL(url); ttsAudio.value = null; ttsPlaying.value = false }
            audio.play().catch(() => { ttsAudio.value = null; ttsPlaying.value = false })
          }
        } catch {}
      }
    }
    _vaRecorder.stop()
  })
}

// ── Media drawer ────────────────────────────────────────────────────
const mediaOpen  = ref(false)
const ttsAudio   = ref(null)
const ttsPlaying = ref(false)

// ── @-Command strip ─────────────────────────────────────────────────
const cmdsOpen = ref(false)

const AT_COMMANDS = [
  { cmd: '@suche ',       label: 'suche',        desc: 'KI-Websuche',                     direct: false, hint: 'Was ist …'                              },
  { cmd: '@create-media ',label: 'create-media', desc: 'KI-Bild generieren',              direct: false, hint: 'Beschreibe das Bild …'                  },
  { cmd: '@audio',        label: 'audio',        desc: 'Stimme aufnehmen',                direct: true                                                  },
  { cmd: '@gesicht',      label: 'gesicht',      desc: 'Gesicht aufnehmen',               direct: true                                                  },
  { cmd: '@bewegung',     label: 'bewegung',     desc: 'Bewegung aufnehmen',              direct: true                                                  },
  { cmd: '@create-agent', label: 'create-agent', desc: 'ElevenLabs Agent erstellen',      direct: true                                                  },
  { cmd: '@sprechen',     label: 'sprechen',     desc: 'Sprachaufnahme starten',          direct: true                                                  },
  { cmd: '@diagnose',     label: 'diagnose',     desc: 'Fehlerlog anzeigen',              direct: true                                                  },
  { cmd: '@contact ',     label: 'contact',      desc: 'Peer hinzufügen',                 direct: false, hint: '<soul_id> <name> https://peer.domain'   },
  { cmd: '@pin ',         label: 'pin',          desc: 'Soul pinnen / Pinata JWT',        direct: false, hint: 'free | paid 0.001 0xWallet | publish Name | Beschreibung | Tags | status' },
  { cmd: '@abbruch',      label: 'abbruch',      desc: 'Aktion abbrechen & zurücksetzen', direct: true                                                  },
  { cmd: '@session-end',  label: 'session-end',  desc: 'Session jetzt analysieren & eintragen', direct: true                                              },
  { cmd: '@alle ',        label: 'alle',         desc: 'Nachricht an alle Peers',         direct: false, hint: 'Nachricht …'                            },
  { cmd: '@peer ',        label: 'peer',         desc: 'Direkt an Peer (explizit)',       direct: false, hint: 'Name Nachricht …'                       },
  { cmd: '@agent ',       label: 'agent',        desc: 'Agent Sandbox',                   direct: false, hint: 'Frage an den Agent …'                  },
]

function insertCommand(cmd) {
  cmdsOpen.value = false
  if (cmd.direct) {
    draft.value = cmd.cmd
    handleSend()
    return
  }
  // Non-direct: insert full placeholder, then select the hint part so typing replaces it
  const full = cmd.hint ? cmd.cmd + cmd.hint : cmd.cmd
  draft.value = full
  nextTick(() => {
    const el = textareaEl.value
    if (!el) return
    el.focus()
    if (cmd.hint) el.setSelectionRange(cmd.cmd.length, full.length)
  })
}

// ── Mobile composer FAB ─────────────────────────────────────────────
const mobileComposerOpen = ref(false)
const dockEl             = ref(null)
const dockHeight         = ref(80)
// isMobile: Teleport dock+FAB aus overflow:hidden-Containern heraus
// damit backdrop-filter auf Android Chrome funktioniert
const isMobile = ref(typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches)
let _mqMobile = null
const _onMqMobile = (e) => { isMobile.value = e.matches }

// ── Filter strip (mobile dock toggle) ───────────────────────────────
const filterOpen = ref(false)
function setFilter(val) {
  emit('update:filter', val)
  filterOpen.value = false
}

// ── Dynamic stream padding (tracks real dock height) ─────────────────
const streamPadStyle = computed(() => {
  if (!isMobile.value) return {}
  return { paddingBottom: `calc(${dockHeight.value}px + max(12px, env(safe-area-inset-bottom, 0px)) + 8px)` }
})
let _dockRO = null

function toggleMobileComposer() {
  mobileComposerOpen.value = !mobileComposerOpen.value
  if (mobileComposerOpen.value) {
    nextTick(() => { if (dockEl.value) dockHeight.value = dockEl.value.offsetHeight })
  }
}

function closeMobileComposer() {
  mobileComposerOpen.value = false
}

// ── Pin tool multi-select state ────────────────────────────────────
const pinSelectedTools = ref([])

// ── Global abort — shared across all async handlers ────────────────
const currentAbort   = ref(null)   // AbortController | null
const currentJobName = ref('')     // shown in @abbruch confirmation

function startJob(name) {
  currentAbort.value?.abort()
  const ac = new AbortController()
  currentAbort.value = ac
  currentJobName.value = name
  return ac.signal
}
function endJob() {
  currentAbort.value = null
  currentJobName.value = ''
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
  return 'Nachricht schreiben…'
})

// ── Messaging / Social sphere state ───────────────────────────────
const { soulContent: soulContentAgent, soulMeta, updateContent, pushToServer, fetchFromServer, syncStatus, serverContent, syncLongmemFromServer } = useSoul()
const isSavingAgent      = ref(false)
const isRefreshing       = ref(false)
const isSynthesizing     = ref(false)
const localSynthesisMsgs = ref([])
const msgRecipient       = ref('ki')   // 'ki' | 'peer' | 'agent' | 'community'
const msgMedia        = ref(null)    // { base64, mime, name? } — attached image in messaging mode
const msgDoc          = ref(null)    // { file, name } — attached doc in messaging mode
const msgMediaCache   = reactive(new Map()) // ts → dataUrl — session-only image display
const msgBlobCache    = reactive(new Map()) // ts → { url, name } — session blob URLs for docs
const lightboxImg     = ref(null)           // { url, name } | null — fullscreen image viewer
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
const peerPollPending = computed(() =>
  peerPollErrors.value.filter(e => e.error?.includes('peer_not_trusted'))
)
const peerPollUnreachable = computed(() =>
  peerPollErrors.value.filter(e => !e.error?.includes('peer_not_trusted'))
)
function peerLabel(soulId) {
  return peerIds.value.find(p => p.soul_id === soulId)?.label || soulId.slice(0, 8) + '…'
}

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
  return [...socialMsgs.value, ...agentMsgsNew.value, ...agentMsgsOld.value]
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

const filteredStream = computed(() => {
  const s = unifiedStream.value
  // 'all': AI-Chat + Social-Bubbles — Agent-Block-Einträge nur im 'agents'-Tab
  if (props.filter === 'all')    return s.filter(i => i._type === 'ai' || (i._type === 'bubble' && i.sphere !== 'agent' && i.sphere !== 'agent_reply'))
  if (props.filter === 'soul')   return s.filter(i => i._type === 'ai')
  if (props.filter === 'peers')  return s.filter(i => i._type === 'bubble' && i.sphere !== 'agent' && i.sphere !== 'agent_reply')
  if (props.filter === 'agents') return s.filter(i => i._type === 'bubble' && (i.sphere === 'agent' || i.sphere === 'agent_reply'))
  return s
})

const _PEER_COLORS = ['#6db89a','#9c7cd6','#d4a46a','#6aadd4','#d46a9c','#94cb6d']
function peerTextColor(id) {
  let n = 0
  for (let i = 0; i < (id || '').length; i++) n = (n * 31 + id.charCodeAt(i)) & 0xffff
  return _PEER_COLORS[n % _PEER_COLORS.length]
}

function resolveAuthor(msg) {
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


function downloadImg(url, name) {
  const a = document.createElement('a')
  a.href = url
  a.download = name || 'bild.jpg'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function deleteLocalImg(item) {
  // Clear media cache entries
  if (item.ts) msgMediaCache.delete(item.ts)
  // Clear vault blob URL/error so the bubble stops rendering the image
  const ref = getMsgVaultRef(item.content)
  if (ref) {
    const key = `${ref.soul_id}:${ref.filename}`
    const burl = vaultBlobUrls.get(key)
    if (burl) URL.revokeObjectURL(burl)
    vaultBlobUrls.delete(key)
    vaultBlobErrors.delete(key)
  }
  // Remove message from correct store
  if (item._type === 'bubble') {
    peerSocialMsgs.value = peerSocialMsgs.value.filter(m => m.ts !== item.ts)
  } else if (item.id) {
    removeMessage(item.id)
  }
}

async function deleteVaultImg(item, filename) {
  if (item.from === 'me') await deleteSharedFile(filename)
  deleteLocalImg(item)
}

function openLightbox(url, name) {
  lightboxImg.value = { url, name: name || 'bild.jpg' }
}
function closeLightbox() {
  lightboxImg.value = null
}
function downloadLightboxImg() {
  if (!lightboxImg.value) return
  const a = document.createElement('a')
  a.href = lightboxImg.value.url
  a.download = lightboxImg.value.name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
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
  if (!archivEnabled.value) return
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
        system: `Lies den Chat-Verlauf und liefere genau 1–2 Sätze auf Deutsch: einen konkreten Fakt, eine präzise Zusammenfassung oder einen nützlichen Impuls zum Thema. Kein "Ich", keine Anrede, kein Meta-Kommentar, keine Einleitung. Nur Inhalt. Optional: ein Google-Suchlink am Ende — [Begriff](https://www.google.com/search?q=Begriff). ABSOLUTES VERBOT: Keine Warnung, kein Disclaimer, keine Bewertung ob etwas real oder fiktiv ist, keine Einschätzung zu Transaktionen oder Protokollen. Nur Fakt oder Impuls.`,
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
const cameraOpen       = ref(false)
const mediaPickerOpen  = ref(false)
const visionLoading    = ref(false)
const fileInputEl      = ref(null)

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
  if (scrollEl.value) scrollEl.value.scrollLeft = 0
  if (chatEnd.value) {
    chatEnd.value.scrollIntoView({ behavior: 'smooth', block: 'end' })
  } else if (scrollEl.value) {
    scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  }
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

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
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
  // Web search (natural language → KI-Suche)
  const webMatch = t.match(/^such[e]?\s+(?:(?:im\s+)?(?:netz|web|internet|google)\s+(?:nach\s+)?|nach\s+)(.+)/i)
  if (webMatch) return { type: 'web-search', query: webMatch[1].trim() }
  // Capture intents — checked before generic @name match
  if (/^@audio\b|^@stimme\b/i.test(t)) return { type: 'capture-audio' }
  if (/^@face\b|^@gesicht\b/i.test(t)) return { type: 'capture-face' }
  if (/^@body\b|^@bewegung\b/i.test(t)) return { type: 'capture-body' }
  // @create-agent → ElevenLabs Voice Clone + Agent erstellen
  if (/^@create-agent\b/i.test(t)) return { type: 'create-agent' }
  // @sprechen → Voice-Agent Aufnahme starten
  if (/^@sprechen\b/i.test(t)) return { type: 'voice-agent' }
  // @diagnose → OpenResty Fehlerlog anzeigen
  if (/^@diagnose\b/i.test(t)) return { type: 'diagnose' }
  // @contact → Peer im Agent-Marketplace hinzufügen
  const contactMatch = t.match(/^@contact\b\s*(.*)/is)
  if (contactMatch) return { type: 'contact', query: contactMatch[1].trim() }
  // @pin → Pinata JWT hinterlegen oder Soul auf IPFS registrieren
  const pinMatch = t.match(/^@pin\b\s*(.*)/is)
  if (pinMatch) return { type: 'pin', query: pinMatch[1].trim() }
  // @abbruch → laufende Chat-Aktion abbrechen
  if (/^@abbruch\b/i.test(t)) return { type: 'abbruch' }
  if (/^@session-end\b/i.test(t)) return { type: 'session-end' }
  // @create-media → KI-Bildgenerierung via WaveSpeed
  const mediaMatch = t.match(/^@create-media\b\s*(.*)/is)
  if (mediaMatch) return { type: 'create-media', query: mediaMatch[1].trim() }
  // @suche → KI-Websuche
  const sucheMatch = t.match(/^@suche\b\s*(.*)/is)
  if (sucheMatch) return { type: 'web-search', query: sucheMatch[1].trim() }
  // @all/@alle → community (send to everyone)
  const allMention = t.match(/^@al(?:l|le)\b\s*(.*)/is)
  if (allMention) return { type: 'community', query: (allMention[1].trim() || t) }
  // @agent → Agent Sandbox
  const agentMention = t.match(/^@agent\b\s*(.*)/is)
  if (agentMention) return { type: 'agent', query: (agentMention[1].trim() || t) }
  // @peer Name → explizites Peer-Routing, geht NIE an die KI
  const peerPrefixMatch = t.match(/^@peer\s+(\w+)\b\s*(.*)/is)
  if (peerPrefixMatch) {
    const name = peerPrefixMatch[1].toLowerCase()
    const msg  = peerPrefixMatch[2].trim() || t
    const exact = peerIds.value.find(p => p.label?.toLowerCase() === name)
    if (exact) return { type: 'peer-specific', soul_id: exact.soul_id, query: msg }
    const prefix = peerIds.value.filter(p => p.label?.toLowerCase().startsWith(name))
    if (prefix.length === 1) return { type: 'peer-specific', soul_id: prefix[0].soul_id, query: msg }
    if (prefix.length > 1)   return { type: 'ambiguous', candidates: prefix, name: peerPrefixMatch[1] }
    return { type: 'peer-not-found', name: peerPrefixMatch[1] }
  }
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

// ── KI-Websuche ────────────────────────────────────────────────────
async function handleWebSearch(query) {
  const safe = query.replace(/<[^>]*>/g, '').trim().slice(0, 300)
  const preErr = preflightCheck('web-search')
  if (preErr) { addMessage('user', `@suche ${safe}`); addMessage('assistant', preErr); return }
  addMessage('user', `@suche ${safe}`)
  const statusMsg = addMessage('assistant', 'Suche läuft…', { streaming: true })
  await scrollToBottom()

  // ── Schritt 1: Brave Search ──────────────────────────────────────
  let results = []
  try {
    const sRes = await fetch('/api/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${props.soulCert}` },
      body: JSON.stringify({ query: safe }),
    })
    const sData = await sRes.json().catch(() => ({}))
    if (!sRes.ok) {
      const msg = sData.message === 'brave_key_missing'
        ? 'Brave Search API-Key fehlt — bitte in Einstellungen hinterlegen (brave.com/search/api · Free: 2000/Monat).'
        : `Suchfehler: ${sData.message || sData.error || 'Unbekannt'}`
      setMessageMetaById(statusMsg.id, 'text', msg)
      setMessageMetaById(statusMsg.id, 'streaming', false)
      return
    }
    results = sData.results || []
  } catch (e) {
    setMessageMetaById(statusMsg.id, 'text', `Netzwerkfehler: ${e.message}`)
    setMessageMetaById(statusMsg.id, 'streaming', false)
    return
  }

  if (!results.length) {
    setMessageMetaById(statusMsg.id, 'text', 'Keine Suchergebnisse gefunden.')
    setMessageMetaById(statusMsg.id, 'streaming', false)
    return
  }

  // ── Schritt 2: Claude KI-Zusammenfassung (streaming) ─────────────
  const resultCtx = results.map((r, i) =>
    `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.description}`
  ).join('\n\n')

  const searchSystem = mindContent.value
    ? (() => {
        const m = mindContent.value.match(/^## Websearch\s*\n([\s\S]*?)(?=\n## |$)/m)
        return m?.[1]?.trim() || null
      })()
    : null

  const systemPrompt = searchSystem ||
    'Du bist ein präziser Web-Suchassistent. Beantworte die Frage auf Basis der Suchergebnisse auf Deutsch. Zitiere Quellen als [1], [2] etc.'

  const userMsg = `Suchergebnisse:\n\n${resultCtx}\n\nFrage: ${safe}`

  setMessageMetaById(statusMsg.id, 'text', '')

  try {
    const chatRes = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${props.soulCert}` },
      body: JSON.stringify({
        model: selectedModel.value,
        max_tokens: 1024,
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })

    if (!chatRes.ok) {
      setMessageMetaById(statusMsg.id, 'text', `KI-Fehler ${chatRes.status}`)
      setMessageMetaById(statusMsg.id, 'streaming', false)
      return
    }

    const reader  = chatRes.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let full = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') break
        try {
          const p = JSON.parse(data)
          if (p?.type === 'content_block_delta' && p.delta?.type === 'text_delta') {
            full += p.delta.text
            setMessageMetaById(statusMsg.id, 'text', full)
            scrollToBottom()
          }
        } catch { /* ignore parse errors */ }
      }
    }
  } catch (e) {
    setMessageMetaById(statusMsg.id, 'text', `Streaming-Fehler: ${e.message}`)
  }

  setMessageMetaById(statusMsg.id, 'streaming', false)
  setMessageMetaById(statusMsg.id, 'sources', results)
  await scrollToBottom()
}

// ── @create-agent ─────────────────────────────────────────────────
async function handleCreateAgent() {
  const preErr = preflightCheck('create-agent')
  if (preErr) { addMessage('user', '@create-agent'); addMessage('assistant', preErr); return }
  const signal = startJob('@create-agent')
  addMessage('user', '@create-agent')
  const statusMsg = addMessage('assistant', 'ElevenLabs Agent wird erstellt…', { streaming: true })
  await scrollToBottom()

  try {
    // Audio aus Server-Vault holen — Server entschlüsselt via vault_auth, Browser als Fallback
    let audioBase64 = null
    let audioFilename = null
    try {
      const listRes = await fetch('/api/vault/audio', {
        headers: { Authorization: `Bearer ${props.soulCert}` },
      })
      if (listRes.ok) {
        const listData = await listRes.json()
        const files = Array.isArray(listData.files) ? listData.files : []
        const target = files.find(f => f.active) || files[0]
        if (target?.name) {
          const fileRes = await fetch(`/api/vault/audio/${encodeURIComponent(target.name)}`, {
            headers: { Authorization: `Bearer ${props.soulCert}` },
          })
          if (fileRes.ok) {
            const buf = await fileRes.arrayBuffer()
            let bytes = new Uint8Array(buf)
            // Server konnte nicht entschlüsseln → Browser-seitig nachhelfen
            if (bytes[0] === 0x53 && bytes[1] === 0x59 && bytes[2] === 0x53 && bytes[3] === 0x01) {
              const key = _vaultKey.value
              if (key && /^[0-9a-f]{64}$/i.test(key)) {
                try {
                  const iv = bytes.slice(4, 20)
                  const cipher = bytes.slice(20)
                  const kb = new Uint8Array(key.match(/../g).map(h => parseInt(h, 16)))
                  const ck = await crypto.subtle.importKey('raw', kb, { name: 'AES-CBC' }, false, ['decrypt'])
                  bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, ck, cipher))
                } catch {}
              }
            }
            if (!(bytes[0] === 0x53 && bytes[1] === 0x59 && bytes[2] === 0x53 && bytes[3] === 0x01)) {
              let bin = ''
              const chunk = 65536
              for (let i = 0; i < bytes.length; i += chunk)
                bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
              audioBase64 = btoa(bin)
              audioFilename = target.name
            }
          }
        }
      }
    } catch {}

    const res = await fetch('/api/create-agent', {
      method: 'POST',
      headers: { Authorization: `Bearer ${props.soulCert}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vault_key: _vaultKey.value || '',
        ...(audioBase64 ? { audio_base64: audioBase64, audio_filename: audioFilename } : {}),
      }),
      signal,
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      const msg = data.message || data.error || `HTTP ${res.status}`
      const text = msg === 'elevenlabs_key_missing'
        ? 'ElevenLabs API-Key fehlt — bitte in Einstellungen hinterlegen.'
        : `Fehler: ${msg}`
      setMessageMetaById(statusMsg.id, 'text', text)
      setMessageMetaById(statusMsg.id, 'streaming', false)
      return
    }

    // agent_id + voice_id in localStorage (zuverlässig für @sprechen, unabhängig vom Lade-Zustand der soul)
    if (data.agent_id) localStorage.setItem('sys_elevenlabs_agent_id', data.agent_id)
    if (data.voice_id) localStorage.setItem('sys_elevenlabs_voice_id', data.voice_id)

    // agent_id + voice_id lokal patchen + zum Server pushen
    if (data.agent_id && soulContentAgent.value) {
      let patched = soulContentAgent.value
      const agentRe = /^(elevenlabs_agent_id:\s*).*$/m
      patched = agentRe.test(patched)
        ? patched.replace(agentRe, `$1${data.agent_id}`)
        : patched.replace(/^(---\n[\s\S]*?)(---)/m, `$1elevenlabs_agent_id: ${data.agent_id}\n$2`)
      if (data.voice_id) {
        const voiceRe = /^(elevenlabs_voice_id:\s*).*$/m
        patched = voiceRe.test(patched)
          ? patched.replace(voiceRe, `$1${data.voice_id}`)
          : patched.replace(/^(---\n[\s\S]*?)(---)/m, `$1elevenlabs_voice_id: ${data.voice_id}\n$2`)
      }
      updateContent(patched)
      pushToServer().catch(() => {})
      if (vaultConnected.value) writeSoulMd(patched, 'sys').catch(() => {})
    }

    const voiceNote = data.has_voice_clone
      ? `Voice-ID: \`${data.voice_id}\``
      : 'Kein Stimm-Clone — kein Audio im Vault oder Vault war beim Erstellen gesperrt. Vault entsperren und `@create-agent` erneut ausführen.'

    const talkUrl = `https://elevenlabs.io/app/talk-to?agent_id=${data.agent_id}`
    const lines = [
      `Agent **${data.soul_name}** erstellt und in sys.md gespeichert.`,
      '',
      `Agent-ID: \`${data.agent_id}\``,
      voiceNote,
      '',
      data.published
        ? `Öffentlich erreichbar: ${talkUrl}`
        : `**Manuell veröffentlichen:** ${data.agent_url} → Security → "Publicly available"`,
    ]
    setMessageMetaById(statusMsg.id, 'text', lines.join('\n'))
    setMessageMetaById(statusMsg.id, 'streaming', false)
  } catch (err) {
    if (err.name !== 'AbortError') {
      setMessageMetaById(statusMsg.id, 'text', `Netzwerkfehler: ${err.message}`)
      setMessageMetaById(statusMsg.id, 'streaming', false)
    }
  } finally { endJob() }
  await scrollToBottom()
}

// ── @diagnose — OpenResty Fehlerlog ───────────────────────────────
async function handleDiagnose() {
  const signal = startJob('@diagnose')
  addMessage('user', '@diagnose')
  const statusMsg = addMessage('assistant', 'Fehlerlog wird gelesen…', { streaming: true })
  await scrollToBottom()

  try {
    const res = await fetch('/api/diagnose', {
      headers: { Authorization: `Bearer ${props.soulCert}` },
      signal,
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setMessageMetaById(statusMsg.id, 'text', `Fehler: ${data.error || `HTTP ${res.status}`}`)
      setMessageMetaById(statusMsg.id, 'streaming', false)
      return
    }

    const lines = Array.isArray(data.lines) ? data.lines : []
    if (lines.length === 0) {
      setMessageMetaById(statusMsg.id, 'text', `Keine Fehler im Log gefunden. ✓\n\n_Geprüft: \`${data.log_path || '/var/log/openresty/error.log'}\` — ${data.checked_at || '–'}_`)
      setMessageMetaById(statusMsg.id, 'streaming', false)
      return
    }

    const header = `**${data.total_found || lines.length} Einträge** im OpenResty-Fehlerlog (neueste zuerst):\n\n`
    const body = lines.map(l => `\`\`\`\n${l}\n\`\`\``).join('\n')
    const footer = `\n\n_Geprüft: \`${data.log_path}\` — ${data.checked_at}_`
    setMessageMetaById(statusMsg.id, 'text', header + body + footer)
    setMessageMetaById(statusMsg.id, 'streaming', false)
  } catch (err) {
    if (err.name !== 'AbortError') {
      setMessageMetaById(statusMsg.id, 'text', `Netzwerkfehler: ${err.message}`)
      setMessageMetaById(statusMsg.id, 'streaming', false)
    }
  } finally { endJob() }
  await scrollToBottom()
}

// ── @contact — MCP-Peer hinzufügen ───────────────────────────────
async function handleContact(query) {
  const GUIDE = [
    '**Peer hinzufügen — Format:**',
    '',
    '`@contact <soul_id> <name>` — gleicher Server',
    '`@contact <soul_id> <name> https://peer.domain.com` — anderer Server',
    '',
    '**Beispiel:**',
    '`@contact 550e8400-e29b-41d4-a716-446655440000 Jan`',
    '',
    'soul_id und Endpoint findest du auf der Peers-Seite unter "Dein Endpoint".',
  ].join('\n')

  if (!query) {
    addMessage('user', '@contact')
    addMessage('assistant', GUIDE)
    return
  }

  // Parse: soul_id label [https://endpoint]
  const parts = query.split(/\s+/)
  const soulId = parts[0]

  if (!/^[a-f0-9-]{36}$/i.test(soulId)) {
    addMessage('user', `@contact ${query}`)
    addMessage('assistant', `Ungültige Soul-ID: \`${soulId}\`\n\nErwartet: UUID-Format \`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\`\n\n${GUIDE}`)
    return
  }

  let label = ''
  let endpoint = ''
  const last = parts[parts.length - 1]
  if (parts.length >= 3 && last.startsWith('https://')) {
    endpoint = last.replace(/\/$/, '')
    label = parts.slice(1, -1).join(' ').trim()
  } else {
    label = parts.slice(1).join(' ').trim()
  }

  if (!label) {
    addMessage('user', `@contact ${query}`)
    addMessage('assistant', `Name fehlt.\n\n${GUIDE}`)
    return
  }

  addMessage('user', `@contact ${query}`)
  const statusMsg = addMessage('assistant', `Peer **${label}** wird hinzugefügt…`, { streaming: true })
  await scrollToBottom()

  try {
    // Aktuellen Stand lesen
    const getRes = await fetch('/api/soul/amortization', {
      headers: { Authorization: `Bearer ${props.soulCert}` },
    })
    const getData = await getRes.json().catch(() => ({}))
    const amort = getData.amortization || {}
    const trusted = Array.isArray(amort.trusted_souls) ? [...amort.trusted_souls] : []

    // Duplikat-Check
    const dup = trusted.some(t =>
      (typeof t === 'string' && t === soulId) ||
      (typeof t === 'object' && t?.soul_id === soulId)
    )
    if (dup) {
      setMessageMetaById(statusMsg.id, 'text', `Peer \`${soulId}\` ist bereits verbunden.`)
      setMessageMetaById(statusMsg.id, 'streaming', false)
      return
    }

    // Neuen Eintrag im selben Format wie peersToTrustedSouls()
    trusted.push(endpoint ? { soul_id: soulId, endpoint } : soulId)

    const putRes = await fetch('/api/soul/amortization', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${props.soulCert}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled:             amort.enabled             ?? false,
        pol_per_request:     amort.pol_per_request     ?? '0.001',
        wallet:              amort.wallet              ?? '',
        agent_tools:         Array.isArray(amort.agent_tools) ? amort.agent_tools : ['soul_read', 'verify_human', 'soul_maturity'],
        token_duration_days: amort.token_duration_days ?? 1,
        trusted_souls:       trusted,
      }),
    })

    if (!putRes.ok) {
      const d = await putRes.json().catch(() => ({}))
      setMessageMetaById(statusMsg.id, 'text', `Fehler: ${d.error || d.message || `HTTP ${putRes.status}`}`)
      setMessageMetaById(statusMsg.id, 'streaming', false)
      return
    }

    // localStorage für Agent-Marketplace Label-Anzeige aktualisieren
    const localKey = `sys.connected_nodes.${props.soulCert?.split('.')?.[0] || ''}`
    if (localKey !== 'sys.connected_nodes.') {
      try {
        const nodes = JSON.parse(localStorage.getItem(localKey) || '[]')
        if (!nodes.some(n => n.soul_id === soulId)) {
          nodes.push({
            soul_id: soulId,
            url: endpoint ? `${endpoint}/mcp` : `${window.location.origin}/mcp`,
            label,
          })
          localStorage.setItem(localKey, JSON.stringify(nodes))
        }
      } catch { /* ignore */ }
    }

    const lines = [`Peer **${label}** hinzugefügt ✓`, '', `Soul-ID: \`${soulId}\``]
    if (endpoint) lines.push(`Endpoint: \`${endpoint}\``)
    lines.push('', `Ab jetzt mit \`@${label}\` erreichbar.`)
    setMessageMetaById(statusMsg.id, 'text', lines.join('\n'))
    setMessageMetaById(statusMsg.id, 'streaming', false)
    await loadPeerIds()
  } catch (err) {
    setMessageMetaById(statusMsg.id, 'text', `Netzwerkfehler: ${err.message}`)
    setMessageMetaById(statusMsg.id, 'streaming', false)
  }
  await scrollToBottom()
}

// ── @pin — Pinata JWT hinterlegen / Soul veröffentlichen ──────────
const PIN_TOOLS = [
  { id: 'soul_read',     name: 'Soul lesen',           desc: 'sys.md, Identität, Werte, Session-Log' },
  { id: 'soul_maturity', name: 'Reifegrad',             desc: 'Reife-Score 0–100 der Soul' },
  { id: 'soul_skills',   name: 'Skills',                desc: 'Fähigkeiten & Kenntnisse aus der Soul' },
  { id: 'verify_human',  name: 'Menschlichkeit',        desc: 'Bestätigt, dass hinter der Soul ein Mensch steht' },
  { id: 'audio_get',     name: 'Audio abrufen',         desc: 'Einzelne Audio-Datei aus dem Vault' },
  { id: 'audio_list',    name: 'Audio auflisten',       desc: 'Alle Audio-Dateien im Vault' },
  { id: 'image_get',     name: 'Bild abrufen',          desc: 'Einzelnes Bild aus dem Vault' },
  { id: 'image_list',    name: 'Bilder auflisten',      desc: 'Alle Bilder im Vault' },
  { id: 'video_get',     name: 'Video abrufen',         desc: 'Einzelnes Video aus dem Vault' },
  { id: 'video_list',    name: 'Videos auflisten',      desc: 'Alle Videos im Vault' },
  { id: 'context_get',   name: 'Kontext-Datei lesen',   desc: 'mind.md oder andere Kontext-Dateien' },
  { id: 'context_list',  name: 'Kontext auflisten',     desc: 'Alle Kontext-Dateien im Vault' },
  { id: 'profile_get',   name: 'Profil abrufen',        desc: 'Profilfoto, biometrische Metadaten' },
  { id: 'calendar_read',       name: 'Kalender lesen',   desc: 'Kalender-Einträge der Soul' },
  { id: 'health_check_payed', name: 'Gesundheit',        desc: 'Körpermetriken, Schlaf, Aktivität aus health.md' },
  { id: 'shop_write_read',    name: 'Shopping',          desc: 'Wunschliste & Käufe aus shopping.md' },
]

async function handlePin(query) {
  const auth  = { Authorization: `Bearer ${props.soulCert}`, 'Content-Type': 'application/json' }
  const authH = { Authorization: `Bearer ${props.soulCert}` }

  // Intern aufgerufen nach Bestätigung: { _publishExec: { namePart, descPart, tagsArr } }
  if (query && typeof query === 'object' && query._publishExec) {
    const { namePart, descPart, tagsArr } = query._publishExec
    const body = {}
    if (namePart)       body.name_override = namePart
    if (descPart)       body.description   = descPart
    if (tagsArr.length) body.tags = tagsArr
    const msg = addMessage('assistant', 'Soul wird auf IPFS veröffentlicht…', { streaming: true })
    await scrollToBottom()
    try {
      const pinRes  = await fetch('/api/soul/pinata-config', { headers: authH })
      const pinData = await pinRes.json().catch(() => ({}))
      if (!pinData.configured) {
        setMessageMetaById(msg.id, 'text', ['Pinata JWT fehlt.', '', '1. JWT holen: [app.pinata.cloud](https://app.pinata.cloud/keys)', '2. Hinterlegen: `@pin <jwt>`', '3. Dann: `@pin publish <name>`'].join('\n'))
        setMessageMetaById(msg.id, 'streaming', false)
        return
      }
      const r = await fetch('/api/soul/register', { method: 'POST', headers: auth, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setMessageMetaById(msg.id, 'text', `Fehler: ${d.error || d.message || `HTTP ${r.status}`}`); setMessageMetaById(msg.id, 'streaming', false); return }
      const pubCid = d.cid || ''
      if (pubCid) await putAmort({ agent_registry_cid: pubCid }).catch(() => {})
      const lines = ['Soul veröffentlicht ✓', '']
      if (namePart)       lines.push(`Name: **${namePart}**`)
      if (descPart)       lines.push(`Beschreibung: ${descPart}`)
      if (tagsArr.length) lines.push(`Tags: ${tagsArr.join(', ')}`)
      if (pubCid) { lines.push('', `CID: \`${pubCid}\``, `[Gateway öffnen ↗](https://gateway.pinata.cloud/ipfs/${pubCid})`) }
      else { lines.push('', 'IPFS: kein CID erhalten') }
      lines.push('', 'Zugang & Status: `@pin status`')
      setMessageMetaById(msg.id, 'text', lines.join('\n'))
      setMessageMetaById(msg.id, 'streaming', false)
    } catch (err) { setMessageMetaById(msg.id, 'text', `Netzwerkfehler: ${err.message}`); setMessageMetaById(msg.id, 'streaming', false) }
    await scrollToBottom()
    return
  }

  const q    = query.trim()
  startJob(`@pin ${q.split(' ')[0] || 'status'}`)

  const PIN_HELP = [
    '**@pin — Befehle**',
    '',
    '`@pin`                                Status anzeigen',
    '`@pin <jwt>`                          Pinata JWT hinterlegen',
    '`@pin free`                           Freier Zugang (alle KI-Agenten)',
    '`@pin paid 0.001 0xWallet`            Bezahlter Zugang (POL-Rate + Wallet)',
    '`@pin paid 0.001 0xWallet 7`          + Token-Gültigkeit in Tagen (1–30)',
    '`@pin tools soul_read,verify_human`   Erlaubte Tools festlegen',
    '`@pin publish <name>`                 Auf IPFS veröffentlichen',
    '`@pin publish <name> | <desc>`        + Beschreibung',
    '`@pin publish <name> | <desc> | <tags>`  + Tags (kommasepariert)',
    '`@pin status`                         Schnellstatus',
  ].join('\n')

  // Aktuellen Amortization-Stand lesen (für merge-safe PUT)
  async function getAmort() {
    const r = await fetch('/api/soul/amortization', { headers: authH })
    const d = await r.json().catch(() => ({}))
    return d.amortization || {}
  }

  // Amortization aktualisieren — liest erst aktuellen Stand, merged Patch
  async function putAmort(patch) {
    const cur = await getAmort()
    const body = {
      enabled:             cur.enabled             ?? false,
      pol_per_request:     cur.pol_per_request     ?? '0.001',
      wallet:              cur.wallet              ?? '',
      agent_tools:         Array.isArray(cur.agent_tools) ? cur.agent_tools : ['soul_read', 'verify_human', 'soul_maturity'],
      token_duration_days: cur.token_duration_days ?? 1,
      trusted_souls:       Array.isArray(cur.trusted_souls) ? cur.trusted_souls : [],
      ...patch,
    }
    const r = await fetch('/api/soul/amortization', { method: 'PUT', headers: auth, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || d.message || `HTTP ${r.status}`)
    // Cache für VPS-Migration: amort-Config im Browser persistieren
    try { localStorage.setItem('sys_amort_config', JSON.stringify(body)) } catch {}
    return d
  }

  // ── @pin help ──────────────────────────────────────────────────
  if (/^help$/i.test(q)) {
    addMessage('user', '@pin help')
    addMessage('assistant', PIN_HELP)
    return
  }

  // ── @pin / @pin status — vollständiger Status ──────────────────
  if (!q || /^status$/i.test(q)) {
    addMessage('user', q ? '@pin status' : '@pin')
    const msg = addMessage('assistant', 'Wird geprüft…', { streaming: true })
    await scrollToBottom()
    try {
      const [pinRes, amortRes] = await Promise.all([
        fetch('/api/soul/pinata-config', { headers: authH }),
        fetch('/api/soul/amortization',  { headers: authH }),
      ])
      const pin   = await pinRes.json().catch(() => ({}))
      const amort = (await amortRes.json().catch(() => ({}))).amortization || {}

      const jwtLine = pin.configured
        ? `Pinata JWT: \`${pin.preview}\` ✓`
        : 'Pinata JWT: fehlt  →  `@pin <jwt>`'

      const cid = amort.agent_registry_cid
      const cidLine = cid
        ? `IPFS: veröffentlicht ✓  [${cid}](https://gateway.pinata.cloud/ipfs/${cid})`
        : 'IPFS: noch nicht veröffentlicht  →  `@pin publish <name>`'

      let accessLine
      if (amort.enabled === true) {
        const rate   = amort.pol_per_request || '?'
        const wallet = amort.wallet ? `\`${amort.wallet.slice(0, 10)}…\`` : 'Wallet fehlt'
        const days   = amort.token_duration_days || 1
        const tools  = Array.isArray(amort.agent_tools) && amort.agent_tools.length
          ? amort.agent_tools.map(t => {
              const meta = PIN_TOOLS.find(pt => pt.id === t)
              return meta ? `${t} (${meta.name})` : t
            }).join(', ')
          : '(keine)  →  `@pin tools` für Liste'
        accessLine = `Zugang: Bezahlt  ${rate} POL · ${wallet} · ${days}d\nTools: ${tools}`
      } else {
        accessLine = amort.hasOwnProperty?.('enabled')
          ? 'Zugang: Frei (alle KI-Agenten können deine Soul lesen)'
          : 'Zugang: nicht konfiguriert  →  `@pin free` oder `@pin paid …`'
      }

      setMessageMetaById(msg.id, 'text', [jwtLine, cidLine, accessLine].join('\n'))
      setMessageMetaById(msg.id, 'streaming', false)
    } catch (err) {
      setMessageMetaById(msg.id, 'text', `Netzwerkfehler: ${err.message}`)
      setMessageMetaById(msg.id, 'streaming', false)
    }
    await scrollToBottom()
    return
  }

  // Wiederverwendbare Tool-Auswahl-Actions
  const toolPickerActions = [
    ...PIN_TOOLS.map(t => ({ label: t.name, title: t.desc, pin_tool_id: t.id })),
    { label: 'Fertig →', primary: true, pin_tool_confirm: true },
    { label: '✕ Abbrechen', type: 'abbruch' },
  ]

  // ── @pin free ──────────────────────────────────────────────────
  if (/^free$/i.test(q)) {
    addMessage('user', '@pin free')
    const msg = addMessage('assistant', 'Freier Zugang wird aktiviert…', { streaming: true })
    await scrollToBottom()
    try {
      await putAmort({ enabled: false })
      setMessageMetaById(msg.id, 'text', [
        'Zugang: Frei ✓',
        '',
        'Jeder KI-Assistent kann deine Soul lesen.',
        'Welche Tools sollen freigegeben werden?',
      ].join('\n'))
      setMessageMetaById(msg.id, 'actions', toolPickerActions)
      setMessageMetaById(msg.id, 'streaming', false)
    } catch (err) {
      setMessageMetaById(msg.id, 'text', `Fehler: ${err.message}`)
      setMessageMetaById(msg.id, 'streaming', false)
    }
    await scrollToBottom()
    return
  }

  // ── @pin paid <pol> <wallet> [days] ────────────────────────────
  if (/^paid\s+0x/i.test(q)) {
    addMessage('user', `@pin ${q.trim().split(/\s+/).slice(0, 3).join(' ')}…`)
    addMessage('assistant', [
      'POL-Rate fehlt.',
      'Format: `@pin paid 0.001 0xWallet [7d]`',
      '· `0.001` = POL-Betrag pro Zugriff',
      '· `0xWallet` = deine Empfänger-Wallet',
      '· `7d` = Token-Gültigkeit in Tagen (optional, Standard: 1)',
    ].join('\n'))
    return
  }
  const paidM = q.match(/^paid\s+(\S+)\s+(\S+)(?:\s+(\d+)\w*)?$/i)
  if (paidM) {
    const pol    = paidM[1]
    const wallet = paidM[2]
    const days   = Math.min(30, Math.max(1, parseInt(paidM[3] || '1', 10)))
    const walletShort = wallet.length > 12 ? wallet.slice(0, 10) + '…' : wallet
    addMessage('user', `@pin paid ${pol} ${walletShort} ${days}d`)
    const msg = addMessage('assistant', 'Bezahlter Zugang wird konfiguriert…', { streaming: true })
    await scrollToBottom()
    try {
      await putAmort({ enabled: true, pol_per_request: pol, wallet, token_duration_days: days })
      setMessageMetaById(msg.id, 'text', [
        'Bezahlter Zugang ✓',
        `Rate: ${pol} POL · Wallet: \`${wallet}\` · Gültigkeit: ${days} ${days === 1 ? 'Tag' : 'Tage'}`,
        '',
        'Welche Tools sollen freigegeben werden?',
      ].join('\n'))
      setMessageMetaById(msg.id, 'actions', toolPickerActions)
      setMessageMetaById(msg.id, 'streaming', false)
    } catch (err) {
      setMessageMetaById(msg.id, 'text', `Fehler: ${err.message}`)
      setMessageMetaById(msg.id, 'streaming', false)
    }
    await scrollToBottom()
    return
  }

  // ── @pin tools [<t1,t2,...>] ───────────────────────────────────
  if (/^tools$/i.test(q) || /^tools\s/i.test(q)) {
    const toolsArg = q.replace(/^tools\s*/i, '').trim()

    // Ohne Args → verfügbare Tools als klickbare Buttons (additiv)
    if (!toolsArg) {
      pinSelectedTools.value = []
      addMessage('user', '@pin tools')
      const msg = addMessage('assistant', [
        '**Tools auswählen** — anklicken zum Auswählen, nochmal für Abwahl:',
      ].join('\n'))
      setMessageMetaById(msg.id, 'actions', toolPickerActions)
      return
    }

    // Mit Args → setzen + Klarnamen in Bestätigung
    pinSelectedTools.value = []
    const tools = toolsArg.split(',').map(t => t.trim()).filter(Boolean)
    const unknown = tools.filter(t => !PIN_TOOLS.some(pt => pt.id === t))
    addMessage('user', `@pin tools ${tools.join(', ')}`)
    const msg = addMessage('assistant', 'Tools werden gesetzt…', { streaming: true })
    await scrollToBottom()
    try {
      await putAmort({ agent_tools: tools })
      const named = tools.map(t => {
        const meta = PIN_TOOLS.find(pt => pt.id === t)
        return meta ? `\`${t}\` — ${meta.name}` : `\`${t}\``
      })
      const warnLine = unknown.length
        ? `\n\n⚠ Unbekannte Tools (werden ignoriert): ${unknown.map(t => `\`${t}\``).join(', ')}`
        : ''
      setMessageMetaById(msg.id, 'text', [
        'Tools gesetzt ✓',
        '',
        ...named,
        '',
        'Veröffentlichen: `@pin publish <name>`',
        '_Dauert ca. 5–15 Sekunden._',
      ].join('\n') + warnLine)
      setMessageMetaById(msg.id, 'streaming', false)
    } catch (err) {
      setMessageMetaById(msg.id, 'text', `Fehler: ${err.message}`)
      setMessageMetaById(msg.id, 'streaming', false)
    }
    await scrollToBottom()
    return
  }

  // ── @pin publish [name] [| desc] [| tags] ─────────────────────
  if (/^publish/i.test(q)) {
    const rest = q.replace(/^publish\s*/i, '').trim()
    const [namePart = '', descPart = '', tagsPart = ''] = rest.split('|').map(s => s.trim())
    const tagsArr = tagsPart ? tagsPart.split(',').map(t => t.trim()).filter(Boolean) : []

    addMessage('user', namePart ? `@pin publish ${namePart}` : '@pin publish')

    // Bestätigungsschritt — zeigt was veröffentlicht wird
    const confirmLines = ['**Veröffentlichen bestätigen:**', '']
    confirmLines.push(`Name: **${namePart || '(aus sys.md)'}**`)
    if (descPart) confirmLines.push(`Beschreibung: ${descPart}`)
    confirmLines.push(tagsArr.length ? `Tags: \`${tagsArr.join('`, `')}\`` : 'Tags: *(keine)* — für soul_discover wichtig: `@pin publish Name | Desc | Tag1,Tag2`')
    const confirmMsg = addMessage('assistant', confirmLines.join('\n'))
    setMessageMetaById(confirmMsg.id, 'actions', [
      { label: 'Veröffentlichen ✓', primary: true, type: 'pin_publish_confirm', _publishData: { namePart, descPart, tagsArr } },
      { label: '✕ Abbrechen', type: 'abbruch' },
    ])
    await scrollToBottom()
    return
  }

  // ── @pin <jwt> — JWT hinterlegen (20+ Zeichen, kein bekannter Subbefehl) ──
  if (q.length >= 20) {
    addMessage('user', `@pin ${q.substring(0, 8)}…`)
    const msg = addMessage('assistant', 'Pinata JWT wird gespeichert…', { streaming: true })
    await scrollToBottom()
    try {
      const r = await fetch('/api/soul/pinata-config', {
        method: 'PUT', headers: auth, body: JSON.stringify({ jwt: q }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setMessageMetaById(msg.id, 'text', `Fehler: ${d.error || `HTTP ${r.status}`}`)
        setMessageMetaById(msg.id, 'streaming', false)
        return
      }
      setMessageMetaById(msg.id, 'text', [
        'Pinata JWT gespeichert ✓',
        '',
        'Nächste Schritte:',
        '1. Zugang: `@pin free` oder `@pin paid 0.001 0xWallet [7d]`',
        '   → Zahl = Token-Gültigkeit in Tagen (1–30, Standard: 1)',
        '2. Veröffentlichen: `@pin publish <dein-name>`',
        '   → Dauert ca. 5–15 Sekunden (IPFS-Upload)',
      ].join('\n'))
      setMessageMetaById(msg.id, 'streaming', false)
    } catch (err) {
      setMessageMetaById(msg.id, 'text', `Netzwerkfehler: ${err.message}`)
      setMessageMetaById(msg.id, 'streaming', false)
    }
    await scrollToBottom()
    return
  }

  // ── Unbekannter Subbefehl → Kurzhinweis
  addMessage('user', `@pin ${q}`)
  addMessage('assistant', `Unbekannter Befehl. Hilfe: \`@pin help\``)
}

// ── @create-media — KI-Bildgenerierung ────────────────────────────
async function handleCreateMedia(userPrompt) {
  const preErr = preflightCheck('create-media')
  if (preErr) { addMessage('user', userPrompt ? `@create-media ${userPrompt}` : '@create-media'); addMessage('assistant', preErr); return }
  const authHeader = { Authorization: `Bearer ${props.soulCert}` }
  addMessage('user', userPrompt ? `@create-media ${userPrompt}` : '@create-media')
  const statusMsg = addMessage('assistant', 'Bild wird generiert…', { streaming: true })
  await scrollToBottom()

  let imagePrompt = userPrompt

  // mind.md Grenzen-Sektion extrahieren (kein m-Flag — $ = Stringende, nicht Zeilenende)
  const grenzenSection = (() => {
    const m = (mindContent.value || '').match(/## Grenzen[ \t]*\n([\s\S]*?)(?=\n## |$)/)
    return m ? m[1].trim() : ''
  })()

  // Direkter Prompt → gegen Grenzen prüfen bevor WaveSpeed aufgerufen wird
  if (imagePrompt && grenzenSection) {
    try {
      const checkRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 10,
          stream: false,
          system: `Du prüfst ob ein Bildprompt gegen die definierten Grenzen verstößt.\n\nGrenzen:\n${grenzenSection}\n\nAntworte NUR mit "JA" wenn der Prompt eine Grenze verletzt, oder "NEIN" wenn nicht.`,
          messages: [{ role: 'user', content: imagePrompt }],
        }),
      })
      if (checkRes.ok) {
        const cd = await checkRes.json()
        const verdict = (cd?.content?.[0]?.text || '').trim().toUpperCase()
        if (verdict.startsWith('JA')) {
          setMessageMetaById(statusMsg.id, 'text', 'Dieser Prompt verstößt gegen die in mind.md definierten Grenzen.')
          setMessageMetaById(statusMsg.id, 'streaming', false)
          return
        }
      }
    } catch { /* bei Fehler: weiter, nicht blockieren */ }
  }

  // Kein Prompt → Claude erzeugt einen soul-basierten visuellen Prompt
  if (!imagePrompt) {
    setMessageMetaById(statusMsg.id, 'text', 'Soul-Inhalt wird analysiert…')
    const soulSnippet = (props.soulContent || '').slice(0, 1200)
    const grenzenHint = grenzenSection ? `\n\nVerbotene Inhalte laut Grenzen:\n${grenzenSection}` : ''
    try {
      const genRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          model: (typeof window !== 'undefined' && localStorage.getItem('sys_chat_model')) || 'claude-haiku-4-5-20251001',
          max_tokens: 120,
          stream: false,
          system: `Du bist ein Bildprompt-Spezialist. Erstelle einen präzisen, atmosphärischen englischen Bildprompt (max. 80 Wörter) für einen KI-Bildgenerator. Basiere ihn auf dem Soul-Content des Menschen — seine Persönlichkeit, Ästhetik, Werte. Antworte NUR mit dem Prompt, ohne Kommentar oder Erklärung.${grenzenHint}`,
          messages: [{ role: 'user', content: `Soul-Content:\n${soulSnippet}` }],
        }),
      })
      if (genRes.ok) {
        const d = await genRes.json()
        imagePrompt = d?.content?.[0]?.text?.trim() || ''
      }
    } catch { /* weiter ohne soul-prompt */ }

    if (!imagePrompt) {
      setMessageMetaById(statusMsg.id, 'text', 'Prompt-Generierung fehlgeschlagen.')
      setMessageMetaById(statusMsg.id, 'streaming', false)
      return
    }
    setMessageMetaById(statusMsg.id, 'text', `Generiere: _${imagePrompt}_`)
  }

  // WaveSpeed text-to-image
  try {
    const submitRes = await fetch('/api/wavespeed-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ outputMode: 'text-to-image', prompt: imagePrompt }),
    })

    if (!submitRes.ok) {
      const err = await submitRes.json().catch(() => ({}))
      const msg = err.message === 'wavespeed_key_missing'
        ? 'WaveSpeed API-Key fehlt — bitte in Einstellungen hinterlegen.'
        : `Fehler: ${err.message || submitRes.status}`
      setMessageMetaById(statusMsg.id, 'text', msg)
      setMessageMetaById(statusMsg.id, 'streaming', false)
      return
    }

    const { taskId } = await submitRes.json()
    if (!taskId) {
      setMessageMetaById(statusMsg.id, 'text', 'Keine Task-ID erhalten.')
      setMessageMetaById(statusMsg.id, 'streaming', false)
      return
    }

    // Poll alle 4 s, max. 30 Versuche (~2 min)
    let imageUrl = null
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 4000))
      try {
        const pollRes = await fetch(`/api/wavespeed-result?id=${encodeURIComponent(taskId)}`, { headers: authHeader })
        if (pollRes.ok) {
          const p = await pollRes.json()
          if (p.url) { imageUrl = p.url; break }
          if (p.error && p.status !== 'pending' && p.status !== 'running') break
        }
      } catch { /* retry */ }
    }

    if (imageUrl) {
      setMessageMetaById(statusMsg.id, 'text', imagePrompt)
      setMessageMetaById(statusMsg.id, 'mediaUrl',  imageUrl)
      setMessageMetaById(statusMsg.id, 'mediaType', 'image')
    } else {
      setMessageMetaById(statusMsg.id, 'text', 'Bildgenerierung: kein Ergebnis erhalten.')
    }
  } catch (err) {
    setMessageMetaById(statusMsg.id, 'text', `Netzwerkfehler: ${err.message}`)
  }

  setMessageMetaById(statusMsg.id, 'streaming', false)
  await scrollToBottom()
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

      // Lebensmittelbild → food_log direkt aufrufen, keine soulReaction
      if (vData.isFoodPhoto && vData.foodName) {
        try {
          await fetch('/api/food-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({ name: vData.foodName, rating: vData.foodRating || 'C', notes: vData.foodNotes || '' }),
          })
        } catch { /* gespeichert oder nicht – Anzeige trotzdem */ }
        const rating = vData.foodRating || 'C'
        updateLastMessage(`${vData.foodName} · ${rating} · gespeichert`)
        setLastMessageMeta('streaming', false)
        await scrollToBottom()
        visionLoading.value = false
        return
      }

      // Produktbild → shop_log speichern, dann KI für shop_check + Preisvergleich
      if (vData.isProductPhoto && vData.productName) {
        try {
          await fetch('/api/soul-tool', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({ tool: 'shop_log', input: {
              name: vData.productName,
              category: vData.productCategory || 'Sonstiges',
              price: vData.productPrice > 0 ? vData.productPrice : null,
              status: 'wishlist',
            }}),
          })
        } catch { /* gespeichert oder nicht */ }
        const savedLine = `${vData.productName} · ${vData.productCategory || 'Sonstiges'} · gespeichert`
        updateLastMessage(savedLine)
        await scrollToBottom()
        await chat({
          messages: [...toApiMessages(), { role: 'user', content: `[Produkt erfasst: ${vData.productName}] shop_check aufrufen und Preisvergleich starten.` }],
          soulContent: props.soulContent, soulCert: props.soulCert,
          mindContent: mindContent.value || null, vaultContext: null, networkContext: null,
          networkPdfBlocks: null, networkImageBlocks: null,
          conversationSummary: conversationSummary.value || null,
          profileImageBase64: profileBase64.value, role: localRole.value,
          model: selectedModel.value, externalTools: mcpTools.value, voiceMode: false,
          onDelta: (delta, fullText) => { updateLastMessage(savedLine + '\n\n' + fullText); scrollToBottom() },
        })
        setLastMessageMeta('streaming', false)
        await scrollToBottom()
        visionLoading.value = false
        return
      }

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
  if (action.url) {
    window.open(action.url, '_blank', 'noopener,noreferrer')
    return
  }
  if (action.cmd) {
    draft.value = action.cmd
    await nextTick()
    document.querySelector('.dock-textarea')?.focus()
    return
  }
  if (action.pin_tool_id) {
    const idx = pinSelectedTools.value.indexOf(action.pin_tool_id)
    if (idx >= 0) pinSelectedTools.value.splice(idx, 1)
    else pinSelectedTools.value.push(action.pin_tool_id)
    draft.value = pinSelectedTools.value.length
      ? '@pin tools ' + pinSelectedTools.value.join(',')
      : ''
    await nextTick()
    document.querySelector('.dock-textarea')?.focus()
    return
  }
  if (action.pin_tool_confirm) {
    const tools = [...pinSelectedTools.value]
    pinSelectedTools.value = []
    draft.value = tools.length ? '@pin tools ' + tools.join(',') : '@pin tools'
    await nextTick()
    await handleSend()
    return
  }
  if (action.type === 'abbruch') {
    const jobName = currentJobName.value
    currentAbort.value?.abort()
    endJob()
    pinSelectedTools.value = []
    draft.value = ''
    addMessage('assistant', jobName
      ? `Abgebrochen: \`${jobName}\` ✓`
      : 'Abgebrochen.')
    return
  }
  if (action.type === 'pin_publish_confirm') {
    setMessageMetaById(msg.id, 'actions', [])
    setMessageMetaById(msg.id, 'actionsDisabled', true)
    await handlePin({ _publishExec: action._publishData })
    return
  }
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
    externalTools: mcpTools.value,
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
  cmdsOpen.value = false
  closeMobileComposer()
  await nextTick(autoResize)

  const intent = detectIntent(raw)


  if (intent.type === 'capture-audio' || intent.type === 'capture-face' || intent.type === 'capture-body') {
    const mode = intent.type.replace('capture-', '')
    // Gegenseitiger Ausschluss: bestehende Capture-Kacheln schließen
    messages.value.filter(m => m._type === 'capture').forEach(m => removeMessage(m.id))
    addMessage('capture', `@${mode}`, { _type: 'capture', captureMode: mode })
    await scrollToBottom()
    return
  }

  if (intent.type === 'voice-agent') {
    await startVoiceRecord()
    return
  }

  if (intent.type === 'create-agent') {
    await handleCreateAgent()
    return
  }

  if (intent.type === 'diagnose') {
    await handleDiagnose()
    return
  }

  if (intent.type === 'contact') {
    await handleContact(intent.query)
    return
  }

  if (intent.type === 'pin') {
    await handlePin(intent.query)
    return
  }

  if (intent.type === 'abbruch') {
    const jobName = currentJobName.value
    currentAbort.value?.abort()
    endJob()
    pinSelectedTools.value = []
    draft.value = ''
    addMessage('user', '@abbruch')
    addMessage('assistant', jobName
      ? `Abgebrochen: \`${jobName}\` ✓`
      : 'Kein laufender Job — alles zurückgesetzt.')
    return
  }

  if (intent.type === 'session-end') {
    addMessage('user', '@session-end')
    emit('session-end')
    return
  }

  if (intent.type === 'create-media') {
    await handleCreateMedia(intent.query)
    return
  }

  if (intent.type === 'web-search') {
    if (!intent.query) {
      addMessage('assistant', 'Bitte eine Suchanfrage angeben: `@suche Was ist …`')
      return
    }
    await handleWebSearch(intent.query)
    return
  }

  if (intent.type === 'ambiguous') {
    const names = intent.candidates.map(p => `@${p.label}`).join(', ')
    addMessage('assistant', `Mehrdeutig: ${names} — bitte den vollständigen Namen verwenden.`)
    return
  }

  if (intent.type === 'peer-not-found') {
    addMessage('assistant', `Peer "@${intent.name}" nicht gefunden. Verbindung herstellen unter → Peers.`)
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

// ── Peer-ID-Liste laden (trusted_souls + vault/connections) ────────
async function loadPeerIds() {
  try {
    const r = await fetch('/api/soul/amortization', { headers: { Authorization: `Bearer ${props.soulCert}` } })
    if (!r.ok) return
    const d = await r.json()
    const ownId    = props.soulCert?.split('.')?.[0] || ''
    const lsKey    = ownId ? `sys.connected_nodes.${ownId}` : null
    let localNodes = []
    if (lsKey) { try { localNodes = JSON.parse(localStorage.getItem(lsKey) || '[]') } catch {} }
    const labelMap = new Map(localNodes.map(n => [n.soul_id, n.label || '']))
    peerIds.value = (d.amortization?.trusted_souls ?? [])
      .map(p => {
        if (typeof p === 'string') return { soul_id: p, endpoint: null, label: labelMap.get(p) || '' }
        return { soul_id: p.soul_id, endpoint: p.endpoint || null, label: p.label || labelMap.get(p.soul_id) || '' }
      })
      .filter(p => p && p.soul_id)
    try {
      const cr = await fetch('/api/vault/connections', { headers: { Authorization: `Bearer ${props.soulCert}` } })
      if (cr.ok) {
        const cd = await cr.json()
        const conns = cd.connections || []
        const aliasMap = new Map(conns.map(c => [c.soul_id, c.alias || '']))
        peerIds.value = peerIds.value.map(p => ({ ...p, label: p.label || aliasMap.get(p.soul_id) || '' }))
        const existingIds = new Set(peerIds.value.map(p => p.soul_id))
        const newPeers = conns
          .filter(c => c.soul_id && !existingIds.has(c.soul_id))
          .map(c => ({ soul_id: c.soul_id, endpoint: c.domain || null, label: c.alias || '' }))
        if (newPeers.length) peerIds.value = [...peerIds.value, ...newPeers]
      }
    } catch { /* silent */ }
  } catch { /* silent */ }
}

// ── Lifecycle ──────────────────────────────────────────────────────
let _briefingTimer        = null
let _lastBriefingMsgCount = 0

function _onLightboxKey(e) { if (e.key === 'Escape') closeLightbox() }

onMounted(async () => {
  _mqMobile = window.matchMedia('(max-width: 900px)')
  isMobile.value = _mqMobile.matches
  _mqMobile.addEventListener('change', _onMqMobile)
  nextTick(() => {
    if (dockEl.value) {
      dockHeight.value = dockEl.value.offsetHeight
      _dockRO = new ResizeObserver(() => {
        if (dockEl.value) dockHeight.value = dockEl.value.offsetHeight
      })
      _dockRO.observe(dockEl.value)
    }
  })
  document.addEventListener('keydown', _onLightboxKey)
  nextTick(autoResize)
  loadMind(props.soulCert)
  loadMcpTools(props.soulCert)
  loadConfigStatus()
  await loadPeerIds()
  await refreshAgentContent()
  // Auto-briefing on open (small delay so content renders first)
  setTimeout(() => {
    const msgs = displayMessages.value
    const total = msgs.slice(-5).map(m => m.content || '').join(' ').replace(/\[.*?\]\(.*?\)/g, '').trim()
  }, 3000)
  _agentPollTimer  = setInterval(refreshAgentContent, 30_000)
  _cacheEvictTimer = setInterval(evictCache, 5 * 60 * 1000)
  _briefingTimer   = setInterval(() => {
    // herz läuft server-seitig — kein Browser-Timer nötig
  }, 3 * 60 * 1000)
})
onUnmounted(() => {
  if (_mqMobile) _mqMobile.removeEventListener('change', _onMqMobile)
  _dockRO?.disconnect()
  document.removeEventListener('keydown', _onLightboxKey)
  for (const { url } of msgBlobCache.values()) URL.revokeObjectURL(url)
  mediaBlobUrls.forEach((url) => URL.revokeObjectURL(url))
  // herz deaktivieren wenn Chat geschlossen wird
  stopHerzHeartbeat()
  if (autonomousKi.value && props.soulCert) {
    fetch('/api/soul/herz/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${props.soulCert}` },
      body: JSON.stringify({ active: false }),
    }).catch(() => {})
  }
})

defineExpose({
  focusInput:           () => textareaEl.value?.focus(),
  sendExternal:         (text) => { if (text?.trim() && !isLoading.value) dispatchToChat(text, {}) },
  getSocialMessages:    () => displayMessages.value,
  addAssistantMessage:  (text) => addMessage('assistant', text),
})
</script>

<style scoped>
/* ════════════════════════════════════════════════════════════════════
   SYS · ChatInterface · Editorial Polish v4
   Drop-in replacement for the <style scoped> block in ChatInterface.vue
   No logic / no template changes required.
   ════════════════════════════════════════════════════════════════════ */

/* ── Design tokens ───────────────────────────────────────────────── */
.sys-chat {
  --rule:    rgba(245,241,234,0.07);
  --rule-2:  rgba(245,241,234,0.12);
  --fg:      #f4f1ea;
  --fg-2:    rgba(244,241,234,0.72);
  --fg-3:    rgba(244,241,234,0.48);
  --fg-4:    rgba(244,241,234,0.30);
  --accent:  #6db89a;
  --accent-bright: #8ad0b3;
  --accent-dim:    rgba(109,184,154,0.14);
  --on-accent: #0c1410;
  --paper-3: #161513;
  --serif:   'Noto Serif', Georgia, serif;
  --mono:    'JetBrains Mono', ui-monospace, monospace;

  display: flex; flex-direction: column;
  flex: 1; min-height: 0; min-width: 0; overflow: hidden;
}

/* ── Stream ──────────────────────────────────────────────────────── */
.stream {
  flex: 1; overflow-y: auto; overflow-x: hidden;
  padding: clamp(20px,3vw,40px) clamp(12px,3vw,32px) clamp(28px,4vw,56px);
  display: flex; flex-direction: column; position: relative;
}
.stream::before {
  content: ""; position: absolute; inset: 0;
  background: radial-gradient(circle at 85% 8%, rgba(109,184,154,0.05), transparent 55%);
  pointer-events: none; z-index: 0;
}
.stream > * { position: relative; z-index: 1; }

.stream-inner {
  display: flex; flex-direction: column;
  gap: 16px;
  width: 100%;
  min-width: 0;
  overflow-x: hidden;
}
.anchor { height: 1px; }

/* ── Inline link ─────────────────────────────────────────────────── */
.inline-link { color: var(--accent-bright); text-decoration: underline; text-underline-offset: 2px; text-decoration-color: rgba(109,184,154,0.4); transition: text-decoration-color 0.15s; }
.inline-link:hover { text-decoration-color: var(--accent-bright); }

/* ── AI message timestamp ────────────────────────────────────────── */
.msg-time-ai {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em;
  color: var(--fg-4); padding: 1px 4px;
  align-self: flex-start; margin-top: 2px;
}
.msg-bubble--me .msg-time-ai { align-self: flex-end; }

/* ── Streaming dots ──────────────────────────────────────────────── */
.dots { display: flex; gap: 6px; padding: 8px 0; }
.dots span { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--fg-3); animation: sys-blink 1.2s infinite; }
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes sys-blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }

/* ── Media embeds ────────────────────────────────────────────────── */
.media-preview.msg-img-wrap { margin-bottom: 10px; }
.media-preview img { display: block; width: 100%; height: auto; border-radius: 0; margin: 0; }
.media-video video { max-width: 100%; display: block; border-radius: 10px; margin-bottom: 10px; }
.media-audio { min-width: 240px; }
.media-audio audio  { width: 100%; height: 36px; display: block; margin-bottom: 4px; }
.media-embed iframe { width: 100%; max-width: 320px; aspect-ratio: 16/9; display: block; margin-bottom: 10px; border-radius: 10px; }
.media-spotify iframe { width: 100%; max-width: 320px; height: 80px; display: block; margin-bottom: 10px; border-radius: 10px; }

.link-card {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px; border: 1px solid var(--rule-2);
  color: var(--fg-3); font-family: var(--mono); font-size: 12px;
  letter-spacing: 0.10em; text-decoration: none; margin-bottom: 10px;
  transition: all 0.15s;
}
.link-card:hover { border-color: var(--rule); color: var(--fg); }
.lc-icon  { flex: none; }
.lc-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
.lc-arr   { flex: none; opacity: 0.4; font-family: var(--serif); }

/* ════════════════════════════════════════════════════════════════════
   BUBBLES — Editorial chat bubbles
   ════════════════════════════════════════════════════════════════════ */

.msg-day-sep {
  align-self: center;
  font-family: var(--mono); font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.14em; color: var(--fg-4);
  background: transparent;
  border: 0; border-radius: 0;
  padding: 4px 14px;
  margin: 22px auto 14px;
  position: relative;
}
.msg-day-sep::before,
.msg-day-sep::after {
  content: ""; position: absolute; top: 50%;
  width: 60px; height: 1px; background: var(--rule);
}
.msg-day-sep::before { right: 100%; margin-right: 12px; }
.msg-day-sep::after  { left: 100%;  margin-left: 12px; }

.msg-bubble {
  display: flex; flex-direction: column;
  gap: 5px;
  box-sizing: border-box;
  min-width: 0;
}
.msg-bubble--me      { align-items: flex-end; }
.msg-bubble--other   { align-items: flex-start; }

.msg-sender {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  opacity: 0.85;
  padding: 0 6px;
}

.msg-bubble-wrap {
  position: relative;
  display: inline-flex;
  max-width: 100%;
}
.msg-bubble--other .msg-bubble-wrap { align-self: flex-start; }
.msg-bubble--me    .msg-bubble-wrap { align-self: flex-end; }

.msg-inner {
  padding: 12px 16px;
  font-family: var(--sans);
  font-size: clamp(14px, 1.35vw, 15.5px);
  line-height: 1.58;
  color: var(--fg);
  word-break: break-word;
  overflow-wrap: anywhere;
  hyphens: auto;
  max-width: 100%;
  box-sizing: border-box;
}
.msg-inner p          { margin: 0 0 6px; }
.msg-inner p:last-child { margin-bottom: 0; }
.msg-inner p:empty    { display: none; }
.msg-inner a          { color: var(--accent-bright); }
.msg-inner *          { overflow-wrap: anywhere; word-break: break-word; max-width: 100%; }

.msg-img-wrap {
  display: inline-block;
  max-width: 320px; width: 100%;
  margin: 2px 0 6px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
}
.msg-media-img {
  display: block; width: 100%; height: auto;
  margin: 0; cursor: zoom-in;
}
.msg-img-actions {
  display: flex;
  background: rgba(10,10,20,0.82);
  backdrop-filter: blur(12px);
  border-top: 1px solid rgba(255,255,255,0.10);
}
.mia-btn {
  flex: 1; background: transparent; border: none;
  color: rgba(255,255,255,0.55);
  cursor: pointer; padding: 9px 4px; min-height: 40px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 3px;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.06em;
  text-transform: uppercase;
  transition: background 0.12s, color 0.12s;
}
.mia-btn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.9); }
.mia-btn--del { color: rgba(248,113,113,0.55); }
.mia-btn--del:hover { background: rgba(248,113,113,0.10); color: #f87171; }
.mia-btn + .mia-btn { border-left: 1px solid rgba(255,255,255,0.08); }

.msg-doc-link { margin-bottom: 6px; }
.msg-doc-a {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 6px;
  text-decoration: none;
  color: var(--fg-2);
  font-family: var(--mono);
  font-size: 12px; letter-spacing: 0.04em;
  max-width: 240px;
  transition: background 0.12s, border-color 0.12s;
}
.msg-doc-a:hover { background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.18); }
.msg-doc-icon { flex-shrink: 0; font-size: 13px; opacity: 0.7; }
.msg-doc-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px; }
.msg-doc-link { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.msg-doc-del {
  flex-shrink: 0; background: transparent;
  border: 1px solid rgba(240,163,163,0.25); border-radius: 4px;
  color: var(--fg-4); font-size: 14px; line-height: 1;
  cursor: pointer; padding: 0; width: 26px; height: 26px; min-height: 26px;
  display: inline-flex; align-items: center; justify-content: center;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.msg-doc-del:hover { color: #f0a3a3; border-color: #f0a3a3; background: rgba(240,163,163,0.08); }

/* ── Lightbox ────────────────────────────────────────────────────── */
.lightbox-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.92);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 16px;
  padding: 24px;
  touch-action: none;
}
.lightbox-img {
  max-width: 100%; max-height: calc(100dvh - 120px);
  object-fit: contain; border-radius: 10px;
  box-shadow: 0 8px 48px rgba(0,0,0,0.6);
}
.lightbox-close {
  position: absolute; top: 16px; right: 16px;
  background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14);
  border-radius: 50%; color: var(--fg-2);
  font-size: 20px; line-height: 1; cursor: pointer;
  width: 40px; height: 40px; min-height: 40px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, border-color 0.15s;
}
.lightbox-close:hover { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.25); }
.lightbox-download {
  background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14);
  border-radius: 8px; color: var(--fg-2);
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
  cursor: pointer; padding: 8px 20px; min-height: 36px;
  transition: background 0.15s, border-color 0.15s;
}
.lightbox-download:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.22); }

.msg-media-loading {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em;
  color: var(--fg-4); padding: 8px 0;
}
.msg-media-error {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em;
  color: #f87171; padding: 6px 0;
}
.msg-expired {
  font-family: var(--mono); font-size: 11px;
  letter-spacing: 0.06em; color: var(--fg-4);
  font-style: italic; margin-bottom: 4px;
}
.dock-doc-icon { font-size: 16px; flex-shrink: 0; color: var(--fg-3); }

/* ── Bubble variants — consistent asymmetric tails ─────────────── */
.msg-inner--me {
  background: rgba(109,184,154,0.10);
  border: 1px solid rgba(109,184,154,0.30);
  border-radius: 16px 4px 16px 16px;
}
.msg-inner--ki {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(109,184,154,0.20);
  border-radius: 16px 16px 16px 4px;
  color: var(--fg);
  font-size: clamp(14px, 1.35vw, 15.5px);
  line-height: 1.58;
}
.msg-inner--ki em { color: var(--accent-bright); font-style: italic; }
.msg-inner--ki code {
  font-family: var(--mono); font-size: 0.85em;
  background: rgba(255,255,255,0.07);
  padding: 1px 5px; border-radius: 3px;
}
.msg-inner--social {
  background: rgba(255,255,255,0.05);
  border-radius: 16px 16px 16px 4px;
  border-left: 2px solid #5baa87;
  color: var(--fg);
}
.msg-inner--agent {
  background: rgba(255,255,255,0.05);
  border-radius: 16px 16px 16px 4px;
  border-left: 2px solid var(--accent-bright);
  color: var(--fg);
}
.msg-inner--synthesis {
  background: rgba(112,153,184,0.07);
  border-radius: 16px 16px 16px 4px;
  border-left: 2px solid #7099b8;
  color: var(--fg);
  font-style: italic;
}

.msg-inner--ki-out {
  background: rgba(109,184,154,0.09);
  border-radius: 16px 16px 4px 16px;
  border: 1px dashed rgba(109,184,154,0.32);
  color: var(--fg);
  font-size: 0.94em;
}

.msg-bubble--archivar {
  align-self: stretch;
  max-width: 100%;
  opacity: 0.78;
  margin: 10px 0;
}
.msg-bubble--archivar .msg-sender {
  font-size: 9px;
  letter-spacing: 0.20em;
  text-align: center;
  padding: 0 2px;
}
.msg-bubble--archivar .msg-inner--synthesis {
  background: transparent;
  border-radius: 0;
  border-left: none;
  border-top: 1px solid rgba(112,153,184,0.18);
  padding: 10px 4px 8px;
  font-size: 13px; line-height: 1.55;
  font-style: italic;
  color: var(--fg-3);
}

/* ── Foot ──────────────────────────────────────────────────────── */
.msg-foot {
  display: flex; align-items: center;
  gap: 8px;
  padding: 0 6px;
  margin-top: 2px;
  min-height: 14px;
}
.msg-bubble--me .msg-foot { flex-direction: row-reverse; }
.msg-bubble--me .msg-foot .msg-to { order: 1; }

.msg-to {
  font-family: var(--mono);
  font-size: 10px; letter-spacing: 0.06em;
  font-weight: 600;
}
.msg-time {
  font-family: var(--mono);
  font-size: 10px; color: var(--fg-4);
  letter-spacing: 0.06em;
}

.msg-delivery {
  font-family: var(--mono);
  font-size: 10px; letter-spacing: 0.04em;
  transition: color 0.2s, opacity 0.2s;
  cursor: default; user-select: none;
}
.msg-delivery--saving    { color: var(--fg-4); opacity: 0.5; }
.msg-delivery--saved     { color: var(--fg-4); }
.msg-delivery--delivered { color: #5baa87; }
.msg-delivery--error     { color: #fbbf24; }

.msg-vault-del {
  margin-left: 4px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--fg-4);
  font-size: 13px; line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 22px; height: 22px;
  min-height: 22px;
  display: inline-flex;
  align-items: center; justify-content: center;
  border-radius: 50%;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}
.msg-vault-del:hover {
  color: #f0a3a3;
  background: rgba(240,163,163,0.10);
  border-color: rgba(240,163,163,0.30);
}

.msg-vault-del-overlay {
  position: absolute;
  top: -8px; right: -8px;
  width: 24px; height: 24px;
  min-height: 24px;
  background: var(--paper-3);
  border: 1px solid var(--rule-2);
  border-radius: 50%;
  color: var(--fg-3);
  font-size: 13px; line-height: 1;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  padding: 0;
  z-index: 2;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, border-color 0.15s, background 0.15s;
}
.msg-bubble-wrap:hover .msg-vault-del-overlay,
.msg-vault-del-overlay:focus-visible { opacity: 1; }
.msg-vault-del-overlay:hover {
  color: #f0a3a3;
  border-color: rgba(240,163,163,0.50);
  background: rgba(240,163,163,0.12);
}
@media (hover: none) { .msg-vault-del-overlay { opacity: 1; } }

.msg-forward-btn {
  margin-left: 6px;
  background: transparent;
  border: 1px solid rgba(112,153,184,0.3);
  color: #7099b8;
  font-family: var(--mono);
  font-size: 10px; letter-spacing: 0.08em;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 4px;
  min-height: 22px;
  transition: all 0.15s;
}
.msg-forward-btn:hover { background: rgba(112,153,184,0.10); border-color: #7099b8; }
.msg-forwarded {
  margin-left: 6px;
  font-family: var(--mono);
  font-size: 10px; color: #5baa87;
  letter-spacing: 0.06em;
}

/* ── Capture cards — centered, framed, recognizably their own surface ─ */
.capture-wrap {
  align-self: center;
  width: 100%;
  max-width: 480px;
  margin: 8px auto;
  position: relative;
  background: linear-gradient(180deg,
    rgba(139, 92, 246, 0.06),
    rgba(139, 92, 246, 0.02) 60%,
    transparent);
  border: 1px solid rgba(139, 92, 246, 0.22);
  border-radius: 14px;
  padding: 6px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.03) inset,
    0 12px 40px rgba(0, 0, 0, 0.25);
}
.capture-wrap > :not(.capture-dismiss) {
  border-radius: 10px;
  overflow: hidden;
}
.capture-wrap::before {
  content: "Aufnahme";
  position: absolute;
  top: -10px; left: 14px;
  padding: 1px 8px;
  background: var(--paper-3);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(167, 139, 250, 0.78);
  border: 1px solid rgba(139, 92, 246, 0.22);
  border-radius: 4px;
}
.capture-dismiss {
  position: absolute;
  top: -10px; right: 10px;
  z-index: 10;
  width: 28px; height: 28px;
  min-height: 28px;
  padding: 0; flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: var(--paper-3);
  color: var(--fg-3);
  font-size: 12px; line-height: 1;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: color 0.15s, background 0.15s, border-color 0.15s, transform 0.15s;
}
.capture-dismiss:hover {
  color: #f0a3a3;
  background: rgba(240, 163, 163, 0.10);
  border-color: rgba(240, 163, 163, 0.40);
}
.capture-dismiss:active { transform: scale(0.92); }

/* ── Mic button ──────────────────────────────────────────────────── */
.dock-mic {
  flex-shrink: 0;
  touch-action: none; /* prevent scroll stealing the hold gesture on mobile */
  transition: background .15s, color .15s, box-shadow .15s;
}
.tts-stop-btn {
  color: var(--sys-accent-bright);
  border-color: rgba(var(--sys-accent-bright-rgb, 109,184,154), 0.4);
}
.tts-stop-btn:hover {
  background: rgba(var(--sys-accent-bright-rgb, 109,184,154), 0.15);
}
.tts-stop-enter-active, .tts-stop-leave-active { transition: opacity .15s, transform .15s; }
.tts-stop-enter-from, .tts-stop-leave-to { opacity: 0; transform: scale(0.7); }
.dock-mic.recording {
  background: rgba(239, 68, 68, 0.22);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.55);
  animation: mic-pulse 1s ease-in-out infinite;
}
@keyframes mic-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.35); }
  50%       { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
}

/* ════════════════════════════════════════════════════════════════════
   DOCK — softer container, modern chat-input feel
   ════════════════════════════════════════════════════════════════════ */

.dock {
  border-top: 1px solid var(--rule);
  background: rgba(22,21,19,0.88);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  flex-shrink: 0;
  display: flex; flex-direction: column;
  padding: 10px clamp(10px, 2vw, 18px) 12px;
  gap: 8px;
  position: relative;
}

.dock-growth-lock {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px;
  background: rgba(109, 184, 154, 0.07);
  border: 1px solid rgba(109, 184, 154, 0.18);
  border-radius: 10px;
  font-family: var(--mono); font-size: 11px;
  letter-spacing: 0.10em; text-transform: uppercase;
  color: var(--accent); opacity: 0.85;
}
.dock-growth-spinner {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  border: 1.5px solid rgba(109, 184, 154, 0.3);
  border-top-color: var(--accent);
  animation: dock-spin 0.9s linear infinite;
}
@keyframes dock-spin { to { transform: rotate(360deg); } }

.dock-mode-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 2px 4px;
  min-height: 22px;
}
.mode-cmd-toggle {
  display: inline-flex; align-items: center; gap: 3px;
  background: var(--surface-2); border: 1px solid var(--line); cursor: pointer;
  font-family: var(--mono); font-size: 12px;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--fg-2); padding: 4px 10px;
  border-radius: 999px;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}
.mode-cmd-toggle:hover { color: var(--fg); border-color: var(--line-2); }
.mode-cmd-toggle.active {
  color: var(--accent); border-color: rgba(109,184,154,0.35);
  background: var(--accent-dim);
}
.mode-at { color: var(--accent); font-weight: 700; }
.archivar-facts-count {
  margin-left: 4px;
  background: var(--accent); color: #0e1a14;
  font-size: 9px; font-weight: 700;
  padding: 1px 5px; border-radius: 999px;
  line-height: 1.4;
}

.archivar-panel {
  margin: 0 4px 6px;
  border: 1px solid var(--sys-rule);
  border-radius: var(--r-xs);
  background: var(--surface-2);
  overflow: hidden;
}
.archivar-panel-loading {
  padding: 12px 14px;
  font-family: var(--mono); font-size: 11px; color: var(--fg-3);
}
.archivar-panel-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 14px;
  border-bottom: 1px solid var(--sys-rule);
  font-family: var(--mono); font-size: 11px;
}
.archivar-panel-key { color: var(--fg); letter-spacing: 0.06em; text-transform: uppercase; font-size: 10px; }
.archivar-panel-val { color: var(--fg); letter-spacing: 0.04em; }
.archivar-panel-ok  { color: var(--sys-ok); }
.archivar-panel-warn { color: var(--sys-warn); }
.archivar-panel-btn {
  display: block; width: calc(100% - 28px); margin: 10px 14px;
  padding: 7px 0; border-radius: var(--r-xs);
  border: 1px solid rgba(109,184,154,0.35);
  background: var(--accent-dim); color: var(--accent);
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em;
  cursor: pointer; transition: background 0.15s;
}
.archivar-panel-btn:hover { background: rgba(109,184,154,0.18); }
.archivar-panel-btn:disabled { opacity: 0.5; cursor: default; }
.archivar-panel-msg {
  margin: 0 14px 10px;
  padding: 7px 10px;
  font-family: var(--mono); font-size: 10px;
  border-left: 2px solid;
  border-radius: 0 var(--r-xs) var(--r-xs) 0;
}
.archivar-panel-msg.ok  { border-color: var(--sys-ok);  color: var(--sys-ok);  background: rgba(184,220,196,0.06); }
.archivar-panel-msg.err { border-color: var(--sys-err); color: var(--sys-err); background: rgba(240,163,163,0.06); }
.archivar-chaos-wrap { display: flex; align-items: center; gap: 8px; }
.archivar-chaos-bar  { width: 64px; flex-shrink: 0; height: 6px; background: rgba(255,255,255,0.18); border-radius: 3px; overflow: hidden; }
.archivar-chaos-fill { display: block; height: 100%; border-radius: 3px; transition: width 0.6s ease, background 0.6s ease; }
.archivar-panel-fade-enter-active, .archivar-panel-fade-leave-active { transition: opacity 0.15s, transform 0.15s; }
.archivar-panel-fade-enter-from, .archivar-panel-fade-leave-to { opacity: 0; transform: translateY(4px); }

.mode-sep {
  width: 1px; height: 12px; flex: none;
  background: var(--rule-2);
}
.mode-status {
  font-family: var(--mono); font-size: 10px;
  letter-spacing: 0.10em; text-transform: uppercase;
  color: var(--fg-4);
}
.mode-activity {
  display: flex; align-items: center; gap: 3px;
}
.mode-activity span {
  display: inline-block; width: 4px; height: 4px; border-radius: 50%;
  background: var(--accent); opacity: 0.6;
  animation: sys-blink 1.2s infinite;
}
.mode-activity span:nth-child(2) { animation-delay: 0.2s; }
.mode-activity span:nth-child(3) { animation-delay: 0.4s; }

.model-btn {
  background: var(--accent-dim);
  border: 1px solid rgba(109,184,154,0.30);
  border-radius: 999px;
  color: var(--accent);
  font-family: var(--mono); font-size: 12px;
  letter-spacing: 0.04em;
  padding: 4px 13px;
  cursor: pointer;
  outline: 0;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.model-btn:hover { color: var(--accent-bright); border-color: var(--accent); background: rgba(109,184,154,0.22); }

.archivar-toggle {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--line-2);
  background: var(--surface-2); cursor: pointer;
  font-family: var(--mono); font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--fg-2); padding: 4px 12px;
  border-radius: 999px;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}
.archivar-toggle:hover { color: var(--fg); border-color: var(--line-2); }
.archivar-toggle.active {
  color: var(--accent);
  border-color: rgba(109, 184, 154, 0.35);
  background: var(--accent-dim);
}
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

.cmd-toggle {
  margin-left: auto;
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.05em;
  color: var(--fg-4);
  background: transparent; border: 1px solid transparent; cursor: pointer;
  padding: 2px 7px; border-radius: 999px;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.cmd-toggle:hover { color: var(--fg-2); border-color: var(--rule-2); }
.cmd-toggle.active { color: var(--accent); border-color: rgba(109,184,154,0.3); background: rgba(109,184,154,0.08); }

.cmd-strip {
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 8px 2px;
  width: 100%; min-width: 0; box-sizing: border-box;
}

.cmd-chip {
  display: inline-flex; align-items: center; gap: 1px;
  padding: 6px 13px; border-radius: 999px;
  background: var(--accent-dim); border: 1px solid rgba(109,184,154,0.30);
  color: var(--accent);
  font-family: var(--mono); font-size: 13px; letter-spacing: 0.04em;
  cursor: pointer; white-space: nowrap;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.cmd-chip:hover {
  background: rgba(109,184,154,0.22); border-color: var(--accent);
  color: var(--accent-bright);
}

/* ── Filter strip (mobile dock) ── */
.filter-strip {
  display: flex; gap: 4px; padding: 6px 0 2px;
  overflow-x: auto; scrollbar-width: none;
}
.filter-strip::-webkit-scrollbar { display: none; }
.filter-strip button {
  padding: 4px 12px; border: 1px solid transparent; flex-shrink: 0;
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--fg-3); white-space: nowrap; cursor: pointer;
  transition: color 0.12s, border-color 0.12s, background 0.12s;
}
.filter-strip button.on {
  color: var(--accent); border-color: rgba(109,184,154,0.30);
  background: rgba(109,184,154,0.07);
}
.filter-strip button:hover:not(.on) { color: var(--fg); }

/* ── Filter toggle button ── */
.dock-filter-btn { color: var(--fg-3); }
.dock-filter-btn.active { color: var(--accent); }
.dock-filter-btn.filter-on { color: var(--accent-bright); }
.dock-filter-btn { display: none; }
.cmd-at { color: var(--accent); font-size: 10px; }

.cmd-strip-enter-active { transition: opacity 0.14s ease, transform 0.16s ease; }
.cmd-strip-leave-active { transition: opacity 0.10s ease, transform 0.12s ease; }
.cmd-strip-enter-from, .cmd-strip-leave-to { opacity: 0; transform: translateY(6px); }
.cmd-strip-enter-to, .cmd-strip-leave-from { opacity: 1; transform: translateY(0); }

/* ── Media picker (compact chip row) ── */
.media-picker {
  display: flex; flex-wrap: nowrap; gap: 6px; padding: 6px 2px 2px;
}
.mp-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 13px; border-radius: 999px;
  background: var(--accent-dim); border: 1px solid rgba(109,184,154,0.30);
  color: var(--accent); cursor: pointer;
  font-family: var(--mono); font-size: 13px; letter-spacing: 0.04em;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.mp-btn:hover:not(:disabled) {
  background: rgba(109,184,154,0.22); border-color: var(--accent); color: var(--accent-bright);
}
.mp-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* ── @ dock button ── */
.dock-at { font-size: 15px; font-weight: 600; }
.dock-at-sym { font-family: var(--mono); font-size: 14px; color: var(--accent); transition: color 0.12s; }
.dock-at.active .dock-at-sym { color: var(--accent-bright); }

.dock-main {
  display: flex; align-items: center;
  min-height: 48px;
  background: transparent;
  border: none;
  border-top: 1px solid var(--rule);
  padding: 4px 0;
  gap: 4px;
}
.dock-main:focus-within {
  border-top-color: rgba(109, 184, 154, 0.30);
}

.dock-icon {
  display: flex; align-items: center; justify-content: center;
  width: 44px; flex-shrink: 0;
  border: 0;
  background: transparent; cursor: pointer;
  color: var(--accent);
  transition: color 0.12s, background 0.12s;
}
.dock-icon:hover:not(:disabled) {
  color: var(--accent-bright);
  background: var(--accent-dim);
}
.dock-icon:disabled { opacity: 0.3; cursor: not-allowed; }
.dock-icon-svg { width: 16px; height: 16px; }

.dock-plus { color: var(--fg-2); }
.dock-plus.active { color: var(--accent); }
.dock-plus svg { transition: transform 0.2s; }
.dock-plus.active svg { transform: rotate(45deg); }

.media-drawer { display: flex; }
.media-drawer-enter-active, .media-drawer-leave-active {
  transition: opacity 0.18s, max-width 0.22s ease;
  overflow: hidden; max-width: 88px;
}
.media-drawer-enter-from, .media-drawer-leave-to { opacity: 0; max-width: 0; }

.input-wrap {
  flex: 1;
  display: flex; align-items: center;
  padding: 0 8px;
  min-width: 0;
}
.input {
  font-family: var(--sans);
  font-size: clamp(16px, 1.5vw, 17px);
  color: var(--fg); border: 0; outline: 0;
  background: transparent;
  padding: 13px 6px;
  width: 100%; min-width: 0;
  line-height: 1.5;
  resize: none; overflow-y: auto;
  min-height: 48px; max-height: 140px;
}
.input::placeholder { color: var(--fg-2); }

.send {
  width: 36px; height: 36px; flex-shrink: 0;
  border: 0; border-radius: 50%;
  background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
  color: var(--fg-4);
}
.send:not(:disabled) { color: var(--accent); }
.send:not(:disabled):hover { background: rgba(109,184,154,0.12); color: var(--accent-bright); }
.send:disabled { opacity: 0.35; cursor: not-allowed; }
.arr-icon { width: 17px; height: 17px; }

.pulse { animation: sys-blink 1.2s infinite; }

/* ── Message action buttons ──────────────────────────────────────── */
.msg-actions {
  display: flex; gap: 10px; flex-wrap: wrap;
  margin-top: 14px;
}
.msg-action-btn {
  font-family: var(--mono); font-size: 11px;
  letter-spacing: 0.12em; text-transform: uppercase;
  padding: 8px 16px;
  border: 1px solid var(--rule-2);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  min-height: 36px;
}
.msg-action-btn.primary {
  background: var(--accent); color: var(--on-accent); border-color: var(--accent);
}
.msg-action-btn.primary:hover:not(:disabled) {
  background: var(--accent-bright); border-color: var(--accent-bright);
}
.msg-action-btn.secondary {
  background: transparent; color: var(--fg-2);
}
.msg-action-btn.secondary:hover:not(:disabled) {
  color: var(--fg); border-color: var(--rule);
  background: rgba(255,255,255,0.03);
}
.msg-action-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.msg-action-btn.selected {
  background: rgba(109,184,154,0.15);
  border-color: rgba(109,184,154,0.5);
  color: var(--accent);
}
.msg-action-btn.selected:hover:not(:disabled) {
  background: rgba(109,184,154,0.22);
}

/* ── Web-Suche: Quellen-Chips ──────────────────────────────────── */
.msg-sources {
  display: flex; flex-direction: column; gap: 5px;
  margin-top: 14px;
}
.source-chip {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  align-items: baseline;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--rule-2);
  background: rgba(255,255,255,0.02);
  text-decoration: none;
  color: var(--fg-3);
  transition: background 0.12s, border-color 0.12s;
  min-width: 0;
}
.source-chip:hover { background: rgba(109,184,154,0.07); border-color: rgba(109,184,154,0.25); }
.src-n {
  font-family: var(--mono); font-size: 10px; color: var(--accent);
  letter-spacing: 0.05em; flex-shrink: 0;
}
.src-title {
  font-size: 12px; color: var(--fg-2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.src-domain {
  font-family: var(--mono); font-size: 9.5px; color: var(--fg-4);
  white-space: nowrap; letter-spacing: 0.04em;
}

/* ── Desktop dock: mehr Abstand unten — Input-Feld optisch höher ── */
@media (min-width: 901px) {
  .dock { padding-bottom: 24px; border-bottom: 1px solid var(--rule); }
  /* Desktop: center the stream column, constrain bubble widths */
  .stream-inner { max-width: 780px; margin: 0 auto; }
  .msg-bubble { max-width: min(78%, 580px); }
  .msg-bubble--me    { align-self: flex-end;   margin-right: 8px; }
  .msg-bubble--other { align-self: flex-start; }
}

/* ── Mobile FAB (hidden on desktop) ─────────────────────────────── */
.mobile-fab { display: none; }

/* ════════════════════════════════════════════════════════════════════
   RESPONSIVE
   ════════════════════════════════════════════════════════════════════ */

@media (max-width: 900px) {
  /* Stream: symmetric 16px horizontal padding */
  .stream { padding: 16px 16px calc(env(safe-area-inset-bottom, 0px) + 80px); box-sizing: border-box; overflow-x: hidden; width: 100%; }
  .mob-composer-open .stream { padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 260px); }
  /* No margin:auto or max-width on desktop → no overrides needed here. Just tighten gap. */
  .stream-inner { gap: 14px; overflow-x: hidden; box-sizing: border-box; }

  /* Mobile bubbles: same left/right alignment as desktop, just wider max-width */
  .msg-bubble     { max-width: 82%; gap: 4px; margin-right: 0; margin-left: 0; }
  .msg-bubble--me    { align-self: flex-end;   align-items: flex-end;   margin-right: 0; }
  .msg-bubble--other { align-self: flex-start; align-items: flex-start; }
  .msg-bubble--archivar { align-self: stretch; max-width: 100%; }

  .msg-bubble--me .msg-inner  { border-radius: 16px 4px 16px 16px; }
  .msg-sender { font-size: 9.5px; letter-spacing: 0.12em; padding: 0 4px; }
  .msg-inner  { max-width: 100%; padding: 11px 14px; font-size: 15px; line-height: 1.50; overflow-wrap: anywhere; word-break: break-word; box-sizing: border-box; }
  .msg-media-img { max-width: 100%; }
  .msg-inner img, .msg-inner video, .msg-inner iframe { max-width: 100%; width: auto; }
  .media-audio { min-width: 220px; }
  .media-audio audio { width: 100%; max-width: 100%; }
  .media-embed iframe, .media-spotify iframe { max-width: 100%; }
  .msg-doc-a { max-width: 100%; }
  .msg-doc-name { max-width: 100%; }

  .msg-day-sep::before,
  .msg-day-sep::after { width: 28px; }

  .msg-foot { gap: 6px; padding: 0 4px; flex-wrap: wrap; }

  .msg-vault-del-overlay { top: -6px; right: -6px; width: 26px; height: 26px; opacity: 1; }

  .capture-wrap {
    align-self: stretch;
    width: 100%; max-width: 100%;
    margin: 8px 0;
    box-sizing: border-box;
  }

  /* Dock: always visible on mobile, fixed at bottom */
  .dock {
    position: fixed;
    bottom: 0;
    left: 0; right: 0;
    z-index: 200;
    padding: 10px 14px max(12px, env(safe-area-inset-bottom, 12px)); gap: 7px;
    background: rgba(22, 21, 19, 0.96);
    backdrop-filter: blur(32px);
    -webkit-backdrop-filter: blur(32px);
    border-top: 1px solid rgba(109, 184, 154, 0.14);
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.24);
  }
  /* chip strip padding adjustment on mobile */
  .cmd-strip { padding: 4px 0 2px; }
  .dock-mode-bar { gap: 6px; flex-wrap: wrap; min-height: 20px; }
  .archivar-toggle { font-size: 12px; padding: 4px 10px; }
  .archivar-dot { width: 5px; height: 5px; }
  .model-btn { font-size: 12px; padding: 4px 10px; }
  .mode-cmd-toggle { font-size: 11px; padding: 2px 8px; }
  .dock-icon { width: 40px; }
  .input-wrap { padding: 0 10px; }
  /* font-size ≥ 16px verhindert Auto-Zoom beim Fokussieren auf Android/iOS */
  .input { padding: 11px 4px; font-size: 16px; }
  /* stream padding: dock height (≈80px) + safe-area */
  .stream { padding: 16px 16px calc(env(safe-area-inset-bottom, 0px) + 90px); }
  .mob-composer-open .stream { padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 90px); }
  .mobile-fab { display: none; }
}

/* ── Empty state ─────────────────────────────────────────────────── */
.agent-empty {
  flex: 1;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px; padding: 48px 32px;
  text-align: center;
}
.agent-empty-icon { font-size: 28px; color: var(--fg-4); margin: 0; line-height: 1; }
.agent-empty-title {
  font-family: var(--mono);
  font-size: 12px; letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg-3); margin: 0;
}
.agent-empty-hint {
  font-family: var(--mono);
  font-size: 12px; color: var(--fg-4);
  line-height: 1.6; max-width: 320px; margin: 0;
}
.saving-dots { padding: 12px clamp(16px,3vw,40px); }

/* ── Agent ID badges ────────────────────────────────────────────── */
.agent-id-bar {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin-top: 8px;
}
.agent-id-badge {
  font-family: var(--mono);
  font-size: 11px; letter-spacing: 0.06em;
  color: var(--fg-4);
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 2px 8px;
  white-space: nowrap;
}
.agent-id-badge.tx { opacity: 0.6; }

/* ── Dock media preview ─────────────────────────────────────────── */
.dock-media-preview {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px;
  background: rgba(139, 92, 246, 0.05);
  border: 1px solid rgba(109, 184, 154, 0.18);
  border-radius: 10px;
  order: -1;
}
.dock-media-thumb {
  width: 32px; height: 32px;
  object-fit: cover;
  border-radius: 5px;
  border: 1px solid var(--rule-2);
  flex-shrink: 0;
}
.dock-media-name {
  font-family: var(--mono);
  font-size: 11px; color: var(--fg-2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1;
  letter-spacing: 0.02em;
}
.dock-media-remove {
  font-size: 11px; color: var(--fg-3);
  background: transparent; border: 1px solid var(--rule-2);
  cursor: pointer;
  width: 22px; height: 22px;
  min-height: 22px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  flex-shrink: 0;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}
.dock-media-remove:hover {
  color: #f0a3a3;
  border-color: rgba(240,163,163,0.40);
  background: rgba(240,163,163,0.08);
}

/* ── KI-Disclaimer ──────────────────────────────────────────────── */
.dock-disclaimer { display: none; }

/* ── Peer error notice ──────────────────────────────────────────── */
.peer-error-notice {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 14px;
  background: rgba(251,191,36,0.06);
  border: 1px solid rgba(251,191,36,0.20);
  border-radius: 8px;
  font-family: var(--mono);
  font-size: 11px; color: #fbbf24;
  letter-spacing: 0.04em; line-height: 1.5;
  flex-shrink: 0; word-break: break-all;
  margin-bottom: 12px;
}
.peer-error-icon { flex-shrink: 0; margin-top: 1px; }

/* ── Vault shared session banner ────────────────────────────────── */
.shared-files-banner {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px;
  padding: 7px 12px;
  background: rgba(139, 92, 246, 0.05);
  border: 1px solid rgba(109, 184, 154, 0.18);
  border-radius: 10px;
  flex-shrink: 0;
}
.sfb-info {
  font-family: var(--mono);
  font-size: 11px; color: var(--fg-3);
  letter-spacing: 0.04em;
  flex: 1; min-width: 0;
}
.sfb-delete {
  font-family: var(--mono);
  font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
  background: transparent;
  border: 1px solid rgba(240,163,163,0.30);
  color: #f0a3a3;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 4px;
  flex-shrink: 0;
  min-height: 28px;
  transition: all 0.15s;
}
.sfb-delete:hover { background: rgba(240,163,163,0.08); border-color: #f0a3a3; }

</style>
