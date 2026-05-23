<template>
  <Teleport to="body">
    <Transition name="sys-modal-fade">
      <div v-if="open" class="sys-modal-overlay" @click.self="$emit('close')" role="dialog" aria-modal="true" aria-label="Einstellungen">
        <div class="sys-modal sys-modal--md" style="max-width:520px">
          <div class="sys-modal-handle"></div>

          <!-- Head -->
          <div class="sys-modal-head" style="padding:20px 28px 16px">
            <button class="sys-modal-close" @click="$emit('close')" aria-label="Schließen">×</button>
            <span class="sys-kicker" style="margin-bottom:0;padding-bottom:0;border-bottom:none">Einstellungen</span>
          </div>

          <!-- Rail / Tabs -->
          <div class="sys-rail" :class="'sys-rail--2'">
            <button
              @click="tab = 'api'"
              class="sys-rail-item"
              :class="tab === 'api' ? 'is-active' : ''"
            >
              <span class="sys-rail-num">
                <span class="sys-rail-check" v-if="keySource === 'soul'">✓</span>
                <span v-else>K</span>
              </span>
              <span class="sys-rail-lbl">
                <span class="sys-rail-t">API-Keys</span>
                <span class="sys-rail-sub">Anthropic · WaveSpeed · ElevenLabs</span>
              </span>
            </button>

            <button
              v-if="!isAdmin"
              @click="tab = 'connect'"
              class="sys-rail-item"
              :class="tab === 'connect' ? 'is-active' : ''"
            >
              <span class="sys-rail-num">A</span>
              <span class="sys-rail-lbl">
                <span class="sys-rail-t">Admin</span>
                <span class="sys-rail-sub">Token verbinden</span>
              </span>
            </button>

            <button
              v-if="isAdmin"
              @click="tab = 'admin'"
              class="sys-rail-item"
              :class="tab === 'admin' ? 'is-active' : ''"
            >
              <span class="sys-rail-num">S</span>
              <span class="sys-rail-lbl">
                <span class="sys-rail-t">Server-Admin</span>
                <span class="sys-rail-sub">Key-Rotation</span>
              </span>
            </button>
          </div>

          <!-- Body -->
          <div class="sys-modal-body" style="padding:24px 28px;overflow-y:auto">

            <!-- ── Tab: Mein API-Key ── -->
            <template v-if="tab === 'api'">

              <!-- Key status -->
              <div class="sys-state" :class="keySource === 'soul' ? 'sys-state--ok' : keySource === 'none' ? '' : 'sys-state--info'" style="margin-bottom:20px">
                <div class="sys-state-mark"></div>
                <div class="sys-state-text">
                  <span class="sys-state-label">{{ keySourceLabel }}</span>
                  <span v-if="keyPreview" class="sys-state-value">{{ keyPreview }}</span>
                </div>
              </div>

              <!-- Model -->
              <div class="sys-field" style="gap:12px;margin-bottom:24px">
                <label class="sys-field-label">Modell</label>
                <select v-model="model" class="sys-input" style="cursor:pointer">
                  <option value="">Server-Standard</option>
                  <option value="claude-opus-4-6">Claude Opus 4.6 — leistungsstark</option>
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6 — ausgewogen</option>
                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 — schnell</option>
                </select>
              </div>

              <!-- Anthropic Key -->
              <div class="sys-field" style="gap:12px;margin-bottom:24px">
                <label class="sys-field-label">Anthropic API-Key</label>
                <div style="display:flex;gap:0">
                  <input
                    v-model="apiKey"
                    :type="showKey ? 'text' : 'password'"
                    class="sys-input sys-input--mono"
                    style="flex:1;border-right:none"
                    :style="(keySource === 'soul' || keySource === 'master') ? 'border-color:var(--sys-ok)' : 'border-color:var(--sys-err)'"
                    placeholder="sk-ant-..."
                    autocomplete="off"
                    spellcheck="false"
                    @keyup.enter="saveConfig"
                  />
                  <button
                    @click="showKey = !showKey"
                    class="sys-btn-ed sys-btn-ed--ghost"
                    style="padding:0 12px;border-left:none"
                    :aria-label="showKey ? 'Key verbergen' : 'Key anzeigen'"
                  >
                    <i :class="showKey ? 'ri-eye-off-line' : 'ri-eye-line'" class="ri-fw" style="font-size:13px" />
                  </button>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  <button
                    @click="testKey('anthropic', apiKey, !apiKey && !!keyPreview)"
                    :disabled="anthTest?.loading || (!apiKey && !keyPreview)"
                    class="sys-btn-ed sys-btn-ed--ghost"
                    style="height:26px;font-size:10px;padding:0 10px;letter-spacing:0.08em"
                  >{{ anthTest?.loading ? 'Teste…' : 'Testen' }}</button>
                  <span v-if="anthTest && !anthTest.loading" style="font-family:var(--sys-mono);font-size:10px"
                    :style="anthTest.ok ? 'color:var(--sys-ok)' : 'color:var(--sys-err)'">
                    {{ anthTest.message }}
                  </span>
                </div>
                <p style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-fg);letter-spacing:0.08em;margin:0">
                  Leer lassen → Server-Key (Fallback).
                  <a href="https://console.anthropic.com" target="_blank" rel="noopener" style="color:var(--sys-accent-bright)">console.anthropic.com</a>
                </p>
              </div>

              <!-- WaveSpeed Key -->
              <div class="sys-field" style="gap:12px;margin-bottom:24px">
                <label class="sys-field-label">
                  WaveSpeed API-Key
                  <span v-if="wavespeedKeySet" style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-ok);text-transform:none;letter-spacing:0;margin-left:8px">{{ wavespeedPreview }}</span>
                </label>
                <div style="display:flex;gap:0">
                  <input
                    v-model="wavespeedKey"
                    :type="showWavespeedKey ? 'text' : 'password'"
                    class="sys-input sys-input--mono"
                    style="flex:1;border-right:none"
                    :style="wavespeedKeySet ? 'border-color:var(--sys-ok)' : 'border-color:var(--sys-err)'"
                    :placeholder="wavespeedKeySet ? 'Neu eingeben zum Überschreiben…' : 'WaveSpeed API-Key…'"
                    autocomplete="off"
                    spellcheck="false"
                    @input="wavespeedDirty = true"
                    @keyup.enter="saveConfig"
                  />
                  <button
                    @click="showWavespeedKey = !showWavespeedKey"
                    class="sys-btn-ed sys-btn-ed--ghost"
                    style="padding:0 12px;border-left:none"
                    :aria-label="showWavespeedKey ? 'Key verbergen' : 'Key anzeigen'"
                  >
                    <i :class="showWavespeedKey ? 'ri-eye-off-line' : 'ri-eye-line'" class="ri-fw" style="font-size:13px" />
                  </button>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  <button
                    @click="testKey('wavespeed', wavespeedKey, !wavespeedKey && wavespeedKeySet)"
                    :disabled="waveTest?.loading || (!wavespeedKey && !wavespeedKeySet)"
                    class="sys-btn-ed sys-btn-ed--ghost"
                    style="height:26px;font-size:10px;padding:0 10px;letter-spacing:0.08em"
                  >{{ waveTest?.loading ? 'Teste…' : 'Testen' }}</button>
                  <span v-if="waveTest && !waveTest.loading" style="font-family:var(--sys-mono);font-size:10px"
                    :style="waveTest.ok ? 'color:var(--sys-ok)' : 'color:var(--sys-err)'">
                    {{ waveTest.message }}
                  </span>
                </div>
                <p style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-fg);letter-spacing:0.08em;margin:0">
                  Für KI-Bildgenerierung.
                  <a href="https://wavespeed.ai" target="_blank" rel="noopener" style="color:var(--sys-accent-bright)">wavespeed.ai</a>
                </p>
              </div>

              <!-- Brave Search Key -->
              <div class="sys-field" style="gap:12px">
                <label class="sys-field-label">
                  Brave Search API-Key
                  <span v-if="braveKeySet" style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-ok);text-transform:none;letter-spacing:0;margin-left:8px">{{ bravePreview }}</span>
                </label>
                <input
                  v-model="braveKey"
                  type="password"
                  class="sys-input sys-input--mono"
                  :style="braveKeySet ? 'border-color:var(--sys-ok)' : ''"
                  :placeholder="braveKeySet ? 'Neu eingeben zum Überschreiben…' : 'BSA…'"
                  autocomplete="off"
                  spellcheck="false"
                  @input="braveDirty = true"
                  @keyup.enter="saveConfig"
                />
                <p style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-fg);letter-spacing:0.08em;margin:0">
                  Für @suche — KI-Websuchmaschine.
                  <a href="https://brave.com/search/api/" target="_blank" rel="noopener" style="color:var(--sys-accent-bright)">brave.com/search/api</a> (Free: 2000/Monat)
                </p>
              </div>

              <!-- ElevenLabs Key -->
              <div class="sys-field" style="gap:12px;margin-bottom:0">
                <label class="sys-field-label">
                  ElevenLabs API-Key
                  <span v-if="elevenlabsKeySet" style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-ok);text-transform:none;letter-spacing:0;margin-left:8px">{{ elevenlabsPreview }}</span>
                </label>
                <div style="display:flex;gap:0">
                  <input
                    v-model="elevenlabsKey"
                    :type="showElevenlabsKey ? 'text' : 'password'"
                    class="sys-input sys-input--mono"
                    style="flex:1;border-right:none"
                    :style="elevenlabsKeySet ? 'border-color:var(--sys-ok)' : 'border-color:var(--sys-err)'"
                    :placeholder="elevenlabsKeySet ? 'Neu eingeben zum Überschreiben…' : 'ElevenLabs API-Key…'"
                    autocomplete="off"
                    spellcheck="false"
                    @input="elevenlabsDirty = true"
                    @keyup.enter="saveConfig"
                  />
                  <button
                    @click="showElevenlabsKey = !showElevenlabsKey"
                    class="sys-btn-ed sys-btn-ed--ghost"
                    style="padding:0 12px;border-left:none"
                    :aria-label="showElevenlabsKey ? 'Key verbergen' : 'Key anzeigen'"
                  >
                    <i :class="showElevenlabsKey ? 'ri-eye-off-line' : 'ri-eye-line'" class="ri-fw" style="font-size:13px" />
                  </button>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  <button
                    @click="testKey('elevenlabs', elevenlabsKey, !elevenlabsKey && elevenlabsKeySet)"
                    :disabled="labsTest?.loading || (!elevenlabsKey && !elevenlabsKeySet)"
                    class="sys-btn-ed sys-btn-ed--ghost"
                    style="height:26px;font-size:10px;padding:0 10px;letter-spacing:0.08em"
                  >{{ labsTest?.loading ? 'Teste…' : 'Testen' }}</button>
                  <span v-if="labsTest && !labsTest.loading" style="font-family:var(--sys-mono);font-size:10px"
                    :style="labsTest.ok ? 'color:var(--sys-ok)' : 'color:var(--sys-err)'">
                    {{ labsTest.message }}
                  </span>
                </div>
                <p style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-fg);letter-spacing:0.08em;margin:0">
                  Für Text-to-Speech.
                  <a href="https://elevenlabs.io" target="_blank" rel="noopener" style="color:var(--sys-accent-bright)">elevenlabs.io</a>
                </p>
              </div>

              <!-- Feedback -->
              <Transition name="sys-modal-fade">
                <div v-if="feedback" style="margin-top:12px;padding:10px 14px;border-left:2px solid;font-family:var(--sys-mono);font-size:11px"
                  :style="feedback.ok
                    ? 'border-color:var(--sys-ok);color:var(--sys-ok);background:rgba(184,220,196,0.06)'
                    : 'border-color:var(--sys-err);color:var(--sys-err);background:rgba(240,163,163,0.06)'"
                >{{ feedback.message }}</div>
              </Transition>

              <!-- Soul-Cert rotieren -->
              <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--sys-rule)">
                <div style="font-family:var(--sys-mono);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:var(--sys-fg-muted);margin-bottom:10px">Soul-Cert</div>
                <button
                  @click="handleRotateCert"
                  :disabled="certRotateBusy"
                  class="sys-btn-ed sys-btn-ed--ghost"
                  style="width:100%;justify-content:center"
                >{{ certRotateBusy ? 'Rotiert…' : 'Soul-Cert rotieren' }}</button>
                <p style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-fg);letter-spacing:0.06em;margin:6px 0 0">
                  Altes Cert sofort ungültig — sys.md wird automatisch heruntergeladen.
                </p>
                <Transition name="sys-modal-fade">
                  <div v-if="certRotationResult" style="margin-top:10px;padding:12px 14px;border:1px solid var(--sys-rule-strong)">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                      <span style="font-family:var(--sys-mono);font-size:11px;color:var(--sys-accent-bright)">Cert rotiert — Version {{ certRotationResult.cert_version }}</span>
                      <button @click="certRotationResult = null" style="background:none;border:none;cursor:pointer;color:var(--sys-fg-dim);font-size:16px;line-height:1;padding:0">×</button>
                    </div>
                    <div style="font-family:var(--sys-mono);font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:var(--sys-fg-muted);margin-bottom:4px">Bearer-Token (Zugangscode)</div>
                    <div style="display:flex;align-items:center;gap:8px;background:rgba(0,0,0,0.3);padding:8px 10px;margin-bottom:8px">
                      <code style="flex:1;font-family:var(--sys-mono);font-size:11px;color:var(--sys-accent-bright);word-break:break-all;user-select:all">Bearer {{ soulToken }}</code>
                      <button @click="copyCertResult" style="background:none;border:none;cursor:pointer;padding:0;flex-shrink:0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                          :style="certCopied ? 'color:var(--sys-ok)' : 'color:var(--sys-fg-dim)'">
                          <path v-if="certCopied" stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                          <path v-else stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/>
                        </svg>
                      </button>
                    </div>
                    <p style="font-family:var(--sys-mono);font-size:10px;letter-spacing:0.06em"
                      :style="certRotationResult.validated ? 'color:var(--sys-ok)' : 'color:var(--sys-fg-dim)'">
                      {{ certRotationResult.validated ? '✓ Cert auf Server validiert' : 'Server-Validierung prüfen — Seite neu laden' }}
                    </p>
                  </div>
                </Transition>
              </div>

            </template>

            <!-- ── Tab: Admin verbinden ── -->
            <template v-if="tab === 'connect' && !isAdmin">
              <p class="sys-prose">Gib den Admin-Token ein, den du beim Server-Setup erhalten hast. Er wird nur lokal im Browser gespeichert.</p>

              <div class="sys-field" style="margin-bottom:0">
                <label class="sys-field-label">Admin-Token</label>
                <div style="display:flex;gap:0">
                  <input
                    v-model="connectToken"
                    :type="showConnectToken ? 'text' : 'password'"
                    class="sys-input sys-input--mono"
                    style="flex:1;border-right:none"
                    placeholder="adm_..."
                    autocomplete="off"
                    spellcheck="false"
                    @keyup.enter="connectAdmin"
                  />
                  <button
                    @click="showConnectToken = !showConnectToken"
                    class="sys-btn-ed sys-btn-ed--ghost"
                    style="padding:0 12px;border-left:none"
                    :aria-label="showConnectToken ? 'Token verbergen' : 'Token anzeigen'"
                  >
                    <i :class="showConnectToken ? 'ri-eye-off-line' : 'ri-eye-line'" class="ri-fw" style="font-size:13px" />
                  </button>
                </div>
              </div>

              <Transition name="sys-modal-fade">
                <div v-if="connectFeedback" style="margin-top:12px;padding:10px 14px;border-left:2px solid;font-family:var(--sys-mono);font-size:11px"
                  :style="connectFeedback.ok
                    ? 'border-color:var(--sys-ok);color:var(--sys-ok);background:rgba(184,220,196,0.06)'
                    : 'border-color:var(--sys-err);color:var(--sys-err);background:rgba(240,163,163,0.06)'"
                >{{ connectFeedback.message }}</div>
              </Transition>
            </template>

            <!-- ── Tab: Server-Admin ── -->
            <template v-if="tab === 'admin' && isAdmin">

              <div style="padding:10px 14px;border-left:2px solid var(--sys-rule-strong);background:rgba(167,139,250,0.05);font-family:var(--sys-mono);font-size:10px;letter-spacing:0.1em;color:var(--sys-fg-muted);margin-bottom:20px">
                Master-Key-Rotation betrifft diese Instanz. Grace-Period 15 min — danach sind alte Certs ungültig.
              </div>

              <!-- Neuer Soul-Master-Key -->
              <div class="sys-field">
                <label class="sys-field-label">Neuer Soul-Master-Key</label>
                <div style="display:flex;gap:8px">
                  <input
                    v-model="newMasterKey"
                    type="text"
                    readonly
                    class="sys-input sys-input--mono"
                    style="flex:1"
                    placeholder="→ Generieren klicken"
                  />
                  <button @click="generateMasterKey" class="sys-btn-ed sys-btn-ed--ghost" style="white-space:nowrap">Generieren</button>
                </div>
                <p style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-fg);letter-spacing:0.06em">sys_ + 256-bit zufällig. Nur im Browser generiert.</p>
              </div>

              <!-- Master Anthropic-Key (nur global-Admin, nicht per-soul) -->
              <div class="sys-field" v-if="!isSoulAdmin">
                <label class="sys-field-label">Server Anthropic-Key (Fallback für alle)</label>
                <input
                  v-model="masterAnthropicKey"
                  type="password"
                  class="sys-input sys-input--mono"
                  placeholder="sk-ant-… (leer = unverändert)"
                  autocomplete="off"
                />
              </div>

              <!-- Grace-Period -->
              <Transition name="sys-modal-fade">
                <div v-if="graceUntil" style="border:1px solid rgba(245,158,11,0.25);background:rgba(245,158,11,0.05);padding:14px 16px;margin-bottom:16px">
                  <div style="display:flex;justify-content:space-between;margin-bottom:10px">
                    <span style="font-family:var(--sys-mono);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:var(--sys-accent-bright)">Grace-Period aktiv</span>
                    <span style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-accent-bright)">{{ graceCountdown }}</span>
                  </div>
                  <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer">
                    <input type="checkbox" v-model="checkWA" style="accent-color:var(--sys-violet)" />
                    <span style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-fg-muted);letter-spacing:0.08em">WhatsApp-Bot soul_cert erneuern</span>
                  </label>
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                    <input type="checkbox" v-model="checkVC" style="accent-color:var(--sys-violet)" />
                    <span style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-fg-muted);letter-spacing:0.08em">Voice-Clone Token erneuern</span>
                  </label>
                </div>
              </Transition>

              <!-- Admin-Token rotieren -->
              <div class="sys-field" style="padding-top:14px;border-top:1px solid var(--sys-rule);margin-bottom:0">
                <label class="sys-field-label">Admin-Token rotieren</label>
                <p style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-fg);letter-spacing:0.06em;margin:0 0 8px">Bei Leak: neuen Token generieren. Der alte wird sofort ungültig.</p>
                <div style="display:flex;gap:8px">
                  <input
                    v-model="newAdminToken"
                    type="text"
                    readonly
                    class="sys-input sys-input--mono"
                    style="flex:1"
                    placeholder="→ Generieren klicken"
                  />
                  <button @click="generateAdminToken" class="sys-btn-ed sys-btn-ed--ghost" style="white-space:nowrap">Generieren</button>
                </div>
              </div>

              <!-- Admin-Feedback -->
              <Transition name="sys-modal-fade">
                <div v-if="adminFeedback" style="margin-top:12px;padding:10px 14px;border-left:2px solid;font-family:var(--sys-mono);font-size:11px"
                  :style="adminFeedback.ok
                    ? 'border-color:var(--sys-ok);color:var(--sys-ok);background:rgba(184,220,196,0.06)'
                    : 'border-color:var(--sys-err);color:var(--sys-err);background:rgba(240,163,163,0.06)'"
                >{{ adminFeedback.message }}</div>
              </Transition>

            </template>

          </div>

          <!-- Foot -->
          <div class="sys-modal-foot">
            <div class="sys-foot-meta">
              <template v-if="tab === 'api'">
                <span class="sys-dot"
                  :class="keySource === 'soul' ? 'sys-dot--ok' : keySource === 'none' ? 'sys-dot--idle' : 'sys-dot--live'"
                ></span>
                {{ keySourceLabel }}
              </template>
              <template v-else-if="tab === 'connect'">
                <span class="sys-dot sys-dot--idle"></span>
                Admin-Zugang
              </template>
              <template v-else-if="tab === 'admin'">
                <span class="sys-dot sys-dot--warn"></span>
                Server-Admin · Rotation
              </template>
            </div>
            <div class="sys-foot-actions">
              <!-- API-Key tab -->
              <template v-if="tab === 'api'">
                <button
                  class="sys-btn-ed sys-btn-ed--primary"
                  @click="saveConfig"
                  :disabled="saving"
                >{{ saving ? 'Speichert…' : 'Speichern' }}</button>
              </template>
              <!-- Connect tab -->
              <template v-else-if="tab === 'connect'">
                <button
                  class="sys-btn-ed sys-btn-ed--primary"
                  @click="connectAdmin"
                  :disabled="connectingAdmin || !connectToken"
                >{{ connectingAdmin ? 'Prüfe…' : 'Verbinden' }}</button>
              </template>
              <!-- Admin tab -->
              <template v-else-if="tab === 'admin'">
                <button
                  class="sys-btn-ed sys-btn-ed--ghost"
                  @click="saveMaster"
                  :disabled="savingMaster || (!newMasterKey && !masterAnthropicKey && !newAdminToken)"
                >{{ savingMaster ? 'Rotiert…' : 'Speichern & rotieren' }}</button>
              </template>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useSoul } from '~/composables/useSoul.js'
import { useVault } from '~/composables/useVault.js'

const props = defineProps({ open: Boolean })
const emit  = defineEmits(['close', 'master-rotated'])

const { soulToken, rotateCert, soulContent: composableSoulContent, pushToServer, exportAsBlob } = useSoul()
const { isConnected: vaultConnected, writeFile, allFiles } = useVault()

// ── Admin-Erkennung (nur aus localStorage — nie vom Server) ─────────────────
const ADMIN_KEY    = 'sys_admin_token'
const isAdmin      = ref(false)
const adminToken   = ref('')
const isSoulAdmin  = ref(false)  // true = per-soul token (multi-hoster), false = global token

const currentSoulId = computed(() => soulToken.value?.split('.')?.[0] ?? '')

function detectAdmin() {
  // Per-soul token zuerst prüfen (multi-hoster: jede Soul hat eigenen Token)
  const soulId = currentSoulId.value
  if (soulId) {
    const perSoul = localStorage.getItem(`sys_admin_token_${soulId}`)
    if (perSoul && perSoul.startsWith('adm_') && perSoul.length === 68) {
      isAdmin.value    = true
      adminToken.value  = perSoul
      isSoulAdmin.value = true
      return
    }
  }
  // Globaler Token (single-hoster / legacy)
  const stored = localStorage.getItem(ADMIN_KEY)
  if (stored && stored.startsWith('adm_') && stored.length === 68) {
    isAdmin.value    = true
    adminToken.value  = stored
    isSoulAdmin.value = false
  }
}

// ── Tab ──────────────────────────────────────────────────────────────────────
const tab = ref('api')

// ── API-Key Tab State ─────────────────────────────────────────────────────────
const apiKey    = ref('')
const model     = ref('')
const showKey   = ref(false)
const saving    = ref(false)
const feedback  = ref(null)

const anthTest  = ref(null)  // { loading, ok, message }
const waveTest  = ref(null)
const labsTest  = ref(null)
const keySource  = ref('none')   // 'soul' | 'master' | 'env' | 'none'
const keyPreview = ref('')

const wavespeedKey      = ref('')
const showWavespeedKey  = ref(false)
const wavespeedKeySet   = ref(false)
const wavespeedPreview  = ref('')
const wavespeedDirty    = ref(false)

const elevenlabsKey     = ref('')
const showElevenlabsKey = ref(false)
const elevenlabsKeySet  = ref(false)
const elevenlabsPreview = ref('')
const elevenlabsDirty   = ref(false)

const braveKey     = ref('')
const braveKeySet  = ref(false)
const bravePreview = ref('')
const braveDirty   = ref(false)

const keySourceLabel = computed(() => ({
  soul:   'Eigener Key aktiv',
  master: 'Server-Key aktiv',
  env:    'Env-Key aktiv',
  none:   'Kein Key konfiguriert',
}[keySource.value] || ''))

async function loadStatus() {
  try {
    const res = await fetch('/api/get-config', {
      headers: { Authorization: `Bearer ${soulToken.value}` }
    })
    if (!res.ok) return
    const d = await res.json()
    keySource.value       = d.key_source || 'none'
    keyPreview.value      = d.key_preview || ''
    wavespeedKeySet.value  = !!d.wavespeed_key_set
    wavespeedPreview.value = d.wavespeed_preview || ''
    elevenlabsKeySet.value  = !!d.elevenlabs_key_set
    elevenlabsPreview.value = d.elevenlabs_preview || ''
    braveKeySet.value  = !!d.brave_key_set
    bravePreview.value = d.brave_preview || ''
    if (d.model) model.value = d.model
  } catch {}
}

function sanitizeKey(k) {
  // Remove non-ISO-8859-1 characters (e.g. zero-width spaces from copy-paste)
  return (k || '').replace(/[^\x20-\xFF]/g, '').trim()
}

async function testKey(type, key, useStored = false) {
  key = sanitizeKey(key)
  const stateRef = { anthropic: anthTest, wavespeed: waveTest, elevenlabs: labsTest }[type]
  stateRef.value = { loading: true, ok: null, message: '' }
  let ok = false
  let msg = ''
  try {
    if (useStored) {
      // Gespeicherter Key → Server liest aus config.json und testet serverseitig
      const res = await fetch('/api/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
        body: JSON.stringify({ key_type: type, use_stored: true })
      })
      const d = await res.json().catch(() => ({}))
      ok  = d.ok === true
      msg = ok ? 'Key gültig ✓' : `Fehler ${d.status || res.status}${d.error ? ' · ' + d.error : ''}`
    } else if (!key) {
      ok = false; msg = 'Kein Key eingegeben'
    } else if (type === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'test' }] })
      })
      ok  = res.status === 200
      msg = ok ? 'Key gültig ✓' : `Fehler ${res.status}${res.status === 401 ? ' · Ungültiger Key' : res.status === 429 ? ' · Rate-Limit' : ''}`
    } else if (type === 'elevenlabs') {
      // ElevenLabs blockiert CORS → immer über Server testen
      const body = key
        ? { elevenlabs_key: key }
        : { key_type: 'elevenlabs', use_stored: true }
      const res = await fetch('/api/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
        body: JSON.stringify(body)
      })
      const d = await res.json().catch(() => ({}))
      ok  = d.ok === true
      msg = ok ? 'Key gültig ✓' : `Fehler ${d.status || res.status}${d.error ? ' · ' + d.error : res.status === 401 ? ' · Ungültiger Key' : ''}`
    } else if (type === 'wavespeed') {
      ok  = /^[0-9a-f]{32,}$/i.test(key)
      msg = ok ? 'Format OK (Hex-Key erkannt)' : 'Ungültiges Format — Hex erwartet'
    }
  } catch (e) {
    ok  = false
    msg = `Verbindungsfehler: ${e.message}`
  }
  stateRef.value = { loading: false, ok, message: msg }
  setTimeout(() => { stateRef.value = null }, 6000)
}

async function saveConfig() {
  saving.value  = true
  feedback.value = null
  try {
    const body = {}
    if (apiKey.value) body.anthropic_key = sanitizeKey(apiKey.value)
    if (model.value) body.model = model.value
    if (wavespeedDirty.value) body.wavespeed_key = sanitizeKey(wavespeedKey.value)
    if (elevenlabsDirty.value) body.elevenlabs_key = sanitizeKey(elevenlabsKey.value)
    if (braveDirty.value) body.brave_key = sanitizeKey(braveKey.value)
    const res = await fetch('/api/set-config', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization: `Bearer ${soulToken.value}`,
      },
      body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      feedback.value = { ok: true, message: 'Gespeichert ✓' }
      await loadStatus()
      apiKey.value        = ''
      wavespeedKey.value  = ''
      wavespeedDirty.value = false
      elevenlabsKey.value  = ''
      elevenlabsDirty.value = false
      braveKey.value  = ''
      braveDirty.value = false
    } else {
      feedback.value = { ok: false, message: d.message || d.error || `Fehler ${res.status}` }
    }
  } catch {
    feedback.value = { ok: false, message: 'Netzwerkfehler' }
  } finally {
    saving.value = false
    setTimeout(() => { feedback.value = null }, 5000)
  }
}

// ── Connect Tab State ─────────────────────────────────────────────────────────
const connectToken      = ref('')
const showConnectToken  = ref(false)
const connectingAdmin   = ref(false)
const connectFeedback   = ref(null)

async function connectAdmin() {
  if (!connectToken.value) return
  connectingAdmin.value = true
  connectFeedback.value = null
  try {
    // Per-soul token zuerst versuchen (multi-hoster)
    const soulId = currentSoulId.value
    let matched = false
    if (soulId) {
      const res = await fetch('/api/set-master', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Soul-Admin-Token': connectToken.value,
          'X-Soul-Id': soulId,
        },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        localStorage.setItem(`sys_admin_token_${soulId}`, connectToken.value)
        matched = true
        isSoulAdmin.value = true
      }
    }
    // Fallback: globaler Admin-Token (single-hoster)
    if (!matched) {
      const res = await fetch('/api/set-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': connectToken.value },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        localStorage.setItem(ADMIN_KEY, connectToken.value)
        matched = true
        isSoulAdmin.value = false
      }
    }
    if (matched) {
      connectFeedback.value = { ok: true, message: 'Admin-Zugang verbunden ✓' }
      setTimeout(() => {
        detectAdmin()
        tab.value = 'admin'
        connectToken.value = ''
        connectFeedback.value = null
      }, 800)
    } else {
      connectFeedback.value = { ok: false, message: 'Token ungültig — Zugang verweigert' }
    }
  } catch {
    connectFeedback.value = { ok: false, message: 'Netzwerkfehler' }
  } finally {
    connectingAdmin.value = false
  }
}

// ── Admin Tab State ───────────────────────────────────────────────────────────
const newMasterKey      = ref('')
const masterAnthropicKey = ref('')
const newAdminToken     = ref('')
const savingMaster      = ref(false)
const adminFeedback     = ref(null)
const graceUntil        = ref(null)
const graceCountdown    = ref('')
const checkWA           = ref(false)
const checkVC           = ref(false)
let graceTimer          = null

function generateMasterKey() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  newMasterKey.value = `sys_${hex}`
}

function generateAdminToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  newAdminToken.value = `adm_${hex}`
}

function startGraceCountdown(isoString) {
  graceUntil.value = isoString
  checkWA.value    = false
  checkVC.value    = false
  function tick() {
    const diff = new Date(isoString) - Date.now()
    if (diff <= 0) { graceCountdown.value = 'Abgelaufen'; return }
    const m = Math.floor(diff / 60_000)
    const s = Math.floor((diff % 60_000) / 1000)
    graceCountdown.value = `${m}m ${s}s verbleibend`
    graceTimer = setTimeout(tick, 1_000)
  }
  tick()
}

async function saveMaster() {
  if (!newMasterKey.value && !masterAnthropicKey.value && !newAdminToken.value) return
  savingMaster.value  = true
  adminFeedback.value = null
  try {
    const body = {}
    if (newMasterKey.value)                     body.soul_master_key = newMasterKey.value
    if (!isSoulAdmin.value && masterAnthropicKey.value) body.anthropic_key = masterAnthropicKey.value
    if (newAdminToken.value)                    body.new_admin_token = newAdminToken.value
    const soulId = currentSoulId.value
    const authHeaders = isSoulAdmin.value && soulId
      ? { 'X-Soul-Admin-Token': adminToken.value, 'X-Soul-Id': soulId }
      : { 'X-Admin-Token': adminToken.value }
    const res = await fetch('/api/set-master', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      const masterRotated = !!body.soul_master_key
      let msg = 'Gespeichert ✓'
      if (d.prev_valid_until) msg += ' — Grace-Period 15 min aktiv'
      if (newAdminToken.value) {
        if (isSoulAdmin.value && soulId) {
          localStorage.setItem(`sys_admin_token_${soulId}`, newAdminToken.value)
        } else {
          localStorage.setItem(ADMIN_KEY, newAdminToken.value)
        }
        adminToken.value = newAdminToken.value
        msg += ' — Admin-Token rotiert & gespeichert'
      }
      if (masterRotated) msg += ' — Cert wird erneuert…'
      adminFeedback.value = { ok: true, message: msg }
      if (d.prev_valid_until) startGraceCountdown(d.prev_valid_until)
      newMasterKey.value       = ''
      masterAnthropicKey.value = ''
      newAdminToken.value      = ''
      await loadStatus()
      if (masterRotated) emit('master-rotated')
    } else {
      adminFeedback.value = { ok: false, message: d.message || d.error || `Fehler ${res.status}` }
    }
  } catch {
    adminFeedback.value = { ok: false, message: 'Netzwerkfehler' }
  } finally {
    savingMaster.value = false
    setTimeout(() => { adminFeedback.value = null }, 6000)
  }
}

onUnmounted(() => clearTimeout(graceTimer))

// ── Cert-Rotation ─────────────────────────────────────────────────────────────
const certRotateBusy     = ref(false)
const certRotationResult = ref(null)
const certCopied         = ref(false)

const localSoulFileName = computed(() => {
  const soulFile = allFiles.value.find(f => f.kind === 'soul')
  return soulFile ? soulFile.name : 'sys.md'
})

function downloadSoulLocal() {
  const content = composableSoulContent.value
  if (!content) return
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: localSoulFileName.value })
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

async function copyCertResult() {
  if (!certRotationResult.value?.cert) return
  try {
    await navigator.clipboard.writeText(`Bearer ${soulToken.value}`)
    certCopied.value = true
    setTimeout(() => { certCopied.value = false }, 2000)
  } catch {}
}

async function handleRotateCert() {
  if (certRotateBusy.value) return
  certRotateBusy.value = true
  certRotationResult.value = null
  try {
    const result = await rotateCert()
    if (!result) { alert('Cert-Rotation fehlgeschlagen'); return }
    // Vault-Datei + Server + lokaler Download — alle drei aktualisieren
    if (vaultConnected.value && composableSoulContent.value) {
      await writeFile(localSoulFileName.value, new TextEncoder().encode(composableSoulContent.value))
    }
    await pushToServer()
    await exportAsBlob()
    let validated = false
    try {
      const soulId = soulToken.value?.split('.')?.[0] ?? ''
      const vRes = await fetch('/api/validate', { headers: { Authorization: `Bearer ${soulId}.${result.cert}` } })
      validated = vRes.ok
    } catch {}
    certRotationResult.value = { ...result, validated }
  } finally { certRotateBusy.value = false }
}

// ── Beim Öffnen laden ─────────────────────────────────────────────────────────
watch(() => props.open, (val) => {
  if (val) {
    detectAdmin()
    loadStatus()
    tab.value           = 'api'
    wavespeedKey.value   = ''
    wavespeedDirty.value = false
    elevenlabsKey.value  = ''
    elevenlabsDirty.value = false
  }
})
</script>

<style scoped>
@keyframes spin { to { transform: rotate(360deg); } }

/* Override: Rail dient hier als Tab-Navigation, nicht als Step-Wizard.
   Alle Items immer sichtbar — auch auf Mobile. */
@media (max-width: 560px) {
  :deep(.sys-rail) {
    grid-template-columns: repeat(2, 1fr);
  }
  :deep(.sys-rail-item) {
    display: flex !important;
    padding: 10px 14px;
    gap: 8px;
  }
  :deep(.sys-rail-sub) {
    display: none;
  }
  :deep(.sys-rail-num) {
    width: 26px;
    height: 26px;
    font-size: 11px;
    flex-shrink: 0;
  }
}
</style>
